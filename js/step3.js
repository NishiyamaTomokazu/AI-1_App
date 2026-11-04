// step3.js (STEP3 反復処理): ブロックでプログラムを作り、AI クロックへ転送・実行する。
// 通信は comm.js (iPad: 音声 / Windows・ChromeOS: HID)。接続は STEP0 で行う。
//   転送データ: [230, 2, ...ブロックのバイト列, 231, 250]
//     cmd_led         → [130, R, G, B, 秒×4, 次のアドレス]
//     cmd_wait_sound  → [170, 次のアドレス]
//     cmd_wait_switch → [171, 次のアドレス]
//     cmd_loop        → [190, 回数, 中身の先頭アドレス] … 中身 … [191, 次のアドレス]  (入れ子にできる)
//   実行: 実行コマンド (iPad: [253, 2] / HID: [241]) を送り、画面上でも実行中のブロックを光らせる。
//         音・スイッチのブロックは、マイコンから確認コード [170, 1] / [171, 1] が届くまで待つ。
//         繰り返しのブロックは、繰り返しに入ったときに1回だけ届く [190, 1] を待ってから中身へ進む。
//         (入れ子の内側の繰り返しは、外側の1周ごとに入り直すので、そのたびに届く)
let isSimulating = false;
let isTransferring = false;   // 転送中 (接続・[252] 後の待ち時間を含む) は、転送・実行ボタンを受け付けない
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// WebHID で転送時に接続したとき、[252] を送ってからマイコンの動作が終わるまで待つ時間
const HID_HELLO_WAIT_MS = 3000;

const comm = window.parent.comm;

const deviceStatusText = document.getElementById('device-status');
const sampleButtons = ['loop-sample1-btn', 'loop-sample2-btn'].map(id => document.getElementById(id));

// ブロックごとのバイト数 (cmd_loop は先頭の [190, 回数, 先頭] の分。最後に [191, 次] の2バイトが付く)
const BLOCK_SIZE = { cmd_led: 6, cmd_wait_sound: 2, cmd_wait_switch: 2, cmd_loop: 3 };
const LOOP_END_SIZE = 2;
// 待ちブロックと、成立したときにマイコンから届く確認コード
const SENSOR_CODE = { cmd_wait_sound: 170, cmd_wait_switch: 171 };
const LOOP_START_CODE = 190;
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

// ===== 受信の監視 (comm-byte の並びから 170/171/190 の2バイト組を検出する) =====
// 届いた確認コードは順番に貯めておき、実行中のブロックが前から取り出す。
// [190, 1] は画面側がそのブロックに着く前に届くことがあるため、取りこぼさないよう貯めておく。
// (入れ子の繰り返しでも、届く順番と画面で進む順番が同じなので、前から取り出せば合う)
const RX_CODES = [...Object.values(SENSOR_CODE), LOOP_START_CODE];
let rxBuffer = [];
let rxQueue = [];
let rxWaiter = null;
window.addEventListener('comm-byte', (e) => {
    rxBuffer.push(e.detail.value);
    if (rxBuffer.length > 2) rxBuffer.shift();
    if (rxBuffer.length === 2 && RX_CODES.includes(rxBuffer[0])) {
        rxQueue.push([...rxBuffer]);
        rxBuffer = [];
        if (rxWaiter) rxWaiter();
    }
});

// 確認コード (例: 170,1) が届くまで待つ。それより前に貯まっていた別のコードは捨てる
async function waitForCode(targetCode, targetValue) {
    while (isSimulating) {
        const i = rxQueue.findIndex(d => d[0] === targetCode && d[1] === targetValue);
        if (i >= 0) {
            rxQueue.splice(0, i + 1);
            return;
        }
        await new Promise(resolve => { rxWaiter = resolve; });
        rxWaiter = null;
    }
}

