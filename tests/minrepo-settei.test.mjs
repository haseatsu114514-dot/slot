// tools/minrepo のジャグラー/ハナハナ設定推定（specs / settei / manual / atype）のテスト。
// 設定の入れ方に既知の法則を仕込んだ合成ホールを作り、分析がその法則を検出できるか・
// 法則が無いホールで「ある」と言ってしまわないかを確かめる。
// 実行: node tests/minrepo-settei.test.mjs

import assert from "node:assert/strict";
import { ATYPE_SPECS, matchSpec, normalizeModelName, validateSpecs } from "../tools/minrepo/lib/specs.mjs";
import { logLikCounts, logLikDiff, unitLogLik, posterior, probAtLeast, expectedPayout, estimateMix, diffMoments, summarizeMix, IN_PER_GAME } from "../tools/minrepo/lib/settei.mjs";
import { parseCsv, parseCounts, parseObservations, parseCalendar, mergeCounts, buildCountsSheet, templateCsv, normalizeDate, expandUnits } from "../tools/minrepo/lib/manual.mjs";
import { analyzeAType, buildATypeRows, bucketIndex, bucketLabels, fastPermutationP, replacementDates, atypeConfig } from "../tools/minrepo/lib/atype.mjs";
import { analyze } from "../tools/minrepo/lib/analyze.mjs";
import { renderHtml, renderMarkdown } from "../tools/minrepo/lib/report.mjs";
import { mulberry32, addDays, toDateParts } from "../tools/minrepo/lib/util.mjs";

