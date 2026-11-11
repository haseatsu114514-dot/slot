// tools/minrepo の営業カレンダー分析（全台・日単位）のテスト。
// 「年金支給日は回収」「入替当日は放出」「放出の翌日は回収」「おすすめ週間は対象機種だけ強い」
// 「示唆景品の台は出る」を仕込んだ合成ホールで、分析がそれを検出できるかを確かめる。
// 実行: node tests/minrepo-calendar.test.mjs

import assert from "node:assert/strict";
import { analyzeCalendar, pensionPayday, salaryPayday, dayTags, buildTagContext, categoryOf, upcomingCalendar, CALENDAR_DEFAULTS } from "../tools/minrepo/lib/calendar.mjs";
import { analyze } from "../tools/minrepo/lib/analyze.mjs";
import { renderHtml, renderMarkdown } from "../tools/minrepo/lib/report.mjs";
import { mulberry32, addDays, toDateParts } from "../tools/minrepo/lib/util.mjs";

// ---- 年金支給日・給料日（土日は直前の平日へ前倒し）----
assert.equal(pensionPayday(2026, 4), "2026-04-15"); // 水
assert.equal(pensionPayday(2026, 2), "2026-02-13"); // 15日が日曜 → 金曜
assert.equal(pensionPayday(2026, 8), "2026-08-14"); // 15日が土曜 → 金曜
assert.equal(pensionPayday(2026, 3), null, "奇数月は支給なし");
assert.equal(salaryPayday(2026, 10), "2026-10-23"); // 25日が日曜
assert.equal(salaryPayday(2026, 11), "2026-11-25");

// ---- タグ付け ----
const CONFIG = {
  storeName: "テスト店",
  eventDays: [
    { label: "3のつく日", type: "digitContains", digit: 3 },
    { label: "土曜日", type: "weekday", weekday: 6 },
  ],
  seriesWatchlist: [],
  anniversaries: [],
  hole: { window: 7, minObs: 4, buckets: [-8000, -3000, 3000] },
  analysis: { iterations: 200 },
  atype: { iterations: 200 },
  calendar: { iterations: 500 },
};
{
  const ctx = buildTagContext(CONFIG, { replacement: ["2026-11-17"], calendar: [{ date: "2026-11-16", kind: "おすすめ週間" }, { date: "2026-11-17", kind: "入替" }], observations: [{ date: "2026-11-16", unit: 1, tag: "示唆景品" }] });
  const labels = (d) => dayTags(d, ctx).map((t) => t.label);
  assert.deepEqual(labels("2026-02-13"), ["3のつく日", "年金支給日"]);
  assert.ok(labels("2026-02-14").includes("年金支給日の後3日") && labels("2026-02-14").includes("3のつく日の翌日") && labels("2026-02-14").includes("土曜日"));
  assert.ok(!labels("2026-02-14").includes("土曜日の翌日"), "曜日型のイベントには前日/翌日タグを作らない");
  assert.deepEqual(labels("2026-11-16"), ["入替前日", "おすすめ週間", "示唆景品の記録があった日"]);
  assert.deepEqual(labels("2026-11-17"), ["入替当日"], "kind=入替 は入替タグ側で扱い、手入力タグには出さない");
  assert.ok(labels("2026-11-20").includes("入替後2〜7日"));
  assert.ok(labels("2026-12-30").includes("年末年始(12/29〜1/3)") && labels("2026-12-30").includes("月末(最後の3日)"));
  assert.ok(labels("2027-01-02").includes("年末年始(12/29〜1/3)") && labels("2027-01-02").includes("月初(1〜3日)"));
  assert.ok(labels("2026-08-14").includes("お盆(8/11〜8/16)") && labels("2026-08-14").includes("年金支給日"));
  assert.ok(labels("2026-05-03").includes("GW(4/29〜5/5)"));
  assert.ok(labels("2026-11-25").includes("給料日(25日)") && labels("2026-11-27").includes("給料日の後3日"));
  assert.deepEqual(labels("2026-11-10"), [], "何でもない日はタグなし");
}
assert.equal(categoryOf("Lスマスロ北斗の拳", CALENDAR_DEFAULTS.categories), "スマスロ");
assert.equal(categoryOf("マイジャグラーV", CALENDAR_DEFAULTS.categories), "ジャグラー/ハナハナ");
assert.equal(categoryOf("スマート沖スロ ドラゴンハナハナ〜閃光〜", CALENDAR_DEFAULTS.categories), "ジャグラー/ハナハナ", "ハナハナはスマスロ版も Aタイプ側に入れる");
assert.equal(categoryOf("パチスロ 甲鉄城のカバネリ", CALENDAR_DEFAULTS.categories), "その他");

