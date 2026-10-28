// step1.js (STEP1 光を作ろう): LEDシミュレータ。通信は comm.js (iPad: 音声 / Windows・ChromeOS: HID)。
let appState = 0;

const comm = window.parent.comm;

const ledImage = document.getElementById('led-image');
const deviceStatusText = document.getElementById('device-status');

// ===== ボタン連打防止 =====
// ボタンをタップした後、この時間(ms)だけ全ボタンの操作を受け付けない。
// マイコンが連打で誤動作するのを防ぐため。値は後で調整する想定。
const BUTTON_COOLDOWN_MS = 500;
let isButtonLocked = false;
const allButtonIds = ['red-on', 'red-off', 'green-on', 'green-off', 'blue-on', 'blue-off', 'end-btn'];

function lockButtonsTemporarily() {
    isButtonLocked = true;
    allButtonIds.forEach(id => { document.getElementById(id).disabled = true; });
    setTimeout(() => {
        isButtonLocked = false;
        allButtonIds.forEach(id => { document.getElementById(id).disabled = false; });
    }, BUTTON_COOLDOWN_MS);
}

window.addEventListener('DOMContentLoaded', () => {
    // 他のタブで一度でも接続ボタンを押していれば、ヒントは表示しない
    if (window.parent && window.parent.commHasClickedConnect) {
        const hint = document.getElementById('connect-hint');
        if (hint) hint.style.display = 'none';
    }

    // 既に接続済みなら (他のタブで接続した場合など)、状態表示を更新する
    // (現在の色は、読み込み時の render() で送信済み)
    if (comm && comm.connected) {
        deviceStatusText.textContent = `接続中 (${comm.productName})`;
        deviceStatusText.style.color = '#0ff';
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
        deviceStatusText.textContent = `接続中 (${comm.productName})`;
        deviceStatusText.style.color = '#0ff';

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
    // ボタンが無効(連打防止のロック中)の間は、信号も送信しない
    if (isButtonLocked) return;
    try {
        await comm.sendLed(appState);
    } catch (error) {
        console.error("LED送信エラー:", error);
    }
}

function render() {
    if (appState === 8) {
        ledImage.style.backgroundColor = '#555';
        ledImage.style.boxShadow = 'none';
        document.getElementById('red-on').classList.remove('pressed');
        document.getElementById('green-on').classList.remove('pressed');
        document.getElementById('blue-on').classList.remove('pressed');
    } else {
        document.getElementById('red-on').classList.toggle('pressed', (appState & 1) !== 0);
        document.getElementById('green-on').classList.toggle('pressed', (appState & 2) !== 0);
        document.getElementById('blue-on').classList.toggle('pressed', (appState & 4) !== 0);
        if (appState === 0) {
            ledImage.style.backgroundColor = '#555';
            ledImage.style.boxShadow = 'none';
        } else {
            const r = (appState & 1) ? 255 : 0;
            const g = (appState & 2) ? 255 : 0;
            const b = (appState & 4) ? 255 : 0;
            ledImage.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
            ledImage.style.boxShadow = `0 0 30px rgb(${r}, ${g}, ${b})`;
        }
    }
    sendStateToDevice();
}

window.turnOn = function(value) {
    if (isButtonLocked) return;
    if (appState === 8) appState = 0;
    appState |= value;
    render();
    lockButtonsTemporarily();
};

window.turnOff = function(value) {
    if (isButtonLocked) return;
    if (appState === 8) appState = 0;
    appState &= ~value;
    render();
    lockButtonsTemporarily();
};

window.endApp = function() {
    if (isButtonLocked) return;
    appState = 8;
    render();
    lockButtonsTemporarily();
};

// 親画面(index.html)の STEP2 タブを開く
window.goToStep2 = function() {
    if (window.parent && window.parent.showPageById) {
        window.parent.showPageById('tab-step2');
    }
};

document.getElementById('red-on').addEventListener('click', () => turnOn(1));
document.getElementById('red-off').addEventListener('click', () => turnOff(1));
document.getElementById('green-on').addEventListener('click', () => turnOn(2));
document.getElementById('green-off').addEventListener('click', () => turnOff(2));
document.getElementById('blue-on').addEventListener('click', () => turnOn(4));
document.getElementById('blue-off').addEventListener('click', () => turnOff(4));
document.getElementById('end-btn').addEventListener('click', endApp);

render();