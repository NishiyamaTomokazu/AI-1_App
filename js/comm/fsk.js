// fsk.js
// iPad 用の音声通信 (送信・受信をこの1ファイルにまとめたもの)
//
//   送信: Webアプリ → マイコン  スピーカー(イヤホン端子)から音で送る
//     - データは 19バイト固定のパケットに組み立てて送る (buildPackets)
//         先頭が 230 のデータ (ブロックプログラム) は 16バイトずつに分割し、
//         [253, 1, ブロック番号] のヘッダーを付けて19バイトにする。
//         それ以外はそのまま先頭に置き、残りを0で埋めて19バイトにする。
//     - 波形は CONFIG.tx.mode で選ぶ
//         'legacy' : 元のAI_Clockと同じパルス幅方式 (今のマイコンのプログラムが受け取れる形式)
//         'fsk'    : FSK (1バイト = スタート0 + データ8bit(LSB先) + ストップ1、アイドルは"1"トーン)
//                    マイコン側に FSK デコーダを組み込んだら 'fsk' に切り替える
//
//   受信: マイコン → Webアプリ  マイクから FSK を復調する (AudioWorklet)
//     復調処理(ワークレット)もこのファイルの中に文字列で持ち、Blob URL で読み込む。
//
// 使い方 (comm.js から使う。各ページからは window.parent.comm を使うこと):
//   import { FskTransport } from './fsk.js';
//   const fsk = new FskTransport({ onByte, onFrameError, onTone });
//   await fsk.connect();          // クリック操作の中で呼ぶ (iPad Safari の制約)
//   await fsk.send([253, 5]);

export const CONFIG = {
  // マイコン → Webアプリ (受信)
  rx: { baud: 500, freq0: 1200, freq1: 2200, threshold: 0.01 },
  // Webアプリ → マイコン (送信)
  tx: {
    //mode: 'legacy',        // 'legacy' または 'fsk'
    mode: 'fsk',        // 'legacy' または 'fsk'
    leadMs: 50,            // 再生開始直後の音切れ対策の無音 (ms)
    blockWaitMs: 500,      // パケットとパケットの間の無音 (ms)
    // --- legacy 用 ---
    blockGapSamples: 1024, // 1パケット送り終えた直後の無音 (サンプル数。元のAI_Clockと同じ)
    // --- fsk 用 (マイコン側と必ずそろえる) ---
    baud: 500,             // 500bps: 1200/2200Hz、1000bps: 2400/4400Hz
    freq0: 1200,           // "0" のトーン(Hz)
    freq1: 2200,           // "1" のトーン(Hz)
    gapMs: 10,             // バイトとバイトの間 ("1"トーンのまま待つ時間)
    tailMs: 20,            // パケットの後ろの無音 (ms)
    amplitude: 0.8,
  },
};

// ==========================================
// パケットの組み立て
// ==========================================
const PACKET_LEN = 19;          // 1パケットは常に19バイト
const CHUNK_LEN = 16;           // ブロックプログラムデータの分割単位
const HEADER_FIXED = 253;       // ヘッダー1バイト目 (iPadモード固定値)
const HEADER_TYPE_TRANSFER = 1; // ヘッダー2バイト目: データ転送開始
const BLOCK_DATA_MARK = 230;    // この値で始まるデータだけ、ヘッダー付き分割の対象にする

/**
 * 渡されたデータを、送信用の19バイトパケットの配列に組み立てる。
 * @param {number[]} data
 * @returns {number[][]}
 */
export function buildPackets(data) {
  data = Array.from(data);
  if (!data.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
    throw new Error('送信データは 0〜255 の整数にしてください');
  }

  if (data.length > 0 && data[0] === BLOCK_DATA_MARK) {
    const packets = [];
    let blockNum = 1;
    for (let i = 0; i < data.length; i += CHUNK_LEN) {
      const chunk = data.slice(i, i + CHUNK_LEN);
      const packet = new Array(PACKET_LEN).fill(0);
      packet[0] = HEADER_FIXED;
      packet[1] = HEADER_TYPE_TRANSFER;
      packet[2] = blockNum;
      for (let j = 0; j < chunk.length; j++) packet[3 + j] = chunk[j];
      packets.push(packet);
      blockNum++;
    }
    return packets;
  }

  if (data.length > PACKET_LEN) {
    throw new Error(`データが ${PACKET_LEN} バイトを超えています (${data.length}バイト)`);
  }
  const packet = new Array(PACKET_LEN).fill(0);
  for (let i = 0; i < data.length; i++) packet[i] = data[i];
  return [packet];
}