// ---- 合成ホール ----
// 仕込み:
//  1. 年金支給日とその後3日は回収（全台 -350枚）
//  2. 入替当日は放出（全台 +450枚）。スマスロだけさらに +300
//  3. 放出日（入替当日）の翌日は回収（-300）
//  4. おすすめ週間（2 回・各 7 日）は 北斗 だけ +900。他機種は平常
//  5. 「景品示唆」と書いた日は全台 +300
//  6. 台単位の現地メモ「示唆景品」の台は +2500
const MODELS = [
  { model: "Lスマスロ北斗の拳", count: 20 },
  { model: "L東京喰種", count: 12 },
  { model: "マイジャグラーV", count: 20 },
  { model: "キングハナハナ-30", count: 10 },
  { model: "パチスロ 甲鉄城のカバネリ", count: 8 },
];
const REPLACEMENTS = ["2025-06-10", "2025-07-08", "2025-08-05", "2025-09-09", "2025-10-07", "2025-11-11", "2025-12-09", "2026-01-13", "2026-02-10", "2026-03-10"];
const RECOMMEND = [
  ["2025-09-15", "2025-09-21"],
  ["2025-12-15", "2025-12-21"],
  ["2026-03-16", "2026-03-22"],
];
function buildHall(seed, planted) {
  const rng = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const days = [];
  const models = [];
  const units = [];
  const calendar = [];
  const observations = [];
  for (const [from, to] of RECOMMEND) for (let d = from; d <= to; d = addDays(d, 1)) calendar.push({ date: d, kind: "おすすめ週間", target: "北斗", note: null });
  const hintDays = new Set();
  let date = "2025-05-01";
  while (date <= "2026-04-30") {
    const p = toDateParts(date);
    const isPension = [0, 1, 2, 3].some((k) => pensionPayday(p.y, p.m) === addDays(date, -k)) || (p.m % 2 === 1 && false);
    const isRep = REPLACEMENTS.includes(date);
    const afterRep = REPLACEMENTS.includes(addDays(date, -1));
    const isRecommend = RECOMMEND.some(([f, t]) => date >= f && date <= t);
    const isHint = rng() < 0.08;
    if (isHint) {
      hintDays.add(date);
      calendar.push({ date, kind: "景品示唆", target: null, note: null });
    }
    let dayShift = gauss() * 120;
    if (planted) {
      if (isPension) dayShift -= 350;
      if (isRep) dayShift += 450;
      if (afterRep) dayShift -= 300;
      if (isHint) dayShift += 300;
    }
    let win = 0;
    let total = 0;
    let sum = 0;
    for (const m of MODELS) {
      let avg = -150 + dayShift + gauss() * 150;
      if (planted && isRep && /^L/.test(m.model)) avg += 300;
      if (planted && isRecommend && /北斗/.test(m.model)) avg += 900;
      const wr = Math.min(0.95, Math.max(0.05, 0.42 + avg / 4000));
      const w = Math.round(m.count * wr);
      models.push({ date, model: m.model, count: m.count, avgDiff: Math.round(avg), avgGames: Math.round(3000 + gauss() * 200 + (isRep ? 500 : 0)), win: w, total: m.count, payout: null });
      win += w;
      total += m.count;
      sum += avg * m.count;
    }
    days.push({ date, postId: 1, y: p.y, m: p.m, d: p.d, weekday: p.weekday, nthWeekday: Math.ceil(p.d / 7), status: null, oldEventDays: null, avgGames: 3000 + (isRep ? 500 : 0), win, total, winRate: win / total, avgDiff: sum / total, masked: false });
    // 台単位: スマスロ 10 台ぶん。毎日 30% で 1 台に示唆景品
    const tagged = rng() < 0.3 ? 100 + Math.floor(rng() * 10) : null;
    for (let u = 100; u < 110; u++) {
      const boost = planted && tagged === u ? 2500 : 0;
      units.push({ date, model: "Lスマスロ北斗の拳", unit: u, suffix: String(u % 10), diff: Math.round(-150 + dayShift + boost + gauss() * 1500), games: 3000, payout: null, bb: null, rb: null });
    }
    if (tagged != null) observations.push({ date, unit: tagged, tag: "示唆景品", note: null });
    date = addDays(date, 1);
  }
  const lineupEvents = REPLACEMENTS.map((d) => ({ date: d, kind: "新台", model: `L新台${d}`, from: 0, to: 5 }));
  return { dataset: { days, models, units, suffixes: [], manual: { observations, calendar } }, lineupEvents, hintDays };
}

