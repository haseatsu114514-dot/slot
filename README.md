# 打つべきかカレンダー

Google スプレッドシートの収支データをもとに、六十干支ごとの「打つべきか / 打たないべきか」を 3 か月カレンダーで見るための静的サイトです。

## この版で入っているもの

- 2026-04-07 を `辛亥` として固定した六十干支カレンダー
- 2026 年 4 月、5 月、6 月の 3 か月表示
- 日付ごとの評価、通変星、実績平均、占断予想の表示
- 成績入力フォーム
- ローカル保存
- Google Apps Script 経由で Google Sheets に追記する同期構成

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

## スコア反映について

元データの `score` を初期値として持ちつつ、追加された実績によって平均収支が変わったぶんだけ、暫定スコアを軽く上下させています。

- 初期スコアは元シートの値
- 追加実績は平均収支と日数に反映
- その差分をもとに `-3` から `+3` の範囲で補正

元シート側に独自の数式ロジックがある場合は、Apps Script 側の `computeLiveScore_` をその式に合わせて置き換えると、フロントとシートの挙動をそろえられます。
