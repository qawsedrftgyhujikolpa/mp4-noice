/* =====================================================
   Motion Mosaic - p5.js メインスクリプト
   動きモザイク効果のコア処理
   ===================================================== */

// ========== グローバル変数 ==========

// 動画関連
let video;              // HTMLVideoElement
let videoLoaded = false; // 動画読み込み完了フラグ

// 前フレームのピクセルデータ保持用
// ※毎フレームslice()すると重いので、typed arrayで再利用
let prevPixels = null;

// 処理用の一時グラフィックス
let processGraphics;

// 設定パラメータ
let settings = {
    blockSize: 10,      // モザイクブロックサイズ（5-50px）
    sensitivity: 0.3,   // 動き検知感度（0.1-0.9）
    isColorMode: true,  // true=カラー, false=白黒
    isPlaying: true     // 再生状態
};

// FPS計測用
let frameCount = 0;
let lastFpsTime = 0;
let currentFps = 0;

// DOM要素キャッシュ
let elements = {};

// ========== p5.js セットアップ ==========

function setup() {
    // キャンバスをコンテナ内に作成
    // 初期サイズは仮。動画読み込み後にリサイズする
    let canvas = createCanvas(640, 360);
    canvas.parent('canvas-container');

    // 処理用グラフィックスバッファ
    processGraphics = createGraphics(640, 360);

    // ピクセル密度を1に固定（パフォーマンス対策）
    pixelDensity(1);

    // DOM要素をキャッシュ
    cacheElements();

    // イベントリスナー設定
    setupEventListeners();

    // 初期状態：フレームレートを下げておく（動画読み込み前）
    frameRate(1);

    // 背景を描画
    background(20);

    console.log('🎬 Motion Mosaic 初期化完了');
}

// ========== DOM要素キャッシュ ==========

function cacheElements() {
    elements = {
        dropzone: document.getElementById('dropzone'),
        canvasContainer: document.getElementById('canvas-container'),
        controls: document.getElementById('controls'),
        fileInput: document.getElementById('fileInput'),
        colorModeBtn: document.getElementById('colorModeBtn'),
        playPauseBtn: document.getElementById('playPauseBtn'),
        resetBtn: document.getElementById('resetBtn'),
        blockSizeSlider: document.getElementById('blockSizeSlider'),
        sensitivitySlider: document.getElementById('sensitivitySlider'),
        blockSizeValue: document.getElementById('blockSizeValue'),
        sensitivityValue: document.getElementById('sensitivityValue'),
        fpsDisplay: document.getElementById('fpsDisplay'),
        statusDisplay: document.getElementById('statusDisplay')
    };
}

// ========== イベントリスナー設定 ==========

function setupEventListeners() {
    const { dropzone, fileInput, colorModeBtn, playPauseBtn, resetBtn,
        blockSizeSlider, sensitivitySlider } = elements;

    // ----- ドラッグ&ドロップ -----
    dropzone.addEventListener('dragover', handleDragOver);
    dropzone.addEventListener('dragleave', handleDragLeave);
    dropzone.addEventListener('drop', handleDrop);

    // ファイル選択（クリック時）
    fileInput.addEventListener('change', handleFileSelect);

    // ----- コントロールボタン -----
    colorModeBtn.addEventListener('click', toggleColorMode);
    playPauseBtn.addEventListener('click', togglePlayPause);
    resetBtn.addEventListener('click', resetApp);

    // ----- スライダー -----
    blockSizeSlider.addEventListener('input', (e) => {
        settings.blockSize = parseInt(e.target.value);
        elements.blockSizeValue.textContent = settings.blockSize;
    });

    sensitivitySlider.addEventListener('input', (e) => {
        // スライダー値(10-90)を感度(0.1-0.9)に変換
        settings.sensitivity = parseInt(e.target.value) / 100;
        elements.sensitivityValue.textContent = settings.sensitivity.toFixed(2);
    });
}

// ========== ドラッグ&ドロップ処理 ==========

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.dropzone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.dropzone.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.dropzone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processVideoFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        processVideoFile(files[0]);
    }
}

// ========== 動画ファイル処理 ==========

