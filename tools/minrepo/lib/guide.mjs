// 攻略シート: 分析結果を「次にどうするか」が分かる言葉に直した 1 ページ。純粋関数のみ。
//
// report.html が「全部の表」なのに対して、こちらは結論だけを短く並べる:
//   結論（行く日・狙い台・避ける日）→ これから2週間 → 分かってきた法則 → 打ちながら判別（早見表・電卓）
//   → お金の計算 → 現地チェックリスト
// 店のデータがまだ無いときも、早見表・電卓・お金の計算・これから確かめる仮説だけで 1 枚になる。

import { toDateParts, addDays } from "./util.mjs";
import { esc } from "./html.mjs";
import { ATYPE_SPECS, matchSpec } from "./specs.mjs";
import { ATYPE_DEFAULTS } from "./atype.mjs";
import { logLikCounts, posterior, probAtLeast, normalize, IN_PER_GAME } from "./settei.mjs";
import { upcomingCalendar, buildTagContext, dayTags } from "./calendar.mjs";
import { atypeScript } from "./report-atype.mjs";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const SET_VARS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];

export const GUIDE_DEFAULTS = {
  // 店のデータが無いときに早見表へ出す機種（データがあれば、いま設置されている機種に置き換わる）
  models: ["マイジャグラーVI", "ネオアイムジャグラーEX", "ゴーゴージャグラー3", "キングハナハナ-30", "ドラゴンハナハナ〜閃光〜-30", "スターハナハナ-30"],
  games: [2000, 3000, 4000, 5000, 6000, 8000],
  dayGames: 7000, // 「1日打ったら」の目安 G数
};

const pct = (v, d = 0) => (v == null ? "-" : `${(v * 100).toFixed(d)}%`);
const num = (v) => (v == null ? "-" : Math.round(v).toLocaleString("ja-JP"));
const signed = (v) => {
  if (v == null || !Number.isFinite(v)) return "-";
  const r = Math.round(v);
  return `${r > 0 ? "+" : r < 0 ? "-" : ""}${Math.abs(r).toLocaleString("ja-JP")}`;
};
/** 表の見出し用に機種名を短くする（スマホ幅に収めるため） */
const shortName = (name) => name.replace(/〜.*〜/, "").replace(/-30$/, "").replace(/EX$/, "").replace("ジャグラー", "ジャグ").replace("ハナハナ", "ハナ");
const dateLabel = (date) => {
  const p = toDateParts(date);
  return `${p.m}/${p.d}(${WEEKDAYS[p.weekday]})`;
};

/** p 値を言葉にする */
function sureness(p) {
  if (p == null) return "データ不足";
  if (p < 0.05) return "確か";
  if (p < 0.2) return "たぶん";
  return "差は見えない";
}

/**
 * 判別の早見表。BIG は平均並み（事前の配分どおり）と仮定して、REG 回数の目安を出す。
 * 戻り値: [{ games, bb, quit, go, strong }]
 *   quit   : REG がこの回数以下なら 高設定の見込み 10% 以下（見切りの目安）
 *   go     : REG がこの回数以上なら 高設定の見込み 50% 以上
 *   strong : REG がこの回数以上なら 高設定の見込み 80% 以上
 */
export function judgeLines(spec, prior, highFrom = 4, gamesList = GUIDE_DEFAULTS.games) {
  return gamesList.map((games) => {
    const bb = Math.round(games * prior.reduce((a, p, s) => a + p / spec.big[s], 0));
    let quit = null;
    let go = null;
    let strong = null;
    for (let rb = 0; rb <= 90; rb++) {
      const ll = logLikCounts({ games, bb, rb }, spec);
      if (!ll) break;
      const p = probAtLeast(posterior(ll, prior), highFrom);
      if (p <= 0.1) quit = rb;
      if (go == null && p >= 0.5) go = rb;
      if (strong == null && p >= 0.8) strong = rb;
    }
    return { games, bb, quit, go, strong };
  });
}

/** 換金ギャップの計算。exchange: { coinsPer100Yen, lendYenPerCoin, replayLimitCoins } */
export function exchangeMath(exchange) {
  const ex = { coinsPer100Yen: 5, lendYenPerCoin: 20, replayLimitCoins: 0, ...(exchange || {}) };
  const yenPerCoin = 100 / ex.coinsPer100Yen;
  const gapYen = ex.lendYenPerCoin - yenPerCoin;
  return {
    ...ex,
    yenPerCoin,
    gapYen,
    gapRate: gapYen / ex.lendYenPerCoin,
    // 現金で coins 枚借りたとき、収支トントンに必要な差枚
    breakEvenCoins: (coins) => (coins * gapYen) / yenPerCoin,
  };
}

