// step5.js (STEP5 総合): ブロックでプログラムを作り、AI クロックへ転送・実行する。
// 通信は comm.js (iPad: 音声 / Windows・ChromeOS: HID)。接続は STEP0 で行う。
// ツールエリアは「LED」「制御」「センサ」「タイマー」「サウンド」のタブに分けてある (step5.html の toolbox)。
//   転送データ: [230, 2, ...ブロックのバイト列, 231, 250]
//     cmd_led                  → [130, R, G, B, 秒×4, 次のアドレス]
//     cmd_led_fade             → [131 (フェードイン) / 132 (フェードアウト), R, G, B, 次のアドレス]
//     cmd_led_conti            → [135, 色番号, 次のアドレス]  (0:赤 1:緑 2:青 3:黄色 4:紫 5:水色 6:白)
//     cmd_led_off              → [136, 次のアドレス]
//     cmd_backlight            → [140, 100, 秒×4, 次のアドレス]
//     cmd_backlight_conti      → [141, 次のアドレス]
//     cmd_backlight_off        → [142, 次のアドレス]
//     cmd_sound1 / 2 / 3       → [150 / 151 / 152, 次のアドレス]
//     cmd_music                → [153, 1, 次のアドレス]
//     cmd_wait_sound           → [170, 次のアドレス]
//     cmd_wait_switch          → [171, 次のアドレス]
//     cmd_wait_timer           → [160, T, 次のアドレス]
//     cmd_wait_timer_or_sound  → [161, T, 次のアドレス]
//     cmd_wait_timer_or_switch → [162, T, 次のアドレス]
//     cmd_loop        → [190, 回数, 中身の先頭アドレス] … 中身 … [191, 次のアドレス]  (入れ子にできる)
//     cmd_if / cmd_if_else → [180 (SW=ON) / 181 (SW=OFF), YESの先頭アドレス, Noの先頭アドレス] … YES … No …
//                            (YES・No の最後は「もし〜なら」の次へ進む。空の側は次のアドレス)
//   実行: 実行コマンド (iPad: [253, 2] / HID: [241]) を送り、画面上でも実行中のブロックを光らせる。
//         「赤を1秒点灯」は画面側で秒数だけ待つ。
//         それ以外のLED・バックライト・サウンド・音・スイッチ・動作停止のブロックは、
//         マイコンから終了の合図 [そのブロックの命令コード, 1] が届くまで待つ。
//         繰り返しのブロックは、繰り返しに入ったときに1回だけ届く [190, 1] を待ってから中身へ進む。
//         「もし〜なら」は、判定結果 [180, 1/0] / [181, 1/0] (1=真 → YES, 0=偽 → No) を待って進む。
let isSimulating = false;
let isTransferring = false;   // 転送中 (接続・[252] 後の待ち時間を含む) は、転送・実行ボタンを受け付けない
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// WebHID で転送時に接続したとき、[252] を送ってからマイコンの動作が終わるまで待つ時間
const HID_HELLO_WAIT_MS = 3000;

const comm = window.parent.comm;

const deviceStatusText = document.getElementById('device-status');
// 実行中は押せなくするボタン (プログラムエリアの中身を置き換えるもの)
const lockButtons = ['sample1-btn', 'sample2-btn', 'load-btn'].map(id => document.getElementById(id));

