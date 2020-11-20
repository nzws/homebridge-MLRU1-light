# @nzws/mlru1-light

> アイリスオーヤマ製「ML-RU1」リモコンを使用する照明を操作するプラグイン

「オン → 常夜灯 → 消灯」でボタン一つ、「n 段階の明るさ」でボタン 2 つを用いて操作を行う照明を制御するための Homebridge プラグインです。  
使用に Nature Remo が必要です。

- 常夜灯は使用できません。
- Nature Remo のリモコン設定で、消点灯ボタンを「ico_on」、明るさ調節を「ico_arrow_top」「ico_arrow_bottom」に設定してください。

## Config

> schema.json 作るのが面倒だった

```json
{
  "accessToken": "/* https://home.nature.global/ */",
  "maxBrightness": 5,
  "lightId": "/* uuid */"
}
```
