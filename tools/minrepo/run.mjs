#!/usr/bin/env node
// タイホウ亀島店 設定狙い分析ツール — エントリポイント
//
// 使い方:
//   node tools/minrepo/run.mjs check            # 取得できる環境かを確かめる（サイトへのアクセスは 2 回だけ）
//   node tools/minrepo/run.mjs once             # 一度だけ: 過去半年ぶんをまとめて取得 → 分析 → 攻略シート（途中で止めても続きから）
//   node tools/minrepo/run.mjs                  # サイトにはアクセスせず、手元のデータで作り直す（inbox の取り込み → 分析 → 攻略シート）
//   node tools/minrepo/run.mjs import [--from フォルダ]   # 手で保存したページを取り込み、集め残しの日を表示
//
// 取得まわり（明示的に指定したときだけサイトにアクセスする。毎回取りに行かせるには config.mjs の autoFetch: true）:
//   node tools/minrepo/run.mjs fetch            # 新しい日だけ取得
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

import { fetchStep, checkStep, importStep, parseStep, analyzeStep, reportStep, sheetStep, judgeStep, guideStep } from "./lib/pipeline.mjs";
import { CONFIG } from "./config.mjs";

if (typeof globalThis.fetch !== "function") {
  console.error(`Node.js ${process.versions.node} では動かない。Node.js 18 以上を入れること。`);
  process.exit(1);
}

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
  from: valueOf("--from"), // import 用: 取り込むフォルダ（既定 data/inbox）
  fetch: args.includes("--fetch"),
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
const VALUE_FLAGS = ["--months", "--limit", "--date", "--from", "--model", "--games", "--bb", "--rb", "--diff", "--grape", "--grape-games"];
const flagValueIdx = new Set(VALUE_FLAGS.map((name) => args.indexOf(name)).filter((i) => i >= 0).map((i) => i + 1));
let command = args.find((a, i) => !a.startsWith("--") && !flagValueIdx.has(i) && Number.isNaN(Number(a))) || "all";

// once = 「現状の攻略をまとめるために、一度だけまとめて取る」。過去 backfillMonths か月ぶんの日別ページと、
// ジャグラー/ハナハナの台番別ページだけを、間隔を空けて取得する。取得済みのぶんは取り直さない。
if (command === "once") {
  const months = flags.months ?? CONFIG.backfillMonths;
  const days = Math.round(months * 30.4);
  const sec = (CONFIG.delayMs + CONFIG.jitterMs / 2) / 1000;
  console.log(`一度だけの取得: 過去 ${months} か月ぶん（日別ページ 約${days}枚${flags.noKishu ? "" : ` + ${CONFIG.kishuDetail.pattern || "注目機種"} の台番別ページ`}）`);
  console.log(`  アクセス間隔は約 ${sec.toFixed(1)} 秒。日別だけで約 ${Math.round((days * sec) / 60)} 分、台番別を含めると 1 時間前後かかる。`);
  console.log(`  途中で止めても、同じコマンドで続きから取得する。終わったら以後の取得は不要（作り直しは引数なしの run.mjs）。\n`);
  flags.backfill = true;
  command = "all";
}

async function main() {
  if (command === "check") {
    const r = await checkStep(CONFIG);
    process.exit(r.ok ? 0 : 2);
  }
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
  // サイトへの自動アクセスは、明示的に頼まれたときだけ行う（既定は手で保存したページの取り込みのみ）
  const wantsFetch = command === "fetch" || flags.fetch || flags.backfill || (command === "all" && CONFIG.autoFetch === true);
  if (wantsFetch) {
    const r = await fetchStep(CONFIG, flags);
    if (r.aborted) process.exit(2);
  }
  if (command === "import" || command === "all") {
    importStep(CONFIG, { ...flags, verbose: command === "import" });
    if (command === "import") return;
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
