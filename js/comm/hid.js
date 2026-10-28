// hid.js
// Windows / ChromeOS 用の WebHID 通信 (Chrome / Edge のみ)。旧 main_webhid.js と同じ仕様。
//
//   送信: send(data) … 先頭に CONFIG.header (240) を付け、1バイトずつ、レポートID 0 の1バイトレポートで送る。
//                      (接続確認 [252]・実行 [241] は noHeader: true で 240 を付けずに送る)
//                      バイトとバイトの間は CONFIG.byteIntervalMs 待つ (マイコンの取りこぼし対策)
//   受信: マイコンから届いたレポートを onReport に配列で渡し、各バイトを onByte にも渡す

export const CONFIG = {
  vendorId: 0x21CF,     // AI クロックの VendorID
  reportId: 0x00,       // 送信に使うレポートID
  byteIntervalMs: 90,   // 1バイト送るごとの待ち時間 (ms)
  header: 240,          // 送信データの先頭に付けるバイト
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class HidTransport {
  /**
   * @param {object} handlers
   * @param {(byte:number)=>void} [handlers.onByte]        受信した1バイトごと
   * @param {(bytes:number[])=>void} [handlers.onReport]   受信したレポート1つ分
   * @param {()=>void} [handlers.onDisconnect]             USBが抜かれたとき
   */
  constructor({ onByte, onReport, onDisconnect } = {}) {
    this.kind = 'hid';
    this.productName = 'USB (HID)';
    this.onByte = onByte;
    this.onReport = onReport;
    this.onDisconnect = onDisconnect;
    this.device = null;

    this._onInputReport = (e) => {
      const bytes = Array.from(new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength));
      console.log('📥 [WebHID受信]', bytes);
      if (this.onReport) this.onReport(bytes);
      if (this.onByte) bytes.forEach((b) => this.onByte(b));
    };
    this._onHidDisconnect = (e) => {
      if (e.device !== this.device) return;
      console.log('WebHID デバイスの切断を検知しました。');
      this.device.removeEventListener('inputreport', this._onInputReport);
      this.device = null;
      if (this.onDisconnect) this.onDisconnect();
    };
  }

  static get supported() { return 'hid' in navigator; }

  get connected() { return !!(this.device && this.device.opened); }

  /** デバイス選択画面を出して接続する。クリック操作の中で呼ぶこと。 */
  async connect() {
    if (this.connected) return;
    if (!HidTransport.supported) throw new Error('このブラウザは WebHID に対応していません');

    // 以前に許可したデバイスがあれば、選択画面を出さずにそれを使う
    const devices = await navigator.hid.getDevices();
    let device = devices.find((d) => d.vendorId === CONFIG.vendorId);
    if (!device) {
      [device] = await navigator.hid.requestDevice({ filters: [{ vendorId: CONFIG.vendorId }] });
    }
    if (!device) throw new Error('デバイスが選択されませんでした');

    if (!device.opened) await device.open();
    device.addEventListener('inputreport', this._onInputReport);
    navigator.hid.addEventListener('disconnect', this._onHidDisconnect);
    this.device = device;
    this.productName = device.productName || 'USB (HID)';
  }

  async disconnect() {
    const device = this.device;
    this.device = null;
    navigator.hid.removeEventListener('disconnect', this._onHidDisconnect);
    if (device) {
      device.removeEventListener('inputreport', this._onInputReport);
      if (device.opened) await device.close();
    }
  }

  /**
   * データの先頭に 240 を付けて、1バイトずつ送る。全部送り終えると解決する。
   * 接続確認・実行コマンドのように 240 を付けないときは noHeader: true にする。
   * @param {number[]} data
   * @param {{onProgress?: (index:number, count:number)=>void, noHeader?: boolean}} [opts]
   */
  async send(data, { onProgress, noHeader = false } = {}) {
    data = Array.from(data);
    if (!data.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
      throw new Error('送信データは 0〜255 の整数にしてください');
    }
    if (!this.connected) return false;

    if (!noHeader) data = [CONFIG.header, ...data];
    console.log('【WebHID送信】', data);
    const report = new Uint8Array(1);
    for (let i = 0; i < data.length; i++) {
      if (onProgress) onProgress(i, data.length);
      report[0] = data[i];
      await this.device.sendReport(CONFIG.reportId, report);
      await wait(CONFIG.byteIntervalMs);
    }
    return true;
  }
}