const hall = buildHall(11, true);
const c = analyzeCalendar(hall.dataset, CONFIG, { lineupEvents: hall.lineupEvents });
const tag = (cal, label) => cal.tags.find((t) => t.label === label);
{
  assert.equal(c.available, true);
  assert.equal(c.nDays, 365);
  assert.deepEqual(c.context.replacement, REPLACEMENTS);

  // 1. 年金: 当日は年 6 回しか無いので「後3日」と合わせて見る
  const pensionAfter = tag(c, "年金支給日の後3日");
  assert.equal(tag(c, "年金支給日").nDays, 6);
  assert.equal(pensionAfter.nDays, 18);
  assert.ok(pensionAfter.diff.uplift < -200 && pensionAfter.diff.p < 0.01, `年金後の回収を検出: ${pensionAfter.diff.uplift} p=${pensionAfter.diff.p}`);
  assert.equal(pensionAfter.verdict, "回収寄り");
  assert.ok(pensionAfter.recoveryRate > 0.5, `年金後は回収日になりやすい: ${pensionAfter.recoveryRate}`);
  assert.ok(tag(c, "年金支給日").diff.uplift < -150);

  // 2. 入替当日は放出、3. 翌日は回収
  const rep = tag(c, "入替当日");
  assert.equal(rep.nDays, REPLACEMENTS.length);
  assert.ok(rep.diff.uplift > 300 && rep.diff.p < 0.01, `入替当日の放出を検出: ${rep.diff.uplift}`);
  assert.equal(rep.verdict, "放出寄り");
  assert.ok(rep.releaseRate > 0.8 && rep.releaseP < 0.01);
  assert.ok(rep.games.uplift > 300, "入替当日は稼働も増える");
  assert.ok(Math.abs(rep.upliftDiffWeekdayAdj - rep.diff.uplift) < 150, "曜日調整しても効果は残る");
  const repNext = tag(c, "入替翌日");
  assert.ok(repNext.diff.uplift < -150 && repNext.diff.p < 0.05, `入替翌日の回収を検出: ${repNext.diff.uplift}`);
  // 放出日（上位 15% の日）の大半は入替と無関係なので、「放出日の翌日」全体では効果が薄まる。集計が出ていることだけ確かめる
  assert.ok(c.recovery.afterRelease.nIn > 30 && Number.isFinite(c.recovery.afterRelease.uplift) && c.recovery.afterRelease.p != null);
  assert.ok(c.recovery.lagCorr != null && Math.abs(c.recovery.lagCorr) < 1);
  assert.ok(c.recovery.lowCut < c.recovery.highCut);
  assert.equal(c.recovery.worstRecent.length, 10);
  assert.ok(c.recovery.worstRecent[0].avgDiff <= c.recovery.worstRecent[9].avgDiff);

  // 仕込んでいない種類は「放出/回収寄り」と言わない
  for (const label of ["土曜日", "月初(1〜3日)", "給料日(25日)"]) {
    const t = tag(c, label);
    assert.ok(t && !["放出寄り", "回収寄り"].includes(t.verdict), `${label} は仕込んでいない: ${t && t.verdict} (${t && t.diff.uplift}, p=${t && t.diff.p})`);
  }

  // 5. 手入力した日単位の示唆
  const hint = tag(c, "景品示唆");
  assert.equal(hint.group, "手入力");
  assert.equal(hint.nDays, hall.hintDays.size);
  assert.ok(hint.diff.uplift > 150 && hint.diff.p < 0.01, `景品示唆の日を検出: ${hint.diff.uplift}`);

  // 2'. 入替当日はスマスロが特に強い
  const smart = c.categories.find((k) => k.name === "スマスロ");
  const atype = c.categories.find((k) => k.name === "ジャグラー/ハナハナ");
  const smartRep = smart.byTag.find((x) => x.label === "入替当日");
  const atypeRep = atype.byTag.find((x) => x.label === "入替当日");
  assert.ok(smartRep.upliftDiff > atypeRep.upliftDiff + 150, `入替当日のスマスロ優遇: ${smartRep.upliftDiff} vs ${atypeRep.upliftDiff}`);
  assert.ok(smartRep.pWin < 0.05);
  assert.equal(smart.samples, 32 * 365);

  // 4. おすすめ週間: 対象機種（北斗）だけ強い
  assert.equal(c.targets.length, 1);
  const rec = c.targets[0];
  assert.deepEqual([rec.kind, rec.target, rec.nDays, rec.nPeriodDays], ["おすすめ週間", "北斗", 21, 21]);
  assert.deepEqual(rec.models, ["Lスマスロ北斗の拳"]);
  assert.ok(rec.diff.uplift > 600 && rec.win.p < 0.01, `おすすめ週間の対象機種を検出: ${rec.diff.uplift}`);
  assert.ok(rec.gap.uplift > 0.1 && rec.gap.p < 0.01, "他機種との差が期間中に広がる");
  // 店全体としては、おすすめ週間はほぼ平常（対象機種だけの話）
  assert.ok(Math.abs(tag(c, "おすすめ週間").diff.uplift) < 250);
  const recModels = c.modelsByTag.find((m) => m.label === "おすすめ週間");
  assert.equal(recModels.top[0].model, "Lスマスロ北斗の拳", "日の種類×機種の表でも北斗が 1 位");

  // 6. 台単位の現地メモ（スマスロは差枚で比較）
  assert.equal(c.unitTags.length, 1);
  const ut = c.unitTags[0];
  assert.equal(ut.nMatched, ut.nObs);
  assert.ok(ut.dDiff > 1500 && ut.pDiff < 0.01, `示唆景品の台を検出: ${ut.dDiff}`);
  assert.deepEqual(ut.byCategory.map((k) => k.name), ["スマスロ"]);
  assert.ok(tag(c, "示唆景品の記録があった日"), "記録があった日も日単位のタグになる");

  // 今後 2 週間の見通し: 入替日（calendar.csv / 自動検知）や年金がタグとして出て、実績つきで並ぶ
  const up = upcomingCalendar(c, CONFIG, "2026-02-08", 14);
  assert.equal(up.length, 14);
  const feb10 = up.find((u) => u.date === "2026-02-10");
  assert.ok(feb10.tags.some((t) => t.label === "入替当日" && t.verdict === "放出寄り"));
  assert.equal(feb10.outlook, "放出寄り");
  const feb14 = up.find((u) => u.date === "2026-02-14");
  assert.ok(feb14.tags.some((t) => t.label === "年金支給日の後3日"));
  assert.ok(["回収寄り", "やや回収"].includes(feb14.outlook), `年金後は回収見通し: ${feb14.outlook}`);
}

