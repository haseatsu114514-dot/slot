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
//
// ジャグラー/ハナハナの設定狙い用:
//   node tools/minrepo/run.mjs sheet [--date 2026-11-11]   # 手入力 CSV（data/manual/）を用意し、その日の記入行を足す
//   node tools/minrepo/run.mjs judge --model マイジャグラーV --games 3200 --bb 13 --rb 14   # その場で設定判別
//     （--grape ぶどう回数 --grape-games 数えたG数 / --diff 差枚だけで判別 / --flat 全設定同確率を前提にする）

//   node tools/minrepo/run.mjs guide [--date 2026-11-12]   # 攻略シート（data/guide.html）だけ作り直す。データが無くても作れる

import { fetchStep, parseStep, analyzeStep, reportStep, sheetStep, judgeStep, guideStep } from "./lib/pipeline.mjs";
import { CONFIG } from "./config.mjs";

const args = process.argv.slice(2);
const valueOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const numberOf = (name) => {
  const v = valueOf(name);
  return v == null || v === "" || Number.isNaN(Number(v)) ? undefined : Number(v);
};
const flags = {
  backfill: args.includes("--backfill"),
  noKishu: args.includes("--no-kishu"),
  months: numberOf("--months"),
  limit: numberOf("--limit"),
  date: valueOf("--date"),
  // judge 用
  model: valueOf("--model"),
  games: numberOf("--games"),
  bb: numberOf("--bb"),
  rb: numberOf("--rb"),
  diff: numberOf("--diff"),
  grape: numberOf("--grape"),
  grapeGames: numberOf("--grape-games"),
  flat: args.includes("--flat"),
  fragment: args.includes("--fragment"),
};
// フラグの値（--date 2026-06-13 等）をコマンドと誤認しないよう除外する
const VALUE_FLAGS = ["--months", "--limit", "--date", "--model", "--games", "--bb", "--rb", "--diff", "--grape", "--grape-games"];
const flagValueIdx = new Set(VALUE_FLAGS.map((name) => args.indexOf(name)).filter((i) => i >= 0).map((i) => i + 1));
const command = args.find((a, i) => !a.startsWith("--") && !flagValueIdx.has(i) && Number.isNaN(Number(a))) || "all";

async function main() {
  if (command === "sheet") {
    sheetStep(CONFIG, flags);
    return;
  }
  if (command === "guide") {
    guideStep(CONFIG, flags);
    return;
  }
  if (command === "judge") {
    if (!judgeStep(CONFIG, flags)) process.exit(1);
    return;
  }
  if (command === "fetch" || command === "all") {
    const r = await fetchStep(CONFIG, flags);
    if (r.aborted) process.exit(2);
  }
  if (command === "parse" || command === "all") parseStep(CONFIG);
  if (command === "analyze" || command === "all") analyzeStep(CONFIG);
  if (command === "report" || command === "all") {
    reportStep(CONFIG, flags);
    console.log("\nまず tools/minrepo/data/guide.html（攻略シート）を開く。細かい表は report.html。");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
