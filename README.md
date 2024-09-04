# @nzws/mlru1-light

> アイリスオーヤマ製「ML-RU1」リモコンを使用する照明を操作するプラグイン

「オン → 常夜灯 → 消灯」でボタン一つ、「n 段階の明るさ」でボタン 2 つを用いて操作を行う照明を制御するための Homebridge プラグインです。  
使用に Nature Remo が必要です。

- 常夜灯は使用できません。
- Nature Remo のリモコン設定で、消点灯ボタンを「ico_on」、明るさ調節を「ico_arrow_top」「ico_arrow_bottom」に設定してください。
- 設定には `accessToken` か `remoIpAddr` のどちらかが必要です。
  - accessToken を使用する場合、Nature Remo の API サーバーを経由する Cloud API を使用します。
  - remoIpAddr を使用する場合、Nature Remo に直接通信する Local API を使用します。

## Config

> schema.json 作るのが面倒だった

```json
{
  "accessory": "MLRU1Light",
  "name": "Light",
  "accessToken": "/* https://home.nature.global/ */",
  "remoIpAddr": "/* Optional */",
  "maxBrightness": 5,
  "lightId": "/* uuid */"
}
```
