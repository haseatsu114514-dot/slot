# 打つべきかカレンダー

Google スプレッドシートの収支データをもとに、六十干支ごとの「打つべきか / 打たないべきか」をカレンダーで見るための静的サイトです。

## この版で入っているもの

- 2026-04-07 を `辛亥` として固定した六十干支カレンダー
- 表示範囲は今日を基準に自動追従（既定: 過去 12 か月〜未来 3 か月）。月が変わっても更新作業は不要
- グリッド表示とリスト（アジェンダ）表示の切替。スマホはリスト表示が見やすい
- カレンダー上の左右スワイプで前月 / 翌月へ移動（スマホ）
- 日付ごとの評価、通変星、実績平均、占断予想の表示
- 成績入力フォームとセル長押しのクイック入力（± ボタンで負け額の符号を反転できる）
- 入力済み収支の編集・削除
- 同じ日付に同じ収支を入れたときの重複警告
- ローカル保存
- Google Apps Script 経由で Google Sheets に追加・更新・削除する同期構成

## ファイル構成

- `index.html`
  そのままブラウザで開けるフロント本体です。
- `kanshi-data.js`
  干支データ、干支計算、暫定スコア再計算ロジックです。
- `app.js`
  画面描画、フォーム処理、Sheets 同期処理です。
- `google-apps-script/Code.gs`
  シート連携用の Web アプリです。
- `google-apps-script/appsscript.json`
  Apps Script の設定です。

## ローカルで見る

ビルドは不要です。`slot/index.html` をそのまま開けます。

## テスト

```
node tests/kanshi-data.test.mjs
node tests/code-gs-parity.test.mjs
```

2 つ目は `Code.gs` と `kanshi-data.js` のスコアリングロジックが乖離していないかを照合します。
どちらかのスコア計算を変えたら必ず両方実行してください。

## Google Sheets とつなぐ手順

1. Google Apps Script に `google-apps-script/Code.gs` と `google-apps-script/appsscript.json` を貼り付けます。
2. 必要なら Script Properties に次を設定します。
   - `SPREADSHEET_ID`
   - `API_SECRET`
   - `MASTER_SHEET_NAME`
   - `RESULTS_SHEET_NAME`
3. Apps Script 側で `setupSheets()` を一度実行します。
4. 続けて `seedMasterSheet()` を一度実行します。
5. Web アプリとしてデプロイします。
6. `index.html` 内の `window.SLOT_APP_CONFIG.syncEndpoint` に Web アプリ URL を入れます。
7. `API_SECRET` を使う場合は `window.SLOT_APP_CONFIG.syncSecret` に同じ文字列を入れます。

### セキュリティ上の注意

`index.html` はそのまま公開されるため、`syncSecret` もソースから誰でも読めます。
GitHub Pages などで公開する場合、このシークレットは「URL を知らない人の誤操作を防ぐ」程度の意味しかありません。
書き込まれて困るデータを扱うなら、Apps Script のデプロイを「自分のみ」アクセスに絞るか、定期的にシークレットと Web アプリ URL を変更してください。

### 既存データ修正

この版の Apps Script には `repairRequestedEntries` アクションが入っています。
Web アプリを再デプロイしたあとにこのアクションを実行すると、2026-05-20 の `7000` を `5000` に更新し、2026-05-14 の `-11000` 重複4件を1件に整理します。

## スコア反映について

元データの `score` を初期値として持ちつつ、追加された実績で平均収支が変わったぶんだけスコアを補正します。
実績日数が増えるほど占断より実績側の重みが自然に増える「シュリンクブレンド」方式です（詳細は `CLAUDE.md` のスコアリング仕様）。

元シート側に独自の数式ロジックがある場合は、Apps Script 側の `computeLiveScore_` をその式に合わせて置き換えると、フロントとシートの挙動をそろえられます。

## 暦データの保守

- 月干支の節入時刻（`kanshi-data.js` の `MONTH_PILLAR_TRANSITIONS`）は **2028 年末まで** 収録済みです。
  毎年 2 月に国立天文台の暦要項が公表されたら、翌年分を 1 年ぶん追記してください。
  データが切れそうになると `node tests/kanshi-data.test.mjs` が失敗して知らせます。
- 日家九星の切替日（`KYUSEI_SWITCH_POINTS`）も 2028 年分まで収録済みです（180 日周期の甲子日）。