/** 分析結果から「分かってきた法則」を言葉にして並べる。戻り値: [{ tone, badge, title, detail }] */
export function buildFindings(analysis) {
  const out = [];
  const c = analysis && analysis.calendar && analysis.calendar.available ? analysis.calendar : null;
  const t = analysis && analysis.atype && analysis.atype.available ? analysis.atype : null;

  if (c) {
    const judged = c.tags
      .filter((x) => ["放出寄り", "回収寄り", "やや放出", "やや回収"].includes(x.verdict))
      .sort((a, b) => (a.diff.p ?? 1) - (b.diff.p ?? 1))
      .slice(0, 8);
    for (const x of judged) {
      const up = x.diff.uplift > 0;
      out.push({
        tone: up ? "go" : "stop",
        badge: x.verdict.startsWith("やや") ? "たぶん" : "確か",
        title: `${x.label}は${up ? "出している" : "回収されている"}`,
        detail: `全台の平均で、他の日より 1台あたり ${signed(x.diff.uplift)}枚（${x.nDays}日ぶん）。勝率は ${x.win.uplift == null ? "-" : (x.win.uplift > 0 ? "+" : "") + (x.win.uplift * 100).toFixed(1) + "ポイント"}。`,
      });
    }
    const ar = c.recovery.afterRelease;
    if (ar.uplift != null && ar.p != null && ar.nIn >= 5 && ar.p < 0.2) {
      out.push({
        tone: ar.uplift < 0 ? "stop" : "go",
        badge: sureness(ar.p),
        title: ar.uplift < 0 ? "大きく出した日の翌日は締める" : "出す日は続く",
        detail: `よく出た日の翌日は、ふだんの翌日より 1台あたり ${signed(ar.uplift)}枚（${ar.nIn}日ぶん）。`,
      });
    }
    for (const g of c.targets.filter((x) => !x.error && x.gap.p != null)) {
      const up = g.gap.uplift > 0;
      out.push({
        tone: g.gap.p < 0.2 ? (up ? "go" : "stop") : "flat",
        badge: sureness(g.gap.p),
        title: `${g.kind}の対象機種（${g.target}）は${g.gap.p < 0.2 ? (up ? "期間中に強い" : "期間中も強くない") : "ふだんと変わらない"}`,
        detail: `期間中の勝率はふだんより ${(g.win.uplift * 100).toFixed(1)}ポイント、差枚は ${signed(g.diff.uplift)}枚/台（${g.nDays}日ぶん）。`,
      });
    }
    for (const g of c.unitTags) {
      const up = g.dDiff > 0;
      out.push({
        tone: g.pDiff != null && g.pDiff < 0.2 ? (up ? "go" : "stop") : "flat",
        badge: sureness(g.pDiff),
        title: `「${g.tag}」の台は${g.pDiff != null && g.pDiff < 0.2 ? (up ? "出ている" : "むしろ出ていない") : "他の台と変わらない"}`,
        detail: `同じ日の他の台より ${signed(g.dDiff)}枚（記録 ${g.nObs}件・勝率 ${pct(g.winRate)}）。`,
      });
    }
  }

  if (t) {
    const hf = t.config.highFrom;
    const minQ = Math.max(0.03, 0.2 * (t.baseQ ?? 0));
    const strongModels = t.byModel.filter((m) => m.mix && m.n >= 100).sort((a, b) => b.mix.high - a.mix.high);
    if (strongModels.length >= 2) {
      const best = strongModels[0];
      const worst = strongModels[strongModels.length - 1];
      out.push({
        tone: "info",
        badge: "目安",
        title: `設定がいちばん入っているのは ${best.name}`,
        detail: `設定${hf}以上の割合は ${best.name} が約 ${pct(best.mix.high)}、いちばん少ない ${worst.name} が約 ${pct(worst.mix.high)}（店全体では約 ${pct(t.mix.high)}）。`,
      });
    }
    const holeRows = [
      { label: `前日に ${t.hole.prev1[0].bucket} だった台`, row: t.hole.prev1[0] },
      { label: `直近7日の合計が ${t.hole.prev7[0].bucket} の台`, row: t.hole.prev7[0] },
    ].filter((h) => h.row && h.row.n >= 20 && h.row.p != null);
    const hole = holeRows.sort((a, b) => a.row.p - b.row.p)[0];
    if (hole) {
      const r = hole.row;
      const works = r.dq >= minQ && r.p < 0.2;
      const reverse = r.dq <= -minQ && r.p < 0.05;
      out.push({
        tone: works ? "go" : reverse ? "stop" : "flat",
        badge: works || reverse ? sureness(r.p) : "差は見えない",
        title: works ? "凹み台は狙い目" : reverse ? "凹み台は逆効果（据え置きが多い）" : "凹み台を狙う根拠は見えない",
        detail: `${hole.label}は、翌日 約 ${pct(r.high)} が設定${hf}以上（全体は約 ${pct(t.mix.high)}・${num(r.n)}件）。`,
      });
    }
    const keep = t.carry[2];
    if (keep && keep.n >= 20 && keep.p != null) {
      const works = keep.dq >= minQ && keep.p < 0.2;
      out.push({
        tone: works ? "go" : "flat",
        badge: works ? sureness(keep.p) : "差は見えない",
        title: works ? "良かった台は据え置かれやすい" : "据え置きは見えない",
        detail: `前日に高設定らしかった台は、翌日 約 ${pct(keep.high)} が設定${hf}以上（全体は約 ${pct(t.mix.high)}・${num(keep.n)}件）。`,
      });
    }
    const rep = t.replacement.offsets.find((o) => o.label === "入替当日");
    if (rep && rep.nDays >= 3 && rep.p != null) {
      const works = rep.upliftQ >= minQ && rep.p < 0.2;
      out.push({
        tone: works ? "go" : "flat",
        badge: works ? sureness(rep.p) : "差は見えない",
        title: works ? "入替当日はジャグラー/ハナハナにも入る" : "入替当日のジャグラー/ハナハナはふだん通り",
        detail: `入替当日の設定${hf}以上は約 ${pct(rep.high)}（他の日は約 ${pct(rep.highRest)}・${rep.nDays}日ぶん）。`,
      });
    }
    if (t.units.pHeterogeneity != null) {
      const topUnits = t.units.table.filter((u) => u.active && u.dq > 0).slice(0, 3);
      const works = t.units.pHeterogeneity < 0.05 && topUnits.length > 0;
      out.push({
        tone: works ? "go" : "flat",
        badge: works ? "確か" : "差は見えない",
        title: works ? `よく入る台番がある（${topUnits.map((u) => u.unit).join("・")}）` : "特定の台番への偏りは見えない",
        detail: works ? `上位の台番は、同じ日の他の台より高設定らしい日が多い。「台番/日」の表で順位を確認。` : "台番ごとの差は偶然の範囲。台番で決め打ちする根拠は無い。",
      });
    }
    if (t.neighbors.p != null && t.neighbors.p < 0.05 && t.neighbors.corr > 0) {
      out.push({ tone: "go", badge: "確か", title: "並びで入れる傾向がある", detail: "強い台の隣も高設定らしいことが多い。良さそうな台が埋まっていたら隣を見る。" });
    }
    const tail = t.tailMatch[1];
    if (tail && tail.n >= 30 && tail.p != null && tail.dq >= minQ && tail.p < 0.2) {
      out.push({ tone: "go", badge: sureness(tail.p), title: "日付と同じ末尾が強い", detail: `日付の末尾と台番の末尾が同じ台は、約 ${pct(tail.high)} が設定${hf}以上（${num(tail.n)}件）。` });
    }
  }
  return out;
}