// ==========================================
// 送信波形: legacy (元のAI_Clockと同じパルス幅方式。サンプル数で指定)
//   同期: 0を20個 → 1を30個
//   各ビット (MSBファースト): 0を5個 → 1を5個 (ビット0) / 1を15個 (ビット1)
//   終端: 0を20個
// ==========================================
const SYNC_LOW = 20, SYNC_HIGH = 30;
const BIT_LOW = 5, BIT0_HIGH = 5, BIT1_HIGH = 15;
const END_LOW = 20;

const msbBits = (b) => Array.from({ length: 8 }, (_, i) => (b >> (7 - i)) & 1);

function encodeLegacy(packets, sampleRate, tx) {
  const lead = Math.round(sampleRate * tx.leadMs / 1000);
  const gap = tx.blockGapSamples + Math.round(sampleRate * tx.blockWaitMs / 1000);

  const byteLen = (b) => {
    let n = SYNC_LOW + SYNC_HIGH + END_LOW;
    for (const bit of msbBits(b)) n += BIT_LOW + (bit ? BIT1_HIGH : BIT0_HIGH);
    return n;
  };

  const packetStarts = [];
  let total = lead;
  packets.forEach((p) => {
    packetStarts.push(total);
    total += p.reduce((n, b) => n + byteLen(b), 0) + gap;
  });

  const samples = new Float32Array(total); // 0 で初期化済み (無音)
  packets.forEach((packet, k) => {
    let i = packetStarts[k];
    const high = (n) => { for (let j = 0; j < n; j++) samples[i++] = 1; };
    for (const b of packet) {
      i += SYNC_LOW; high(SYNC_HIGH);
      for (const bit of msbBits(b)) {
        i += BIT_LOW;
        high(bit ? BIT1_HIGH : BIT0_HIGH);
      }
      i += END_LOW;
    }
  });
  return { samples, packetStarts };
}

// ==========================================
// 送信波形: fsk (位相が連続した正弦波)
//   [前無音 leadMs] [アイドル"1" gapMs] { [スタート0][データ8bit LSB先][ストップ1][アイドル"1" gapMs] } x19
//   [後無音 tailMs] [パケット間の無音 blockWaitMs] ...
// ==========================================
function encodeFsk(packets, sampleRate, tx) {
  const spb = sampleRate / tx.baud;           // 1ビットのサンプル数 (小数のまま積算してずれを防ぐ)
  const ms = (v) => Math.round(sampleRate * v / 1000);

  // まずトーンの並びを作る: [freq or 0(無音), サンプル数]
  const packetStarts = [];
  const segs = [];
  let total = 0;
  const push = (freq, n) => { segs.push([freq, n]); total += n; };

  push(0, ms(tx.leadMs));
  packets.forEach((packet, k) => {
    if (k > 0) push(0, ms(tx.blockWaitMs));
    packetStarts.push(total);
    push(tx.freq1, ms(tx.gapMs));
    let frac = 0;
    for (const b of packet) {
      const bits = [0];
      for (let i = 0; i < 8; i++) bits.push((b >> i) & 1);
      bits.push(1);
      for (const bit of bits) {
        frac += spb;
        const n = Math.floor(frac);
        frac -= n;
        push(bit ? tx.freq1 : tx.freq0, n);
      }
      push(tx.freq1, ms(tx.gapMs));
    }
    push(0, ms(tx.tailMs));
  });
  push(0, ms(tx.blockWaitMs));

  const samples = new Float32Array(total);
  let i = 0, phase = 0;
  for (const [freq, n] of segs) {
    if (freq === 0) { i += n; phase = 0; continue; }
    const dp = 2 * Math.PI * freq / sampleRate;
    for (let j = 0; j < n; j++) {
      samples[i++] = tx.amplitude * Math.sin(phase);
      phase += dp;
    }
    phase %= 2 * Math.PI;
  }
  return { samples, packetStarts };
}

export function encodePackets(packets, sampleRate, tx = CONFIG.tx) {
  return tx.mode === 'fsk'
    ? encodeFsk(packets, sampleRate, tx)
    : encodeLegacy(packets, sampleRate, tx);
}

