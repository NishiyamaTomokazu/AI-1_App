// step2.js (STEP2 順次処理): ブロックでプログラムを作り、AI クロックへ転送・実行する。
// 通信は comm.js (iPad: 音声 / Windows・ChromeOS: HID)。接続は STEP0 で行う。
//   転送データ: [230, 2, ...ブロックのバイト列, 231, 250]
//     cmd_led         → [130, R, G, B, 秒×4, 次のアドレス]
//     cmd_wait_sound  → [170, 次のアドレス]
//     cmd_wait_switch → [171, 次のアドレス]
//   実行: 実行コマンド (iPad: [253, 2] / HID: [241]) を送り、画面上でも実行中のブロックを光らせる。
//         音・スイッチのブロックは、マイコンから確認コード [170, 1] / [171, 1] が届くまで待つ。
let isSimulating = false;
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const comm = window.parent.comm;

const deviceStatusText = document.getElementById('device-status');
const sampleButtons = ['sound-sample-btn', 'switch-sample-btn'].map(id => document.getElementById(id));

// ブロックごとのバイト数
const BLOCK_SIZE = { cmd_led: 6, cmd_wait_sound: 2, cmd_wait_switch: 2 };
// 待ちブロックと、成立したときにマイコンから届く確認コード
const SENSOR_CODE = { cmd_wait_sound: 170, cmd_wait_switch: 171 };
const LED_COLORS = {
    red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255],
    yellow: [255, 255, 0], purple: [255, 0, 255], cyan: [0, 255, 255],
    white: [255, 255, 255], off: [0, 0, 0],
};

// ===== 接続状態の表示 =====
function updateStatus() {
    if (comm && comm.connected) {
        deviceStatusText.textContent = `接続中 (${comm.productName})`;
        deviceStatusText.style.color = '#0a8f6a';
    } else {
        deviceStatusText.textContent = '未接続';
        deviceStatusText.style.color = '#d33';
    }
}
window.addEventListener('comm-status', updateStatus);
updateStatus();

// ===== 受信の監視 (comm-byte の並びから 170/171 の2バイト組を検出する) =====
let rxBuffer = [];
window.addEventListener('comm-byte', (e) => {
    rxBuffer.push(e.detail.value);
    if (rxBuffer.length > 2) rxBuffer.shift();
    if (rxBuffer.length === 2 && Object.values(SENSOR_CODE).includes(rxBuffer[0])) {
        const data = [...rxBuffer];
        rxBuffer = [];
        window.dispatchEvent(new CustomEvent('sensor-detected', { detail: { data } }));
    }
});

// 確認コード (例: 170,1) が届くまで待つ
function waitForSensor(targetCode, targetValue) {
    return new Promise((resolve) => {
        const listener = (event) => {
            const data = event.detail.data;
            if (data[0] === targetCode && data[1] === targetValue) {
                window.removeEventListener('sensor-detected', listener);
                resolve();
            }
        };
        window.addEventListener('sensor-detected', listener);
    });
}

// ===== Blockly =====
window.addEventListener('load', () => {
    window.workspace = Blockly.inject('blocklyDiv', {
        toolbox: document.getElementById('toolbox'),
        move: { scrollbars: true, drag: true, wheel: true }
    });
    Blockly.serialization.workspaces.load(defaultBlocksJsonStep2, window.workspace);
    const resizeObserver = new ResizeObserver(() => {
        if (window.workspace) Blockly.svgResize(window.workspace);
    });
    resizeObserver.observe(document.getElementById('blocklyDiv'));
});

function getStartBlock() {
    return window.workspace ? window.workspace.getBlocksByType('cmd_start')[0] : null;
}

// ===== サンプル (プログラムエリアの中身を置き換え、説明文を変える) =====
// 説明文は、そのサンプルを押すのが1回目か2回目以降かで変える (ページを開き直すと1回目に戻る)
const SAMPLES = {
    'sound-sample-btn': {
        json: soundSampleBlocksJsonStep2,
        first: '音センサに合図を送ると、AIクロックが赤く光ります',
        again: '音センサと他のブロックを組み合わせて、光り方を変えてみよう',
    },
    'switch-sample-btn': {
        json: switchSampleBlocksJsonStep2,
        first: 'スイッチを押すと、AIクロックが赤、緑、青の順に光ります',
        again: 'スイッチセンサと他のブロックを組み合わせて、光り方を変えてみよう',
    },
};
const messageEl = document.getElementById('prog-message');

