# AI-1 App

中学生向けのプログラミング教材 (Webアプリ)。AI クロック (マイコン) と通信して LED などを操作する。
GitHub Pages で公開する。

## 構成

```
index.html            タブ + iframe の親画面。通信モジュール(comm)を持つ
css/style.css
vendor/blockly.min.js Blockly (CDNだと読み込めないことがあるため同梱)
js/
  comm/
    comm.js           通信の共通窓口。端末に合わせて FSK / HID を自動で選ぶ
    fsk.js            iPad 用の音声通信 (送信・受信・復調ワークレットを1ファイルに)
    hid.js            Windows / ChromeOS 用の WebHID 通信 (雛形)
  stepN.js            各 STEP のスクリプト (pages/stepN.html と1対1)
pages/
  step0.html  導入
  step1.html  光を作ろう
  step2.html  順次処理   (雛形)
  step3.html  反復処理   (雛形)
  step4.html  分岐処理   (雛形)
  step5.html  総合       (雛形)
  step6.html  チャレンジ (3秒チャレンジのゲーム)
```

## タブ

- タブは `index.html` の `PAGES` に1行足すだけで増やせる。
- ページから別のタブへ移動: `window.parent.showPageById('tab-step2')`
- 隠したタブ (`hidden: true`) を表示: `window.parent.unlockTab('tab-step3')`

## 通信

各ページからは `window.parent.comm` を使う。

```js
const comm = window.parent.comm;
await comm.connect();                  // クリック操作の中で呼ぶ
await comm.sendHello();                // 接続確認 (FSK: [253, 5] / HID: [252])
await comm.sendLed(appState);          // LED手動操作 [248, 240, appState]
// 受信は 'comm-byte' イベント (detail.value に1バイト)
```

| 端末 | 方式 |
|---|---|
| iPad / iPhone | 音声通信 (fsk.js) |
| WebHID が使えるブラウザ (Windows・ChromeOS の Chrome / Edge) | HID (hid.js) |
| それ以外 | 音声通信 (fsk.js) |

動作確認用に、URL に `?comm=fsk` / `?comm=hid` を付けると方式を固定できる。

### 音声通信の送信方式 (`fsk.js` の `CONFIG.tx.mode`)

- `'legacy'` (初期値): 元の AI_Clock と同じパルス幅方式。今のマイコンのプログラムが受け取れる形式。
- `'fsk'`: 1200/2200Hz・500bps の FSK。マイコン側に FSK デコーダを組み込んだら切り替える。
  baud / freq0 / freq1 はマイコン側と必ずそろえる (1000bps なら 2400/4400Hz)。

### HID

旧 `main_webhid.js` と同じ仕様。VendorID `0x21CF` のデバイスに接続し、
送信データの先頭には 240 を付ける (例: プログラム転送 `[230, 2, …]` → `[240, 230, 2, …]`)。
ただし接続確認 `[252]`・実行 `[241]`・LED手動操作 `[248, 240, appState]` は 240 を付けずにそのまま送る
(`comm.sendHello()` / `comm.sendRun()` / `comm.sendLed()`)。
送信は1バイトずつ (レポートID 0、1バイトのレポート、バイト間 90ms)。
受信したレポートは `comm-report` (配列) と `comm-byte` (1バイトずつ) の両方で届く。

## ローカルで動かす

ES モジュールを使うため、`index.html` を直接開くのではなく HTTP サーバー経由で開く
(マイク・WebHID は localhost か https でのみ動く)。
