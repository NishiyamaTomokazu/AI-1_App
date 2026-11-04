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

// ==========================================
// STEP5 用のブロック定義 (総合)
//   cmd_led_fade             → [131 (フェードイン) / 132 (フェードアウト), R, G, B, 次のアドレス]
//                              終わると [131, 1] / [132, 1] が返ってくる
//   cmd_led_conti            → [135, 色番号, 次のアドレス]   終わると [135, 1] が返ってくる
//                              色番号 0:赤 1:緑 2:青 3:黄色 4:紫 5:水色 6:白
//   cmd_led_off              → [136, 次のアドレス]   終わると [136, 1] が返ってくる
//   cmd_backlight            → [140, 100, 秒×4, 次のアドレス]   終わると [140, 1] が返ってくる
//   cmd_backlight_conti      → [141, 次のアドレス]   終わると [141, 1] が返ってくる
//   cmd_backlight_off        → [142, 次のアドレス]   終わると [142, 1] が返ってくる
//   cmd_sound1 / 2 / 3       → [150 / 151 / 152, 次のアドレス]   終わると [150 / 151 / 152, 1] が返ってくる
//   cmd_music                → [153, 次のアドレス]   終わると [153, 1] が返ってくる
//   cmd_wait_timer          → [160, T, 次のアドレス]   終わると [160, 1] が返ってくる
//   cmd_wait_timer_or_sound  → [161, T, 次のアドレス]   終わると [161, 1] が返ってくる
//   cmd_wait_timer_or_switch → [162, T, 次のアドレス]   終わると [162, 1] が返ってくる
//   T (動作停止の秒数) は 1〜255、初期値は 1
// ==========================================
Blockly.defineBlocksWithJsonArray([
    {
        "type": "cmd_led_fade",
        "message0": "%1 を %2",
        "args0": [
            {
                "type": "field_dropdown",
                "name": "COLOR",
                "options": [
                    ["🔴 赤", "red"], ["🟢 緑", "green"], ["🔵 青", "blue"],
                    ["🟡 黄色", "yellow"], ["🟣 紫", "purple"], ["🩵 水色", "cyan"],
                    ["⚪ 白", "white"]
                ]
            },
            {
                "type": "field_dropdown",
                "name": "FADE",
                "options": [["フェードイン", "in"], ["フェードアウト", "out"]]
            }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 230,
        "tooltip": "LEDをだんだん明るく (フェードイン)、またはだんだん暗く (フェードアウト) します。"
    },
    {
        "type": "cmd_led_conti",
        "message0": "%1 を連続点灯",
        "args0": [
            {
                "type": "field_dropdown",
                "name": "COLOR",
                "options": [
                    ["🔴 赤", "red"], ["🟢 緑", "green"], ["🔵 青", "blue"],
                    ["🟡 黄色", "yellow"], ["🟣 紫", "purple"], ["🩵 水色", "cyan"],
                    ["⚪ 白", "white"]
                ]
            }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 230,
        "tooltip": "LEDを点灯したままにします。「LED消灯」で消えます。"
    },
    {
        "type": "cmd_led_off",
        "message0": "LED消灯",
        "previousStatement": null,
        "nextStatement": null,
        "colour": 230,
        "tooltip": "LEDを消します。"
    },
    {
        "type": "cmd_backlight",
        "message0": "バックライトを %1 秒点灯",
        "args0": [
            { "type": "field_number", "name": "TIME", "value": 1, "min": 0.25, "max": 31.75, "precision": 0.25 }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 230,
        "tooltip": "時計のバックライトを指定した時間だけ点灯します。"
    },
    {
        "type": "cmd_backlight_conti",
        "message0": "バックライト連続点灯",
        "previousStatement": null,
        "nextStatement": null,
        "colour": 230,
        "tooltip": "時計のバックライトを点灯したままにします。「バックライト消灯」で消えます。"
    },
    {
        "type": "cmd_backlight_off",
        "message0": "バックライト消灯",
        "previousStatement": null,
        "nextStatement": null,
        "colour": 230,
        "tooltip": "時計のバックライトを消します。"
    },
    {
        "type": "cmd_sound1",
        "message0": "サウンド1",
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#ab47bc",
        "tooltip": "サウンド1を鳴らします。"
    },
    {
        "type": "cmd_sound2",
        "message0": "サウンド2",
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#ab47bc",
        "tooltip": "サウンド2を鳴らします。"
    },
    {
        "type": "cmd_sound3",
        "message0": "サウンド3",
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#ab47bc",
        "tooltip": "サウンド3を鳴らします。"
    },
    {
        "type": "cmd_music",
        "message0": "音楽再生",
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#ab47bc",
        "tooltip": "音楽を再生します。"
    },
    {
        "type": "cmd_wait_timer",
        "message0": "動作停止 %1 秒",
        "args0": [
            { "type": "field_number", "name": "T", "value": 1, "min": 1, "max": 255, "precision": 1 }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#00bcd4",
        "tooltip": "指定した時間(秒)だけプログラムを一時停止します。"
    },
    {
        "type": "cmd_wait_timer_or_sound",
        "message0": "動作停止 %1 秒 or 音センサ",
        "args0": [
            { "type": "field_number", "name": "T", "value": 1, "min": 1, "max": 255, "precision": 1 }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#00bcd4",
        "tooltip": "指定した時間(秒)が経過するか、音センサが検知するまでプログラムを一時停止します。"
    },
    {
        "type": "cmd_wait_timer_or_switch",
        "message0": "動作停止 %1 秒 or SWセンサ",
        "args0": [
            { "type": "field_number", "name": "T", "value": 1, "min": 1, "max": 255, "precision": 1 }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": "#00bcd4",
        "tooltip": "指定した時間(秒)が経過するか、スイッチが押されるまでプログラムを一時停止します。"
    }
]);

// ==========================================
// プログラムエリアに置くブロックのデータ (STEP5用)
// ==========================================
// 初期配置: 「プログラムスタート」だけ
const defaultBlocksJsonStep5 = {
    "blocks": {
        "blocks": [
            { "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false }
        ]
    }
};

// サンプル1: 「プログラムスタート」->「白をフェードイン」->「白をフェードアウト」
const sample1BlocksJsonStep5 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_led_fade", "fields": { "COLOR": "white", "FADE": "in" },
                        "next": { "block": { "type": "cmd_led_fade", "fields": { "COLOR": "white", "FADE": "out" } } }
                    }
                }
            }
        ]
    }
};

// サンプル2: 「プログラムスタート」->「赤を連続点灯」->「バックライト連続点灯」->「動作停止3秒」
//            ->「バックライト消灯」->「動作停止10秒 or 音センサ」
//   (プログラムが終わると、マイコン側で LED・バックライトを消す)
const sample2BlocksJsonStep5 = {
    "blocks": {
        "blocks": [
            {
                "type": "cmd_start", "x": 20, "y": 20, "deletable": false, "movable": false,
                "next": {
                    "block": {
                        "type": "cmd_led_conti", "fields": { "COLOR": "red" },
                        "next": {
                            "block": {
                                "type": "cmd_backlight_conti",
                                "next": {
                                    "block": {
                                        "type": "cmd_wait_timer", "fields": { "T": 3 },
                                        "next": {
                                            "block": {
                                                "type": "cmd_backlight_off",
                                                "next": { "block": { "type": "cmd_wait_timer_or_sound", "fields": { "T": 10 } } }
                                            }
                                        }
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