// ===== Blockly =====
window.addEventListener('load', () => {
    window.workspace = Blockly.inject('blocklyDiv', {
        toolbox: document.getElementById('toolbox'),
        move: { scrollbars: true, drag: true, wheel: true },
        sounds: false   // ブロックを置いたとき・消したときの効果音を鳴らさない
    });
    Blockly.serialization.workspaces.load(defaultBlocksJsonStep3, window.workspace);
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
    'loop-sample1-btn': {
        json: loopSample1BlocksJsonStep3,
        first: '赤が3回点滅します',
        again: 'くり返す回数や色を変えて、点滅のしかたを変えてみよう',
    },
    'loop-sample2-btn': {
        json: loopSample2BlocksJsonStep3,
        first: 'スイッチを3回押すと、AIクロックが赤く光ります',
        again: 'くり返す回数を変えて、何回押すと光るか試してみよう',
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
    const info = new Map();
    function assignAddresses(first, addr) {
        for (let b = first; b; b = b.getNextBlock()) {
            const bi = { addr };
            info.set(b.id, bi);
            addr += BLOCK_SIZE[b.type] || 0;
            if (b.type === 'cmd_loop') {
                bi.bodyStart = addr;
                addr = assignAddresses(b.getInputTargetBlock('DO'), addr);
                bi.loopEndAddr = addr;
                addr += LOOP_END_SIZE;
            }
        }
        return addr;
    }

    function generateBytes(first, exitAddr) {
        const bytes = [];
        for (let b = first; b; b = b.getNextBlock()) {
            const next = b.getNextBlock();
            const nextAddr = next ? info.get(next.id).addr : exitAddr;
            if (b.type === 'cmd_led') {
                const [r, g, bl] = LED_COLORS[b.getFieldValue('COLOR')];
                const sec = Math.round(Number(b.getFieldValue('TIME')) * 4);
                bytes.push(130, r, g, bl, sec, nextAddr);
            } else if (b.type in SENSOR_CODE) {
                bytes.push(SENSOR_CODE[b.type], nextAddr);
            } else if (b.type === 'cmd_loop') {
                const bi = info.get(b.id);
                bytes.push(190, Number(b.getFieldValue('COUNT')), bi.bodyStart);
                // 中身の最後は、この繰り返しの終わり [191, 次のアドレス] へ進む
                bytes.push(...generateBytes(b.getInputTargetBlock('DO'), bi.loopEndAddr));
                bytes.push(191, nextAddr);
            }
        }
        return bytes;
    }

    const endAddr = assignAddresses(firstBlock, 2);
    return generateBytes(firstBlock, endAddr);
}

document.getElementById('transfer-btn').addEventListener('click', async () => {
    if (isSimulating || isTransferring) return;
    const startBlock = getStartBlock();
    if (!startBlock) return alert("「プログラムスタート」ブロックが見つかりません！");

    const payload = buildProgramBytes(startBlock.getNextBlock());
    if (payload.length === 0) return alert("転送するブロックが繋がっていません！");

    isTransferring = true;
    try {
        // 未接続ならここで接続する (クリック操作の中なので、マイク許可・デバイス選択を出せる)
        if (!comm.connected) {
            if (!await comm.connect()) {
                return alert('AI クロックに接続できませんでした。\nSTEP0 で接続してから、もう一度お試しください。');
            }
            updateStatus();
            await comm.sendHello();
            // HID では [252] を受けたマイコンの動作が終わるまで待ってから転送する
            if (comm.mode === 'hid') await wait(HID_HELLO_WAIT_MS);
        }

        const programBytes = [230, 2, ...payload, 231, 250];
        console.log('◆プログラム転送:', programBytes);
        await comm.send(programBytes);
    } catch (err) {
        console.error('プログラム転送エラー:', err);
    } finally {
        isTransferring = false;
    }
});

// ===== プログラム実行 =====
// 繰り返しやセンサのブロックは、AI クロックからの合図が無いと先へ進めない
function needsDevice(first) {
    for (let b = first; b; b = b.getNextBlock()) {
        if (b.type in SENSOR_CODE || b.type === 'cmd_loop') return true;
    }
    return false;
}

async function executeBlocks(first) {
    for (let b = first; b && isSimulating; b = b.getNextBlock()) {
        if (b.type === 'cmd_loop') {
            const count = Number(b.getFieldValue('COUNT'));
            // [190, 1] は繰り返しに入ったとき (1周目の前) だけ届く。2周目以降はそのまま進む
            for (let i = 0; i < count && isSimulating; i++) {
                if (i === 0) await waitForCode(LOOP_START_CODE, 1);
                if (!isSimulating) break;
                window.workspace.highlightBlock(b.id);
                await executeBlocks(b.getInputTargetBlock('DO'));
            }
            continue;
        }
        window.workspace.highlightBlock(b.id);
        if (b.type === 'cmd_led') {
            await wait(Number(b.getFieldValue('TIME')) * 1000);
        } else if (b.type in SENSOR_CODE) {
            await waitForCode(SENSOR_CODE[b.type], 1);
        }
    }
}

document.getElementById('run-btn').addEventListener('click', async () => {
    if (isSimulating || isTransferring) return;
    const startBlock = getStartBlock();
    if (!startBlock) return;

    if (!comm.connected && needsDevice(startBlock.getNextBlock())) {
        return alert('繰り返しやセンサを使うプログラムは、AI クロックに接続してから実行してね。');
    }

    // 前回の実行の残りを捨ててから、実行コマンドを送る
    rxQueue = [];
    console.log("◆実行コマンド送信");
    comm.sendRun();

    isSimulating = true;
    sampleButtons.forEach(btn => btn.disabled = true);
    try {
        window.workspace.highlightBlock(startBlock.id);
        await executeBlocks(startBlock.getNextBlock());
    } catch (err) {
        console.error('プログラム実行中にエラー:', err);
    } finally {
        isSimulating = false;
        sampleButtons.forEach(btn => btn.disabled = false);
        if (window.workspace) window.workspace.highlightBlock(null);
    }
});

// 親画面(index.html)の STEP4 タブを開く
window.goToNext = function() {
    if (window.parent && window.parent.showPageById) {
        window.parent.showPageById('tab-step4');
    }
};
