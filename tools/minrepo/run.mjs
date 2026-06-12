#!/usr/bin/env node
// タイホウ亀島店 設定狙い分析ツール — エントリポイント
//
// 使い方:
//   node tools/minrepo/run.mjs                  # 増分取得 → パース → 分析 → レポート
//   node tools/minrepo/run.mjs --backfill       # config.backfillMonths か月ぶん遡って取得
//   node tools/minrepo/run.mjs --months 24      # 遡る範囲を指定
//   node tools/minrepo/run.mjs --limit 50       # 今回取得するレポート数の上限（分割実行用）
//   node tools/minrepo/run.mjs --no-kishu       # 機種別詳細(?kishu=)を取得しない
//   node tools/minrepo/run.mjs --date 2026-06-13 # 「狙い日」計算の基準日を指定（既定: 今日 JST）
//   node tools/minrepo/run.mjs parse|analyze|report   # 個別ステップ（取得なしで再計算）

import { fetchStep, parseStep, analyzeStep, reportStep } from "./lib/pipeline.mjs";
import { CONFIG } from "./config.mjs";

const args = process.argv.slice(2);
const flags = {
  backfill: args.includes("--backfill"),
  noKishu: args.includes("--no-kishu"),
  months: args.includes("--months") ? Number(args[args.indexOf("--months") + 1]) : undefined,
  limit: args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : undefined,
  date: args.includes("--date") ? args[args.indexOf("--date") + 1] : undefined,
};
// フラグの値（--date 2026-06-13 等）をコマンドと誤認しないよう除外する
const flagValueIdx = new Set(
  ["--months", "--limit", "--date"].map((name) => args.indexOf(name)).filter((i) => i >= 0).map((i) => i + 1)
);
const command = args.find((a, i) => !a.startsWith("--") && !flagValueIdx.has(i) && Number.isNaN(Number(a))) || "all";

async function main() {
  if (command === "fetch" || command === "all") {
    const r = await fetchStep(CONFIG, flags);
    if (r.aborted) process.exit(2);
  }
  if (command === "parse" || command === "all") parseStep(CONFIG);
  if (command === "analyze" || command === "all") analyzeStep(CONFIG);
  if (command === "report" || command === "all") {
    reportStep(CONFIG, flags);
    console.log("\nブラウザで tools/minrepo/data/report.html を開いて確認。");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
