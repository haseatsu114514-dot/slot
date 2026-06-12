// tools/minrepo の分析エンジンのテスト。
// 既知の法則を仕込んだ合成データで、分析が法則を検出できるかを確かめる。
// 実行: node tests/minrepo-analyze.test.mjs

import assert from "node:assert/strict";
import { buildDataset } from "../tools/minrepo/lib/dataset.mjs";
import { analyze, matchesEvent, buildSeriesDays } from "../tools/minrepo/lib/analyze.mjs";
import { mulberry32, toDateParts, dayContainsDigit, nthWeekdayOfMonth } from "../tools/minrepo/lib/util.mjs";

const CONFIG = {
  eventDays: [
    { label: "3のつく日", type: "digitContains", digit: 3 },
    { label: "4のつく日", type: "digitContains", digit: 4 },
    { label: "7のつく日", type: "digitContains", digit: 7 },
    { label: "第1土曜日", type: "nthWeekday", weekday: 6, nth: 1 },
  ],
  seriesWatchlist: [
    { name: "北斗", pattern: "北斗" },
    { name: "カバネリ", pattern: "カバネリ" },
  ],
  anniversaries: [{ label: "テスト記念日", month: 12, day: 20, seriesPattern: "北斗" }],
  hole: { window: 7, minObs: 4, buckets: [-8000, -3000, 3000] },
};

// ---- 合成データ生成 ----
// 仕込み:
//  1. 3のつく日: 全体勝率 +15pt・差枚ブースト（全期間）
//  2. 4のつく日: 前半6か月だけブースト → 「やめた可能性」の判定が出るはず
//  3. 7のつく日: 北斗だけ 2024 年のみブースト
//  4. イベント日(3のつく日)は日付末尾一致の末尾をブースト
//  5. カバネリ 2025-03-10 に 4台→6台（増台）、2025-05-01 に新機種登場
//  6. 台番901 は 2025-06-06〜12 に大負け→ 2025-06-13 に大勝ち（大凹み→救済）
const rng = mulberry32(123);
const noise = (scale) => (rng() - 0.5) * 2 * scale;

function* dateRange(from, to) {
  let d = from;
  while (d <= to) {
    yield d;
    const p = toDateParts(d);
    const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    d = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  }
}

const records = [];
for (const date of dateRange("2024-01-01", "2025-06-30")) {
  const p = toDateParts(date);
  const is3 = dayContainsDigit(p.d, 3);
  const is4 = dayContainsDigit(p.d, 4);
  const is7 = dayContainsDigit(p.d, 7);
  const firstHalf = date < "2025-01-01";

  const boost = (is3 ? 0.15 : 0) + (is4 && firstHalf ? 0.15 : 0);
  const baseWr = 0.4 + boost;

  const mkModel = (model, count, wr, avgDiff) => ({
    model,
    count,
    avgDiff: Math.round(avgDiff + noise(150)),
    avgGames: Math.round(2500 + noise(500)),
    win: Math.round(count * Math.min(0.95, Math.max(0.05, wr))),
    total: count,
    payout: null,
  });

  const hokutoBoost = is7 && p.y === 2024 ? 1800 : 0;
  const models = [
    mkModel("Lスマスロ北斗の拳", 30, baseWr + (is7 && p.y === 2024 ? 0.2 : 0), -300 + boost * 4000 + hokutoBoost),
    mkModel("マイジャグラーV", 30, baseWr, -300 + boost * 4000),
    mkModel("パチスロ 甲鉄城のカバネリ", date >= "2025-03-10" ? 6 : 4, baseWr, -300 + boost * 4000),
    mkModel("沖ドキ！GOLD", 20, baseWr, -300 + boost * 4000),
  ];
  if (date >= "2025-05-01") models.push(mkModel("L新機種テスト", 5, baseWr, 0));

  const totalCount = models.reduce((a, m) => a + m.count, 0);
  const totalWin = models.reduce((a, m) => a + m.win, 0);

  // 末尾テーブル: イベント日(3のつく日)は日付末尾一致をブースト
  const tail = String(p.d % 10);
  const suffixes = [];
  for (let s = 0; s <= 9; s++) {
    const match = is3 && String(s) === tail;
    suffixes.push({
      suffix: String(s),
      avgDiff: Math.round(-300 + (match ? 2000 : 0) + noise(200)),
      avgGames: 2500,
      win: match ? 20 : 12,
      total: 32,
      payout: null,
    });
  }

  // バラエティ台: 台番900〜909。台番901 に凹み→救済を仕込む
  const units = [];
  for (let u = 900; u <= 909; u++) {
    let diff = Math.round(noise(500));
    if (u === 901) {
      if (date >= "2025-06-06" && date <= "2025-06-12") diff = -2000;
      if (date === "2025-06-13") diff = 5000;
    }
    units.push({ model: `バラ機種${u}`, unit: u, diff, games: 1500, payout: null });
  }

  records.push({
    date,
    postId: 1,
    title: `${p.m}/${p.d}(x) テスト店`,
    masked: false,
    report: {
      status: is3 ? "旧イベント日（3のつく日）" : "通常営業",
      oldEventDays: "3のつく日、第1土曜日",
      avgGames: 2500,
      win: totalWin,
      total: totalCount,
      models,
      units,
      suffixes,
    },
    kishuUnits: [],
  });
}