// ブロックごとのバイト数 (cmd_loop は先頭の [190, 回数, 先頭] の分。最後に [191, 次] の2バイトが付く)
const BLOCK_SIZE = {
    cmd_led: 6, cmd_led_fade: 5, cmd_led_conti: 3, cmd_led_off: 2,
    cmd_backlight: 4, cmd_backlight_conti: 2, cmd_backlight_off: 2,
    cmd_sound1: 2, cmd_sound2: 2, cmd_sound3: 2, cmd_music: 3,
    cmd_wait_sound: 2, cmd_wait_switch: 2,
    cmd_wait_timer: 3, cmd_wait_timer_or_sound: 3, cmd_wait_timer_or_switch: 3,
    cmd_loop: 3, cmd_if: 3, cmd_if_else: 3,
};
const LOOP_END_SIZE = 2;
// [コード, 次のアドレス] の2バイトで送るブロックの命令コード
// (cmd_music だけは [153, 1, 次のアドレス] の3バイトで送る。終了の合図 [153, 1] はほかと同じ)
const SIMPLE_CODE = {
    cmd_led_off: 136, cmd_backlight_conti: 141, cmd_backlight_off: 142,
    cmd_sound1: 150, cmd_sound2: 151, cmd_sound3: 152, cmd_music: 153,
    cmd_wait_sound: 170, cmd_wait_switch: 171,
};
// 動作停止のブロックの命令コード ([コード, T, 次のアドレス])
const TIMER_CODE = { cmd_wait_timer: 160, cmd_wait_timer_or_sound: 161, cmd_wait_timer_or_switch: 162 };
const FADE_CODE = { in: 131, out: 132 };
const LED_CONTI_CODE = 135;
const BACKLIGHT_CODE = 140;
const LOOP_START_CODE = 190;
// 条件ブロックと、判定結果としてマイコンから届くコード
const COND_CODE = { cond_switch_on: 180, cond_switch_off: 181 };
const IF_TYPES = ['cmd_if', 'cmd_if_else'];
const LED_COLORS = {
    red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255],
    yellow: [255, 255, 0], purple: [255, 0, 255], cyan: [0, 255, 255],
    white: [255, 255, 255], off: [0, 0, 0],
};
// 「〜を連続点灯」で送る色番号
const LED_COLOR_NUMBER = { red: 0, green: 1, blue: 2, yellow: 3, purple: 4, cyan: 5, white: 6 };

// 終わったときにマイコンから [コード, 1] が届くブロックの、そのコード (それ以外は null)
function doneCodeOf(b) {
    switch (b.type) {
        case 'cmd_led_fade': return FADE_CODE[b.getFieldValue('FADE')];
        case 'cmd_led_conti': return LED_CONTI_CODE;
        case 'cmd_backlight': return BACKLIGHT_CODE;
        default: return SIMPLE_CODE[b.type] ?? TIMER_CODE[b.type] ?? null;
    }
}

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

// ===== 受信の監視 (comm-byte の並びから、下の RX_CODES の2バイト組を検出する) =====
// 届いたコードは順番に貯めておき、実行中のブロックが前から取り出す。
// コードは画面側がそのブロックに着く前に届くことがあるため、取りこぼさないよう貯めておく。
const RX_CODES = [
    ...Object.values(FADE_CODE), LED_CONTI_CODE, BACKLIGHT_CODE,
    ...Object.values(SIMPLE_CODE), ...Object.values(TIMER_CODE),
    LOOP_START_CODE, ...Object.values(COND_CODE),
];
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

// コード (例: 170,1) が届くまで待ち、届いた値を返す。targetValue を省くと値は問わない (判定結果 180/181 用)。
// それより前に貯まっていた別のコードは捨てる
async function waitForCode(targetCode, targetValue) {
    while (isSimulating) {
        const i = rxQueue.findIndex(d => d[0] === targetCode && (targetValue === undefined || d[1] === targetValue));
        if (i >= 0) {
            const value = rxQueue[i][1];
            rxQueue.splice(0, i + 1);
            return value;
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
        sounds: false,   // ブロックを置いたとき・消したときの効果音を鳴らさない
        // 「プログラムスタート」は1つだけ。置いてある間は、制御タブの「プログラムスタート」が灰色になる
        maxInstances: { cmd_start: 1 }
    });
    Blockly.serialization.workspaces.load(defaultBlocksJsonStep5, window.workspace);
    unlockStartBlocks();
    const resizeObserver = new ResizeObserver(() => {
        if (window.workspace) Blockly.svgResize(window.workspace);
    });
    resizeObserver.observe(document.getElementById('blocklyDiv'));
});

