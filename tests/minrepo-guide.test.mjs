// tools/minrepo の攻略シート（guide.mjs）のテスト。
// 実行: node tests/minrepo-guide.test.mjs

import assert from "node:assert/strict";
import { judgeLines, exchangeMath, buildFindings, renderGuideFragment, renderGuideHtml } from "../tools/minrepo/lib/guide.mjs";
import { matchSpec } from "../tools/minrepo/lib/specs.mjs";
import { analyze } from "../tools/minrepo/lib/analyze.mjs";
import { logLikCounts, posterior, probAtLeast, IN_PER_GAME } from "../tools/minrepo/lib/settei.mjs";
import { mulberry32, addDays, toDateParts } from "../tools/minrepo/lib/util.mjs";
import { CONFIG as REAL_CONFIG } from "../tools/minrepo/config.mjs";

const MYJ = matchSpec("マイジャグラーV");
const PRIOR = [0.45, 0.25, 0.14, 0.08, 0.05, 0.03];

// ---- 早見表 ----
{
  const lines = judgeLines(MYJ, PRIOR, 4, [2000, 4000, 8000]);
  assert.equal(lines.length, 3);
  for (const l of lines) {
    assert.ok(l.quit < l.go && l.go < l.strong, `見切り < 期待あり < かなり強い の順: ${JSON.stringify(l)}`);
    // 表の境界が、電卓と同じ計算の 10% / 50% / 80% に一致している
    const p = (rb) => probAtLeast(posterior(logLikCounts({ games: l.games, bb: l.bb, rb }, MYJ), PRIOR), 4);
    assert.ok(p(l.quit) <= 0.1 && p(l.quit + 1) > 0.1);
    assert.ok(p(l.go) >= 0.5 && p(l.go - 1) < 0.5);
    assert.ok(p(l.strong) >= 0.8 && p(l.strong - 1) < 0.8);
  }
  assert.ok(lines[2].go > lines[0].go, "G数が増えるほど必要な REG 回数も増える");
  // 高設定が多い前提なら、同じ数字でも「期待あり」の線は下がる
  const generous = judgeLines(MYJ, [0.1, 0.1, 0.1, 0.2, 0.25, 0.25], 4, [4000]);
  assert.ok(generous[0].go < judgeLines(MYJ, PRIOR, 4, [4000])[0].go);
}

// ---- 換金ギャップ ----
{
  const ex = exchangeMath({ coinsPer100Yen: 7.0, lendYenPerCoin: 20, replayLimitCoins: 500 });
  assert.ok(Math.abs(ex.yenPerCoin - 14.2857) < 1e-3);
  assert.ok(Math.abs(ex.gapYen - 5.7143) < 1e-3);
  assert.ok(Math.abs(ex.breakEvenCoins(500) - 200) < 1e-6, "1万円（500枚）借りたら +200枚でトントン");
  const even = exchangeMath({ coinsPer100Yen: 5, lendYenPerCoin: 20 });
  assert.equal(even.gapYen, 0);
  assert.equal(even.breakEvenCoins(1000), 0, "等価ならギャップなし");
  assert.equal(exchangeMath(undefined).gapYen, 0, "設定が無ければ等価として扱う");
}

// ---- データ無し版 ----
const meta = { generatedAt: "2026/11/12 6:30:00", today: "2026-11-12" };
const bodyOf = (h) => h.slice(0, h.indexOf("<script>"));
{
  const frag = renderGuideFragment(null, REAL_CONFIG, meta);
  assert.ok(frag.startsWith("<title>タイホウ亀島 攻略シート</title>"), "先頭に名前だけの <title>");
  assert.ok(!/<!DOCTYPE|<html|<body/i.test(frag), "断片には html/body タグを含めない");
  for (const text of ["まだ店のデータがありません", "これから確かめる仮説", "凹み台に設定を入れる", "示唆景品がある", "新台入替の日に少し入れる", "REG 回数の早見表", "マイジャグラーVI", "7枚交換", "現地チェックリスト", "年金支給日"]) {
    assert.ok(bodyOf(frag).includes(text), `データ無し版に「${text}」がある`);
  }
  assert.ok(frag.includes("11/13(金)") && !frag.includes("11/12(木)</span>"), "何も無い日は並べない（11/12 は該当なし、11/13 は 3のつく日）");
  assert.ok(!bodyOf(frag).includes("undefined") && !bodyOf(frag).includes("NaN"));
  assert.ok(frag.includes("var JG=") && frag.includes("var(--s6)"), "電卓が入り、色はテーマ変数を使う");
  // 色はすべてトークン経由（:root の定義以外に生の色コードを書かない）
  const css = frag.slice(frag.indexOf("<style>"), frag.indexOf("</style>"));
  const rules = css.replace(/:root[^{]*\{[^}]*\}/g, "").replace(/@media[^{]*\{\s*\}/g, "");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(rules), "コンポーネントのルールに生の色コードが無い");
  const html = renderGuideHtml(null, REAL_CONFIG, meta);
  assert.ok(html.startsWith("<!DOCTYPE html>") && html.indexOf("<title>") < html.indexOf("</head>") && html.indexOf('<div class="sheet">') > html.indexOf("<body>"));
}