/** 店のデータがまだ無いときに出す「これから確かめる仮説」 */
const HYPOTHESES = [
  { title: "凹み台に設定を入れる", from: "自分の観察", how: "台番別の差枚が貯まると自動で判定（「凹み台は狙い目 / 逆効果 / 根拠なし」）。" },
  { title: "示唆景品がある", from: "自分の観察", how: "見かけたら結果を見る前に台番をメモ。10〜20 件貯まると判定が付く。" },
  { title: "新台入替の日に少し入れる", from: "自分の観察。口コミには逆に「入替初日は回収」（2022年）もある", how: "入替日は設置機種の変化から自動で拾う。告知を見たら日付を書き足すとより正確。" },
  { title: "3のつく日・第1土曜が強い", from: "旧イベント日（みんパチ掲載。「月1〜2回は台平均+100枚程度」）", how: "日ごとのデータが貯まると自動で判定。今もやっているかは直近の数字で分かる。" },
  { title: "ハナハナは頑張るがジャグラーは厳しい", from: "口コミ（2021〜2024年）", how: "機種別の設定配分で判定。" },
  { title: "土日・年金支給日・給料日の後は回収", from: "口コミ（2025年）と一般論", how: "暦から自動で判定。年金支給日は年 6 回なので時間がかかる。" },
];

function chip(text, tone) {
  return `<span class="chip ${tone}">${esc(text)}</span>`;
}

const toneOfOutlook = (o) => (o === "放出寄り" ? "go" : o === "やや放出" ? "go soft" : o === "回収寄り" ? "stop" : o === "やや回収" ? "stop soft" : "flat");
const outlookWord = (o) => ({ 放出寄り: "行く価値あり", やや放出: "やや良い", 回収寄り: "避ける", やや回収: "やや悪い", ふつう: "ふつう" })[o] || o;