// ==========================================
// 受信: AudioWorklet 側(音声スレッド)で動く FSK + UART 復調処理
//   DOM には触れず、結果は port.postMessage でメインスレッドへ送る。
//     { type: 'byte', value }         ... 1バイト受信
//     { type: 'frameError', count }   ... ストップビット異常
//     { type: 'tone', tone, level }   ... 約50msごとの状態 (tone: 0 / 1 / -1=無音)
//   AudioWorklet は別ファイルとして読み込む決まりなので、関数の中身を文字列にして Blob URL で渡す。
// ==========================================
function fskProcessorSource() {
  class FskProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      const { baud, freq0, freq1, threshold } = options.processorOptions;
      this.threshold = threshold;

      // sampleRate は AudioWorkletGlobalScope のグローバル変数
      this.spb = sampleRate / baud;                          // 1ビットのサンプル数
      this.W = Math.max(8, Math.round(this.spb / 2));        // 判定窓 (約1/2ビット)
      this.STEP = Math.max(1, Math.round(this.spb / 16));    // 判定間隔 (約1/16ビット)
      this.tab0 = this.makeTable(freq0);
      this.tab1 = this.makeTable(freq1);

      let size = 1;
      while (size < this.W * 2) size <<= 1;
      this.ring = new Float32Array(size);
      this.mask = size - 1;
      this.n = 0; // 受信済み総サンプル数

      // UART 状態
      this.state = 0;        // 0=IDLE, 1=RECV
      this.armed = false;    // アイドル("1")を確認済みか
      this.edgeN = 0;        // スタートビットのエッジ推定位置
      this.bitIndex = 0;     // 0=start, 1..8=data, 9=stop
      this.nextCheckN = 0;
      this.byte = 0;
      this.errCount = 0;

      this.lastTone = -1;
      this.lastAmp = 0;
      this.nextReport = 0;

      this.port.onmessage = (e) => {
        if (e.data.type === 'threshold') this.threshold = e.data.value;
      };
    }

    makeTable(freq) {
      const c = new Float32Array(this.W);
      const s = new Float32Array(this.W);
      for (let i = 0; i < this.W; i++) {
        const ph = 2 * Math.PI * freq * i / sampleRate;
        c[i] = Math.cos(ph);
        s[i] = Math.sin(ph);
      }
      return { c, s };
    }

    // 直近 W サンプルと参照波の相関から振幅を推定
    amplitude(tab) {
      let I = 0, Q = 0;
      let idx = (this.n - this.W) & this.mask;
      for (let i = 0; i < this.W; i++) {
        const v = this.ring[idx];
        I += v * tab.c[i];
        Q += v * tab.s[i];
        idx = (idx + 1) & this.mask;
      }
      return Math.sqrt(I * I + Q * Q) * 2 / this.W;
    }

    // 0 / 1 / -1(信号なし)
    detect() {
      const a0 = this.amplitude(this.tab0);
      const a1 = this.amplitude(this.tab1);
      this.lastAmp = Math.max(a0, a1);
      if (this.lastAmp < this.threshold) return -1;
      return a1 > a0 ? 1 : 0;
    }

    step(d) {
      const n = this.n, W = this.W, spb = this.spb;

      if (this.state === 0) {
        if (d === 1) {
          this.armed = true;
        } else if (d === -1) {
          this.armed = false;
        } else if (this.armed) {
          // 1→0 を検出。判定は窓の中心がエッジを通過した時点で反転する
          this.edgeN = n - W / 2;
          this.bitIndex = 0;
          this.byte = 0;
          this.state = 1;
          this.nextCheckN = this.edgeN + 0.5 * spb + W / 2;
        }
        return;
      }

      if (n < this.nextCheckN) return;

      if (this.bitIndex === 0) {
        if (d !== 0) { this.state = 0; this.armed = (d === 1); return; }
      } else if (this.bitIndex <= 8) {
        if (d === -1) { this.state = 0; this.armed = false; return; }
        if (d === 1) this.byte |= (1 << (this.bitIndex - 1));
      } else {
        if (d === 1) {
          this.port.postMessage({ type: 'byte', value: this.byte });
          this.armed = true;
        } else {
          this.errCount++;
          this.port.postMessage({ type: 'frameError', count: this.errCount });
          this.armed = false;
        }
        this.state = 0;
        return;
      }
      this.bitIndex++;
      this.nextCheckN = this.edgeN + (this.bitIndex + 0.5) * spb + W / 2;
    }

    process(inputs) {
      const ch = inputs[0] && inputs[0][0];
      if (!ch) return true;

      for (let i = 0; i < ch.length; i++) {
        this.ring[this.n & this.mask] = ch[i];
        this.n++;
        if (this.n >= this.W && this.n % this.STEP === 0) {
          const d = this.detect();
          this.lastTone = d;
          this.step(d);
        }
      }

      if (this.n >= this.nextReport) {
        this.nextReport = this.n + sampleRate / 20;
        this.port.postMessage({ type: 'tone', tone: this.lastTone, level: this.lastAmp });
      }
      return true;
    }
  }

  registerProcessor('fsk-processor', FskProcessor);
}

