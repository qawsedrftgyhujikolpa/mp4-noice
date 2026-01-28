
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse, HTMLResponse, FileResponse
import uvicorn
import os
import time

# ==================================================
# サーバー設定 (Server Setup)
# ==================================================
app = FastAPI()

# フォルダ設定
UPLOAD_DIR = "uploads"          # 元動画（一時保存用）
OUTPUT_DIR = "processed_videos" # 解析後動画（保存用）

# 起動時に必要なフォルダがなければ作る
for d in [UPLOAD_DIR, OUTPUT_DIR]:
    if not os.path.exists(d):
        os.makedirs(d)

# --------------------------------------------------
# 画像処理関数 (Generator) - 真・ノイズ迷彩
# --------------------------------------------------
def process_video_generator(temp_path: str, output_path: str):
    cap = cv2.VideoCapture(temp_path)
    out = None

    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps == 0: fps = 30.0

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        # 動体検知 MOG2
        backSub = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50, detectShadows=False)

        # 固定背景ノイズ (Gray -> BGR)
        static_noise_base = np.random.randint(0, 256, (height, width), dtype=np.uint8)
        static_noise = cv2.cvtColor(static_noise_base, cv2.COLOR_GRAY2BGR)

        print(f"💀 MP4-NOICE 変換開始: {temp_path}")

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # 動きの抽出
            fg_mask = backSub.apply(frame)
            kernel = np.ones((5,5), np.uint8)
            fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)
            mask_3ch = cv2.cvtColor(fg_mask, cv2.COLOR_GRAY2BGR)

            # 動的ノイズ
            dynamic_noise_base = np.random.randint(0, 256, (height, width), dtype=np.uint8)
            dynamic_noise = cv2.cvtColor(dynamic_noise_base, cv2.COLOR_GRAY2BGR)

            # 合成: 動きがあるところ=動的ノイズ, ないところ=固定ノイズ
            result_frame = np.where(mask_3ch == 255, dynamic_noise, static_noise)

            out.write(result_frame)
            _, buffer = cv2.imencode('.jpg', result_frame)
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

    except Exception as e:
        print(f"❌ 解析エラー: {e}")
    finally:
        # リソース解放
        if cap: cap.release()
        if out: out.release()
        
        # ==================================================
        # 【重要】証拠隠滅ロジック
        # 処理が終わったら、uploadsフォルダ内の元の重い動画は削除します。
        # 初心者のあなたでも安心して何度も実行できるように。
        # ==================================================
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
                print(f"🗑️ 一時ファイルを消去しました: {temp_path}")
            except Exception as e:
                print(f"⚠️ ファイル消去に失敗（他で使ってるかも）: {e}")

# ==================================================
# エンドポイント
# ==================================================

@app.get("/")
def main():
    try:
        with open("index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(content="<h1>index.htmlが見つかりません。</h1>")

@app.get("/style.css")
async def get_css(): return FileResponse("style.css")

@app.get("/main.js")
async def get_js(): return FileResponse("main.js")

@app.get("/download/{filename}")
async def download_file(filename: str):
    path = os.path.join(OUTPUT_DIR, filename)
    if os.path.exists(path):
        return FileResponse(path, media_type='video/mp4', filename=f"noiced_{filename}")
    return {"error": "File not found"}

@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    # uploads フォルダの中にユニークな名前で保存
    timestamp = int(time.time())
    safe_name = f"raw_{timestamp}_{file.filename.replace(' ', '_')}"
    temp_path = os.path.join(UPLOAD_DIR, safe_name)
    
    with open(temp_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    output_filename = f"out_{timestamp}.mp4"
    return {"temp_name": safe_name, "output_name": output_filename}

@app.get("/stream/{temp_name}/{output_name}")
async def stream_video(temp_name: str, output_name: str):
    # uploads フォルダから読み取り、processed_videos へ書き出す
    temp_path = os.path.join(UPLOAD_DIR, temp_name)
    output_path = os.path.join(OUTPUT_DIR, output_name)
    
    return StreamingResponse(
        process_video_generator(temp_path, output_path),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