function processVideoFile(file) {
    // ファイル形式チェック
    if (!file.type.match(/video\/(mp4|webm)/)) {
        alert('⚠️ MP4またはWebM形式の動画を選択してください。');
        return;
    }

    console.log(`📁 動画ファイル読み込み: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    updateStatus('動画を読み込み中...');

    // Blob URLを作成
    const videoUrl = URL.createObjectURL(file);

    // 既存の動画があれば破棄
    if (video) {
        video.pause();
        video.remove();
    }

    // HTMLVideoElementを作成
    video = document.createElement('video');
    video.src = videoUrl;
    video.loop = true;
    video.muted = true; // 自動再生のためミュート
    video.playsInline = true;

    // 動画メタデータ読み込み完了時
    video.addEventListener('loadedmetadata', () => {
        console.log(`📐 動画サイズ: ${video.videoWidth} x ${video.videoHeight}`);

        // キャンバスサイズを動画に合わせる（最大720p）
        let w = video.videoWidth;
        let h = video.videoHeight;

        // 720pを超える場合はリサイズ
        if (w > 1280 || h > 720) {
            const scale = Math.min(1280 / w, 720 / h);
            w = Math.floor(w * scale);
            h = Math.floor(h * scale);
            console.log(`📐 リサイズ後: ${w} x ${h}`);
        }

        // キャンバスリサイズ
        resizeCanvas(w, h);
        processGraphics = createGraphics(w, h);
        processGraphics.pixelDensity(1);

        // 前フレームピクセル配列を初期化
        prevPixels = new Uint8ClampedArray(w * h * 4);

        // UI切り替え
        elements.dropzone.classList.add('hidden');
        elements.canvasContainer.classList.remove('hidden');
        elements.controls.classList.remove('hidden');

        // 動画再生開始
        video.play().then(() => {
            videoLoaded = true;
            settings.isPlaying = true;
            updatePlayPauseButton();
            updateStatus('再生中');

            // フレームレートを上げる
            frameRate(30);

            console.log('▶️ 動画再生開始');
        }).catch(err => {
            console.error('動画再生エラー:', err);
            updateStatus('再生エラー');
        });
    });

    video.addEventListener('error', (e) => {
        console.error('動画読み込みエラー:', e);
        alert('⚠️ 動画の読み込みに失敗しました。');
        updateStatus('エラー');
    });
}

// ========== p5.js 描画ループ ==========

function draw() {
    // 動画未読み込みなら何もしない
    if (!videoLoaded || !video) {
        return;
    }

    // 一時停止中は前フレームを保持
    if (!settings.isPlaying) {
        return;
    }

    // FPS計測
    updateFps();

    // ----- メイン処理：モーションモザイク -----

    // 処理用グラフィックスに動画フレームを描画
    processGraphics.image(video, 0, 0, width, height);
    processGraphics.loadPixels();

    const currentPixels = processGraphics.pixels;
    const blockSize = settings.blockSize;
    const threshold = settings.sensitivity * 255;

    // メインキャンバスをクリア
    // 白黒モードの場合はグレー背景
    background(settings.isColorMode ? 20 : 40);

    // ブロック単位で処理
    for (let y = 0; y < height; y += blockSize) {
        for (let x = 0; x < width; x += blockSize) {
            // ブロック内の動き検知 & 平均色計算
            let motionDetected = false;
            let totalR = 0, totalG = 0, totalB = 0;
            let pixelCount = 0;

            // ブロック内のピクセルをスキャン
            for (let by = 0; by < blockSize && (y + by) < height; by++) {
                for (let bx = 0; bx < blockSize && (x + bx) < width; bx++) {
                    const px = x + bx;
                    const py = y + by;
                    const idx = (py * width + px) * 4;

                    // 現在のピクセル
                    const r = currentPixels[idx];
                    const g = currentPixels[idx + 1];
                    const b = currentPixels[idx + 2];

                    // 前フレームとの差分計算
                    if (prevPixels) {
                        const diffR = Math.abs(r - prevPixels[idx]);
                        const diffG = Math.abs(g - prevPixels[idx + 1]);
                        const diffB = Math.abs(b - prevPixels[idx + 2]);

                        // RGB差分の平均が閾値を超えたら動きあり
                        if ((diffR + diffG + diffB) / 3 > threshold) {
                            motionDetected = true;
                        }
                    }

                    // 平均色用に累積
                    totalR += r;
                    totalG += g;
                    totalB += b;
                    pixelCount++;
                }
            }

            // 動きが検知されたブロックにモザイク描画
            if (motionDetected && pixelCount > 0) {
                // ブロック平均色
                const avgR = totalR / pixelCount;
                const avgG = totalG / pixelCount;
                const avgB = totalB / pixelCount;

                // 白黒モードの場合はグレースケール変換
                if (settings.isColorMode) {
                    fill(avgR, avgG, avgB);
                } else {
                    const gray = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
                    fill(gray);
                }

                noStroke();
                rect(x, y, blockSize, blockSize);
            }
            // 静止部分は何も描画しない（背景色のまま）
        }
    }

    // 現在フレームを前フレームとして保存
    // ※slice()ではなくset()で効率的にコピー
    if (prevPixels) {
        prevPixels.set(currentPixels);
    }
}

// ========== FPS計測 ==========

function updateFps() {
    frameCount++;
    const now = millis();

    // 1秒ごとにFPS更新
    if (now - lastFpsTime >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastFpsTime = now;
        elements.fpsDisplay.textContent = `FPS: ${currentFps}`;
    }
}

// ========== コントロール処理 ==========

// 白黒/カラー切り替え
function toggleColorMode() {
    settings.isColorMode = !settings.isColorMode;

    const btn = elements.colorModeBtn;
    const icon = btn.querySelector('.btn-icon');
    const text = btn.querySelector('.btn-text');

    if (settings.isColorMode) {
        icon.textContent = '🎨';
        text.textContent = 'カラー';
    } else {
        icon.textContent = '⚫';
        text.textContent = '白黒';
    }

    console.log(`🎨 カラーモード: ${settings.isColorMode ? 'カラー' : '白黒'}`);
}

// 再生/一時停止切り替え
function togglePlayPause() {
    if (!video) return;

    settings.isPlaying = !settings.isPlaying;

    if (settings.isPlaying) {
        video.play();
        updateStatus('再生中');
    } else {
        video.pause();
        updateStatus('一時停止');
    }

    updatePlayPauseButton();
}

function updatePlayPauseButton() {
    const btn = elements.playPauseBtn;
    const icon = btn.querySelector('.btn-icon');
    const text = btn.querySelector('.btn-text');

    if (settings.isPlaying) {
        icon.textContent = '⏸️';
        text.textContent = '一時停止';
        btn.className = 'control-btn success';
    } else {
        icon.textContent = '▶️';
        text.textContent = '再生';
        btn.className = 'control-btn primary';
    }
}

// リセット
function resetApp() {
    console.log('🔄 アプリリセット');

    // 動画停止・破棄
    if (video) {
        video.pause();
        video.src = '';
        video = null;
    }

    videoLoaded = false;
    prevPixels = null;

    // UI初期化
    elements.canvasContainer.classList.add('hidden');
    elements.controls.classList.add('hidden');
    elements.dropzone.classList.remove('hidden');

    // 設定リセット
    settings.isColorMode = true;
    settings.isPlaying = true;
    settings.blockSize = 10;
    settings.sensitivity = 0.3;

    // スライダー値リセット
    elements.blockSizeSlider.value = 10;
    elements.sensitivitySlider.value = 30;
    elements.blockSizeValue.textContent = '10';
    elements.sensitivityValue.textContent = '0.30';

    // ボタン状態リセット
    const colorBtn = elements.colorModeBtn;
    colorBtn.querySelector('.btn-icon').textContent = '🎨';
    colorBtn.querySelector('.btn-text').textContent = 'カラー';

    const playBtn = elements.playPauseBtn;
    playBtn.querySelector('.btn-icon').textContent = '⏸️';
    playBtn.querySelector('.btn-text').textContent = '一時停止';
    playBtn.className = 'control-btn success';

    // フレームレートを下げる
    frameRate(1);
    background(20);

    updateStatus('待機中');
}

// ステータス表示更新
function updateStatus(status) {
    elements.statusDisplay.textContent = `状態: ${status}`;
}

// ========== ユーティリティ ==========

// ウィンドウリサイズ時の処理（レスポンシブ対応）
function windowResized() {
    // 動画読み込み済みの場合、コンテナ幅に合わせてスケーリング
    // ※今回はシンプルにキャンバスサイズは固定とする
}
