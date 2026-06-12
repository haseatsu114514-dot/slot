# CLAUDE.md

Claude Code がこのリポジトリで作業する際のガイド。

## プロジェクト概要

「打つべきかカレンダー」— Google Sheets の収支データをもとに、六十干支ごとの「打つべきか / 打たないべきか」をカレンダーで表示する静的サイト。ビルドなしで `index.html` をそのまま開ける。

## 実行

- ローカル確認: `index.html` をブラウザで直接開く（ビルド不要）
- テスト: `node tests/kanshi-data.test.mjs` と `node tests/code-gs-parity.test.mjs`（フレームワーク無し、`node:assert` のみ）
  - `code-gs-parity` は `Code.gs` と `kanshi-data.js` のスコアリングが一致するかを vm サンドボックスで照合する。スコア計算を触ったら必ず両方実行
- ホスティング: GitHub Pages などに静的配信
- Sheets 同期: `google-apps-script/Code.gs` を Apps Script 側に貼り付け Web アプリとしてデプロイ、`window.SLOT_APP_CONFIG.syncEndpoint` に URL を設定

## ファイル構成

- `index.html` — UI のマークアップ
- `styles.css` — スタイル
- `kanshi-data.js` — 干支データ、干支計算、スコアリングロジック（**コアロジックはここ**）
- `app.js` — 画面描画、フォーム、Sheets 同期
- `service-worker.js` / `manifest.webmanifest` — PWA
- `google-apps-script/Code.gs` — Sheets 連携。`kanshi-data.js` のスコア計算と**同じロジックをコピー**しているので、片方を変えたらもう片方も合わせる（`tests/code-gs-parity.test.mjs` が乖離を検知する）
- `tests/kanshi-data.test.mjs` — コアロジックのテスト
- `tests/code-gs-parity.test.mjs` — Code.gs と kanshi-data.js のパリティテスト

## 表示範囲

- 表示範囲は今日を基準に自動計算（既定: 過去 12 か月〜未来 3 か月、`getDynamicRange`）
- `SLOT_APP_CONFIG` に `pastMonths` / `futureMonths` で幅を変更可能。`startMonth` と `monthCount` を両方指定すると固定レンジになる
- カレンダーはグリッド / リスト（アジェンダ）の 2 表示。状態は localStorage に永続化

## スコアリング仕様（要点）

`kanshi-data.js` と `Code.gs` の双方に同じ実装がある。変更時は両方を同期させ、パリティテストを回す。

- **評価記号** (`RATING_THRESHOLDS` / `getRating`): ★=スコア8以上、◎=6.5以上、○=5以上、△=3以上、×=3未満（上から順に判定。日補正後のスコアは小数になり得る）
- **seedScore**: `SEED_KANSHI_DATA` の `score`（手動 -6..9）
- **blendExpected**: シュリンクブレンド `(avg * days + sendan * 6) / (days + 6)` — sendan を擬似サンプル k=6 として混ぜ、実績日数が増えるほど自然に実績寄りになる（days 上限なし）。k=6 は 159 日の leave-one-out 検証で順位相関が最大だった値（少サンプルの実績平均はノイズが強いため占断を厚めに見る）
- **computeLiveScore**:
  1. `seedBased = clamp(seedScore + clamp(round((liveBlend - seedBlend) / 6000), -5, +5), -6, 9)`
  2. `dataDriven`: avg の階段関数（25000→9 … -20000→1、それ未満 0。avg なしなら null）
  3. `dataWeight = days / (days + 4)` で seedBased と dataDriven を加重平均
  4. 最後に quality cap で頭打ち
- **getQualityScoreCap**: avg/sendan/days/tags で上限を決める
  - `avg === null || days <= 0` → 4
  - avg 階段: `< 0` → ≤4、`< 5000` → ≤6、`< 12000` → ≤7、`< 20000` → ≤8
  - sendan 階段: `< 0` → ≤4、`< 5000` → ≤6、`< 10000` → ≤7、`< 18000` → ≤8
    - 緩和: `days >= 5 && avg > sendan + 8000` で +1、`days >= 8 && avg > sendan + 14000` でさらに +1
  - 失望キャップ: `days >= 5 && avg < sendan - 8000` なら avg 階段の cap まで引き下げ、`days >= 8 && avg < sendan - 14000` でさらに -1
  - `days <= 1` → ≤6、`days === 2` かつ強候補（avg≥30000 かつ sendan≥20000）でない → ≤8
  - `実績×` タグ → ≤4、`要検証`/`データ無` タグ → ≤7
- **buildDayInfo**: 日単位の補正（月干支ステータス・年金日・質感 playStyle・九星）をかけてから再度 quality cap。曜日補正 (`WEEKDAY_EFFECTS`) は実日付つき実測で裏付けが取れず全曜日 0 に無効化中（構造は残してある）

## 干支・暦関連

- 基準日: `2026-04-07` = `辛亥`（`DEFAULT_CONFIG.anchorDate` / `anchorKanshi`）
- 月干支: 節入時刻 (`MONTH_PILLAR_TRANSITIONS`) で切り替え、JST 正午基準。**2028 年末まで収録済み**。毎年 2 月に国立天文台の暦要項が出たら翌年分を追記する（カバー切れが近づくとテストが落ちる）
- 日家九星: `KYUSEI_SWITCH_POINTS`（夏至/冬至に最も近い甲子日、180 日周期）から 1 日ずつ進退。2028 年分まで収録済み
- 吉方位: `getKichoDirections` — 本命殺/本命的殺/五黄殺/暗剣殺/`badStars` を除外

## コード方針

- 依存パッケージ無し。ESM モジュール (`.js`) で読み込む前提。`package.json` は無い
- `kanshi-data.js` は**純粋関数の集まり**として保つ。DOM/fetch を入れない
- 新しいロジックを加えるときは必ず `tests/kanshi-data.test.mjs` にケースを足す
- `SEED_KANSHI_DATA` の `days` / `avg` は `SEED_MONTHLY_ENTRIES` と整合している必要がある（テストが照合する）
- `index.html` / `service-worker.js` のキャッシュバスター (`?v=YYYYMMDDx`) は JS/CSS を変えたら更新する（`app.js` 内の `kanshi-data.js` import も忘れずに）

## 既知の改善余地

2026-06 時点・全 159 日 (シード 122 + 実績入力 37) での実測に基づく:

- ◎帯 (スコア 6.5〜7.9, n=8日, 平均 +7,938円) が ○帯 (n=23日, +15,500円) を下回る逆転が残る。小サンプルのため未対応。他の帯は ★ +33,452 > ○ > △ +3,880 > × -10,106 と単調
- 九星補正は「半周期内で干支と九星がほぼ 1:1 対応する」構造的交絡があり、干支実績の二重カウントの疑い。実日付サンプルが貯まったら検証する
- `SEED_MONTHLY_ENTRIES` には実日付が無い。`scripts/migrate-seed-history.mjs` で「実績入力」シートへ移行できる (メモの `SEED_MIGRATION_MARKER` を検知するとアプリは焼き込み実績を使わずエントリ全量から再構成する)。移行後の日付は干支からの推定なので、本当の日付が分かるならシート上で直すと曜日・九星検証に使えるようになる
- entries の store / machine フィールドに対応する入力 UI が無い。店舗別集計は精度向上の有力候補
- `syncSecret` は静的サイトに平文で載るため、本質的なアクセス制御にはならない（README のセキュリティ注意を参照）
