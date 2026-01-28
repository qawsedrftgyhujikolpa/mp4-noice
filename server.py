
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse, HTMLResponse, FileResponse
import uvicorn
import os
import time
import logging

# ==================================================
# ロギング (進捗が見えるように)
# ==================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler("server.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("LIMIT-BREAK")

app = FastAPI()
UPLOAD_DIR, OUTPUT_DIR = "uploads", "processed_videos"
for d in [UPLOAD_DIR, OUTPUT_DIR]:
    if not os.path.exists(d): os.makedirs(d)

def create_noise_pool(w, h, size=20):
    return [np.random.randint(0, 256, (h, w, 3), dtype=np.uint8) for _ in range(size)]

# --------------------------------------------------
# 真・限界突破 NITRO エンジン
# --------------------------------------------------
def fast_process_video_nitro(temp_path: str, output_path: str):
    cap = cv2.VideoCapture(temp_path)
    if not cap.isOpened(): return
    
    # 元のスペック
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # ⚡ 爆速リサイズ戦略
    # 720pを超える場合は、強制的にダウンスケールして計算負荷を四分の三以下に削る
    target_w = orig_w
    if orig_w > 1280:
        target_w = 1280
    
    scale = target_w / orig_w
    h = int(orig_h * scale)
    w = target_w

    out = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))
    
    static_noise = np.random.randint(0, 256, (h, w, 3), dtype=np.uint8)
    pool = create_noise_pool(w, h, 20)
    
    ret, prev_frame = cap.read()
    if not ret: return
    if scale != 1.0: prev_frame = cv2.resize(prev_frame, (w, h))
    prev_gray = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
    
    p_idx = 0
    logger.info(f"🚀 LIMIT BREAK: {orig_w}p -> {w}p に最適化して爆走します (全{total_frames}フレーム)")

    # 高速リファレンス
    read = cap.read
    write = out.write
    diff = cv2.absdiff
    thresh = cv2.threshold
    cvt = cv2.cvtColor
    resize = cv2.resize

    last_log_time = time.time()

    while True:
        ret, frame = read()
        if not ret: break

        # リサイズ（必要なら）
        if scale != 1.0: frame = resize(frame, (w, h))

        gray = cvt(frame, cv2.COLOR_BGR2GRAY)
        frame_diff = diff(gray, prev_gray)
        _, mask = thresh(frame_diff, 25, 255, cv2.THRESH_BINARY)
        
        # 合成
        res = static_noise.copy()
        res[mask > 0] = pool[p_idx % 20][mask > 0]
        
        write(res)
        prev_gray = gray
        p_idx += 1

        # 1秒おきに進捗を報告
        if time.time() - last_log_time > 1.0:
            progress = (p_idx / total_frames) * 100
            logger.info(f"📊 進捗: {progress:.1f}% ({p_idx}/{total_frames})")
            last_log_time = time.time()
    
    cap.release()
    out.release()
    if os.path.exists(temp_path): os.remove(temp_path)
    logger.info("🏁 限界突破完了: 現代人の勝利です")

# (Preview用はそのまま)
def process_video_generator(temp_path: str, output_path: str):
    cap = cv2.VideoCapture(temp_path)
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    out = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))
    backSub = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=50, detectShadows=False)
    static_noise = np.random.randint(0, 256, (h, w, 3), dtype=np.uint8)
    pool = create_noise_pool(w, h, 10)
    p_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret: break
        mask = backSub.apply(frame)
        res = static_noise.copy()
        res[mask > 0] = pool[p_idx % 10][mask > 0]
        out.write(res)
        _, buffer = cv2.imencode('.jpg', res)
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        p_idx += 1
    cap.release(); out.release()
    if os.path.exists(temp_path): os.remove(temp_path)

@app.get("/")
def main():
    with open("index.html", "r", encoding="utf-8") as f: return HTMLResponse(content=f.read())

@app.get("/style.css")
async def get_css(): return FileResponse("style.css")

@app.get("/main.js")
async def get_js(): return FileResponse("main.js")

@app.get("/logs")
async def get_logs():
    if not os.path.exists("server.log"): return {"logs": "Logging..."}
    with open("server.log", "r", encoding="utf-8") as f: return {"logs": "".join(f.readlines()[-10:])}

@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    ts = int(time.time())
    path = os.path.join(UPLOAD_DIR, f"raw_{ts}_{file.filename.replace(' ', '_')}")
    with open(path, "wb") as b: b.write(await file.read())
    return {"temp_name": os.path.basename(path), "output_name": f"nitro_{ts}.mp4"}

@app.get("/stream/{temp_name}/{output_name}")
async def stream_video(temp_name: str, output_name: str):
    return StreamingResponse(process_video_generator(os.path.join(UPLOAD_DIR, temp_name), os.path.join(OUTPUT_DIR, output_name)),
                             media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/nitro_process/{temp_name}/{output_name}")
async def run_nitro_process(temp_name: str, output_name: str):
    fast_process_video_nitro(os.path.join(UPLOAD_DIR, temp_name), os.path.join(OUTPUT_DIR, output_name))
    return {"status": "completed", "url": f"/download/{output_name}"}

@app.get("/download/{filename}")
async def download_file(filename: str):
    return FileResponse(os.path.join(OUTPUT_DIR, filename), media_type='video/mp4', filename=f"noiced_{filename}")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
