// tools/minrepo の分析エンジンのテスト。
// 既知の法則を仕込んだ合成データで、分析が法則を検出できるかを確かめる。
// 実行: node tests/minrepo-analyze.test.mjs

import assert from "node:assert/strict";
import { buildDataset } from "../tools/minrepo/lib/dataset.mjs";
import { analyze, matchesEvent, buildSeriesDays } from "../tools/minrepo/lib/analyze.mjs";
import { renderHtml, renderMarkdown, upcomingDays } from "../tools/minrepo/lib/report.mjs";
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
//  1. 3のつく日: 全体勝率 +15pt・差枚ブースト（全期間）+ 稼働（平均G数）+400G
//  2. 4のつく日: 前半6か月だけブースト → 「やめた可能性」の判定が出るはず
//  3. 7のつく日: 北斗だけ 2024 年のみブースト
//  4. イベント日(3のつく日)は日付末尾一致の末尾をブースト（差枚 +2000・勝率・稼働 +300G）
//  5. カバネリ 2025-03-10 に 4台→6台（増台）、2025-05-01 に新機種登場
//  6. 台番901 は 2025-06-06〜12 に大負け→ 2025-06-13 に大勝ち（大凹み→救済）
// ※ 仕込みはすべて決定的な加算にする（rng の消費順を変えると既存の p値検証が壊れる）
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
      avgGames: 2500 + (match ? 300 : 0),
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
      avgGames: 2500 + (is3 ? 400 : 0),
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

// 9) G数（稼働）が差枚と並ぶ観察対象になっている
assert.equal(analysis.params.iterations, 400, "検定の反復数が記録される");
assert.equal(analysis.params.seed, 7);
assert.ok(analysis.coverage.meanGames > 2540 && analysis.coverage.meanGames < 2620, `全期間平均G数: ${analysis.coverage.meanGames}`);
assert.ok(g3.games.uplift > 300, `3のつく日の稼働uplift: ${g3.games.uplift}`);
assert.ok(g3.games.p != null && g3.games.p < 0.05, `3のつく日の稼働は有意: p=${g3.games.p}`);
const day3 = analysis.byDayOfMonth.find((r) => r.d === 3);
assert.ok(day3.upliftGames > 250, `3日のG数uplift: ${day3.upliftGames}`);
assert.ok(analysis.byWeekday.every((r) => "upliftGames" in r), "曜日別にもG数uplift がある");
const sx3 = ev3.table.find((r) => r.suffix === "3");
assert.ok(sx3.upliftGamesVsNormal > 100, `3のつく日×末尾3 のG数uplift: ${sx3.upliftGamesVsNormal}`);
assert.ok(dt.meanDeltaGames > 30, `日付末尾一致の稼働Δ: ${dt.meanDeltaGames}`);
assert.ok(dt.pGames != null && dt.pGames < 0.05, `日付末尾一致の稼働Δは有意: ${dt.pGames}`);
assert.equal(bigHoleEvent.meanGames, 1500, "凹みバケツに当日平均G数が出る");
assert.ok(hokuto.meanGames > 2300 && hokuto.meanGames < 2700, `北斗の平均G数: ${hokuto.meanGames}`);
assert.ok(h7.games && h7.games.nEvent > 0, "シリーズ×イベントにG数の群間比較がある");
assert.ok(intro.firstWeek.meanGames != null, "導入初週の平均G数が出る");

// 9b) 全機種ランキング（ウォッチリスト外の強い台を探す用）
const hokutoRow = analysis.models.find((m) => m.model === "Lスマスロ北斗の拳");
assert.ok(hokutoRow, "機種ランキングに北斗がいる");
assert.equal(hokutoRow.count, 30, "直近の設置台数");
assert.equal(hokutoRow.nDays, 547, "観測日数");
assert.equal(hokutoRow.samples, 30 * 547, "延べサンプル（台×日）");
assert.ok(hokutoRow.winRate > 0.3 && hokutoRow.winRate < 0.7, `北斗のプール勝率: ${hokutoRow.winRate}`);
assert.ok(hokutoRow.recent.samples > 0 && hokutoRow.recent.winRate != null, "直近60日の再集計がある");
assert.ok(hokutoRow.active, "最終日まで設置されている機種は active");
const kabaRow = analysis.models.find((m) => m.model.includes("カバネリ"));
assert.equal(kabaRow.count, 6, "増台後の台数が反映される");
assert.ok(analysis.models.every((m) => m.samples >= m.recent.samples), "全期間サンプル >= 直近サンプル");
assert.equal(analysis.coverage.nModelRows, dataset.models.length, "カバレッジに機種行数が出る");