// ---- 法則の無いホール: 放出/回収と言わない ----
{
  const nullHall = buildHall(77, false);
  const n = analyzeCalendar(nullHall.dataset, CONFIG, { lineupEvents: nullHall.lineupEvents });
  const strong = n.tags.filter((t) => ["放出寄り", "回収寄り"].includes(t.verdict));
  // 種類を 20 個以上同時に見ているので、偶然の「寄り」が 1〜2 個出るのは許容する
  assert.ok(strong.length <= 2, `偽陽性が多すぎる: ${strong.map((t) => `${t.label}(p=${t.diff.p})`).join(", ")}`);
  assert.ok(!["放出寄り", "回収寄り"].includes(tag(n, "入替当日").verdict) || tag(n, "入替当日").diff.p > 0.01);
  assert.ok(n.targets[0].gap.p > 0.01, "おすすめ週間の偽陽性");
  assert.ok(n.unitTags[0].pDiff > 0.01, "示唆景品の偽陽性");
}

// ---- データ不足・レポート ----
{
  const few = analyzeCalendar({ days: hall.dataset.days.slice(0, 5), models: [] }, CONFIG);
  assert.equal(few.available, false);
  assert.ok(few.reason.includes("14 日以上"));

  // analyze() 経由では入替日を「設置構成の変化」か calendar.csv から拾う。ここでは calendar.csv に書いた想定
  const withReplacements = {
    ...hall.dataset,
    manual: { ...hall.dataset.manual, calendar: [...hall.dataset.manual.calendar, ...REPLACEMENTS.map((date) => ({ date, kind: "入替", target: null, note: null }))] },
  };
  const a = analyze(withReplacements, CONFIG, { iterations: 100 });
  assert.equal(a.calendar.available, true);
  assert.equal(a.calendar.tags.find((t) => t.label === "入替当日").nDays, REPLACEMENTS.length);
  const meta = { generatedAt: "2026-05-01 06:30", today: "2026-05-01" };
  const html = renderHtml(a, CONFIG, meta);
  const body = html.slice(0, html.indexOf("<script>"));
  assert.ok(html.includes('<section id="cal"') && html.includes('href="#cal"'));
  for (const text of ["年金支給日", "入替当日", "おすすめ週間", "景品示唆", "回収日・放出日の出方", "今後2週間の見通し", "スマスロ"]) assert.ok(body.includes(text), `レポートに「${text}」がある`);
  assert.ok(!body.includes("undefined") && !body.includes("NaN"), "undefined / NaN が出力に漏れていない");
  const md = renderMarkdown(a, CONFIG, meta.generatedAt);
  assert.ok(md.includes("## 出す日・回収する日（全台）") && md.includes("入替当日"));

  const empty = analyze({ days: [], models: [], units: [], suffixes: [] }, CONFIG, { iterations: 50 });
  assert.equal(empty.calendar.available, false);
  const emptyHtml = renderHtml(empty, CONFIG, meta);
  assert.ok(emptyHtml.includes('<section id="cal"') && emptyHtml.includes("データ待ち"));
}

console.log("minrepo-calendar: all tests passed");
