# CLAUDE.md

Claude Code がこのリポジトリで作業する際のガイド。

## プロジェクト概要

「打つべきかカレンダー」— Google Sheets の収支データをもとに、六十干支ごとの「打つべきか / 打たないべきか」を 3 か月カレンダーで表示する静的サイト。ビルドなしで `index.html` をそのまま開ける。

## 実行

- ローカル確認: `index.html` をブラウザで直接開く（ビルド不要）
- テスト: `node tests/kanshi-data.test.mjs`（フレームワーク無し、`node:assert` のみ）
- ホスティング: GitHub Pages などに静的配信
- Sheets 同期: `google-apps-script/Code.gs` を Apps Script 側に貼り付け Web アプリとしてデプロイ、`window.SLOT_APP_CONFIG.syncEndpoint` に URL を設定

## ファイル構成

- `index.html` — UI のマークアップ
- `styles.css` — スタイル
- `kanshi-data.js` — 干支データ、干支計算、スコアリングロジック（**コアロジックはここ**）
- `app.js` — 画面描画、フォーム、Sheets 同期
- `service-worker.js` / `manifest.webmanifest` — PWA
- `google-apps-script/Code.gs` — Sheets 連携。`kanshi-data.js` のスコア計算と**同じロジックをコピー**しているので、片方を変えたらもう片方も合わせる
- `tests/kanshi-data.test.mjs` — 軽量テスト

## スコアリング仕様（要点）

`kanshi-data.js` と `Code.gs` の双方に同じ実装がある。変更時は両方を同期させる。

- **seedScore**: `SEED_KANSHI_DATA` の `score`（手動 -6..9）
- **blendExpected**: `(avg * min(days,6) + sendan * 1.5) / (min(days,6) + 1.5)` — 実績とシートの占断を加重平均
- **computeLiveScore**: `seedScore + clamp(round((liveBlend - seedBlend) / 12000), -3, +3)` を quality cap で頭打ち
- **getQualityScoreCap**: avg/sendan/days/tags で上限を決める
  - `avg === null || days <= 0` → 4
  - `avg < 0` → ≤4、`< 5000` → ≤6、`< 12000` → ≤7、`< 20000` → ≤8
  - `sendan` も同様の段階でキャップ
  - `days <= 1` → ≤6、`days === 2` かつ強候補でない → ≤8
  - `実績×` タグ → ≤4、`要検証`/`データ無` タグ → ≤7
- **buildDayInfo**: 日単位の補正（月干支ステータス・年金日・曜日・質感 playStyle）をかけてから再度 quality cap

## 干支・暦関連

- 基準日: `2026-04-07` = `辛亥`（`DEFAULT_CONFIG.anchorDate` / `anchorKanshi`）
- 月干支: 節入時刻 (`MONTH_PILLAR_TRANSITIONS`) で切り替え、JST 基準
- 日家九星: `KYUSEI_SWITCH_POINTS`（夏至/冬至系の切替）から 1 日ずつ進退
- 吉方位: `getKichoDirections` — 本命殺/本命的殺/五黄殺/暗剣殺/`badStars` を除外

## コード方針

- 依存パッケージ無し。ESM モジュール (`.js`) で読み込む前提。`package.json` は無い
- `kanshi-data.js` は**純粋関数の集まり**として保つ。DOM/fetch を入れない
- 新しいロジックを加えるときは必ず `tests/kanshi-data.test.mjs` にケースを足す
- `SEED_KANSHI_DATA` の `days` / `avg` は `SEED_MONTHLY_ENTRIES` と整合している必要がある（現状 `壬子` と `甲寅` で不整合あり — 直すときは両方）

## 既知の改善余地

- 現行の Spearman(score, avg) ≈ 0.57、Spearman(score, sendan) ≈ 0.83 — スコアは占断側に引っ張られがち
- score 階段での順位逆転が複数（例: score 4 の mean が score 3 より悪い）
- `壬子` `甲寅` の seed データと月次エントリが非同期