for (const [id, sample] of Object.entries(SAMPLES)) {
    let count = 0;
    document.getElementById(id).addEventListener('click', () => {
        if (isSimulating || !window.workspace) return;
        window.workspace.clear();
        Blockly.serialization.workspaces.load(sample.json, window.workspace);
        count++;
        messageEl.textContent = count === 1 ? sample.first : sample.again;
    });
}

// ===== プログラム転送 =====
// 「プログラムスタート」の下につながったブロックを、転送用のバイト列にする
function buildProgramBytes(firstBlock) {
    // 各ブロックのアドレスを決める (先頭の 230, 2 の後ろ = アドレス2 から)
    const addrOf = new Map();
    let addr = 2;
    for (let b = firstBlock; b; b = b.getNextBlock()) {
        addrOf.set(b.id, addr);
        addr += BLOCK_SIZE[b.type] || 0;
    }
    const endAddr = addr;

    const bytes = [];
    for (let b = firstBlock; b; b = b.getNextBlock()) {
        const next = b.getNextBlock();
        const nextAddr = next ? addrOf.get(next.id) : endAddr;
        if (b.type === 'cmd_led') {
            const [r, g, bl] = LED_COLORS[b.getFieldValue('COLOR')];
            const sec = Math.round(Number(b.getFieldValue('TIME')) * 4);
            bytes.push(130, r, g, bl, sec, nextAddr);
        } else if (b.type in SENSOR_CODE) {
            bytes.push(SENSOR_CODE[b.type], nextAddr);
        }
    }
    return bytes;
}

document.getElementById('transfer-btn').addEventListener('click', async () => {
    if (isSimulating) return;
    const startBlock = getStartBlock();
    if (!startBlock) return alert("「プログラムスタート」ブロックが見つかりません！");

    const payload = buildProgramBytes(startBlock.getNextBlock());
    if (payload.length === 0) return alert("転送するブロックが繋がっていません！");

    // 未接続ならここで接続する (クリック操作の中なので、マイク許可・デバイス選択を出せる)
    if (!comm.connected) {
        if (!await comm.connect()) {
            return alert('AI クロックに接続できませんでした。\nSTEP0 で接続してから、もう一度お試しください。');
        }
        updateStatus();
        await comm.sendHello();
    }

    const programBytes = [230, 2, ...payload, 231, 250];
    console.log('◆プログラム転送:', programBytes);
    try {
        await comm.send(programBytes);
    } catch (err) {
        console.error('プログラム転送エラー:', err);
    }
});

// ===== プログラム実行 =====
document.getElementById('run-btn').addEventListener('click', async () => {
    if (isSimulating) return;
    const startBlock = getStartBlock();
    if (!startBlock) return;

    // センサを待つブロックは、AI クロックからの合図が無いと先へ進めない
    const blocks = [];
    for (let b = startBlock.getNextBlock(); b; b = b.getNextBlock()) blocks.push(b);
    if (!comm.connected && blocks.some(b => b.type in SENSOR_CODE)) {
        return alert('センサを使うプログラムは、AI クロックに接続してから実行してね。');
    }

    console.log("◆実行コマンド送信");
    comm.sendRun();

    isSimulating = true;
    sampleButtons.forEach(btn => btn.disabled = true);
    try {
        window.workspace.highlightBlock(startBlock.id);
        for (const b of blocks) {
            if (!isSimulating) break;
            window.workspace.highlightBlock(b.id);
            if (b.type === 'cmd_led') {
                await wait(Number(b.getFieldValue('TIME')) * 1000);
            } else if (b.type in SENSOR_CODE) {
                await waitForSensor(SENSOR_CODE[b.type], 1);
            }
        }
    } catch (err) {
        console.error('プログラム実行中にエラー:', err);
    } finally {
        isSimulating = false;
        sampleButtons.forEach(btn => btn.disabled = false);
        if (window.workspace) window.workspace.highlightBlock(null);
    }
});

// 親画面(index.html)の STEP3 タブを開く
window.goToNext = function() {
    if (window.parent && window.parent.showPageById) {
        window.parent.showPageById('tab-step3');
    }
};