// ---- specs ----
assert.deepEqual(validateSpecs(), [], "スペック表に不整合がある");
assert.ok(ATYPE_SPECS.length >= 12, "ジャグラー/ハナハナの主要機種が登録されていること");
assert.ok(ATYPE_SPECS.every((s) => s.combined && s.sources.every((u) => /^https:\/\//.test(u))), "全機種に合成確率と確認元 URL があること");
for (const s of ATYPE_SPECS) {
  assert.equal(matchSpec(s.name)?.id, s.id, `${s.name} が自分自身に照合されること`);
  assert.ok(s.payout[0] < 100 && s.payout[5] > 100, `${s.name}: 設定1は100%未満・設定6は100%超のはず`);
}
assert.equal(normalizeModelName("Ｓマイジャグラー Ⅴ ＫＫ"), "SマイジャグラーVKK");
assert.equal(matchSpec("SマイジャグラーV")?.name, "マイジャグラーV");
assert.equal(matchSpec("マイジャグラーⅤ")?.name, "マイジャグラーV");
assert.equal(matchSpec("ネオアイムジャグラーEX")?.name, "ネオアイムジャグラーEX", "ネオアイムは旧アイムと区別する");
assert.equal(matchSpec("SアイムジャグラーEX-TP")?.name, "アイムジャグラーEX");
assert.equal(matchSpec("ハッピージャグラーＶⅢ")?.name, "ハッピージャグラーVⅢ");
assert.equal(matchSpec("ハッピージャグラーV III")?.id, "happy-juggler-v3");
assert.equal(matchSpec("マイジャグラーVI")?.name, "マイジャグラーVI", "マイジャグ VI は V と区別する");
assert.equal(matchSpec("ＳマイジャグラーⅥ")?.id, "my-juggler-6");
assert.equal(matchSpec("ゴーゴージャグラー3")?.id, "gogo-juggler-3");
assert.equal(matchSpec("スマート沖スロ ドラゴンハナハナ〜閃光〜")?.id, "dragon-hanahana-senkou-30");
assert.equal(matchSpec("ハナハナホウオウ〜天翔〜-30")?.id, "hanahana-houou-tensho-30");
assert.equal(matchSpec("スターハナハナ-30")?.id, "star-hanahana-30");
// 掲載値の抜き取り確認（転記ミスの検知用）
assert.deepEqual([matchSpec("ゴーゴージャグラー3").reg[2], matchSpec("ゴーゴージャグラー3").payout[3]], [306.2, 101.6]);
assert.deepEqual([matchSpec("ドラゴンハナハナ閃光").reg[5], matchSpec("ドラゴンハナハナ閃光").payout[4]], [399, 107]);
assert.deepEqual([matchSpec("ジャグラーガールズSS").payout[4], matchSpec("ハッピージャグラーVⅢ").payout[4]], [104.0, 105.8]);
assert.equal(matchSpec("ドラゴンハナハナ～閃光～‐30")?.name, "ドラゴンハナハナ〜閃光〜-30");
assert.equal(matchSpec("キングハナハナ-30")?.name, "キングハナハナ-30");
assert.notEqual(matchSpec("ニューキングハナハナV-30")?.name, "キングハナハナ-30", "ニューキングは別機種として扱う");
assert.equal(matchSpec("Lスマスロ北斗の拳"), null);
assert.equal(matchSpec(null), null);

const MYJ = matchSpec("マイジャグラーV");

// ---- settei: 尤度と事後確率 ----
{
  // 設定6 相当の数字（8000G で BIG 38・REG 38）は高設定に、設定1 相当は低設定に寄る
  const hi = posterior(logLikCounts({ games: 8000, bb: 38, rb: 38 }, MYJ));
  assert.ok(probAtLeast(hi, 4) > 0.95, `高設定寄りのはず: ${probAtLeast(hi, 4)}`);
  assert.ok(hi[5] > hi[4] && hi[4] > hi[3]);
  const lo = posterior(logLikCounts({ games: 8000, bb: 27, rb: 17 }, MYJ));
  assert.ok(probAtLeast(lo, 4) < 0.1, `低設定寄りのはず: ${probAtLeast(lo, 4)}`);
  assert.ok(Math.abs(hi.reduce((a, b) => a + b, 0) - 1) < 1e-9);

  // G数が少ないほど判定はぼやける
  const few = posterior(logLikCounts({ games: 800, bb: 4, rb: 4 }, MYJ));
  assert.ok(Math.max(...few) < 0.35, "800G では断定しない");

  // 事前分布（低設定が多い店）を入れると、同じ数字でも高設定確率は下がる
  const prior = [0.6, 0.2, 0.1, 0.05, 0.03, 0.02];
  const ll = logLikCounts({ games: 3000, bb: 12, rb: 13 }, MYJ);
  assert.ok(probAtLeast(posterior(ll, prior), 4) < probAtLeast(posterior(ll), 4));

  // 不正な入力は null
  assert.equal(logLikCounts({ games: 100, bb: 80, rb: 30 }, MYJ), null);
  assert.equal(logLikCounts({ games: 0, bb: 0, rb: 0 }, MYJ), null);
  assert.equal(logLikCounts({ games: 3000, bb: null, rb: 10 }, MYJ), null);
  assert.equal(unitLogLik({ games: null, diff: 100 }, MYJ), null);

  // BIG/REG があればそれを優先、無ければ差枚で代用
  assert.equal(unitLogLik({ games: 5000, bb: 20, rb: 18, diff: 900 }, MYJ).basis, "counts");
  assert.equal(unitLogLik({ games: 5000, diff: 900 }, MYJ).basis, "diff");

  // 差枚ベース: 出ているほど高設定寄り（単調）
  const q = (diff) => probAtLeast(posterior(logLikDiff({ games: 7000, diff }, MYJ)), 4);
  assert.ok(q(-2000) < q(0) && q(0) < q(2000) && q(2000) < q(4000));
  // 差枚の期待値は IN × (機械割 − 1)
  const m6 = diffMoments(8000, MYJ, 5);
  assert.ok(Math.abs(m6.mean - 8000 * IN_PER_GAME * (MYJ.payout[5] / 100 - 1)) < 1e-6);
  assert.ok(Math.sqrt(m6.variance) > 1000 && Math.sqrt(m6.variance) < 2500, "8000G の差枚の標準偏差は 1000〜2500枚程度のはず");
  // 取りこぼし補正を入れると期待値が下がる
  assert.ok(diffMoments(8000, MYJ, 0, { skillLossPct: 1 }).mean < diffMoments(8000, MYJ, 0).mean);

  assert.ok(Math.abs(expectedPayout([0, 0, 0, 0, 0, 1], MYJ) - MYJ.payout[5]) < 1e-9);
  assert.deepEqual(summarizeMix([0.4, 0.2, 0.1, 0.1, 0.1, 0.1]).low.toFixed(2), "0.60");

  // ぶどう確率に設定差がある機種は、ぶどうを数えると判定が動く
  const withGrape = ATYPE_SPECS.find((s) => s.grape && s.grape[0] !== s.grape[5]);
  if (withGrape) {
    const base = { games: 4000, bb: 15, rb: 12 };
    const good = posterior(logLikCounts({ ...base, grape: Math.round(4000 / withGrape.grape[5]) + 20 }, withGrape));
    const bad = posterior(logLikCounts({ ...base, grape: Math.round(4000 / withGrape.grape[0]) - 20 }, withGrape));
    assert.ok(probAtLeast(good, 4) > probAtLeast(bad, 4), "ぶどうが良いほど高設定寄り");
  }
}

// ---- 合成データの道具 ----
function poisson(lambda, rng) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}
function gaussian(rng) {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}
function pickSetting(weights, rng) {
  let r = rng();
  for (let s = 0; s < 6; s++) {
    r -= weights[s];
    if (r <= 0) return s + 1;
  }
  return 6;
}
/** 設定 setting の台を games ゲーム回した 1日の結果を作る（BIG/REG はポアソン、差枚は BIG/REG と整合） */
function simulate(spec, setting, games, rng) {
  const s = setting - 1;
  const pB = 1 / spec.big[s];
  const pR = 1 / spec.reg[s];
  const bb = poisson(games * pB, rng);
  const rb = poisson(games * pR, rng);
  const basePerGame = pB * spec.bigNet + pR * spec.regNet - IN_PER_GAME * (spec.payout[s] / 100 - 1); // 通常時に減る枚数/G
  const diff = Math.round(bb * spec.bigNet + rb * spec.regNet - games * basePerGame + gaussian(rng) * Math.sqrt(games * 9));
  return { games, bb, rb, diff };
}

// ---- settei: EM で設定配分を復元できる ----
{
  const rng = mulberry32(7);
  const truth = [0.55, 0.2, 0.1, 0.05, 0.05, 0.05];
  const lls = [];
  for (let i = 0; i < 4000; i++) {
    const r = simulate(MYJ, pickSetting(truth, rng), 6000 + Math.floor(rng() * 3000), rng);
    lls.push(logLikCounts(r, MYJ));
  }
  const { pi } = estimateMix(lls);
  const got = summarizeMix(pi);
  assert.ok(Math.abs(got.high - 0.15) < 0.04, `高設定率を復元できるはず: ${got.high}`);
  assert.ok(Math.abs(got.low - 0.75) < 0.08, `低設定率を復元できるはず: ${got.low}`);
  // 全台設定1なら高設定率はほぼ 0
  const ones = [];
  for (let i = 0; i < 1500; i++) ones.push(logLikCounts(simulate(MYJ, 1, 7000, rng), MYJ));
  assert.ok(summarizeMix(estimateMix(ones).pi).high < 0.05);
  // 擬似データ（事前分布）で少サンプルを全体へ寄せられる
  const prior = [0.5, 0.25, 0.1, 0.07, 0.05, 0.03];
  const tiny = estimateMix([logLikCounts({ games: 8000, bb: 40, rb: 40 }, MYJ)], { priorPi: prior, priorStrength: 50 });
  assert.ok(summarizeMix(tiny.pi).high < 0.25, "1件だけでは全体配分から大きく動かない");
  assert.deepEqual(estimateMix([], { priorPi: prior }).pi.map((v) => v.toFixed(2)), prior.map((v) => v.toFixed(2)));
}

// ---- manual: CSV ----
{
  assert.deepEqual(parseCsv('a,b\r\n"x,1","say ""hi"""\n\n3,4'), [["a", "b"], ["x,1", 'say "hi"'], ["3", "4"]]);
  assert.equal(normalizeDate("2026/11/8"), "2026-11-08");
  assert.equal(normalizeDate("11/8"), null);

  const counts = parseCounts(`﻿date,unit,model,games,bb,rb,diff,grape,grapeGames,note
# 例,1,x,1,1,1,,,,コメント行
2026-11-08,512,マイジャグラーV,"6,480",28,31,+1850,,,
2026/11/08,513,,,,,,,,未記入の行は無視
2026-11-08,514,,3000,40,3000,,,,
bad,515,,1000,1,1,,,,
`);
  assert.equal(counts.rows.length, 1);
  assert.deepEqual(counts.rows[0], { date: "2026-11-08", unit: 512, model: "マイジャグラーV", games: 6480, bb: 28, rb: 31, diff: 1850, grape: null, grapeGames: null, note: null });
  assert.equal(counts.errors.length, 2, "BIG+REG>G と日付不正の 2 行がエラーになる");

  const obs = parseObservations("date,unit,tag,note\n2026-11-08,512,示唆景品,台上にお菓子\n2026-11-08,,示唆景品,\n");
  assert.equal(obs.rows.length, 1);
  assert.equal(obs.errors.length, 1);
  // 台番は範囲・複数指定を台ごとに展開する
  assert.deepEqual(expandUnits("512"), [512]);
  assert.deepEqual(expandUnits("501-503"), [501, 502, 503]);
  assert.deepEqual(expandUnits("５１２／515 520"), [512, 515, 520]);
  assert.equal(expandUnits("角台"), null);
  assert.equal(expandUnits("503-501"), null);
  assert.equal(expandUnits(""), null);
  const multi = parseObservations('date,unit,tag,note\n2026-11-08,501-503,札,\n2026-11-08,"512,515",示唆景品,\n');
  assert.deepEqual(multi.rows.map((r) => `${r.unit}:${r.tag}`), ["501:札", "502:札", "503:札", "512:示唆景品", "515:示唆景品"]);
  const cal = parseCalendar("date,kind,note\n2026-11-09,入替,新台入替\n");
  assert.deepEqual(cal.rows, [{ date: "2026-11-09", kind: "入替", target: null, note: "新台入替" }]);
  // 期間（dateTo 列 / 〜 区切り）と対象機種
  const ranged = parseCalendar("date,dateTo,kind,target,note\n2026-11-29,2026-12-02,おすすめ週間,北斗|カバネリ,\n2026/11/10〜2026/11/11,,景品示唆,,\n2026-11-05,2026-11-01,逆,,\n");
  assert.deepEqual(ranged.rows.map((r) => `${r.date}:${r.kind}:${r.target ?? ""}`), ["2026-11-29:おすすめ週間:北斗|カバネリ", "2026-11-30:おすすめ週間:北斗|カバネリ", "2026-12-01:おすすめ週間:北斗|カバネリ", "2026-12-02:おすすめ週間:北斗|カバネリ", "2026-11-10:景品示唆:", "2026-11-11:景品示唆:"]);
  assert.equal(ranged.errors.length, 1, "逆向きの期間はエラー");

  // 統合: 既存行は games/bb/rb を上書き、無い行は追加（機種名はその台番の直近から補う）
  const units = [
    { date: "2026-11-07", model: "マイジャグラーV", unit: 512, suffix: "2", diff: -500, games: 4000, payout: null, bb: null, rb: null },
    { date: "2026-11-08", model: "マイジャグラーV", unit: 512, suffix: "2", diff: 1800, games: 6400, payout: null, bb: null, rb: null },
  ];
  const merged = mergeCounts(units, [
    { date: "2026-11-08", unit: 512, model: null, games: 6480, bb: 28, rb: 31, diff: null, grape: null, grapeGames: null },
    { date: "2026-11-09", unit: 512, model: null, games: 5000, bb: 20, rb: 15, diff: 300, grape: null, grapeGames: null },
  ]);
  assert.equal(merged.length, 3);
  assert.equal(units[1].bb, null, "元の配列は書き換えない");
  const m8 = merged.find((u) => u.date === "2026-11-08");
  assert.deepEqual([m8.games, m8.bb, m8.rb, m8.diff, m8.src], [6480, 28, 31, 1800, "manual"]);
  const m9 = merged.find((u) => u.date === "2026-11-09");
  assert.deepEqual([m9.model, m9.games, m9.diff, m9.suffix], ["マイジャグラーV", 5000, 300, "2"]);

  // 記入シート: 既にある 日付×台番 は足さない
  const sheet = buildCountsSheet("2026-11-10", [{ unit: 513, model: "マイジャグラーV" }, { unit: 512, model: "マイジャグラーV" }], "date,unit\n2026-11-10,512\n");
  assert.equal(sheet, "2026-11-10,513,マイジャグラーV,,,,,,,\n");
  assert.equal(buildCountsSheet("2026-11-10", [{ unit: 512, model: "x" }], "date,unit\n2026-11-10,512\n"), "");
  // テンプレの例の行はコメント扱いで読み飛ばされる
  assert.equal(parseCounts(templateCsv("counts")).rows.length, 0);
  assert.equal(parseObservations(templateCsv("observations")).rows.length, 0);
  assert.equal(parseCalendar(templateCsv("calendar")).rows.length, 0);
}

// ---- atype の小道具 ----
assert.equal(bucketIndex(-2500, [-2000, 0, 2000]), 0);
assert.equal(bucketIndex(-2000, [-2000, 0, 2000]), 0);
assert.equal(bucketIndex(1, [-2000, 0, 2000]), 2);
assert.equal(bucketIndex(9999, [-2000, 0, 2000]), 3);
assert.deepEqual(bucketLabels([-2000, 0]), ["-2,000枚以下", "-2,000〜0枚", "0枚超"]);
{
  const rng = mulberry32(1);
  const a = Array.from({ length: 40 }, () => 1 + rng());
  const b = Array.from({ length: 400 }, () => rng());
  assert.ok(fastPermutationP(a, b, 500, rng) < 0.01);
  const c = Array.from({ length: 40 }, () => rng());
  assert.ok(fastPermutationP(c, b, 500, rng) > 0.05);
  assert.equal(fastPermutationP([1, 2], b, 100, rng), null);
}
{
  const cfg = atypeConfig({ atype: { replacementMinUnits: 3, replacementDays: ["2026-01-05"] } });
  const map = replacementDates(
    [
      { date: "2026-01-10", kind: "新台", model: "A", from: 0, to: 5 },
      { date: "2026-01-12", kind: "増台", model: "B", from: 4, to: 5 }, // 1台だけ → 入替日扱いしない
      { date: "2026-01-14", kind: "撤去", model: "C", from: 5, to: 0 },
    ],
    [{ date: "2026-01-20", kind: "新台入替" }, { date: "2026-01-21", kind: "店休" }],
    cfg
  );
  assert.deepEqual([...map.keys()].sort(), ["2026-01-05", "2026-01-10", "2026-01-20"]);
}

// ---- 合成ホール ----
const CONFIG = {
  storeName: "テスト店",
  eventDays: [{ label: "3のつく日", type: "digitContains", digit: 3 }],
  seriesWatchlist: [],
  anniversaries: [],
  hole: { window: 7, minObs: 4, buckets: [-8000, -3000, 3000] },
  analysis: { iterations: 200 },
  atype: { iterations: 400, backtest: { warmupDays: 30 } },
};

const HANA = ATYPE_SPECS.find((s) => s.series === "ハナハナ");
const FLOOR = [
  ...Array.from({ length: 16 }, (_, i) => ({ unit: 501 + i, model: "SマイジャグラーV", spec: MYJ })),
  ...Array.from({ length: 8 }, (_, i) => ({ unit: 601 + i, model: HANA.name, spec: HANA })),
];
const REPLACEMENT_DAYS = ["2025-08-05", "2025-09-09", "2025-10-07", "2025-11-11", "2025-12-09", "2026-01-13"];
const FAVORED_UNIT = 507;
const BASE_MIX = [0.62, 0.23, 0.09, 0.03, 0.02, 0.01];

/**
 * planted=true のとき次の法則を仕込む:
 *  1. 前日 -2,000枚以下の台は 50% で設定6（凹み台上げ）
 *  2. 入替日は全台 40% で設定5
 *  3. 毎日 35% の確率で 1台に「示唆景品」を置き、その台は設定6
 *  4. 台番507 は常に 35% で設定5
 *  5. 3のつく日は 15% で設定4（日の種類の効果）
 */
function buildHall(seed, planted, { stripCounts = false } = {}) {
  const rng = mulberry32(seed);
  const units = [];
  const observations = [];
  const prevDiff = new Map();
  let truthHigh = 0;
  let truthN = 0;
  let date = "2025-07-01";
  while (date <= "2026-02-28") {
    const p = toDateParts(date);
    const isRep = REPLACEMENT_DAYS.includes(date);
    const tagged = planted && rng() < 0.35 ? FLOOR[Math.floor(rng() * FLOOR.length)].unit : null;
    for (const f of FLOOR) {
      let setting = pickSetting(BASE_MIX, rng);
      if (planted) {
        if (String(p.d).includes("3") && rng() < 0.15) setting = 4;
        if (f.unit === FAVORED_UNIT && rng() < 0.35) setting = 5;
        if (isRep && rng() < 0.4) setting = 5;
        const pd = prevDiff.get(f.unit);
        if (pd != null && pd <= -2000 && rng() < 0.5) setting = 6;
        if (tagged === f.unit) setting = 6;
      }
      const games = 4500 + Math.floor(rng() * 3500) + (setting >= 4 ? 1000 : 0);
      const r = simulate(f.spec, setting, games, rng);
      prevDiff.set(f.unit, r.diff);
      truthN++;
      if (setting >= 4) truthHigh++;
      units.push({ date, model: f.model, unit: f.unit, suffix: String(f.unit % 10), diff: r.diff, games: r.games, payout: null, bb: stripCounts ? null : r.bb, rb: stripCounts ? null : r.rb });
    }
    if (tagged != null) observations.push({ date, unit: tagged, tag: "示唆景品", note: null });
    date = addDays(date, 1);
  }
  const lineupEvents = REPLACEMENT_DAYS.map((d) => ({ date: d, kind: "新台", model: `L新台${d}`, from: 0, to: 5 }));
  return { dataset: { days: [], models: [], units, suffixes: [], manual: { observations, calendar: [] } }, lineupEvents, truthHigh: truthHigh / truthN };
}

// ---- 法則を仕込んだホール: 検出できること ----
const hall = buildHall(2026, true);
const t = analyzeAType(hall.dataset, CONFIG, { lineupEvents: hall.lineupEvents });
{
  assert.equal(t.available, true);
  assert.equal(t.coverage.nUnits, FLOOR.length);
  assert.equal(t.coverage.basisCounts.diff, 0, "BIG/REG があるので全件 counts 根拠");
  assert.equal(t.byModel.length, 2);
  assert.ok(t.byModel[0].siteNames.includes("SマイジャグラーV"));

  // 店全体の高設定率が真値に近い
  assert.ok(Math.abs(t.mix.high - hall.truthHigh) < 0.05, `高設定率 推定 ${t.mix.high} / 真値 ${hall.truthHigh}`);
  assert.ok(t.mix.highCi.lo <= t.mix.high + 0.02 && t.mix.highCi.hi >= t.mix.high - 0.02, "信頼区間が推定値の周りにある");
  assert.ok(t.mix.highCi.hi - t.mix.highCi.lo < 0.15);
  assert.ok(t.all.payout > 0.9 && t.all.payout < 1.1);

  // 1. 凹み台上げ
  const hole = t.hole.prev1[0];
  assert.ok(hole.n > 100, `大凹みバケツのサンプル: ${hole.n}`);
  assert.ok(hole.dq > 0.15 && hole.p < 0.01, `凹み台上げを検出: Δq=${hole.dq} p=${hole.p}`);
  assert.ok(hole.high > 0.35, `大凹み翌日の高設定率: ${hole.high}`);
  const flat = t.hole.prev1[3];
  assert.ok(flat.dq < 0.02, "前日プラスの台には上乗せが無い");
  assert.ok(t.hole.prev7[0].dq > 0, "7日合計の大凹みにも波及する");

  // 2. 入替日
  const rep = t.replacement.offsets.find((o) => o.label === "入替当日");
  assert.equal(t.replacement.days.length, REPLACEMENT_DAYS.length);
  assert.equal(rep.nDays, REPLACEMENT_DAYS.length);
  assert.ok(rep.upliftQ > 0.1 && rep.p < 0.01, `入替日を検出: uplift=${rep.upliftQ} p=${rep.p}`);
  assert.ok(rep.high > rep.highRest + 0.15);
  const repNext = t.replacement.offsets.find((o) => o.label === "入替翌日");
  assert.ok(repNext.upliftQ < rep.upliftQ / 2, "翌日には残らない");

  // 3. 示唆景品
  assert.equal(t.tags.length, 1);
  const tag = t.tags[0];
  assert.equal(tag.tag, "示唆景品");
  assert.equal(tag.nObs, hall.dataset.manual.observations.length);
  assert.equal(tag.nMatched, tag.nObs);
  assert.ok(tag.dq > 0.4 && tag.pQ < 0.01, `示唆景品を検出: Δq=${tag.dq} p=${tag.pQ}`);
  assert.ok(tag.dDiff > 1000 && tag.pDiff < 0.01);

  // 4. 贔屓の台番
  assert.ok(t.units.table.slice(0, 2).some((u) => u.unit === FAVORED_UNIT), `台番${FAVORED_UNIT} が上位に来る`);
  assert.ok(t.units.pHeterogeneity < 0.05);

  // 5. 日の種類
  const ev = t.byEvent.find((e) => e.label === "3のつく日");
  assert.ok(ev.upliftQ > 0.015 && ev.p < 0.05, `3のつく日を検出: uplift=${ev.upliftQ} p=${ev.p}`);

  // 並び: 仕込んでいないので有意にならない
  assert.ok(t.neighbors.nPairs > 1000);
  assert.ok(t.neighbors.p > 0.01, `並びは仕込んでいない: p=${t.neighbors.p}`);

  // ランキングは過去データで通用する
  const k3 = t.backtest.results.find((r) => r.k === 3);
  assert.ok(k3.nDays > 150);
  assert.ok(k3.edgeDiff > 300 && k3.pDiff < 0.01, `上位3台が全台平均を上回る: edge=${k3.edgeDiff} p=${k3.pDiff}`);
  assert.ok(k3.pickPayout > t.backtest.allPayout + 0.02);
  assert.equal(t.backtest.verdict, "裏付けあり");

  // 翌日の狙い台
  assert.equal(t.picks.targetDate, "2026-03-01");
  assert.equal(t.picks.rows.length, 10);
  assert.equal(t.picks.nCandidates, FLOOR.length);
  for (let i = 1; i < t.picks.rows.length; i++) assert.ok(t.picks.rows[i - 1].p >= t.picks.rows[i].p, "高設定らしさの降順");
  const holeUnits = hall.dataset.units.filter((u) => u.date === "2026-02-28" && u.diff <= -2000).map((u) => u.unit);
  assert.ok(holeUnits.length >= 1, "最終日に大凹みの台がある（合成データの前提）");
  const top = t.picks.rows.slice(0, holeUnits.length + 1).map((r) => r.unit);
  assert.ok(holeUnits.every((u) => top.includes(u)), `前日大凹みの台が上位に来る: 凹み=${holeUnits} 上位=${top}`);
  assert.ok(holeUnits.includes(t.picks.rows[0].unit) || t.picks.rows[0].unit === FAVORED_UNIT);
  assert.ok(t.picks.rows[0].reasons.length >= 1, "根拠が付く");
  assert.ok(t.picks.rows[0].p > t.picks.baseRate + 0.1, "1位は条件なしの平均よりはっきり高い");
  // 採点表の高設定率は、凹み台の表（同じ条件の EM 推定）とほぼ一致する
  const holeFeature = t.featureTable.find((f) => f.text.includes("前日の差枚") && f.text.includes("以下"));
  assert.ok(Math.abs(holeFeature.rate - hole.high) < 0.08, `採点表 ${holeFeature.rate} / 凹み台の表 ${hole.high}`);
  assert.equal(holeFeature.n, hole.n);

  // 最新日の答え合わせ
  assert.equal(t.latest.date, "2026-02-28");
  assert.equal(t.latest.rows.length, FLOOR.length);
  assert.ok(t.latest.rows.every((r) => r.post && Math.abs(r.post.reduce((a, b) => a + b, 0) - 1) < 1e-9));
}

// ---- 法則の無いホール: 「ある」と言わないこと ----
{
  const nullHall = buildHall(99, false);
  const n = analyzeAType(nullHall.dataset, CONFIG, { lineupEvents: nullHall.lineupEvents });
  assert.equal(n.available, true);
  assert.ok(Math.abs(n.mix.high - nullHall.truthHigh) < 0.04, `高設定率 推定 ${n.mix.high} / 真値 ${nullHall.truthHigh}`);
  assert.ok(n.hole.prev1[0].p > 0.01, `凹み台の偽陽性: p=${n.hole.prev1[0].p}`);
  assert.ok(Math.abs(n.hole.prev1[0].dq) < 0.04);
  const rep = n.replacement.offsets.find((o) => o.label === "入替当日");
  assert.ok(rep.p > 0.01, `入替日の偽陽性: p=${rep.p}`);
  assert.ok(n.units.pHeterogeneity > 0.01, `台番の偽陽性: p=${n.units.pHeterogeneity}`);
  assert.notEqual(n.backtest.verdict, "裏付けあり", "法則が無いのにランキングが通用すると言わない");
  assert.equal(n.tags.length, 0);
}

// ---- BIG/REG が無く差枚だけのとき: 粗いが傾向は拾える ----
{
  const diffHall = buildHall(2026, true, { stripCounts: true });
  const d = analyzeAType(diffHall.dataset, CONFIG, { lineupEvents: diffHall.lineupEvents });
  assert.equal(d.available, true);
  assert.equal(d.coverage.basisCounts.counts, 0);
  assert.ok(d.coverage.basisCounts.diff > 5000);
  assert.ok(Math.abs(d.mix.high - diffHall.truthHigh) < 0.1, `差枚だけでも高設定率は大きく外さない: ${d.mix.high} / ${diffHall.truthHigh}`);
  assert.ok(d.hole.prev1[0].dq > 0.05 && d.hole.prev1[0].p < 0.01, `差枚だけでも凹み台上げを検出: Δq=${d.hole.prev1[0].dq}`);
  assert.ok(d.tags[0].dq > 0.1 && d.tags[0].pQ < 0.01);
}

// ---- データが足りないとき ----
{
  const none = analyzeAType({ days: [], models: [], units: [], suffixes: [] }, CONFIG);
  assert.equal(none.available, false);
  assert.ok(none.reason.includes("台番別データ"));
  const few = analyzeAType({ units: hall.dataset.units.slice(0, 10) }, CONFIG);
  assert.equal(few.available, false);
  // スペック未登録の機種は警告に出す
  const unknown = buildATypeRows({ units: [{ date: "2026-01-01", model: "ナゾノジャグラーZ", unit: 1, diff: 0, games: 3000 }] }, CONFIG);
  assert.equal(unknown.rows.length, 0);
  assert.deepEqual(unknown.unknownModels, [{ model: "ナゾノジャグラーZ", n: 1 }]);
  // 稼働が少ない台×日は推定しない（履歴としては残す）
  const low = buildATypeRows({ units: [{ date: "2026-01-01", model: "マイジャグラーV", unit: 1, diff: -90, games: 30, bb: 0, rb: 0 }] }, CONFIG);
  assert.equal(low.rows.length, 1);
  assert.equal(low.rows[0].ll, null);
}

// ---- analyze() への統合とレポート ----
{
  const dataset = { ...hall.dataset, days: [], models: [], suffixes: [] };
  const a = analyze(dataset, CONFIG, { iterations: 100 });
  assert.equal(a.atype.available, true);
  // analyze() 経由では入替日を設置構成（models）から検知するので、models が空のここでは 0 日
  assert.equal(a.atype.replacement.days.length, 0);

  const withRep = { ...a, atype: t };
  const meta = { generatedAt: "2026-03-01 06:30", today: "2026-03-01" };
  const html = renderHtml(withRep, CONFIG, meta);
  for (const id of ["atype", "picks", "ahole", "arep", "aunit", "judge"]) assert.ok(html.includes(`<section id="${id}"`), `セクション #${id} がある`);
  assert.ok(html.includes('href="#picks"'), "ナビに狙い台がある");
  assert.ok(html.includes("裏付けあり"));
  assert.ok(html.includes("示唆景品"));
  assert.ok(html.includes("var JG="), "設定判別の電卓が埋め込まれている");
  assert.ok(html.includes(`"id":"${MYJ.id}"`));
  // 本文（末尾のスクリプトより前）に undefined / NaN が漏れていない
  const bodyOf = (h) => h.slice(0, h.indexOf("<script>"));
  assert.ok(!bodyOf(html).includes("undefined") && !bodyOf(html).includes("NaN"), "undefined / NaN が出力に漏れていない");
  // データが古いときは注意を出す
  assert.ok(renderHtml(withRep, CONFIG, { ...meta, today: "2026-03-05" }).includes("データが古い"));
  const md = renderMarkdown(withRep, CONFIG, meta.generatedAt);
  assert.ok(md.includes("## ジャグラー・ハナハナ 設定推定"));
  assert.ok(md.includes("裏付けあり"));

  // データが無いときも壊れず、電卓だけは使える
  const empty = analyze({ days: [], models: [], units: [], suffixes: [] }, CONFIG, { iterations: 50 });
  assert.equal(empty.atype.available, false);
  const emptyHtml = renderHtml(empty, CONFIG, meta);
  assert.ok(emptyHtml.includes('<section id="atype"') && emptyHtml.includes('<section id="judge"'));
  assert.ok(emptyHtml.includes("データ待ち"));
  assert.ok(!bodyOf(emptyHtml).includes("undefined") && !bodyOf(emptyHtml).includes("NaN"));
  assert.ok(renderMarkdown(empty, CONFIG, meta.generatedAt).includes("データ待ち"));
}

console.log("minrepo-settei: all tests passed");
