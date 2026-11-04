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

// ==========================================
// STEP3 用のブロック定義 (反復処理)
//   cmd_loop → [190, 回数, 中身の先頭アドレス] … 中身 … [191, 次のアドレス]
//   実行中は、繰り返しに入ったとき (1周目の前) だけマイコンから [190, 1] が返ってくる。入れ子にもできる
// ==========================================
Blockly.defineBlocksWithJsonArray([
    {
        "type": "cmd_loop",
        "message0": "%1 回繰り返す",
        "args0": [
            { "type": "field_number", "name": "COUNT", "value": 3, "min": 1, "max": 255, "precision": 1 }
        ],
        "message1": "%1",
        "args1": [
            { "type": "input_statement", "name": "DO" }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#145c29",
        "tooltip": "指定した回数だけ、中のプログラムを繰り返します。"
    }
]);

// ==========================================
// プログラムエリアに置くブロックのデータ (STEP3用)
// ==========================================
// 初期配置: 「プログラムスタート」->「3回繰り返す」{「赤を1秒点灯」->「青を1秒点灯」}
const defaultBlocksJsonStep3 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_loop", "fields": { "COUNT": 3 },
                        "inputs": {
                            "DO": {
                                "block": {
                                    "type": "cmd_led", "fields": { "COLOR": "red", "TIME": 1 },
                                    "next": { "block": { "type": "cmd_led", "fields": { "COLOR": "blue", "TIME": 1 } } }
                                }
                            }
                        }
                    }
                }
            }
        ]
    }
};

// 反復サンプル1: 「プログラムスタート」->「3回繰り返す」{「赤を1秒点灯」->「消灯を1秒点灯」}
const loopSample1BlocksJsonStep3 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_loop", "fields": { "COUNT": 3 },
                        "inputs": {
                            "DO": {
                                "block": {
                                    "type": "cmd_led", "fields": { "COLOR": "red", "TIME": 1 },
                                    "next": { "block": { "type": "cmd_led", "fields": { "COLOR": "off", "TIME": 1 } } }
                                }
                            }
                        }
                    }
                }
            }
        ]
    }
};

// 反復サンプル2: 「プログラムスタート」->「3回繰り返す」{「スイッチが押されるまで待つ」}->「赤を1秒点灯」
const loopSample2BlocksJsonStep3 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_loop", "fields": { "COUNT": 3 },
                        "inputs": { "DO": { "block": { "type": "cmd_wait_switch" } } },
                        "next": { "block": { "type": "cmd_led", "fields": { "COLOR": "red", "TIME": 1 } } }
                    }
                }
            }
        ]
    }
};

// ==========================================
// STEP4 用のブロック定義 (分岐処理)
//   cmd_if / cmd_if_else → [180 (SW=ON) または 181 (SW=OFF), YESの先頭アドレス, Noの先頭アドレス]
//   YES・No の中身の最後は、「もし〜なら」の次のブロックへ進む
//   実行中は、判定したときにマイコンから [180, 1/0] / [181, 1/0] (1=真, 0=偽) が返ってくる
// ==========================================
Blockly.defineBlocksWithJsonArray([
    {
        "type": "cmd_if",
        "message0": "もし〜なら %1",
        "args0": [
            { "type": "input_value", "name": "COND", "check": "Boolean" }
        ],
        "message1": "YES %1",
        "args1": [
            { "type": "input_statement", "name": "DO" }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#e69500",
        "tooltip": "条件が真の時だけ、YESの中のプログラムを実行します。"
    },
    {
        "type": "cmd_if_else",
        "message0": "もし〜なら %1",
        "args0": [
            { "type": "input_value", "name": "COND", "check": "Boolean" }
        ],
        "message1": "YES %1",
        "args1": [
            { "type": "input_statement", "name": "DO" }
        ],
        "message2": "No %1",
        "args2": [
            { "type": "input_statement", "name": "ELSE" }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#e69500",
        "tooltip": "条件が真の時はYES、偽の時はNoの中のプログラムを実行します。"
    },
    {
        "type": "cond_switch_on",
        "message0": "SW=ON",
        "output": "Boolean",
        "colour": "#4caf50",
        "tooltip": "スイッチが押されている時に真になります。"
    },
    {
        "type": "cond_switch_off",
        "message0": "SW=OFF",
        "output": "Boolean",
        "colour": "#4caf50",
        "tooltip": "スイッチが押されていない時に真になります。"
    }
]);

// ==========================================
// プログラムエリアに置くブロックのデータ (STEP4用)
// ==========================================
// 初期配置: 「プログラムスタート」->「もし SW=ON なら」 YES{「赤を1秒点灯」} No{「緑を1秒点灯」}
const defaultBlocksJsonStep4 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_if_else",
                        "inputs": {
                            "COND": { "block": { "type": "cond_switch_on" } },
                            "DO": { "block": { "type": "cmd_led", "fields": { "COLOR": "red", "TIME": 1 } } },
                            "ELSE": { "block": { "type": "cmd_led", "fields": { "COLOR": "green", "TIME": 1 } } }
                        }
                    }
                }
            }
        ]
    }
};

// 分岐サンプル1: 「プログラムスタート」->「もし SW=ON なら」 YES{「赤を1秒点灯」} ->「黄色を1秒点灯」
const branchSample1BlocksJsonStep4 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_if",
                        "inputs": {
                            "COND": { "block": { "type": "cond_switch_on" } },
                            "DO": { "block": { "type": "cmd_led", "fields": { "COLOR": "red", "TIME": 1 } } }
                        },
                        "next": { "block": { "type": "cmd_led", "fields": { "COLOR": "yellow", "TIME": 1 } } }
                    }
                }
            }
        ]
    }
};

// 分岐サンプル2: 「プログラムスタート」->「もし SW=OFF なら」
//   YES{「3回繰り返す」{「赤を1秒点灯」->「消灯を1秒点灯」}} No{「白を1秒点灯」}
const branchSample2BlocksJsonStep4 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_if_else",
                        "inputs": {
                            "COND": { "block": { "type": "cond_switch_off" } },
                            "DO": {
                                "block": {
                                    "type": "cmd_loop", "fields": { "COUNT": 3 },
                                    "inputs": {
                                        "DO": {
                                            "block": {
                                                "type": "cmd_led", "fields": { "COLOR": "red", "TIME": 1 },
                                                "next": { "block": { "type": "cmd_led", "fields": { "COLOR": "off", "TIME": 1 } } }
                                            }
                                        }
                                    }
                                }
                            },
                            "ELSE": { "block": { "type": "cmd_led", "fields": { "COLOR": "white", "TIME": 1 } } }
                        }
                    }
                }
            }
        ]
    }
};