const dataset = buildDataset(records);
assert.equal(dataset.days.length, 547); // 2024-01-01〜2025-06-30
assert.ok(dataset.days[0].winRate > 0, "勝率が計算されている");
assert.ok(dataset.days.every((d) => d.avgDiff != null), "全日の平均差枚が機種テーブルから計算されている");

// ---- matchesEvent ----
const day0607 = dataset.days.find((d) => d.date === "2025-06-07");
assert.equal(matchesEvent(day0607, { type: "nthWeekday", weekday: 6, nth: 1 }), toDateParts("2025-06-07").weekday === 6 && nthWeekdayOfMonth("2025-06-07") === 1);

// ---- 分析本体 ----
const analysis = analyze(dataset, CONFIG, { iterations: 400, seed: 7 });

// 1) 3のつく日は有意に強い
const g3 = analysis.eventGroups.find((g) => g.label === "3のつく日");
assert.ok(g3.win.uplift > 0.08, `3のつく日の勝率uplift が出るはず: ${g3.win.uplift}`);
assert.ok(g3.win.p != null && g3.win.p < 0.05, `3のつく日は有意のはず: p=${g3.win.p}`);
assert.ok(g3.diff.uplift > 300, `3のつく日の差枚uplift: ${g3.diff.uplift}`);

// 2) 4のつく日は「以前は効いていたが直近は怪しい」
const g4 = analysis.eventGroups.find((g) => g.label === "4のつく日");
assert.ok(g4.recent.past.upliftWin > 0.05, `前半は効いていた: ${g4.recent.past.upliftWin}`);
assert.ok(g4.recent.recent.upliftWin < 0.03, `直近は効いていない: ${g4.recent.recent.upliftWin}`);
assert.equal(g4.recent.verdict, "以前は効いていたが直近は怪しい（やめた可能性）");

// 3) 北斗×7のつく日は 2024 のみ
const hokuto = analysis.series.find((s) => s.name === "北斗");
const h7 = hokuto.byEvent.find((e) => e.label === "7のつく日");
const y2024 = h7.byYear.find((y) => y.y === 2024);
const y2025 = h7.byYear.find((y) => y.y === 2025);
assert.ok(y2024.upliftWin > 0.1, `北斗×7の日は2024年に効いていた: ${y2024.upliftWin}`);
assert.ok(y2025.upliftWin < 0.05, `2025年は効いていない: ${y2025.upliftWin}`);

// 4) 日付末尾一致
const dt = analysis.suffix.dateTailMatch;
assert.ok(dt.meanDeltaDiff > 100, `日付末尾一致の差枚Δ: ${dt.meanDeltaDiff}`);
assert.ok(dt.pDiff != null && dt.pDiff < 0.05, `日付末尾一致は有意: ${dt.pDiff}`);
const ev3 = analysis.suffix.byEvent.find((g) => g.label === "3のつく日");
assert.ok(ev3 && ev3.table.length >= 10, "イベント日別の末尾テーブルがある");

// 5) 増台・新台の検知
const masudai = analysis.lineup.events.find((e) => e.kind === "増台" && e.model.includes("カバネリ"));
assert.ok(masudai && masudai.date === "2025-03-10" && masudai.from === 4 && masudai.to === 6, `カバネリ増台検知: ${JSON.stringify(masudai)}`);
const shindai = analysis.lineup.events.find((e) => e.kind === "新台" && e.model === "L新機種テスト");
assert.ok(shindai && shindai.date === "2025-05-01", `新台検知: ${JSON.stringify(shindai)}`);
const intro = analysis.lineup.intro.find((i) => i.model === "L新機種テスト");
assert.ok(intro && intro.firstWeek.n > 0, "導入初週の成績が出る");

// 6) 凹み→救済の検知（台番901: 直近7日 -8000 以下 → 大凹みバケツで勝つ）
// 凹み形成中（6/11, 6/12 = 通常日）は負け、6/13（3のつく日 = イベント日）に救済勝ち
const bigHoleAll = analysis.hole.allDays.find((b) => b.bucket === "大凹み");
const bigHoleEvent = analysis.hole.eventDays.find((b) => b.bucket === "大凹み");
const bigHoleNormal = analysis.hole.normalDays.find((b) => b.bucket === "大凹み");
assert.ok(analysis.hole.nSamples > 1000, `サンプル数: ${analysis.hole.nSamples}`);
assert.equal(bigHoleAll.n, 3, `大凹みサンプル: ${JSON.stringify(bigHoleAll)}`);
assert.equal(bigHoleEvent.n, 1);
assert.equal(bigHoleEvent.winRate, 1, "イベント日の大凹み台は救済されて勝ち");
assert.equal(bigHoleNormal.winRate, 0, "通常日の大凹み台は据え置き");

// 7) 状況ラベル・記念日・シリーズ日次
assert.ok(analysis.statusLabels.some((s) => s.label.includes("旧イベント日")));
assert.equal(analysis.anniversaries.explicit.length, 1);
assert.ok(analysis.anniversaries.autoScan.length > 0);
const seriesDays = buildSeriesDays(dataset, CONFIG.seriesWatchlist);
assert.equal(seriesDays.get("北斗").length, 547);
assert.ok(Math.abs(seriesDays.get("北斗")[0].count - 30) < 1);

// 8) カバレッジ
assert.equal(analysis.coverage.nDays, 547);
assert.equal(analysis.coverage.nMasked, 0);

console.log("minrepo-analyze: all tests passed");