let workletUrl = null;
export function getWorkletUrl() {
  if (!workletUrl) {
    const src = `(${fskProcessorSource.toString()})();`;
    workletUrl = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
  }
  return workletUrl;
}

// ==========================================
// 通信オブジェクト (送信 + 受信)
// ==========================================
export class FskTransport {
  /**
   * @param {object} handlers
   * @param {(byte:number)=>void} [handlers.onByte]         1バイト受信ごと
   * @param {(count:number)=>void} [handlers.onFrameError]  フレームエラーの累計数
   * @param {(tone:number, level:number)=>void} [handlers.onTone]  約50msごと。tone: 0 / 1 / -1(無音)
   */
  constructor({ onByte, onFrameError, onTone } = {}) {
    this.kind = 'fsk';
    this.productName = '音声通信 (iPad)';
    this.onByte = onByte;
    this.onFrameError = onFrameError;
    this.onTone = onTone;

    this.audioCtx = null;
    this.stream = null;
    this.node = null;
  }

  get connected() { return this.audioCtx !== null; }

  /** マイク(受信)とスピーカー(送信)を準備する。クリック操作の中で呼ぶこと。 */
  async connect() {
    if (this.audioCtx) return;

    // iOS Safari: AudioContext の作成/resume とマイク要求は、ユーザー操作の同期部分で開始する
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const resumed = ctx.resume();
    const streamPromise = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });

    let stream = null;
    try {
      [stream] = await Promise.all([streamPromise, resumed]);
      await ctx.audioWorklet.addModule(getWorkletUrl());

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'fsk-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { ...CONFIG.rx },
      });
      node.port.onmessage = (e) => this._handle(e.data);

      source.connect(node);
      node.connect(ctx.destination); // 出力は無音。Safari で処理を駆動するために接続する

      this.audioCtx = ctx;
      this.stream = stream;
      this.node = node;
    } catch (err) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      ctx.close();
      throw err;
    }
  }

  async disconnect() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.node) { this.node.port.onmessage = null; this.node.disconnect(); }
    if (this.audioCtx) await this.audioCtx.close();
    this.stream = null;
    this.node = null;
    this.audioCtx = null;
  }

  setThreshold(value) {
    CONFIG.rx.threshold = value;
    if (this.node) this.node.port.postMessage({ type: 'threshold', value });
  }

  /**
   * データを19バイトのパケットに組み立てて音で送る。再生が終わると解決する。
   * @param {number[]} data
   * @param {{onProgress?: (packetIndex:number, packetCount:number)=>void}} [opts]
   */
  async send(data, { onProgress } = {}) {
    const packets = buildPackets(data);
    const ctx = this.audioCtx;
    if (!ctx) return false;
    if (ctx.state === 'suspended') await ctx.resume();

    console.log(`【FSK送信】${packets.length}パケット (${CONFIG.tx.mode})`, packets);
    const { samples, packetStarts } = encodePackets(packets, ctx.sampleRate);
    const buffer = ctx.createBuffer(2, samples.length, ctx.sampleRate);
    buffer.getChannelData(0).set(samples); // 元のAI_Clockと同じく左チャンネルに出力

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const timers = [];
    if (onProgress) {
      packetStarts.forEach((s, k) => {
        timers.push(setTimeout(() => onProgress(k, packets.length), 1000 * s / ctx.sampleRate));
      });
    }

    await new Promise((resolve) => {
      source.onended = resolve;
      source.start();
    });
    timers.forEach(clearTimeout);
    return true;
  }

  _handle(m) {
    if (m.type === 'byte') {
      if (this.onByte) this.onByte(m.value);
    } else if (m.type === 'tone') {
      if (this.onTone) this.onTone(m.tone, m.level);
    } else if (m.type === 'frameError') {
      if (this.onFrameError) this.onFrameError(m.count);
    }
  }
}