function getStartBlock() {
    return window.workspace ? window.workspace.getBlocksByType('cmd_start')[0] : null;
}

const NO_START_MESSAGE = '「制御」タブから「プログラムスタート」を置いてね';

// 「プログラムスタート」を動かせて、ゴミ箱に捨てられるようにする。
// 捨てると、下につながったブロックもまとめて消える (= プログラムを削除)
function unlockStartBlocks() {
    window.workspace.getBlocksByType('cmd_start').forEach(b => {
        b.setMovable(true);
        b.setDeletable(true);
    });
}

// ===== サンプル (プログラムエリアの中身を置き換え、説明文を変える) =====
// 説明文は、そのサンプルを押すのが1回目か2回目以降かで変える (ページを開き直すと1回目に戻る)
const SAMPLES = {
    'sample1-btn': {
        json: sample1BlocksJsonStep5,
        first: '白がだんだん明るくなり、そのあとだんだん暗くなります',
        again: '色を変えて、フェードイン・フェードアウトを試してみよう',
    },
    'sample2-btn': {
        json: sample2BlocksJsonStep5,
        first: '赤とバックライトが点灯し、3秒たつとバックライトが消えます。音を鳴らすか10秒たつと、プログラムが終わって赤も消えます',
        again: '色々なブロックを組み合わせて、自由にプログラムしてください',
    },
};
const messageEl = document.getElementById('prog-message');

for (const [id, sample] of Object.entries(SAMPLES)) {
    let count = 0;
    document.getElementById(id).addEventListener('click', () => {
        if (isSimulating || !window.workspace) return;
        window.workspace.clear();
        Blockly.serialization.workspaces.load(sample.json, window.workspace);
        unlockStartBlocks();
        count++;
        messageEl.textContent = count === 1 ? sample.first : sample.again;
    });
}

// ===== プログラム保存・読み込み (JSON ファイル) =====
// ファイルの中身: { app: 'AI-1', step: 5, program: Blockly のワークスペースの保存データ }
// 保存: OS の保存ダイアログ (showSaveFilePicker) を出し、ファイル名と場所を選んでもらう。
//       ダイアログが使えないブラウザ (iPad の Safari など) では、ファイル名を聞いてからダウンロードする。
// 読み込み: OS のファイル選択ダイアログでファイルを選び、確認してからプログラムエリアを置き換える。
const SAVE_FILE_NAME = 'プログラム.json';
const SAVE_FILE_TYPE = { description: 'AI-1 プログラム', accept: { 'application/json': ['.json'] } };

async function saveWithPicker(text) {
    let handle;
    try {
        handle = await window.showSaveFilePicker({ suggestedName: SAVE_FILE_NAME, types: [SAVE_FILE_TYPE] });
    } catch (err) {
        if (err.name === 'AbortError') return false;   // キャンセルされた
        throw err;
    }
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return true;
}

function saveWithDownload(text) {
    let name = prompt('保存するファイル名を入力してね', SAVE_FILE_NAME.replace(/\.json$/, ''));
    if (!name || !name.trim()) return false;
    name = name.trim();
    if (!/\.json$/i.test(name)) name += '.json';
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
}

document.getElementById('save-btn').addEventListener('click', async () => {
    if (!window.workspace) return;
    const text = JSON.stringify({
        app: 'AI-1', step: 5, program: Blockly.serialization.workspaces.save(window.workspace),
    }, null, 2);
    try {
        const saved = window.showSaveFilePicker ? await saveWithPicker(text) : saveWithDownload(text);
        if (saved) messageEl.textContent = 'プログラムを保存しました';
    } catch (err) {
        console.error('プログラム保存エラー:', err);
        messageEl.textContent = 'プログラムを保存できませんでした';
    }
});

const loadFileInput = document.getElementById('load-file');
document.getElementById('load-btn').addEventListener('click', () => {
    if (isSimulating || !window.workspace) return;
    loadFileInput.value = '';   // 同じファイルをもう一度選んでも読み込めるように
    loadFileInput.click();
});

