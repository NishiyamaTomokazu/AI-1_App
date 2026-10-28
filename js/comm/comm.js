// comm.js
// マイコンとの通信の共通窓口。端末に合わせて通信方式を自動で選ぶ。
//   iPad / iPhone            → 音声通信 (fsk.js)
//   WebHID が使えるブラウザ   → USB HID 通信 (hid.js)  … Windows / ChromeOS の Chrome・Edge
//   それ以外                 → 音声通信 (fsk.js)
// 動作確認のため、URL に ?comm=fsk / ?comm=hid を付けると方式を固定できる。
//
// 使い方 (各ページから):
//   const comm = window.parent.comm;
//   await comm.connect();                     // クリック操作の中で呼ぶ
//   await comm.sendHello();                   // 接続確認コマンド (FSK: [253, 5] / HID: [252])
//   await comm.sendRun();                     // 実行コマンド (FSK: [253, 2] / HID: [241])
//   // HIDでは、sendHello・sendRun・sendLed 以外の送信の先頭に 240 が付く
//   await comm.sendLed(appState);             // LED手動操作 [248, 240, appState]
//   await comm.send([230, ...programBytes]);  // ブロックプログラムのデータ
//   comm.mode                                 // 'fsk' または 'hid'
//   // 受信は親ページから 'comm-byte' イベントとして届く (detail.value に1バイト)
//   // HIDでは、レポート1つ分も 'comm-report' イベントで届く (detail.data にバイト配列)

import { FskTransport, CONFIG as FSK_CONFIG } from './fsk.js';
import { HidTransport } from './hid.js';

export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// 接続確認コマンド・実行コマンド (通信方式ごと。HIDでは先頭の 240 を付けずに送る)
const HELLO = { fsk: [253, 5], hid: [252] };
const RUN = { fsk: [253, 2], hid: [241] };

function chooseMode() {
    const forced = new URLSearchParams(location.search).get('comm');
    if (forced === 'fsk' || forced === 'hid') return forced;
    if (isIOS) return 'fsk';
    return HidTransport.supported ? 'hid' : 'fsk';
}

class Comm extends EventTarget {
    constructor() {
        super();
        this.mode = chooseMode();
        this.lastError = null;
        this._connecting = null;
        this._txChain = Promise.resolve();

        const handlers = {
            onByte: (value) => this._emit('byte', { value }),
            onReport: (data) => this._emit('report', { data }),   // HIDのみ
            onFrameError: (count) => this._emit('frameError', { count }),
            onTone: (tone, level) => this._emit('tone', { tone, level, threshold: FSK_CONFIG.rx.threshold }),
            onDisconnect: () => this._emit('status', { connected: false }),
        };
        this.transport = this.mode === 'hid' ? new HidTransport(handlers) : new FskTransport(handlers);
        console.log(`通信方式: ${this.mode}`);
    }

    get connected() { return this.transport.connected; }
    get productName() { return this.transport.productName; }

    _emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }

    /** 接続する。成功なら true。クリック操作の中で呼ぶこと (iPad のマイク・WebHID の選択画面の制約)。 */
    connect() {
        if (this.connected) return Promise.resolve(true);
        if (this._connecting) return this._connecting;

        // async関数は最初の await まで同期実行される。マイク要求やデバイス選択画面が
        // クリック操作の同期部分で始まるようにしている
        this._connecting = (async () => {
            try {
                await this.transport.connect();
            } catch (err) {
                console.error('接続に失敗:', err);
                this.lastError = err;
                return false;
            } finally {
                this._connecting = null;
            }
            this.lastError = null;
            console.log(`接続しました (${this.productName})`);
            this._emit('status', { connected: true });
            return true;
        })();
        return this._connecting;
    }

    async disconnect() {
        try { await this.transport.disconnect(); } catch (e) { console.error(e); }
        this._emit('status', { connected: false });
    }

    /**
     * バイト列を送る。送信が終わると解決する (未接続なら false)。
     * 連続して呼んでも順番に送られる。
     * @param {number[]} data
     * @param {{onProgress?: (packetIndex:number, packetCount:number)=>void}} [opts]
     */
    send(data, opts = {}) {
        if (!this.connected) {
            console.log('【送信】未接続です。送信をスキップします。', data);
            return Promise.resolve(false);
        }
        const job = this._txChain.then(() => this.transport.send(data, opts));
        this._txChain = job.catch(() => {});
        return job;
    }

    /** 接続確認コマンドを送る */
    sendHello() {
        return this.send(HELLO[this.mode], { noHeader: true });
    }

    /** 実行コマンドを送る */
    sendRun() {
        return this.send(RUN[this.mode], { noHeader: true });
    }

    /** LED手動操作 (STEP1・STEP6)。state は 赤1 + 緑2 + 青4 の合計 (8 で終了) */
    sendLed(state) {
        return this.send([248, 240, state], { noHeader: true });
    }

    /**
     * 受信した2バイト組 [firstByte, 値] を1つ受信するまで待つ (例: [244, 明るさ])。
     */
    waitForByteSequence(firstByte) {
        return new Promise((resolve) => {
            const buf = [];
            const listener = (e) => {
                buf.push(e.detail.value);
                if (buf.length > 2) buf.shift();
                if (buf.length === 2 && buf[0] === firstByte) {
                    this.removeEventListener('byte', listener);
                    resolve(buf[1]);
                }
            };
            this.addEventListener('byte', listener);
        });
    }

    /**
     * 指定した2バイト組を1つ受信してから data を送信する。
     * ページ(iframe)を離れた後も動くよう、待機〜送信はここで完結させる。
     */
    async sendAfterByteSequence(firstByte, data) {
        await this.waitForByteSequence(firstByte);
        return this.send(data);
    }
}

export const comm = new Comm();
