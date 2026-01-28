
// =======================================================
// Motion Mosaic - Final Brain
// バックエンドが「何でも屋」になったので、フロントは「指示役」に徹します。
// =======================================================

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const dropzone = document.getElementById('dropzone');
    const resultContainer = document.getElementById('resultContainer');
    const resultImage = document.getElementById('resultImage');
    const statusMessage = document.getElementById('statusMessage');
    const resetBtn = document.getElementById('resetBtn');

    let currentOutputName = null;

    // ファイル選択
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) uploadAndProcess(e.target.files[0]);
    });

    // ドロップ＆ドラッグ
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) uploadAndProcess(e.dataTransfer.files[0]);
    });

    // リセット：すべてを無慈悲に初期化します
    resetBtn.addEventListener('click', () => {
        resultImage.src = "";
        resultContainer.classList.remove('active');
        dropzone.style.display = 'flex';
        fileInput.value = '';
        currentOutputName = null;
        const dlBtn = document.getElementById('downloadBtn');
        if (dlBtn) dlBtn.remove();
        statusMessage.textContent = '待機中...';
    });

    async function uploadAndProcess(file) {
        dropzone.style.display = 'none';
        resultContainer.classList.add('active');
        statusMessage.textContent = 'バックエンドへ動画を輸送中...';

        const formData = new FormData();
        formData.append('file', file);

        try {
            // 1. ファイルをアップロードして「通し番号」をもらう
            const response = await fetch('/upload', { method: 'POST', body: formData });
            if (!response.ok) throw new Error('通信エラー');

            const data = await response.json();
            const { temp_name, output_name } = data;
            currentOutputName = output_name;

            statusMessage.textContent = 'バックエンドでモザイク演算を開始しました。';

            // 2. ストリーミングリクエスト
            // URLにユニークな名前を入れることで、キャッシュ事故を防ぎます
            resultImage.src = `/stream/${temp_name}/${output_name}?t=${Date.now()}`;

            // 3. 完了検知
            // ストリーム(MJPEG)は何らかの原因で止まると 'error' イベントが出る性質を利用
            resultImage.onerror = () => {
                statusMessage.textContent = '処理終了（または通信終了）。動画を保存できます。';
                showDownloadBtn(output_name);
            };

        } catch (error) {
            statusMessage.textContent = 'エラー: ' + error.message;
            console.error(error);
        }
    }

    function showDownloadBtn(filename) {
        // 重複防止
        if (document.getElementById('downloadBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'downloadBtn';
        btn.className = 'control-btn success';
        btn.innerHTML = '<span>📥</span> 処理済み動画を保存';
        btn.style.marginTop = '20px';
        btn.onclick = () => {
            window.location.href = `/download/${filename}`;
        };

        // ボタン群の上（あるいはステータスの下）に挿入
        resultContainer.appendChild(btn);
    }
});