// 10) レポート描画と「今後の狙い日」
const html = renderHtml(analysis, { ...CONFIG, storeName: "テスト店" }, { generatedAt: "テスト生成", today: "2025-06-14" });
assert.ok(html.includes("結論サマリー"));
assert.ok(html.includes("今後2週間の狙い日"));
assert.ok(html.includes("6/14〜"), "狙い日の基準日がタイトルに出る");
assert.ok(html.includes("稼働（G数）の見どころ"), "稼働カードが出る");
assert.ok(html.includes("稼働（G数）版ヒートマップ"), "G数ヒートマップが出る");
assert.ok(html.includes("G数Δ"), "テーブルにG数Δ列がある");
assert.ok(html.includes("並べ替え検定（400回）"), "反復数が動的に表示される");
assert.ok(html.includes("機種別の強さランキング"), "全機種ランキングのセクションがある");
assert.ok(html.includes("いま強い台"), "強い台カードが出る");
assert.ok(html.includes("サンプル(台×日)"), "ランキングにサンプル数列がある");
assert.ok(html.includes("信頼度"), "p値が信頼度の言葉でも出る");
assert.ok(html.includes("データ量:"), "サマリーにデータ量が出る");
assert.ok(html.includes('class="desc"'), "各セクションに見方の説明がある");
assert.ok(html.includes("新台・増台・撤去の検知"));
assert.ok(html.includes("table.sortable"), "ソートJSが入っている");
assert.ok(html.trimEnd().endsWith("</html>"));
const up = upcomingDays(analysis, "2025-06-14", 14);
assert.ok(up.length > 0, "狙い日が出る");
const day23 = up.find((u) => u.date === "2025-06-23");
assert.ok(day23 && day23.hits.some((h) => h.label === "3のつく日" && h.significant), `6/23 が3のつく日として推される: ${JSON.stringify(up[0])}`);
assert.equal(up[0].date, "2025-06-23", "仕込みでは3のつく日が最有力");
assert.ok(day23.hits[0].gamesUplift > 300, `狙い日に稼働upliftが付く: ${JSON.stringify(day23.hits[0])}`);
const md = renderMarkdown(analysis, { storeName: "テスト店" }, "テスト生成");
assert.ok(md.includes("分析ダイジェスト"));
assert.ok(md.includes("稼働（G数）が伸びる日トップ5"), "ダイジェストにも稼働セクション");
assert.ok(md.includes("G数Δ"), "ダイジェストのイベント表にG数Δ列");
assert.ok(md.includes("機種別ランキング"), "ダイジェストにも機種ランキング");

// 11) 分析窓（analysisMonths）と設置なしシリーズの自動非表示
assert.ok(html.includes("詳細（勝率・p値"), "勝率・p値は折りたたみの詳細へ");
const winAnalysis = analyze(
  dataset,
  { ...CONFIG, analysisMonths: 6, seriesWatchlist: [...CONFIG.seriesWatchlist, { name: "ハーデス", pattern: "ハーデス" }] },
  { iterations: 200, seed: 7 }
);
assert.equal(winAnalysis.coverage.windowMonths, 6);
assert.equal(winAnalysis.coverage.totalDaysAvailable, 547, "収集済み全日数は別途記録");
assert.equal(winAnalysis.coverage.windowFrom, "2024-12-31");
assert.equal(winAnalysis.coverage.nDays, 182, "直近6か月だけが分析対象");
assert.ok(winAnalysis.coverage.from >= "2024-12-31");
assert.equal(winAnalysis.params.recentMonths, 3, "窓6か月なら直近判定は3か月で切る");
assert.ok(winAnalysis.lineup.events.every((e) => e.date >= "2024-12-31"), "入替検知も窓内のみ");
assert.equal(winAnalysis.anniversaries.explicit[0].n, 1, "記念日(12/20)は窓の外でも全期間で評価される");
const hadesRow = winAnalysis.series.find((s) => s.name === "ハーデス");
assert.ok(hadesRow && hadesRow.nDays === 0 && hadesRow.active === false, "設置なしシリーズは active=false");
const hokutoWin = winAnalysis.series.find((s) => s.name === "北斗");
assert.ok(hokutoWin.active === true && hokutoWin.lastSeen === "2025-06-30", "設置中シリーズは active");
const winHtml = renderHtml(winAnalysis, { ...CONFIG, storeName: "テスト店" }, { generatedAt: "t", today: "2025-06-14" });
assert.ok(!winHtml.includes("<h3>ハーデス"), "設置なしシリーズはレポートに出ない");
assert.ok(winHtml.includes("設置が確認できないため非表示"), "非表示の注記が出る");
assert.ok(winHtml.includes("直近6か月窓"), "窓の説明が出る");

console.log("minrepo-analyze: all tests passed");
