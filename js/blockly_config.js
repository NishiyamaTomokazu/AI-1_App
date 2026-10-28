// ==========================================
// カスタムブロックの共通定義 (全STEP共通)
//   転送時のバイト列 (各STEPの stepN.js で組み立てる):
//     cmd_led         → [130, R, G, B, 秒×4, 次のアドレス]
//     cmd_wait_sound  → [170, 次のアドレス]   成立すると [170, 1] が返ってくる
//     cmd_wait_switch → [171, 次のアドレス]   成立すると [171, 1] が返ってくる
// ==========================================
Blockly.defineBlocksWithJsonArray([
    {
        "type": "cmd_start",
        "message0": "プログラムスタート",
        "nextStatement": null,
        "colour": "#ffbf00",
        "tooltip": "プログラムの開始点です"
    },
    {
        "type": "cmd_led",
        "message0": "%1 を %2 秒点灯",
        "args0": [
            {
                "type": "field_dropdown",
                "name": "COLOR",
                "options": [
                    ["🔴 赤", "red"], ["🟢 緑", "green"], ["🔵 青", "blue"],
                    ["🟡 黄色", "yellow"], ["🟣 紫", "purple"], ["🩵 水色", "cyan"],
                    ["⚪ 白", "white"], ["⚫ 消灯", "off"]
                ]
            },
            { "type": "field_number", "name": "TIME", "value": 1, "min": 0.25, "max": 31.75, "precision": 0.25 }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 230
    },
    {
        "type": "cmd_wait_sound",
        "message0": "音が鳴るまで待つ",
        "previousStatement": null,
        "nextStatement": null,
        "colour": 210,
        "tooltip": "音が鳴るまでプログラムを一時停止します。"
    },
    {
        "type": "cmd_wait_switch",
        "message0": "スイッチが押されるまで待つ",
        "previousStatement": null,
        "nextStatement": null,
        "colour": 210,
        "tooltip": "スイッチが押されるまでプログラムを一時停止します。"
    }
]);

// ==========================================
// プログラムエリアに置くブロックのデータ (STEP2用)
// ==========================================
// 初期配置: 「プログラムスタート」->「赤を1秒点灯」
const defaultBlocksJsonStep2 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": { "block": { "type": "cmd_led", "fields": { "COLOR": "red", "TIME": 1 } } }
            }
        ]
    }
};

// 音センササンプル: 「プログラムスタート」->「音が鳴るまで待つ」->「赤を1秒点灯」
const soundSampleBlocksJsonStep2 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_wait_sound",
                        "next": { "block": { "type": "cmd_led", "fields": { "COLOR": "red", "TIME": 1 } } }
                    }
                }
            }
        ]
    }
};

// スイッチセンササンプル: 「プログラムスタート」->「スイッチが押されるまで待つ」->「赤」->「緑」->「青」(各1秒)
const switchSampleBlocksJsonStep2 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_wait_switch",
                        "next": {
                            "block": {
                                "type": "cmd_led", "fields": { "COLOR": "red", "TIME": 1 },
                                "next": {
                                    "block": {
                                        "type": "cmd_led", "fields": { "COLOR": "green", "TIME": 1 },
                                        "next": { "block": { "type": "cmd_led", "fields": { "COLOR": "blue", "TIME": 1 } } }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        ]
    }
};