loadFileInput.addEventListener('change', async () => {
    const file = loadFileInput.files[0];
    if (!file || isSimulating) return;
    let program;
    try {
        const data = JSON.parse(await file.text());
        // このアプリで保存したファイルか ([プログラムスタート] を捨ててから保存したものも読み込める)
        if (data?.app !== 'AI-1' || typeof data.program !== 'object' || data.program === null) {
            throw new Error('AI-1 のプログラムのファイルではありません');
        }
        program = data.program;
    } catch (err) {
        console.error('プログラム読み込みエラー:', err);
        messageEl.textContent = 'このファイルは読み込めませんでした';
        return;
    }
    if (!confirm('今のプログラムは消えます。読み込みますか？')) return;
    window.workspace.clear();
    try {
        Blockly.serialization.workspaces.load(program, window.workspace);
        unlockStartBlocks();   // 以前に保存したファイルの「プログラムスタート」も、動かして捨てられるようにする
        messageEl.textContent = 'プログラムを読み込みました';
    } catch (err) {
        // 途中まで読み込んで壊れた状態にしないよう、最初の状態に戻す
        console.error('プログラム読み込みエラー:', err);
        window.workspace.clear();
        Blockly.serialization.workspaces.load(defaultBlocksJsonStep5, window.workspace);
        unlockStartBlocks();
        messageEl.textContent = 'このファイルは読み込めませんでした';
    }
});

// 「もし〜なら」の条件ブロック (SW=ON / SW=OFF)。はまっていなければ null
function condTypeOf(ifBlock) {
    const cond = ifBlock.getInputTargetBlock('COND');
    return cond && cond.type in COND_CODE ? cond.type : null;
}