// ---- データあり版: 仕込んだ法則が、言葉になって出てくる ----
{
  const rng = mulberry32(3);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const poisson = (l) => {
    const L = Math.exp(-l);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rng();
    } while (p > L);
    return k - 1;
  };
  const REPLACEMENTS = ["2026-05-12", "2026-06-09", "2026-07-07", "2026-08-04", "2026-09-08", "2026-10-06", "2026-11-04"];
  const days = [];
  const models = [];
  const units = [];
  const prev = new Map();
  const calendar = [...REPLACEMENTS, "2026-11-17"].map((date) => ({ date, kind: "入替", target: null, note: null }));
  let date = "2026-04-01";
  while (date <= "2026-11-10") {
    const p = toDateParts(date);
    const isRep = REPLACEMENTS.includes(date);
    const shift = gauss() * 100 + (isRep ? 450 : 0);
    const dayUnits = [];
    for (let u = 501; u <= 520; u++) {
      const pd = prev.get(u);
      const setting = pd != null && pd <= -2000 && rng() < 0.5 ? 6 : rng() < 0.9 ? 1 : 4; // 凹み台を翌日 設定6 に
      const s = setting - 1;
      const games = 5000 + Math.floor(rng() * 3000);
      const bb = poisson(games / MYJ.big[s]);
      const rb = poisson(games / MYJ.reg[s]);
      const base = MYJ.bigNet / MYJ.big[s] + MYJ.regNet / MYJ.reg[s] - IN_PER_GAME * (MYJ.payout[s] / 100 - 1);
      const diff = Math.round(bb * MYJ.bigNet + rb * MYJ.regNet - games * base + gauss() * Math.sqrt(games * 9));
      prev.set(u, diff);
      dayUnits.push(diff);
      units.push({ date, model: "マイジャグラーV", unit: u, suffix: String(u % 10), diff, games, payout: null, bb, rb });
    }
    const aAvg = dayUnits.reduce((x, y) => x + y, 0) / dayUnits.length;
    const aWin = dayUnits.filter((d) => d > 0).length;
    const sAvg = -150 + shift + gauss() * 100;
    const sWin = Math.round(30 * Math.min(0.95, Math.max(0.05, 0.42 + sAvg / 4000)));
    models.push({ date, model: "マイジャグラーV", count: 20, avgDiff: Math.round(aAvg), avgGames: 6500, win: aWin, total: 20, payout: null });
    models.push({ date, model: "Lスマスロ北斗の拳", count: 30, avgDiff: Math.round(sAvg), avgGames: 3500, win: sWin, total: 30, payout: null });
    const avgDiff = (aAvg * 20 + sAvg * 30) / 50;
    days.push({ date, postId: 1, y: p.y, m: p.m, d: p.d, weekday: p.weekday, nthWeekday: Math.ceil(p.d / 7), status: null, oldEventDays: null, avgGames: 4700, win: aWin + sWin, total: 50, winRate: (aWin + sWin) / 50, avgDiff, masked: false });
    date = addDays(date, 1);
  }
  const config = { ...REAL_CONFIG, analysis: { iterations: 200 }, atype: { ...REAL_CONFIG.atype, iterations: 300 }, calendar: { ...REAL_CONFIG.calendar, iterations: 400 } };
  const a = analyze({ days, models, units, suffixes: [], manual: { observations: [], calendar } }, config, { iterations: 100 });
  assert.ok(a.atype.available && a.calendar.available);

  const findings = buildFindings(a);
  const find = (re) => findings.find((f) => re.test(f.title));
  const rep = find(/入替当日は出している/);
  assert.ok(rep && rep.tone === "go" && rep.badge === "確か", `入替当日: ${JSON.stringify(rep)}`);
  const hole = find(/凹み台は狙い目/);
  assert.ok(hole && hole.tone === "go" && hole.badge === "確か", `凹み台: ${JSON.stringify(findings.map((f) => f.title))}`);
  assert.ok(find(/据え置きは見えない|良かった台は据え置かれやすい/), "据え置きの判定が出る");
  assert.ok(findings.every((f) => f.title && f.detail && f.badge && f.tone));
  assert.deepEqual(buildFindings(null), []);
  assert.deepEqual(buildFindings({ atype: { available: false }, calendar: { available: false } }), []);

  const frag = renderGuideFragment(a, config, { generatedAt: "x", today: "2026-11-11" });
  const body = bodyOf(frag);
  for (const text of ["分かってきた法則", "次に行くなら", "11/17(火)", "の狙い台", "凹み台は狙い目", "入替当日は出している", "行く価値あり"]) assert.ok(body.includes(text), `データあり版に「${text}」がある`);
  assert.ok(!body.includes("まだ店のデータがありません") && !body.includes("これから確かめる仮説"));
  assert.ok(!body.includes("undefined") && !body.includes("NaN"));
  // データが古いときは、結論の前に注意を出す
  assert.ok(renderGuideFragment(a, config, { generatedAt: "x", today: "2026-11-20" }).includes("データが 2026-11-10 で止まっている"));
}

console.log("minrepo-guide: all tests passed");