/** 攻略シートの中身（<title> から <script> まで。<html>/<body> タグは含まない） */
export function renderGuideFragment(analysis, config, meta) {
  const a = analysis || {};
  const c = a.calendar && a.calendar.available ? a.calendar : null;
  const t = a.atype && a.atype.available ? a.atype : null;
  const hasData = !!(c || t);
  const gcfg = { ...GUIDE_DEFAULTS, ...(config.guide || {}) };
  const hf = (config.atype && config.atype.highFrom) || ATYPE_DEFAULTS.highFrom;
  const defaultPrior = normalize((config.atype && config.atype.prior) || ATYPE_DEFAULTS.prior);
  const today = meta.today;

  // ---- これから2週間 ----
  let upcoming;
  if (c) upcoming = upcomingCalendar(c, config, today, 14);
  else {
    const ctx = buildTagContext(config, {});
    upcoming = Array.from({ length: 14 }, (_, i) => {
      const date = addDays(today, i);
      return { date, tags: dayTags(date, ctx).map((x) => ({ label: x.label, group: x.group, verdict: "実績なし", uplift: null, nDays: 0 })), outlook: null };
    });
  }
  const notable = (x) => x.group !== "イベント前後" || ["放出寄り", "回収寄り", "やや放出", "やや回収"].includes(x.verdict);
  const upcomingRows = upcoming
    .filter((u) => c || u.tags.some(notable))
    .map((u) => {
      const tags = u.tags.filter(notable);
      const tagHtml = tags.length
        ? tags
            .map((x) => {
              // 裏付けのある種類だけ数字つきで目立たせる。それ以外は名前だけ薄く出す
              const judged = ["放出寄り", "回収寄り", "やや放出", "やや回収"].includes(x.verdict);
              const strong = ["放出寄り", "回収寄り"].includes(x.verdict);
              if (!judged) return `<span class="tag dim">${esc(x.label)}</span>`;
              return `<span class="tag${strong ? " strong" : ""}">${esc(x.label)}<span class="dim">${signed(x.uplift)}枚</span></span>`;
            })
            .join("")
        : '<span class="dim">特になし</span>';
      const verdict = u.outlook ? chip(outlookWord(u.outlook), toneOfOutlook(u.outlook)) : "";
      return `<li><span class="day">${dateLabel(u.date)}</span>${verdict}<span class="tags">${tagHtml}</span></li>`;
    })
    .join("\n");

  // ---- 結論 ----
  const conclusion = [];
  if (c) {
    const good = upcoming.filter((u) => u.score >= 1).sort((x, y) => y.score - x.score || (x.date < y.date ? -1 : 1))[0];
    const bad = upcoming.filter((u) => u.score <= -1).sort((x, y) => x.score - y.score || (x.date < y.date ? -1 : 1))[0];
    const why = (u) => {
      const s = u.tags.filter((x) => x.uplift != null && ["放出寄り", "回収寄り", "やや放出", "やや回収"].includes(x.verdict)).sort((x, y) => Math.abs(y.uplift) - Math.abs(x.uplift))[0];
      return s ? `${esc(s.label)}は過去 ${s.nDays}日の平均で、他の日より 1台あたり ${signed(s.uplift)}枚。` : "";
    };
    conclusion.push(
      good
        ? `<div class="verdict go"><p class="k">次に行くなら</p><p class="v">${dateLabel(good.date)}</p><p class="why">${why(good)}</p></div>`
        : `<div class="verdict flat"><p class="k">次に行くなら</p><p class="v">決め手なし</p><p class="why">この 2 週間に、はっきり出している種類の日は無い。</p></div>`
    );
    if (bad) conclusion.push(`<div class="verdict stop"><p class="k">避けるなら</p><p class="v">${dateLabel(bad.date)}</p><p class="why">${why(bad)}</p></div>`);
  }
  if (t && t.picks.rows.length) {
    const bt = t.backtest;
    const main = bt.results.find((r) => r.k === 3);
    const trust =
      bt.verdict === "裏付けあり"
        ? `この選び方は過去 ${main.nDays}日で通用した（上位3台の平均 ${signed(main.pickDiff)}枚、全台の平均 ${signed(main.allDiff)}枚）。`
        : bt.verdict === "弱い裏付け"
          ? `過去の成績は少し良い程度（上位3台 ${signed(main.pickDiff)}枚、全台 ${signed(main.allDiff)}枚）。過信しない。`
          : bt.verdict === "裏付けなし"
            ? "この選び方が過去に通用した証拠はまだ無い。台選びより、行く日選びを優先。"
            : "検証できる日数がまだ足りない。参考程度に。";
    const tone = bt.verdict === "裏付けあり" ? "go" : bt.verdict === "弱い裏付け" ? "go soft" : "flat";
    const picks = t.picks.rows
      .slice(0, 3)
      .map((r) => `<li><b>${r.unit}</b> <span class="dim">${esc(r.model)}</span><span class="pick-p">${pct(r.p)}</span>${r.reasons[0] ? `<span class="pick-why">${esc(r.reasons[0].text)}</span>` : ""}</li>`)
      .join("");
    conclusion.push(
      `<div class="verdict ${tone} wide"><p class="k">${dateLabel(t.picks.targetDate)} の狙い台（ジャグラー/ハナハナ）</p><ol class="picks">${picks}</ol><p class="why">右の数字は設定${hf}以上の見込み（条件なしの平均は ${pct(t.picks.baseRate)}）。${trust}</p></div>`
    );
  }
  const stale = hasData && t && today > t.picks.targetDate ? `<p class="warn">データが ${esc(t.latest.date)} で止まっている。今日ぶんの判断には、先にデータを取り直すこと。</p>` : "";
  const conclusionHtml = hasData
    ? `${stale}<div class="verdicts">${conclusion.join("\n")}</div>`
    : `<div class="verdict flat wide"><p class="k">まだ店のデータがありません</p><p class="why">「いつ行くか」「どの台か」の結論は、店の日ごとのデータが入ってから出ます。それまでは下の早見表・電卓・お金の計算が使えます。</p>
<ol class="steps"><li>自宅の PC で一度だけ <code>node tools/minrepo/run.mjs once</code>。過去半年ぶんをまとめて取得し、このシートを作り直す（1 時間前後。途中で止めても続きから）。</li><li>以後は取得しなくてよい。作り直すだけなら <code>node tools/minrepo/run.mjs</code>（サイトにはアクセスしない）。</li><li>店で見た示唆景品・おすすめ週間・入替告知は、CSV に 1 行ずつ足すと判定に加わる。</li></ol></div>`;

  // ---- 分かってきた法則 ----
  const findings = hasData ? buildFindings(a) : [];
  const findingsHtml = hasData
    ? findings.length
      ? `<ul class="findings">${findings.map((f) => `<li class="${f.tone}">${chip(f.badge, f.tone)}<div><p class="ft">${esc(f.title)}</p><p class="fd">${esc(f.detail)}</p></div></li>`).join("\n")}</ul>
<p class="note">「確か」= 偶然ではまず出ない差。「たぶん」= 差はあるが、まだ偶然かもしれない。「差は見えない」= 今のデータでは根拠なし。日数が増えると判定は変わる。</p>`
      : `<p class="note">はっきり言える法則はまだ無い。データの日数が増えるのを待つ。</p>`
    : `<ul class="findings">${HYPOTHESES.map((h) => `<li class="flat">${chip("未検証", "flat")}<div><p class="ft">${esc(h.title)}</p><p class="fd">出どころ: ${esc(h.from)}。${esc(h.how)}</p></div></li>`).join("\n")}</ul>
<p class="note">口コミは古く、個人の感想。そのまま信じず、データが入ってから上の「確か / たぶん / 差は見えない」の判定で確かめる。</p>`;

  // ---- 早見表 ----
  let modelNames;
  if (t) modelNames = t.byModel.filter((m) => m.nUnits > 0).map((m) => m.name);
  if (!modelNames || !modelNames.length) modelNames = gcfg.models;
  const specs = modelNames.map((n) => ATYPE_SPECS.find((s) => s.name === n) || matchSpec(n)).filter(Boolean);
  const priorFor = (spec) => {
    const m = t ? t.byModel.find((x) => x.specId === spec.id && x.pi && x.n >= 100) : null;
    return m ? m.pi : t ? t.mix.pi : defaultPrior;
  };
  const lineTables = specs
    .map((spec, i) => {
      const rows = judgeLines(spec, priorFor(spec), hf, gcfg.games)
        .map((r) => `<tr><td>${num(r.games)}G<span class="dim">BIG ${r.bb}回</span></td><td class="stop">${r.quit == null ? "-" : `${r.quit}回以下`}</td><td class="go soft">${r.go == null ? "-" : `${r.go}回以上`}</td><td class="go">${r.strong == null ? "-" : `${r.strong}回以上`}</td></tr>`)
        .join("");
      return `<details${i === 0 ? " open" : ""}><summary>${esc(spec.name)}</summary><div class="tw"><table><thead><tr><th>総G数</th><th>見切り</th><th>期待あり</th><th>かなり強い</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
    })
    .join("\n");

  // ---- お金 ----
  const ex = exchangeMath(config.exchange);
  const evSpecs = specs.slice(0, 4);
  const evRows = [0, 1, 2, 3, 4, 5]
    .map((s) => `<tr><td>設定${s + 1}</td>${evSpecs.map((spec) => {
      const coins = gcfg.dayGames * IN_PER_GAME * (spec.payout[s] / 100 - 1);
      return `<td class="${coins >= 0 ? "go soft" : "stop soft"}">${signed(coins)}枚<span class="dim">${signed(coins * ex.yenPerCoin)}円</span></td>`;
    }).join("")}</tr>`)
    .join("");
  const cashRows = [5000, 10000, 20000, 30000]
    .map((yen) => {
      const coins = yen / ex.lendYenPerCoin;
      return `<tr><td>${num(yen)}円<span class="dim">${num(coins)}枚</span></td><td>${signed(ex.breakEvenCoins(coins))}枚</td><td class="stop soft">${signed(-coins * ex.gapYen)}円</td></tr>`;
    })
    .join("");

  const dataLine = hasData
    ? `店のデータ ${c ? `${c.nDays}日ぶん（${esc(c.from)}〜${esc(c.to)}）` : ""}${t ? `・ジャグラー/ハナハナ ${num(t.coverage.nEstimated)}台×日` : ""}`
    : "店のデータは未取得（早見表と計算のみ）";

  const options = ATYPE_SPECS.map((s) => `<option value="${esc(s.id)}"${specs[0] && specs[0].id === s.id ? " selected" : ""}>${esc(s.name)}</option>`).join("");

  return `<title>${esc(config.storeName.replace(/店$/, ""))} 攻略シート</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=DM+Mono:wght@400;500&display=swap">
<style>
/* レイアウト: 片手で読む 1 カラムの作戦メモ。結論 → 予定 → 法則 → 判別 → お金 → チェックリストの順に、上ほど大きく */
:root{
  --bg:#eef1f5;--surface:#fbfcfd;--ink:#16202c;--muted:#566476;--line:#d5dce5;--accent:#2a4a9e;
  --go:#17724a;--go-bg:#dff1e7;--stop:#b02f43;--stop-bg:#f8e1e5;--flat:#4a5868;--flat-bg:#e3e8ee;--info:#2a4a9e;--info-bg:#e1e8f8;
  --s1:#8f9dad;--s2:#b3bdc9;--s3:#dcb93f;--s4:#e89a35;--s5:#e3703f;--s6:#cf3347;
  --font-body:"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif;
  --font-num:"DM Mono","SFMono-Regular",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:#0f151c;--surface:#17202a;--ink:#e6ecf2;--muted:#98a6b6;--line:#2a3643;--accent:#9bb3ff;
  --go:#62d39c;--go-bg:#143325;--stop:#ff8d9b;--stop-bg:#3d171e;--flat:#aab6c4;--flat-bg:#222d39;--info:#9bb3ff;--info-bg:#1b2742;
  --s1:#6f7d8d;--s2:#8e9aa8;--s3:#d0ad36;--s4:#e2932f;--s5:#e06a3a;--s6:#e04a5d;color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#0f151c;--surface:#17202a;--ink:#e6ecf2;--muted:#98a6b6;--line:#2a3643;--accent:#9bb3ff;
  --go:#62d39c;--go-bg:#143325;--stop:#ff8d9b;--stop-bg:#3d171e;--flat:#aab6c4;--flat-bg:#222d39;--info:#9bb3ff;--info-bg:#1b2742;
  --s1:#6f7d8d;--s2:#8e9aa8;--s3:#d0ad36;--s4:#e2932f;--s5:#e06a3a;--s6:#e04a5d;color-scheme:dark}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:15px;line-height:1.65;margin:0;
  padding-block:20px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.sheet{max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:28px}
header h1{font-size:1.55rem;font-weight:900;letter-spacing:.01em;margin:0;text-wrap:balance}
header p{margin:4px 0 0;color:var(--muted);font-size:.82rem}
section{display:flex;flex-direction:column;gap:12px;min-width:0}
h2{font-size:1.12rem;font-weight:900;margin:0;padding-bottom:6px;border-bottom:2px solid var(--ink)}
h3{font-size:.95rem;font-weight:700;margin:6px 0 0}
p{margin:0}
.lead{color:var(--muted);font-size:.88rem}
.note{color:var(--muted);font-size:.8rem}
.dim{color:var(--muted);font-weight:400}
.warn{background:var(--stop-bg);color:var(--stop);border-radius:8px;padding:8px 12px;font-size:.86rem;font-weight:700}
code{font-family:var(--font-num);font-size:.84em;background:var(--flat-bg);border-radius:4px;padding:1px 5px;overflow-wrap:anywhere}
.chip{display:inline-block;font-size:.72rem;font-weight:700;border-radius:999px;padding:2px 10px;white-space:nowrap;background:var(--flat-bg);color:var(--flat)}
.chip.go{background:var(--go-bg);color:var(--go)}.chip.stop{background:var(--stop-bg);color:var(--stop)}.chip.info{background:var(--info-bg);color:var(--info)}
.chip.soft{font-weight:500}
.verdicts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.verdict{background:var(--surface);border:1px solid var(--line);border-left:6px solid var(--flat);border-radius:10px;padding:12px 14px;min-width:0}
.verdict.go{border-left-color:var(--go)}.verdict.stop{border-left-color:var(--stop)}
.verdict.wide{grid-column:1/-1}
.verdict .k{font-size:.8rem;color:var(--muted);font-weight:700}
.verdict .v{font-family:var(--font-num);font-size:1.7rem;font-weight:500;line-height:1.25}
.verdict .why{font-size:.84rem;color:var(--muted);margin-top:4px}
.picks{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.picks li{display:grid;grid-template-columns:auto 1fr auto;column-gap:10px;align-items:baseline}
.picks b{font-family:var(--font-num);font-size:1.35rem;font-weight:500}
.pick-p{font-family:var(--font-num);font-size:1.05rem;color:var(--go)}
.pick-why{grid-column:1/-1;font-size:.8rem;color:var(--muted)}
.steps{margin:8px 0 0;padding-left:1.3em;font-size:.86rem;display:flex;flex-direction:column;gap:4px}
.days{list-style:none;margin:0;padding:0;background:var(--surface);border:1px solid var(--line);border-radius:10px}
.days li{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;padding:8px 12px;border-bottom:1px solid var(--line);min-width:0}
.days li:last-child{border-bottom:0}
.day{font-family:var(--font-num);font-size:.92rem;flex:0 0 4.8em}
.tags{display:flex;flex-wrap:wrap;gap:2px 10px;min-width:0;font-size:.84rem;flex:1 1 12em}
.tag{display:inline-flex;gap:4px;align-items:baseline}
.tag.strong{font-weight:700}
.findings{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.findings li{display:grid;grid-template-columns:5.6em 1fr;gap:10px;align-items:start;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
.findings .chip{text-align:center}
.ft{font-weight:700}.fd{font-size:.84rem;color:var(--muted)}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.86rem;font-variant-numeric:tabular-nums;background:var(--surface)}
th,td{border:1px solid var(--line);padding:6px 9px;text-align:right;white-space:nowrap}
th{background:var(--flat-bg);font-weight:700;font-size:.78rem}
td:first-child,th:first-child{text-align:left}
td.go{background:var(--go-bg);color:var(--go);font-weight:700}td.stop{background:var(--stop-bg);color:var(--stop);font-weight:700}
td.soft{font-weight:500}
td .dim{display:block;font-size:.76rem}
details{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px 12px}
details summary{cursor:pointer;font-weight:700}
details[open] summary{margin-bottom:8px}
.judge{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px}
.judge label{display:flex;flex-direction:column;gap:4px;font-size:.78rem;color:var(--muted);font-weight:700;min-width:0}
.judge input,.judge select{font:inherit;font-size:1.05rem;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 10px;width:100%;min-width:0}
.judge input{font-family:var(--font-num)}
.judge input:focus-visible,.judge select:focus-visible,summary:focus-visible,.check input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.jg-out{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px}
.jg-head{font-size:1rem}.jg-head b{font-family:var(--font-num);font-size:1.3rem;font-weight:500}
.jg-row{display:grid;grid-template-columns:3.4em 1fr 3.6em;gap:8px;align-items:center;font-size:.84rem;margin-top:4px}
.jg-row .dim{grid-column:2/-1;font-size:.72rem;font-family:var(--font-num)}
.jg-row .val{text-align:right;font-family:var(--font-num)}
.jg-row .track{height:12px;background:var(--flat-bg);border-radius:4px;overflow:hidden}
.jg-row .fill{height:100%}
.check{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.check label{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:9px 12px}
.check input{width:1.2em;height:1.2em;margin-top:.2em;accent-color:var(--accent)}
.check .when{display:block;font-size:.74rem;color:var(--muted);font-weight:700}
footer{color:var(--muted);font-size:.76rem;border-top:1px solid var(--line);padding-top:12px}
@media (max-width:420px){.findings li{grid-template-columns:1fr}.findings .chip{justify-self:start}th,td{padding:6px 7px}}
</style>
<div class="sheet">
<header>
<h1>${esc(config.storeName.replace(/店$/, ""))} 攻略シート</h1>
<p>${esc(dateLabel(today))} 作成・${dataLine}</p>
</header>

<section id="ketsuron">
<h2>結論</h2>
${conclusionHtml}
</section>

<section id="yotei">
<h2>これから2週間</h2>
<p class="lead">${c ? "日の種類ごとの過去の実績から出した見通し。太字は裏付けのある種類、数字は他の日との差（1台あたり）。" : "暦から分かる「何かある日」だけを並べている。出す日か回収する日かの判定は、店のデータが入ると付く。"}</p>
<ul class="days">
${upcomingRows}
</ul>
<p class="note">3のつく日・第1土曜は旧イベント日。年金支給日は偶数月の 15 日（土日なら直前の金曜）。景品示唆やおすすめ週間は、見かけたら <code>calendar.csv</code> に書くとここに出る。</p>
</section>

<section id="housoku">
<h2>${hasData ? "分かってきた法則" : "これから確かめる仮説"}</h2>
${findingsHtml}
</section>

<section id="hanbetsu">
<h2>打ちながら判別</h2>
<p class="lead">データカウンタの 総G数・BIG・REG を入れると、設定1〜6 の確率が出る（通信なしで動く）。</p>
<div class="judge">
<label for="jg-model">機種<select id="jg-model">${options}</select></label>
<label for="jg-g">総G数<input id="jg-g" type="number" inputmode="numeric" min="0" placeholder="3200"></label>
<label for="jg-bb">BIG<input id="jg-bb" type="number" inputmode="numeric" min="0" placeholder="13"></label>
<label for="jg-rb">REG<input id="jg-rb" type="number" inputmode="numeric" min="0" placeholder="14"></label>
<label class="jg-grape" for="jg-gr"><span><span id="jg-grl">ぶどう</span>の回数</span><input id="jg-gr" type="number" inputmode="numeric" min="0"></label>
<label class="jg-grape" for="jg-grg">数えた間のG数<input id="jg-grg" type="number" inputmode="numeric" min="0"></label>
<label for="jg-prior">前提<select id="jg-prior"><option value="store">${t ? "この店の推定配分" : "低設定が多い店"}</option><option value="flat">全設定が同じ確率</option></select></label>
</div>
<div id="jg-out" class="jg-out"><p class="note">数字を入れると結果が出る。</p></div>
<h3>REG 回数の早見表</h3>
<p class="lead">BIG が左の回数（平均並み）のとき、REG が何回なら続けるか・やめるかの目安。「期待あり」= 設定${hf}以上の見込み 50% 以上、「かなり強い」= 80% 以上、「見切り」= 10% 以下。</p>
${lineTables}
<p class="note">前提は「${t ? "この店の推定設定配分" : "低設定が多い店（設定1〜2 で 7 割）"}」。BIG が仮定より多い・少ないときは上の入力欄で計算し直す。1 台 1 日の数字で設定は断定できない（設定1 でも 1 日なら設定6 のような数字は出る）。</p>
</section>

<section id="okane">
<h2>お金の計算</h2>
<p class="lead">この店は ${ex.coinsPer100Yen}枚交換（1枚 ${ex.yenPerCoin.toFixed(1)}円）。現金で借りたメダルは 1枚あたり ${ex.gapYen.toFixed(1)}円（${pct(ex.gapRate)}）目減りする。${ex.replayLimitCoins ? `貯メダルの再プレイは 1日 ${num(ex.replayLimitCoins)}枚まで目減りなし。` : ""}</p>
<h3>現金で借りた分を取り返すのに必要な差枚</h3>
<div class="tw"><table><thead><tr><th>現金投資</th><th>トントンの差枚</th><th>差枚0なら</th></tr></thead><tbody>${cashRows}</tbody></table></div>
<h3>1 日（${num(gcfg.dayGames)}G）打ったときの期待値</h3>
<div class="tw"><table><thead><tr><th>設定</th>${evSpecs.map((s) => `<th>${esc(shortName(s.name))}</th>`).join("")}</tr></thead><tbody>${evRows}</tbody></table></div>
<p class="note">期待値は「長く打てば平均でこうなる」数字で、1 日の結果は ±1,500枚ほど平気でぶれる。円は持ちメダルで打てた場合の換算。現金投資が増えるほど、上の表のぶんだけ悪くなる。交換率と再プレイ上限は掲載サイトの値なので、店で確かめること。</p>
</section>

<section id="genchi">
<h2>現地チェックリスト</h2>
<ul class="check">
<li><label for="ck1"><input id="ck1" type="checkbox"><span><span class="when">出かける前</span>このシートの「結論」と「これから2週間」を見る。避ける日なら行かない。</span></label></li>
<li><label for="ck2"><input id="ck2" type="checkbox"><span><span class="when">入店してすぐ</span>示唆っぽい景品・札を見たら、結果を見る前に台番をメモ。カウンターの景品や「おすすめ機種」の POP もメモ。</span></label></li>
<li><label for="ck3"><input id="ck3" type="checkbox"><span><span class="when">台を選ぶ</span>狙い台から順に、データカウンタで前日の 総G・BIG・REG を見て上の入力欄に入れる。</span></label></li>
<li><label for="ck4"><input id="ck4" type="checkbox"><span><span class="when">打っている間</span>1,000G ごとに入れ直す。設定${hf}以上の確率が 10% を切ったらやめる。</span></label></li>
<li><label for="ck5"><input id="ck5" type="checkbox"><span><span class="when">お金</span>現金投資の上限を先に決める。再プレイで打てる範囲に収めるほど有利。</span></label></li>
<li><label for="ck6"><input id="ck6" type="checkbox"><span><span class="when">帰ってから</span>公式の台データを見て <code>counts.csv</code> に 総G・BIG・REG を写す。メモした景品は <code>observations.csv</code> / <code>calendar.csv</code> へ。</span></label></li>
</ul>
</section>

<footer>
<p>設定ごとの確率・機械割は解析サイトの掲載値。日ごとのデータは min-repo.com の独自調査値（推定）。自分用のメモとして使い、転載・公開しないこと。勝ちを保証するものではない。使う金額と時間は先に決める。${hasData ? " 全部の表は <code>report.html</code> にある。" : ""}</p>
</footer>
</div>
<script>
${atypeScript(a, config, { colors: SET_VARS })}
</script>`;
}

/** 単体で開ける HTML ファイルにしたもの（<title> や <style> は <head> に入れる） */
export function renderGuideHtml(analysis, config, meta) {
  const fragment = renderGuideFragment(analysis, config, meta);
  const cut = fragment.indexOf('<div class="sheet">');
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${fragment.slice(0, cut)}</head><body>
${fragment.slice(cut)}
</body></html>`;
}