// 条件ブロックがはまっていない「もし〜なら」があるか (中身の中も調べる)
function hasEmptyCondition(first) {
    for (let b = first; b; b = b.getNextBlock()) {
        if (IF_TYPES.includes(b.type)) {
            if (!condTypeOf(b)) return true;
            if (hasEmptyCondition(b.getInputTargetBlock('DO'))) return true;
            if (b.type === 'cmd_if_else' && hasEmptyCondition(b.getInputTargetBlock('ELSE'))) return true;
        } else if (b.type === 'cmd_loop') {
            if (hasEmptyCondition(b.getInputTargetBlock('DO'))) return true;
        }
    }
    return false;
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
            } else if (IF_TYPES.includes(b.type)) {
                const doBlock = b.getInputTargetBlock('DO');
                const elseBlock = b.type === 'cmd_if_else' ? b.getInputTargetBlock('ELSE') : null;
                bi.trueStart = addr;
                addr = assignAddresses(doBlock, addr);
                bi.falseStart = addr;
                addr = assignAddresses(elseBlock, addr);
                // 空の側は、「もし〜なら」の次 (= YES・No の後ろ) へ進む
                if (!doBlock) bi.trueStart = addr;
                if (!elseBlock) bi.falseStart = addr;
            }
        }
        return addr;
    }

    function generateBytes(first, exitAddr) {
        const bytes = [];
        for (let b = first; b; b = b.getNextBlock()) {
            const next = b.getNextBlock();
            const nextAddr = next ? info.get(next.id).addr : exitAddr;
            const bi = info.get(b.id);
            if (b.type === 'cmd_led') {
                const [r, g, bl] = LED_COLORS[b.getFieldValue('COLOR')];
                const sec = Math.round(Number(b.getFieldValue('TIME')) * 4);
                bytes.push(130, r, g, bl, sec, nextAddr);
            } else if (b.type === 'cmd_led_fade') {
                const [r, g, bl] = LED_COLORS[b.getFieldValue('COLOR')];
                bytes.push(FADE_CODE[b.getFieldValue('FADE')], r, g, bl, nextAddr);
            } else if (b.type === 'cmd_led_conti') {
                bytes.push(LED_CONTI_CODE, LED_COLOR_NUMBER[b.getFieldValue('COLOR')], nextAddr);
            } else if (b.type === 'cmd_backlight') {
                const sec = Math.round(Number(b.getFieldValue('TIME')) * 4);
                bytes.push(BACKLIGHT_CODE, 100, sec, nextAddr);
            } else if (b.type === 'cmd_music') {
                bytes.push(SIMPLE_CODE[b.type], 1, nextAddr);
            } else if (b.type in SIMPLE_CODE) {
                bytes.push(SIMPLE_CODE[b.type], nextAddr);
            } else if (b.type in TIMER_CODE) {
                bytes.push(TIMER_CODE[b.type], Number(b.getFieldValue('T')), nextAddr);
            } else if (b.type === 'cmd_loop') {
                bytes.push(190, Number(b.getFieldValue('COUNT')), bi.bodyStart);
                // 中身の最後は、この繰り返しの終わり [191, 次のアドレス] へ進む
                bytes.push(...generateBytes(b.getInputTargetBlock('DO'), bi.loopEndAddr));
                bytes.push(191, nextAddr);
            } else if (IF_TYPES.includes(b.type)) {
                bytes.push(COND_CODE[condTypeOf(b)], bi.trueStart, bi.falseStart);
                // YES・No の中身の最後は、「もし〜なら」の次へ進む
                bytes.push(...generateBytes(b.getInputTargetBlock('DO'), nextAddr));
                if (b.type === 'cmd_if_else') {
                    bytes.push(...generateBytes(b.getInputTargetBlock('ELSE'), nextAddr));
                }
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
    if (!startBlock) return alert(NO_START_MESSAGE);
    if (hasEmptyCondition(startBlock.getNextBlock())) {
        return alert("「もし〜なら」に条件ブロック (SW=ON / SW=OFF) をはめてね。");
    }

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
// 「赤を1秒点灯」以外のブロックは、AI クロックからの合図が無いと先へ進めない
function needsDevice(first) {
    for (let b = first; b; b = b.getNextBlock()) {
        if (b.type !== 'cmd_led') return true;
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
        const doneCode = doneCodeOf(b);
        if (b.type === 'cmd_led') {
            await wait(Number(b.getFieldValue('TIME')) * 1000);
        } else if (doneCode !== null) {
            await waitForCode(doneCode, 1);
        } else if (IF_TYPES.includes(b.type)) {
            const result = await waitForCode(COND_CODE[condTypeOf(b)]);
            if (!isSimulating) break;
            if (result === 1) {
                await executeBlocks(b.getInputTargetBlock('DO'));
            } else if (b.type === 'cmd_if_else') {
                await executeBlocks(b.getInputTargetBlock('ELSE'));
            }
        }
    }
}

document.getElementById('run-btn').addEventListener('click', async () => {
    if (isSimulating || isTransferring) return;
    const startBlock = getStartBlock();
    if (!startBlock) return alert(NO_START_MESSAGE);

    if (hasEmptyCondition(startBlock.getNextBlock())) {
        return alert("「もし〜なら」に条件ブロック (SW=ON / SW=OFF) をはめてね。");
    }
    if (!comm.connected && needsDevice(startBlock.getNextBlock())) {
        return alert('このプログラムは、AI クロックに接続してから実行してね。');
    }

    // 前回の実行の残りを捨ててから、実行コマンドを送る
    rxQueue = [];
    console.log("◆実行コマンド送信");
    comm.sendRun();

    isSimulating = true;
    lockButtons.forEach(btn => btn.disabled = true);
    try {
        window.workspace.highlightBlock(startBlock.id);
        await executeBlocks(startBlock.getNextBlock());
    } catch (err) {
        console.error('プログラム実行中にエラー:', err);
    } finally {
        isSimulating = false;
        lockButtons.forEach(btn => btn.disabled = false);
        if (window.workspace) window.workspace.highlightBlock(null);
    }
});

// 親画面(index.html)の STEP6 タブを開く
window.goToNext = function() {
    if (window.parent && window.parent.showPageById) {
        window.parent.showPageById('tab-step6');
    }
};
