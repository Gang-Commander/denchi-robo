# でんちロボ カードバトル

ちびロボに電池を入れて戦う、2人用カードゲームのCPU対戦アプリです。ブラウザだけで動く1ファイルのHTMLです。

- 遊ぶ：GitHub Pages で公開した `index.html` を開く
- ルールとカード図鑑：アプリ内の「ルール・カード図鑑」

## 構成

| パス | 内容 |
|---|---|
| `index.html` | 公開用の完成品（`src/` からビルドしたもの。直接編集しない） |
| `src/engine.js` | ルールエンジン（カード定義・手番・戦闘）。ブラウザと Node の両方で動く |
| `src/ai.js` | CPUの思考（行動の全列挙＋評価関数） |
| `src/run.js` | 勝ち抜きモード（ローグライト）の進行：テーマ・報酬・相手のデッキ |
| `src/app.js` | 画面・操作・演出・チュートリアル・デバッグモード |
| `src/sprites.js` | 16×16 のドット絵 |
| `src/template.html` | HTMLとCSSの台紙。ビルド時に各スクリプトを埋め込む |
| `src/tuned.json` | 「つよい」CPUの評価関数の重み |
| `src/sim.js` | CPU同士の対戦ハーネス |
| `tools/` | テスト・バランス計測・重み調整のスクリプト |

## ビルド

```sh
node src/build.js          # → index.html を書き出す
```

## テスト・計測

```sh
node tools/selftest.js                     # ランダム対戦2000戦でルールの整合性を確認（スタンダード）
node tools/rules_test.js && node tools/cards_test.js   # ルール・カードごとの単体テスト
node tools/pooltest.js [ランダム戦数] [CPU戦数]       # 全カードからランダムにデッキを組んで整合性を確認
node tools/runsim.js [ラン数]               # 勝ち抜きモードを通しでシミュレーション（回戦ごとの勝率）
node tools/balance.js <seed> <試合数> out.json   # カード別の使用率・勝率を集計（4並列で回すのが目安）
node tools/tune.js <反復> <試合数> src/tuned.json <seed> out.json   # 自己対戦で重みを調整
```

## カードの管理

- スタンダードのデッキに入るカードは `src/engine.js` の `ROBO_IDS` と `SPELL_IDS`
- 勝ち抜きモードのテーマは `THEMES`、最初のデッキは `BASIC_DECK`
- 対象を選ぶカードは、定義の `pick`（起動時は `deployPick`）に条件を書く。ルールのチェック・CPU・画面がすべてこれを見る
- 不採用カードは `RETIRED_IDS`（図鑑とデバッグモードにだけ残る）
- カードの設計と裁定は `docs/card-design.md`
