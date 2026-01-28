
// =======================================================
// MP4-NOICE - Signal Brain 6.0 (Visual Progress)
// =======================================================

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const dropzone = document.getElementById('dropzone');
    const resultContainer = document.getElementById('resultContainer');
    const resultImage = document.getElementById('resultImage');
    const statusMessage = document.getElementById('statusMessage');
    const resetBtn = document.getElementById('resetBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const skipBtn = document.getElementById('skipBtn');
    const loader = document.getElementById('loader');
    const asciiArt = document.getElementById('asciiArt');
    const logConsole = document.getElementById('logConsole');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');

    const ART = {
        WORKING: `　　　　∧__∧\n　　　（　´∀｀）\n　　　(　O┬O\n≡◎-ヽJ┴◎`,
        ERROR: `｡ 　　∧＿∧｡ﾟ\n　ﾟ 　(ﾟ ´Д｀ﾟ )っﾟ\n　　　(つ　　　/\n　　 　| 　 （⌒）\n　　　 し⌒`,
        SUCCESS: `　　 n ∧＿∧\n　　(ﾖ（´∀｀　） ｸﾞｯｼﾞｮﾌﾞ!\n　　　Y 　　　つ`
    };

    let currentTempName = null;
    let currentOutputName = null;

    async function updateLogs() {
        try {
            const res = await fetch('/logs');
            const data = await res.json();
            if (data.logs) {
                logConsole.textContent = data.logs;
                logConsole.scrollTop = logConsole.scrollHeight;

                // ログから進捗(%)を抽出してバーに反映
                // 初心者メモ: 正規表現で "📊 進捗: 45.3%" のような文字を探します
                const match = data.logs.match(/進捗: (\d+\.\d+)%/);
                if (match) {
                    const percent = match[1];
                    progressBar.style.width = `${percent}%`;
                }
            }
        } catch (e) { }
    }
    setInterval(updateLogs, 1000);

    fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) uploadAndProcess(e.target.files[0]); });
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault(); dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) uploadAndProcess(e.dataTransfer.files[0]);
    });

    resetBtn.addEventListener('click', () => { location.reload(); });

    skipBtn.addEventListener('click', async () => {
        if (!currentTempName) return;
        resultImage.src = "";
        resultImage.style.display = "none";
        skipBtn.style.display = "none";
        loader.style.display = "block";
        progressContainer.style.display = "block"; // バー表示
        progressBar.style.width = "0%";
        statusMessage.textContent = 'NITROモード全開。進捗を見守ってください。';
        asciiArt.textContent = ART.WORKING;
        asciiArt.classList.add('vibrating', 'active');

        try {
            const res = await fetch(`/nitro_process/${currentTempName}/${currentOutputName}`);
            const data = await res.json();
            if (data.status === "completed") {
                progressBar.style.width = "100%";
                setTimeout(finishProcessing, 500);
            }
        } catch (e) { handleError(e); }
    });

    async function uploadAndProcess(file) {
        dropzone.style.display = 'none';
        resultContainer.classList.add('active');
        statusMessage.textContent = 'データ転送中...';

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/upload', { method: 'POST', body: formData });
            const data = await response.json();
            currentTempName = data.temp_name;
            currentOutputName = data.output_name;

            statusMessage.textContent = '解析開始。最速なら🚀を。';
            resultImage.style.display = 'block';
            resultImage.src = `/stream/${currentTempName}/${currentOutputName}?t=${Date.now()}`;
            asciiArt.textContent = ART.WORKING;
            asciiArt.classList.add('active');
            skipBtn.style.display = 'inline-block';

            resultImage.onerror = () => { if (resultImage.src !== "" && resultImage.style.display !== "none") finishProcessing(); };
        } catch (error) { handleError(error); }
    }

    function finishProcessing() {
        loader.style.display = 'none';
        resultImage.style.display = 'none';
        skipBtn.style.display = 'none';
        progressContainer.style.display = 'none';
        statusMessage.textContent = '全工程、完了しました。';
        asciiArt.textContent = ART.SUCCESS;
        asciiArt.classList.remove('vibrating');
        downloadBtn.style.display = 'inline-block';
        downloadBtn.onclick = () => { window.location.href = `/download/${currentOutputName}`; };
    }

    function handleError(e) {
        statusMessage.textContent = '致命的エラー';
        asciiArt.textContent = ART.ERROR;
        progressContainer.style.display = 'none';
        console.error(e);
    }
});
