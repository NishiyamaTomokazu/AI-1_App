// step6.js (STEP6 チャレンジ): 3秒チャレンジのゲーム。
// 通信は comm.js (iPad: 音声 / Windows・ChromeOS: HID)。
let appState = 0;
let gameActive = false;
let currentQuestion = 0;
let targetColorValue = -1;
let timerId = null;
let consecutiveFailures = 0;

const comm = window.parent.comm;

const ledImage = document.getElementById('led-image');
const stateValText = document.getElementById('state-val');
const deviceStatusText = document.getElementById('device-status');
const gameMessageEl = document.getElementById('game-message');
const questionNumEl = document.getElementById('question-num');
const clearContainer = document.getElementById('clear-container');

const colorTasks = { 0:"消灯させて", 1:"赤を点灯させて", 2:"緑を点灯させて", 3:"黄色を点灯させて", 4:"青を点灯させて", 5:"紫を点灯させて", 6:"水色を点灯させて", 7:"白を点灯させて" };

function showConnected() {
    deviceStatusText.textContent = `接続中 (${comm.productName})`;
    deviceStatusText.style.color = '#0ff';
}

// USBが抜かれたときなど
window.addEventListener('comm-status', (e) => {
    if (!e.detail.connected) {
        deviceStatusText.textContent = "未接続";
        deviceStatusText.style.color = "red";
    }
});

window.addEventListener('DOMContentLoaded', () => {
    // 他のタブで一度でも接続ボタンを押していれば、ヒントは表示しない
    if (window.parent && window.parent.commHasClickedConnect) {
        const hint = document.getElementById('connect-hint');
        if (hint) hint.style.display = 'none';
    }

    // 既に接続済みなら (他のタブで接続した場合など)、状態表示を更新する
    // (現在の色は、読み込み時の render() で送信済み)
    if (comm && comm.connected) {
        showConnected();
    }
});

document.getElementById('connect-btn').addEventListener('click', async () => {
    const hint = document.getElementById('connect-hint');
    if (hint) hint.style.display = 'none';
    if (window.parent) {
        window.parent.commHasClickedConnect = true;
    }

    const success = await comm.connect();
    if (success) {
        showConnected();
        console.log("◆AI クロック接続確認コマンド送信");
        await comm.sendHello();
        sendStateToDevice();
    } else if (comm.mode === 'fsk') {
        alert('マイクを使えませんでした。\nマイクの使用を許可してから、もう一度お試しください。');
    } else {
        alert('デバイスの接続に失敗したか、キャンセルされました。');
    }
});

async function sendStateToDevice() {
    try {
        await comm.sendLed(appState);
    } catch (error) {
        console.error("LED送信エラー:", error);
    }
}

window.startGame = function() {
    appState = 8; render();
    gameActive = true;
    currentQuestion = 0;
    gameMessageEl.style.color = "#333";

    if (questionNumEl) questionNumEl.style.display = 'inline-block';
    if (clearContainer) clearContainer.style.display = 'none';

    nextQuestion();
};

document.getElementById('start-game-btn').addEventListener('click', startGame);

function nextQuestion() {
    if (currentQuestion >= 5) {
        questionNumEl.textContent = "クリア！";
        gameMessageEl.textContent = "全問正解！";
        gameMessageEl.style.color = "#e65100";
        gameActive = false;
        if (clearContainer) clearContainer.style.display = 'block';
        return;
    }

    currentQuestion++; questionNumEl.textContent = `第 ${currentQuestion} 問 / 全5問`;

    let nextTarget;
    do { nextTarget = Math.floor(Math.random() * 8); } while (nextTarget === appState);
    targetColorValue = nextTarget;
    gameMessageEl.textContent = `${colorTasks[targetColorValue]}ください`;
    gameMessageEl.style.color = "#333";

    clearTimeout(timerId);
    timerId = setTimeout(() => {
        if (!gameActive) return;
        gameActive = false;
        targetColorValue = -1;
        consecutiveFailures++;

        if (consecutiveFailures >= 3) {
            questionNumEl.textContent = "終了！";
            gameMessageEl.innerHTML = `難しかったかな？<br><span style="font-size: 22px; font-weight: bold; color: #764ba2;">STEP1で色の作り方を復習しよう</span>`;
            consecutiveFailures = 0;
        } else {
            questionNumEl.textContent = "タイムアップ";
            gameMessageEl.innerHTML = `残念....<br><span style="font-size: 18px;">(正解数: ${currentQuestion - 1}問)</span>`;
            gameMessageEl.style.color = "red";
        }
    }, 3000);
}

function checkGame() {
    if (!gameActive || targetColorValue === -1) return;
    if (appState === targetColorValue) {
        clearTimeout(timerId);
        targetColorValue = -1;
        consecutiveFailures = 0;
        gameMessageEl.textContent = "正解！";
        gameMessageEl.style.color = "green";
        setTimeout(() => { if (gameActive) nextQuestion(); }, 600);
    }
}

function render() {
    stateValText.textContent = appState;
    if (appState === 8) {
        ledImage.style.backgroundColor = '#555'; ledImage.style.boxShadow = 'none';
        document.getElementById('red-on').classList.remove('pressed'); document.getElementById('green-on').classList.remove('pressed'); document.getElementById('blue-on').classList.remove('pressed');
    } else {
        document.getElementById('red-on').classList.toggle('pressed', (appState & 1) !== 0);
        document.getElementById('green-on').classList.toggle('pressed', (appState & 2) !== 0);
        document.getElementById('blue-on').classList.toggle('pressed', (appState & 4) !== 0);
        if (appState === 0) { ledImage.style.backgroundColor = '#555'; ledImage.style.boxShadow = 'none'; } else {
            const r = (appState & 1) ? 255 : 0, g = (appState & 2) ? 255 : 0, b = (appState & 4) ? 255 : 0;
            ledImage.style.backgroundColor = `rgb(${r}, ${g}, ${b})`; ledImage.style.boxShadow = `0 0 30px rgb(${r}, ${g}, ${b})`;
        }
    }
    sendStateToDevice(); checkGame();
}

window.turnOn = function(value) { if (appState === 8) appState = 0; appState |= value; render(); };
window.turnOff = function(value) { if (appState === 8) appState = 0; appState &= ~value; render(); };
window.endApp = function() { appState = 8; render(); };

document.getElementById('red-on').addEventListener('click', () => turnOn(1)); document.getElementById('red-off').addEventListener('click', () => turnOff(1));
document.getElementById('green-on').addEventListener('click', () => turnOn(2)); document.getElementById('green-off').addEventListener('click', () => turnOff(2));
document.getElementById('blue-on').addEventListener('click', () => turnOn(4)); document.getElementById('blue-off').addEventListener('click', () => turnOff(4));
document.getElementById('end-btn').addEventListener('click', endApp);

render();
