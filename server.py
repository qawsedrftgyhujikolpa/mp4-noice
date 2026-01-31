import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Header
from fastapi.responses import StreamingResponse, HTMLResponse, FileResponse
import uvicorn
import os
import time
import logging
from pathlib import Path

# ロギング設定（修正）
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("MP4-NOICE")

app = FastAPI()
UPLOAD_DIR, OUTPUT_DIR = "uploads", "processed_videos"
for d in [UPLOAD_DIR, OUTPUT_DIR]: Path(d).mkdir(exist_ok=True)

def create_noise_pool(w, h, size=20):
    return [np.random.randint(0, 256, (h, w, 3), dtype=np.uint8) for _ in range(size)]

# ========================================
# ✅ 修正1: プレビュー用ジェネレータ（画像ストリーム）
# ========================================
def preview_generator(temp_path: str):
    """M-JPEG形式でプレビューストリームを返す"""
    cap = cv2.VideoCapture(temp_path)
    if not cap.isOpened():
        logger.error("❌ 動画読み込み失敗")
        return
    
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    static_noise = np.random.randint(0, 256, (h, w, 3), dtype=np.uint8)
    pool = create_noise_pool(w, h, 10)
    p_idx = 0
    
    backSub = cv2.createBackgroundSubtractorMOG2(history=100, varThreshold=30, detectShadows=False)
    
    logger.info("🎥 プレビュー開始")
    while True:
        ret, frame = cap.read()
        if not ret: break
        
        # ノイズ処理
        mask = backSub.apply(frame)
        res = static_noise.copy()
        res[mask > 0] = pool[p_idx % 10][mask > 0]
        
        # JPEGエンコードしてyield
        _, buffer = cv2.imencode('.jpg', res, [cv2.IMWRITE_JPEG_QUALITY, 85])
        yield (b'--frame
'
               b'Content-Type: image/jpeg
'
               b'Content-Length: ' + str(len(buffer)).encode() + b'

' +
               buffer.tobytes() + b'
')
        p_idx += 1
    
    cap.release()
    logger.info("✅ プレビュー終了")

# ========================================
# ✅ 修正2: NITRO処理（変更なしでOK）
# ========================================
def fast_process_video_nitro(temp_path: str, output_path: str):
    # 既存コードそのまま（高速処理は完璧）
    cap = cv2.VideoCapture(temp_path)
    if not cap.isOpened(): return
    
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    
    target_w = 1280 if orig_w > 1280 else orig_w
    scale = target_w / orig_w
    h = int(orig_h * scale)
    w = target_w

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))
    
    static_noise = np.random.randint(0, 256, (h, w, 3), dtype=np.uint8)
    pool = create_noise_pool(w, h, 20)
    
    ret, prev_frame = cap.read()
    if not ret: return
    if scale != 1.0: prev_frame = cv2.resize(prev_frame, (w, h))
    prev_gray = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
    
    p_idx = 0
    logger.info(f"🚀 NITRO開始: {w}x{h} {fps}fps")
    
    while True:
        ret, frame = cap.read()
        if not ret: break
        
        if scale != 1.0: frame = cv2.resize(frame, (w, h))
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        frame_diff = cv2.absdiff(gray, prev_gray)
        _, mask = cv2.threshold(frame_diff, 25, 255, cv2.THRESH_BINARY)
        
        res = static_noise.copy()
        res[mask > 0] = pool[p_idx % 20][mask > 0]
        out.write(res)
        
        prev_gray = gray
        p_idx += 1
    
    cap.release()
    out.release()
    logger.info("🏁 NITRO完了")

# ========================================
# 📡 FastAPIエンドポイント
# ========================================
@app.get("/")
async def main_page():
    with open("index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/style.css")
async def css(): return FileResponse("style.css")

@app.get("/main.js")
async def js(): return FileResponse("main.js")

# ✅ 修正3: プレビューエンドポイント（シンプル化）
@app.get("/preview/{temp_name}")
async def preview_stream(temp_name: str):
    temp_path = os.path.join(UPLOAD_DIR, temp_name)
    if not os.path.exists(temp_path):
        return HTMLResponse("ファイルが見つかりません", status_code=404)
    
    return StreamingResponse(
        preview_generator(temp_path),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    ts = int(time.time())
    safe_name = file.filename.replace(' ', '_').replace('/', '_')
    temp_path = os.path.join(UPLOAD_DIR, f"raw_{ts}_{safe_name}")
    
    with open(temp_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    logger.info(f"📤 アップロード: {temp_path}")
    return {"temp_name": os.path.basename(temp_path)}

@app.get("/nitro/{temp_name}")
async def nitro_process(temp_name: str):
    temp_path = os.path.join(UPLOAD_DIR, temp_name)
    if not os.path.exists(temp_path):
        return {"error": "ファイルが見つかりません"}
    
    ts = int(time.time())
    output_name = f"nitro_{ts}.mp4"
    output_path = os.path.join(OUTPUT_DIR, output_name)
    
    # バックグラウンドでNITRO処理開始
    import threading
    threading.Thread(target=fast_process_video_nitro, args=(temp_path, output_path)).start()
    
    return {"status": "processing", "output": output_name, "preview": f"/preview/{temp_name}"}

@app.get("/download/{filename}")
async def download(filename: str):
    return FileResponse(os.path.join(OUTPUT_DIR, filename), media_type="video/mp4")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)