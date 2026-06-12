// analysis.json から「サイト風」ダッシュボード HTML と Markdown ダイジェストを生成する。純粋関数のみ。
// 出力はスマホ対応・単一ファイル（そのまま誰かに送っても開ける）。

import { formatSigned, toDateParts, nthWeekdayOfMonth, addDays } from "./util.mjs";
import { matchesEvent } from "./analyze.mjs";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function pct(v, digits = 1) {
  return v == null ? "-" : `${(v * 100).toFixed(digits)}%`;
}

function pctPt(v, digits = 1) {
  return v == null ? "-" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}pt`;
}

function num(v, digits = 0) {
  return v == null ? "-" : Number(v).toLocaleString("ja-JP", { maximumFractionDigits: digits });
}

function pv(p) {
  if (p == null) return "-";
  const s = p < 0.001 ? "<0.001" : p.toFixed(3);
  return p < 0.05 ? `<b>${s}</b>` : s;
}

/** -1..1 に正規化した値を背景色にする（負=青, 正=赤） */
function heat(v, scale) {
  if (v == null || !Number.isFinite(v)) return "";
  const t = Math.max(-1, Math.min(1, v / scale));
  const alpha = Math.abs(t) * 0.5;
  const color = t >= 0 ? `rgba(229,57,53,${alpha})` : `rgba(30,136,229,${alpha})`;
  return ` style="background:${color}"`;
}

function table(headers, rows, { sortable = true } = {}) {
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows.map((cells) => `<tr>${cells.join("")}</tr>`).join("\n");
  return `<div class="tw"><table class="${sortable ? "sortable" : ""}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const td = (content, attr = "") => `<td${attr}>${content}</td>`;

/** シンプル表の下に置く「勝率・p値などの詳細」折りたたみ */
function statDetails(inner, label = "詳細（勝率・p値など）") {
  return `<details class="stat"><summary>${label}</summary>${inner}</details>`;
}

function dayObj(date) {
  const p = toDateParts(date);
  return { ...p, nthWeekday: nthWeekdayOfMonth(date) };
}

/** 今後 horizon 日のうち、検証済みイベント日仮説に当たる日を強い順に出す */
export function upcomingDays(analysis, today, horizon = 14) {
  const out = [];
  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i);
    const day = dayObj(date);
    const hits = [];
    let score = 0;
    for (const g of analysis.eventGroups) {
      if (!g.def || !matchesEvent(day, g.def)) continue;
      const u = g.win.uplift;
      const du = g.diff ? g.diff.uplift : null;
      // 差枚ベースか勝率ベースのどちらかで裏付けがあれば「有力」扱い
      const sigWin = u != null && u > 0.01 && g.win.p != null && g.win.p < 0.2 && g.win.nEvent >= 5;
      const sigDiff = du != null && du > 200 && g.diff.p != null && g.diff.p < 0.2 && g.diff.nEvent >= 5;
      const significant = sigWin || sigDiff;
      hits.push({ label: g.label, uplift: u, diffUplift: du, significant, n: g.win.nEvent, gamesUplift: g.games ? g.games.uplift : null });
      if (significant) score += du != null ? du / 2000 : u * 5;
    }
    if (hits.length) out.push({ date, weekday: day.weekday, hits, score });
  }
  out.sort((a, b) => b.score - a.score || (a.date < b.date ? -1 : 1));
  return out;
}

function chip(text, kind) {
  return `<span class="chip ${kind}">${text}</span>`;
}

function verdictChip(g) {
  // 差枚データがあれば差枚で、無ければ勝率で判定する
  const du = g.diff ? g.diff.uplift : null;
  if (du != null && g.diff.nEvent >= 3) {
    if (du >= 300 && g.diff.p != null && g.diff.p < 0.1) return chip("効いてる", "good");
    if (du <= -300) return chip("むしろ弱い", "bad");
    if (g.win.uplift == null) return chip("微妙", "gray");
  }
  const u = g.win.uplift;
  const p = g.win.p;
  if (u == null) return chip("データ不足", "gray");
  if (u >= 0.02 && p != null && p < 0.1) return chip("効いてる", "good");
  if (u <= -0.02) return chip("むしろ弱い", "bad");
  return chip("微妙", "gray");
}

/** p値を「信頼度」の言葉に直す（生の p も併記する前提） */
function confLabel(p) {
  if (p == null) return "判定不能";
  if (p < 0.01) return "信頼度:高";
  if (p < 0.05) return "信頼度:中";
  if (p < 0.2) return "信頼度:弱";
  return "誤差の範囲かも";
}

/** 結論サマリー（ヒーローセクション） */
function summarySection(a, meta) {
  const items = [];

  // イベント日仮説: 1行目=結論（差枚・G数）、2行目=根拠の詳細
  const evLines = a.eventGroups
    .map((g) => {
      const du = g.diff ? g.diff.uplift : null;
      const word =
        du != null
          ? du >= 100
            ? `通常日より平均 <b>${formatSigned(du)}枚</b> 出てる`
            : du <= -100
              ? `通常日より平均 <b>${formatSigned(du)}枚</b>（出ていない）`
              : "差枚は通常日とほぼ同じ"
          : g.win.uplift != null
            ? `勝率が通常日より <b>${pctPt(g.win.uplift)}</b>`
            : "データ不足";
      return `<li>${verdictChip(g)} <b>${esc(g.label)}</b> — ${word}・稼働Δ<b>${formatSigned(g.games?.uplift)}G</b><br><span class="sub">サンプル ${g.win.nEvent}日・${confLabel(g.diff?.p ?? g.win.p)}・勝率 ${pct(g.win.meanEvent)}${g.recent ? `・${esc(g.recent.verdict)}` : ""}</span></li>`;
    })
    .join("");
  items.push(`<div class="card"><h3>イベント日仮説</h3><ul class="plain">${evLines}</ul></div>`);

  // 今後の狙い日
  const tp = toDateParts(meta.today);
  const up = upcomingDays(a, meta.today, 14);
  const upLines = up
    .slice(0, 6)
    .map((u) => {
      const p = toDateParts(u.date);
      const hits = u.hits
        .map((h) => {
          const v = h.diffUplift != null ? `${formatSigned(h.diffUplift)}枚` : pctPt(h.uplift);
          const t = `${esc(h.label)} ${v}（n=${h.n}日）`;
          return h.significant ? `<b>${t}</b>` : `<span class="dim">${t}</span>`;
        })
        .join("・");
      return `<li><b>${p.m}/${p.d}(${WEEKDAYS[p.weekday]})</b> ${hits}</li>`;
    })
    .join("");
  items.push(
    `<div class="card"><h3>今後2週間の狙い日（${tp ? `${tp.m}/${tp.d}〜` : ""}実績ベース）</h3><ul class="plain">${upLines || "<li>該当なし</li>"}</ul><p class="note">数字は通常日と比べた平均差枚。太字 = 実績の裏付けあり、灰色 = 裏付けが弱いので参考程度。</p></div>`
  );

  // 稼働（G数）
  const evG = a.eventGroups
    .filter((g) => g.games && g.games.uplift != null)
    .sort((x, y) => y.games.uplift - x.games.uplift)
    .slice(0, 2);
  const dayG = (a.byDayOfMonth || [])
    .filter((r) => r.n >= 5 && r.upliftGames != null)
    .sort((x, y) => y.upliftGames - x.upliftGames)
    .slice(0, 3);
  const wkG = (a.byWeekday || []).filter((r) => r.upliftGames != null).sort((x, y) => y.upliftGames - x.upliftGames)[0];
  const gLines = [
    `<li>全期間の平均G数/台: <b>${num(a.coverage.meanGames)}G</b>（${a.coverage.nDays}日分）</li>`,
    ...evG.map((g) => `<li><b>${esc(g.label)}</b>: 稼働 ${formatSigned(g.games.uplift)}G（n=${g.win.nEvent}日・p=${g.games.p == null ? "-" : g.games.p.toFixed(3)}）・勝率 ${pctPt(g.win.uplift)}</li>`),
    dayG.length ? `<li>稼働が伸びる日にち: ${dayG.map((r) => `<b>${r.d}日</b> ${formatSigned(r.upliftGames)}G（n=${r.n}）`).join("・")}</li>` : "",
    wkG ? `<li>稼働が伸びる曜日: <b>${esc(wkG.weekday)}</b> ${formatSigned(wkG.upliftGames)}G（n=${wkG.n}）</li>` : "",
  ].join("");
  items.push(
    `<div class="card"><h3>稼働（G数）の見どころ</h3><ul class="plain">${gLines}</ul><p class="note">高稼働×高勝率 = 客に信じられていて実際に出る日。高稼働×低勝率 = 客が集まるだけの日（回収日に注意）。</p></div>`
  );

  // いま強い台（ウォッチリスト外も含む全機種ランキング上位）
  const strongModels = (a.models || [])
    .filter((m) => m.samples >= 100 && m.active && (m.meanDiff != null || m.winRate != null))
    .sort((x, y) => (y.meanDiff ?? -1e9) - (x.meanDiff ?? -1e9))
    .slice(0, 5);
  const smLines = strongModels
    .map(
      (m) =>
        `<li><b>${esc(m.model)}</b> — 平均差枚 <b>${formatSigned(m.meanDiff)}</b>・平均 ${num(m.meanGames)}G<br><span class="sub">設置${m.count ?? "?"}台・サンプル ${num(m.samples)}台×日・直近60日差枚 ${formatSigned(m.recent.meanDiff)}・勝率 ${pct(m.winRate)}</span></li>`
    )
    .join("");
  items.push(
    `<div class="card"><h3>いま強い台（全機種から）</h3><ul class="plain">${smLines || "<li>サンプル不足（取得日数を増やすと出ます）</li>"}</ul><p class="note">ウォッチリスト外も含む全機種の平均差枚上位（サンプル100台×日以上・現役のみ）。全リストは「<a href="#models">機種ランキング</a>」へ。</p></div>`
  );

  // 末尾ルール
  const dt = a.suffix.dateTailMatch;
  const tailCells = [];
  for (const g of a.suffix.byEvent) {
    if (g.label === "全日") continue;
    for (const r of g.table) {
      const v = r.upliftDiffVsNormal ?? null;
      if (r.n >= 5 && v != null) tailCells.push({ event: g.label, suffix: r.suffix, uplift: v, n: r.n });
    }
  }
  tailCells.sort((x, y) => y.uplift - x.uplift);
  const tailLines = tailCells
    .slice(0, 5)
    .map((t) => `<li><b>${esc(t.event)} × 末尾${esc(t.suffix === "zorome" ? "ゾロ目" : t.suffix)}</b>: 差枚 ${formatSigned(t.uplift)}（n=${t.n}）</li>`)
    .join("");
  items.push(
    `<div class="card"><h3>末尾の見どころ</h3><ul class="plain">
<li>日付末尾一致（n日の末尾n）: 差枚Δ <b>${formatSigned(dt.meanDeltaDiff)}</b>・稼働Δ <b>${formatSigned(dt.meanDeltaGames)}G</b>（${confLabel(dt.pDiff)}）</li>
${tailLines}</ul></div>`
  );

  // シリーズの見どころ（設置が確認できるシリーズのみ）
  const seriesCells = [];
  for (const s of a.series) {
    if (!s.nDays || s.active === false) continue;
    for (const e of s.byEvent || []) {
      const du = e.diff ? e.diff.uplift : null;
      const dp = e.diff ? e.diff.p : null;
      if (du != null && e.diff.nEvent >= 5 && dp != null && dp < 0.2) {
        seriesCells.push({ series: s.name, event: e.label, uplift: du, p: dp, n: e.diff.nEvent });
      } else if (du == null && e.win.uplift != null && e.win.nEvent >= 5 && e.win.p != null && e.win.p < 0.2) {
        seriesCells.push({ series: s.name, event: e.label, uplift: e.win.uplift * 5000, p: e.win.p, n: e.win.nEvent, winBased: e.win.uplift });
      }
    }
  }
  seriesCells.sort((x, y) => Math.abs(y.uplift) - Math.abs(x.uplift));
  const seriesLines = seriesCells
    .slice(0, 6)
    .map((t) => `<li><b>${esc(t.series)} × ${esc(t.event)}</b>: ${t.winBased != null ? `勝率 ${pctPt(t.winBased)}` : `差枚 ${formatSigned(t.uplift)}`}（${confLabel(t.p)}・n=${t.n}）</li>`)
    .join("");
  items.push(`<div class="card"><h3>機種シリーズの見どころ</h3><ul class="plain">${seriesLines || "<li>裏付けのある組み合わせなし</li>"}</ul></div>`);

  // 直近の入替
  const ev = [...a.lineup.events].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 5);
  const evLines2 = ev.map((e) => `<li>${esc(e.date)} ${chip(esc(e.kind), e.kind === "新台" || e.kind === "増台" ? "good" : "gray")} ${esc(e.model)}（${e.from}→${e.to}台）</li>`).join("");
  items.push(`<div class="card"><h3>直近の入替検知</h3><ul class="plain">${evLines2 || "<li>検知なし</li>"}</ul></div>`);

  const cov = a.coverage;
  const windowNote = cov.windowMonths
    ? `（直近${cov.windowMonths}か月窓${cov.totalDaysAvailable > cov.nDays ? `・収集済み全${cov.totalDaysAvailable}日のうち` : ""}）`
    : "";
  return `<section id="summary"><h2>結論サマリー</h2>
<p class="legend">データ量: <b>${cov.nDays}日</b>（${esc(cov.from)}〜${esc(cov.to)}）${windowNote}・機種別 ${num(cov.nModelRows)}行・台番付き ${num(cov.nUnits)}行${cov.nMasked ? `・マスク日 ${cov.nMasked}` : ""}<br>
読み方: 数字は基本「<b>平均差枚</b>」と「<b>G数（稼働）</b>」。Δ = 通常日との差（+なら通常日より良い）。勝率や p値などの細かい統計は各表の「詳細」内。</p>
<div class="cards">${items.join("\n")}</div></section>`;
}

function calendarHeatmap(a, mode = "diff") {
  const byD = new Map(a.byDayOfMonth.map((r) => [r.d, r]));
  const gScale = Math.max(150, (a.coverage?.meanGames ?? 3000) * 0.12);
  let cells = "";
  for (let d = 1; d <= 31; d++) {
    const r = byD.get(d);
    if (!r) {
      cells += `<div class="cal-cell empty">${d}</div>`;
      continue;
    }
    const star = r.pWin != null && r.pWin < 0.05 ? "★" : "";
    const title = `${d}日: 差枚Δ ${formatSigned(r.upliftDiff)} / 平均差枚 ${formatSigned(r.meanDiff)} / G数 ${num(r.meanGames)} / 勝率 ${pct(r.winRate)} (n=${r.n})`;
    const colored = mode === "games" ? heat(r.upliftGames, gScale) : mode === "win" ? heat(r.upliftWin, 0.12) : heat(r.upliftDiff, 1200);
    const value = mode === "games" ? `${formatSigned(r.upliftGames)}G` : mode === "win" ? pctPt(r.upliftWin, 0) : formatSigned(r.upliftDiff);
    cells += `<div class="cal-cell"${colored} title="${title}">
<span class="cal-d">${d}${star}</span><span class="cal-v">${value}</span><span class="cal-n">n${r.n}</span></div>`;
  }
  const legend =
    mode === "games"
      ? "色 = 平均G数（稼働）の通常日比（赤=高稼働・青=閑散）"
      : mode === "win"
        ? "色 = 勝率の通常日比（赤=強い・青=弱い）"
        : "色と数字 = 平均差枚の通常日比（赤=出てる・青=出てない）";
  return `<div class="cal">${cells}</div><p class="note">${legend}、★ = 統計的裏付けあり。セルにカーソルを当てると詳細。</p>`;
}

export function renderHtml(analysis, config, meta) {
  const a = analysis;
  const sections = [];

  sections.push(summarySection(a, meta));

  const gScale = Math.max(150, (a.coverage?.meanGames ?? 3000) * 0.12);
  sections.push(`<section id="days"><h2>日にち別（1〜31日）</h2>
<p class="desc">1〜31日のどの「日にち」が出ているかを実績で見る。赤いセル = 通常日より差枚がプラス、青 = マイナス。各セルの n がサンプル日数。</p>
${calendarHeatmap(a)}
<details><summary>稼働（G数）版ヒートマップを開く</summary>${calendarHeatmap(a, "games")}</details>
${statDetails(
    calendarHeatmap(a, "win") +
      table(
        ["日", "n", "平均差枚", "差枚中央値", "勝率", "平均G数", "差枚Δ", "勝率Δ", "G数Δ", "p(勝率)"],
        a.byDayOfMonth.map((r) => [
          td(`<b>${r.d}</b>`),
          td(r.n),
          td(formatSigned(r.meanDiff), heat(r.meanDiff, 1500)),
          td(formatSigned(r.medianDiff)),
          td(pct(r.winRate), heat((r.winRate ?? 0.5) - 0.5, 0.15)),
          td(num(r.meanGames)),
          td(formatSigned(r.upliftDiff), heat(r.upliftDiff, 1500)),
          td(pctPt(r.upliftWin), heat(r.upliftWin, 0.12)),
          td(formatSigned(r.upliftGames), heat(r.upliftGames, gScale)),
          td(pv(r.pWin)),
        ])
      ),
    "詳細（勝率版ヒートマップ・数値テーブル）"
  )}
<h3>曜日別</h3>
${table(
    ["曜日", "n", "平均差枚", "差枚Δ", "平均G数", "G数Δ"],
    a.byWeekday.map((r) => [
      td(r.weekday),
      td(r.n),
      td(formatSigned(r.meanDiff), heat(r.meanDiff, 1000)),
      td(formatSigned(r.upliftDiff), heat(r.upliftDiff, 1000)),
      td(num(r.meanGames)),
      td(formatSigned(r.upliftGames), heat(r.upliftGames, gScale)),
    ])
  )}
${statDetails(
    table(
      ["曜日", "n", "勝率", "勝率Δ"],
      a.byWeekday.map((r) => [td(r.weekday), td(r.n), td(pct(r.winRate), heat((r.winRate ?? 0.5) - 0.5, 0.15)), td(pctPt(r.upliftWin), heat(r.upliftWin, 0.1))])
    )
  )}</section>`);

  const recentLabel = a.eventGroups[0]?.recent?.months ? `直近${a.eventGroups[0].recent.months}か月の判定` : "直近の判定";
  const evSimpleRows = a.eventGroups.map((g) => [
    td(`<b>${esc(g.label)}</b> ${verdictChip(g)}`),
    td(g.win.nEvent),
    td(formatSigned(g.diff.meanEvent) + " / " + formatSigned(g.diff.meanRest)),
    td(formatSigned(g.diff.uplift), heat(g.diff.uplift, 1500)),
    td(num(g.games.meanEvent) + " / " + num(g.games.meanRest)),
    td(formatSigned(g.games.uplift), heat(g.games.uplift, gScale)),
    td(esc(g.recent ? g.recent.verdict : "-")),
  ]);
  const evFullRows = a.eventGroups.map((g) => [
    td(`<b>${esc(g.label)}</b>`),
    td(g.win.nEvent),
    td(pct(g.win.meanEvent) + " / " + pct(g.win.meanRest)),
    td(pctPt(g.win.uplift), heat(g.win.uplift, 0.12)),
    td(pv(g.win.p)),
    td(pv(g.diff.p)),
    td(pv(g.games.p)),
  ]);
  sections.push(`<section id="events"><h2>イベント日仮説の検証</h2>
<p class="desc">「3のつく日」などの仮説が本当に機能しているかの検証。差枚と稼働（G数）を通常日と比べる。Δ = 通常日との差。</p>
${table(["仮説", "n", "平均差枚(イベ/通常)", "差枚Δ", "平均G数(イベ/通常)", "G数Δ", recentLabel], evSimpleRows)}
${statDetails(table(["仮説", "n", "勝率(イベ/通常)", "勝率Δ", "p(勝率)", "p(差枚)", "p(稼働)"], evFullRows))}
${a.eventGroups
    .map((g) => {
      const rows = g.monthly.filter((m) => m.nEvent > 0);
      if (!rows.length) return "";
      const bars = rows
        .map((m) => {
          const v = m.upliftDiff ?? (m.upliftWin != null ? m.upliftWin * 5000 : null);
          const h = v == null ? 2 : Math.max(2, Math.min(44, Math.abs(v) / 60));
          const cls = v == null ? "na" : v >= 0 ? "pos" : "neg";
          return `<div class="bar ${cls}" style="height:${h}px" title="${m.ym}: 差枚Δ ${formatSigned(m.upliftDiff)} / 勝率Δ ${pctPt(m.upliftWin)} (n=${m.nEvent})"></div>`;
        })
        .join("");
      return `<details><summary>${esc(g.label)} の月次トレンド（差枚Δ）</summary><div class="spark">${bars}</div></details>`;
    })
    .join("\n")}
<h3>min-repo の「状況」ラベル別</h3>
${table(
    ["ラベル", "n", "平均差枚", "平均G数"],
    a.statusLabels.map((r) => [td(esc(r.label)), td(r.n), td(formatSigned(r.meanDiff), heat(r.meanDiff, 1500)), td(num(r.meanGames))])
  )}</section>`);

  const modelRows = (a.models || []).filter((m) => m.samples >= 30).sort((x, y) => (y.meanDiff ?? -1e9) - (x.meanDiff ?? -1e9));
  sections.push(`<section id="models"><h2>機種別の強さランキング（全機種）</h2>
<p class="desc">ウォッチリスト以外も含む<b>全機種</b>を平均差枚順に並べたランキング。「他に強い台」を探す用。
サンプル = 延べ台数（台×日）で、少ない機種は運の影響が大きいので注意。ヘッダのタップで並べ替えできる。</p>
${table(
    ["機種", "台数", "サンプル(台×日)", "平均差枚", "平均G数", "直近60日差枚", "状態"],
    modelRows.map((m) => [
      td(`<b>${esc(m.model)}</b>`),
      td(m.count ?? "-"),
      td(num(m.samples)),
      td(formatSigned(m.meanDiff), heat(m.meanDiff, 1500)),
      td(num(m.meanGames)),
      td(formatSigned(m.recent.meanDiff), heat(m.recent.meanDiff, 1500)),
      td(m.active ? "稼働中" : chip("撤去済?", "gray")),
    ])
  )}
${statDetails(
    table(
      ["機種", "観測日数", "勝率", "直近60日勝率"],
      modelRows.map((m) => [td(esc(m.model)), td(m.nDays), td(pct(m.winRate), heat((m.winRate ?? 0.5) - 0.5, 0.15)), td(pct(m.recent.winRate), heat((m.recent.winRate ?? 0.5) - 0.5, 0.15))])
    )
  )}
<p class="note">目安: 平均差枚プラスが続いている機種が「店の見せ台」。直近60日が全期間より良ければ上り調子（力の入れどころが変わった可能性）。
サンプル30台×日未満は非表示（全件は data/analysis.json と models.csv にある）。</p></section>`);

  const sx = a.suffix;
  sections.push(`<section id="suffix"><h2>末尾分析</h2>
<p class="desc">台番の末尾（下1桁）ごとの成績。「13日は末尾3が熱い」のような日付末尾一致の法則はすぐ下の行で検証している。</p>
<p>日付末尾一致（n日の末尾n、例: 13日の末尾3）: n=${sx.dateTailMatch.n}日、差枚Δ <b>${formatSigned(sx.dateTailMatch.meanDeltaDiff)}</b>・稼働Δ <b>${formatSigned(sx.dateTailMatch.meanDeltaGames)}G</b>（${confLabel(sx.dateTailMatch.pDiff)}）</p>
${statDetails(
    `<p>日付末尾一致の詳細: 差枚Δ ${formatSigned(sx.dateTailMatch.meanDeltaDiff)}（p=${pv(sx.dateTailMatch.pDiff)}）、勝率Δ ${pctPt(sx.dateTailMatch.meanDeltaWin)}（p=${pv(sx.dateTailMatch.pWin)}）、稼働Δ ${formatSigned(sx.dateTailMatch.meanDeltaGames)}G（p=${pv(sx.dateTailMatch.pGames)}）</p>`
  )}
${sx.byEvent
    .map(
      (g) => `<details${g.label === "全日" ? "" : " open"}><summary>${esc(g.label)}（${g.nDays}日）</summary>
${table(
        ["末尾", "n", "平均差枚", "差枚Δ vs 通常日", "平均G数", "G数Δ vs 通常日"],
        g.table.map((r) => [
          td(`<b>${esc(r.suffix === "zorome" ? "ゾロ目" : r.suffix)}</b>`),
          td(r.n),
          td(formatSigned(r.meanDiff), heat(r.meanDiff, 1500)),
          td(formatSigned(r.upliftDiffVsNormal), heat(r.upliftDiffVsNormal, 1500)),
          td(num(r.meanGames)),
          td(formatSigned(r.upliftGamesVsNormal), heat(r.upliftGamesVsNormal, gScale)),
        ])
      )}
${statDetails(
        table(
          ["末尾", "勝率", "勝率Δ vs 通常日"],
          g.table.map((r) => [
            td(`<b>${esc(r.suffix === "zorome" ? "ゾロ目" : r.suffix)}</b>`),
            td(pct(r.winRate), heat((r.winRate ?? 0.5) - 0.5, 0.15)),
            td(pctPt(r.upliftWinVsNormal), heat(r.upliftWinVsNormal, 0.12)),
          ])
        )
      )}</details>`
    )
    .join("\n")}</section>`);

  const visibleSeries = a.series.filter((s) => s.nDays > 0 && s.active !== false);
  const hiddenSeries = a.series.filter((s) => !(s.nDays > 0 && s.active !== false));
  sections.push(`<section id="series"><h2>注目機種シリーズ × イベント日</h2>
<p class="desc">config.mjs のウォッチリストにあるシリーズと、イベント日の相性。シリーズ以外の機種は上の「機種ランキング」で見る。</p>
${
    hiddenSeries.length
      ? `<p class="note">設置が確認できないため非表示: ${hiddenSeries.map((s) => esc(s.name)).join("・")}（撤去済みか、機種名パターンが合っていない。config.mjs の seriesWatchlist を見直す）</p>`
      : ""
  }
${visibleSeries
    .map((s) => {
      const rows = s.byEvent.map((e) => [
        td(esc(e.label)),
        td(e.win.nEvent),
        td(formatSigned(e.diff.meanEvent), heat(e.diff.meanEvent, 2000)),
        td(formatSigned(e.diff.uplift), heat(e.diff.uplift, 2000)),
        td(formatSigned(e.games ? e.games.uplift : null), heat(e.games ? e.games.uplift : null, gScale)),
        td(
          e.byYear
            .filter((y) => y.nEvent > 0)
            .map((y) => `${y.y}: ${formatSigned(y.upliftDiff)} (n=${y.nEvent})`)
            .join("<br>")
        ),
      ]);
      const fullRows = s.byEvent.map((e) => [
        td(esc(e.label)),
        td(e.win.nEvent),
        td(pct(e.win.meanEvent)),
        td(pctPt(e.win.uplift), heat(e.win.uplift, 0.15)),
        td(pv(e.win.p)),
        td(pv(e.diff.p)),
        td(
          e.byYear
            .filter((y) => y.nEvent > 0)
            .map((y) => `${y.y}: ${pctPt(y.upliftWin)} (n=${y.nEvent})`)
            .join("<br>")
        ),
      ]);
      return `<h3>${esc(s.name)} <span class="dim">（${s.nDays}日、平均${num(s.avgCount, 1)}台、平常 差枚${formatSigned(s.meanDiff)}・${num(s.meanGames)}G）</span></h3>
${table(["イベント", "n", "イベ日平均差枚", "差枚Δ", "G数Δ", "年別 差枚Δ"], rows)}
${statDetails(table(["イベント", "n", "イベ日勝率", "勝率Δ", "p(勝率)", "p(差枚)", "年別 勝率Δ"], fullRows))}`;
    })
    .join("\n")}</section>`);

  const hole = a.hole;
  const holeTable = (label, rows) =>
    `<h3>${label}</h3>${table(
      ["直近" + hole.config.window + "日合計", "範囲", "n", "当日平均差枚", "当日平均G数"],
      rows.map((r) => [td(r.bucket), td(esc(r.range)), td(r.n), td(formatSigned(r.meanDiff), heat(r.meanDiff, 1500)), td(num(r.meanGames))]),
      { sortable: false }
    )}`;
  const holeFull = (label, rows) =>
    `<h4>${label}</h4>${table(
      ["バケツ", "n", "当日勝率"],
      rows.map((r) => [td(r.bucket), td(r.n), td(pct(r.winRate), heat((r.winRate ?? 0.5) - 0.5, 0.15))]),
      { sortable: false }
    )}`;
  sections.push(`<section id="hole"><h2>凹み台の扱い <span class="dim">（台番が取れているデータのみ、サンプル ${num(hole.nSamples)}台×日）</span></h2>
<p class="desc">直近${hole.config.window}日で凹んでいる台が、当日（特にイベント日）に出されるか＝救済傾向の検証。</p>
${holeTable("イベント日のみ", hole.eventDays)}
${holeTable("通常日のみ", hole.normalDays)}
<details><summary>全日</summary>${holeTable("全日", hole.allDays)}</details>
${statDetails(holeFull("イベント日のみ", hole.eventDays) + holeFull("通常日のみ", hole.normalDays))}
<p class="note">「大凹みの台がイベント日だけプラスに跳ねる」なら凹み台救済の傾向あり。差がなければ末尾や機種で選ぶ方がよい。</p></section>`);

  const lineupEvents = [...a.lineup.events].sort((x, y) => (x.date < y.date ? 1 : -1));
  sections.push(`<section id="lineup"><h2>新台・増台・撤去の検知</h2>
<p class="desc">設置構成の変化から入替を自動検知し、導入直後（7日）とその後（8〜37日）の扱いを比べる。導入直後だけ甘い店かが分かる。</p>
${table(
    ["日付", "種別", "機種", "台数", "導入後7日 差枚/G数", "8〜37日 差枚/G数"],
    lineupEvents.slice(0, 120).map((e) => {
      const intro = a.lineup.intro.find((i) => i.date === e.date && i.model === e.model);
      return [
        td(esc(e.date)),
        td(`<b>${esc(e.kind)}</b>`),
        td(esc(e.model)),
        td(`${e.from}→${e.to}`),
        td(intro ? `${formatSigned(intro.firstWeek.meanDiff)} / ${num(intro.firstWeek.meanGames)}G` : "-"),
        td(intro ? `${formatSigned(intro.later.meanDiff)} / ${num(intro.later.meanGames)}G` : "-"),
      ];
    })
  )}
<p class="note">設置構成の変化から自動検出。データ欠損日を跨ぐと実際の入替日と1〜2日ずれることがある。直近120件のみ表示（全件は data/analysis.json）。</p></section>`);

  const ann = a.anniversaries;
  sections.push(`<section id="anniv"><h2>キャラ誕生日・記念日</h2>
<p class="desc">「金木研の誕生日に喰種が出る」のようなピンポイント仮説。年1回しか起きないので n が小さい＝話半分で見ること。</p>
<h3>設定した仮説（config.mjs の anniversaries）</h3>
${table(
    ["仮説", "月日", "n", "平均差枚", "シリーズ平常時"],
    ann.explicit.map((r) => [td(esc(r.label)), td(r.monthDay), td(r.n), td(formatSigned(r.meanDiff), heat(r.meanDiff - (r.baselineDiff ?? 0), 2000)), td(formatSigned(r.baselineDiff))])
  )}
<h3>自動スキャン: シリーズ別に突出した（月,日）トップ40</h3>
${table(
    ["シリーズ", "月日", "n", "平均差枚", "差枚Δ"],
    ann.autoScan.map((r) => [td(esc(r.series)), td(esc(r.monthDay)), td(r.n), td(formatSigned(r.meanDiff)), td(formatSigned(r.uplift), heat(r.uplift, 3000))])
  )}
<p class="note">記念日は窓に関係なく収集済みの全期間で評価する（年1回しか起きないため）。自動スキャンは「3のつく日」等と重なるものも混ざる。n が小さいものは話半分に。</p></section>`);

  sections.push(`<section id="notes"><h2>読み方・注意</h2>
<ul>
<li>表は<b>平均差枚と G数（稼働）</b>を前面にしている。差枚は万枚事故などの外れ値に引っ張られることがあるので、怪しいと思ったら各表の「詳細」内の<b>勝率・p値</b>で裏を取る。</li>
<li>G数（稼働）は客側の行動。高稼働=高設定の証明ではないが、「客に信じられている日」の傍証。高稼働なのに差枚が伸びない日は回収日の疑い。</li>
<li>${a.coverage.windowMonths ? `分析は<b>直近${a.coverage.windowMonths}か月</b>のデータのみ使用（店の方針替えに追従するため。config.mjs の analysisMonths で変更可、記念日だけは全期間）。` : "分析は収集済みの全期間を使用。"}</li>
<li>「詳細」内の p値は並べ替え検定（${num(a.params?.iterations ?? 2000)}回）による「偶然でその差が出る確率」。仮説を同時にたくさん見ているので、p&lt;0.05 でも 20 回に 1 回は偶然出る。差の大きさ・月次の安定感・n をセットで判断。</li>
<li>データ出典: min-repo.com（独自調査値・推定）。<b>私的な分析用途のみ。このレポートや元データを転載・公開しないこと。</b></li>
<li>データ範囲: ${esc(a.coverage.from)} 〜 ${esc(a.coverage.to)}（${a.coverage.nDays}日、台番付き ${num(a.coverage.nUnits)}件）</li>
</ul></section>`);

  const nav = [
    ["summary", "結論"],
    ["days", "日にち"],
    ["events", "イベント日"],
    ["models", "機種ランキング"],
    ["suffix", "末尾"],
    ["series", "シリーズ"],
    ["hole", "凹み"],
    ["lineup", "入替"],
    ["anniv", "記念日"],
    ["notes", "注意"],
  ]
    .map(([id, label]) => `<a href="#${id}">${label}</a>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(config.storeName)} 分析</title>
<style>
:root{--accent:#c62828;--bg:#f6f7f9;--card:#fff;--line:#e3e6ea}
*{box-sizing:border-box}
body{font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;margin:0;color:#1c1e21;background:var(--bg)}
header{background:#23272f;color:#fff;padding:14px 16px 10px}
header h1{font-size:1.05rem;margin:0 0 2px}
header .meta{font-size:.72rem;color:#aab}
nav{position:sticky;top:0;z-index:10;background:#23272f;padding:8px 12px;display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch}
nav a{color:#dde;text-decoration:none;font-size:.8rem;padding:5px 10px;border-radius:999px;background:#3a3f4a;white-space:nowrap}
nav a:active{background:var(--accent)}
main{max-width:1100px;margin:0 auto;padding:8px 12px 40px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:14px 0;scroll-margin-top:56px}
h2{font-size:1.05rem;margin:.2em 0 .6em;border-left:4px solid var(--accent);padding-left:8px}
h3{font-size:.92rem;margin:1em 0 .3em}
.dim{color:#888;font-weight:normal;font-size:.8em}
.sub{color:#677;font-size:.78rem;font-weight:normal}
.desc{color:#556;font-size:.8rem;margin:.1em 0 .6em;line-height:1.5}
.legend{color:#556;font-size:.78rem;background:#f4f6f8;border-radius:8px;padding:8px 10px;line-height:1.7;margin:.4em 0 .6em}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}
.card{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#fcfcfd}
.card h3{margin:.1em 0 .4em}
ul.plain{list-style:none;margin:.2em 0;padding:0}
ul.plain li{padding:5px 0;font-size:.86rem;line-height:1.55;border-bottom:1px dashed #eee}
.chip{display:inline-block;font-size:.68rem;padding:2px 8px;border-radius:999px;margin-right:4px;vertical-align:1px}
.chip.good{background:#e8f5e9;color:#1b5e20}.chip.bad{background:#ffebee;color:#b71c1c}.chip.gray{background:#eceff1;color:#546e7a}.chip.warn{background:#fff8e1;color:#8d6e00}
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;font-size:.8rem;margin:.4em 0;background:#fff;min-width:100%}
th,td{border:1px solid var(--line);padding:5px 9px;text-align:right;white-space:nowrap}
th{background:#f0f2f5;position:sticky;top:0}
tbody tr:nth-child(even) td{background:#f7f9fb}
table.sortable th{cursor:pointer}
table.sortable th:hover{background:#e3e6ea}
td:first-child,th:first-child{text-align:left;position:sticky;left:0;background:#fff;z-index:1;box-shadow:1px 0 0 var(--line)}
th:first-child{background:#f0f2f5;z-index:2}
tbody tr:nth-child(even) td:first-child{background:#f7f9fb}
.note{color:#667;font-size:.76rem}
.cal{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:4px;margin:6px 0}
.cal-cell{border:1px solid var(--line);border-radius:8px;padding:4px;display:flex;flex-direction:column;align-items:center;min-height:52px}
.cal-cell.empty{opacity:.3}
.cal-d{font-weight:700;font-size:.85rem}.cal-v{font-size:.68rem}.cal-n{font-size:.6rem;color:#889}
.spark{display:flex;align-items:flex-end;gap:2px;height:50px;margin:4px 0 12px}
.bar{width:9px;min-height:2px;border-radius:2px 2px 0 0}.bar.pos{background:#e53935}.bar.neg{background:#1e88e5}.bar.na{background:#ccc}
details{margin:.4em 0}summary{cursor:pointer;font-size:.85rem;color:#345}
details.stat>summary{color:#8a8f98;font-size:.76rem}
h4{font-size:.82rem;margin:.6em 0 .2em;color:#555}
footer{margin:1em 0 3em;color:#99a;font-size:.72rem;text-align:center}
</style></head><body>
<header><h1>${esc(config.storeName)} 設定狙い分析</h1>
<div class="meta">生成 ${esc(meta.generatedAt)} ／ データ ${esc(a.coverage.from)}〜${esc(a.coverage.to)}（${a.coverage.nDays}日） ／ 出典 min-repo.com（私的利用のみ）</div></header>
<nav>${nav}</nav>
<main>
${sections.join("\n")}
<footer>tools/minrepo による自動生成。仮説の追加は config.mjs を編集 → <code>node tools/minrepo/run.mjs analyze &amp;&amp; node tools/minrepo/run.mjs report</code></footer>
</main>
<script>
// テーブルのヘッダクリックでソート（数値優先・依存なし）
document.querySelectorAll("table.sortable").forEach(function(t){
  var ths=t.querySelectorAll("thead th");
  ths.forEach(function(th,i){
    th.addEventListener("click",function(){
      var tb=t.querySelector("tbody");
      var rows=Array.prototype.slice.call(tb.querySelectorAll("tr"));
      var dir=th.dataset.dir==="desc"?1:-1;
      ths.forEach(function(h){delete h.dataset.dir});
      th.dataset.dir=dir===1?"asc":"desc";
      var val=function(tr){
        var c=tr.children[i];if(!c)return NaN;
        var s=c.textContent.replace(/[,%]/g,"").replace(/pt$/,"").trim();
        var m=s.match(/^[+\\-]?\\d+(\\.\\d+)?/);
        return m?parseFloat(m[0]):NaN;
      };
      rows.sort(function(x,y){
        var a=val(x),b=val(y);
        if(isNaN(a)&&isNaN(b))return x.children[i].textContent.localeCompare(y.children[i].textContent)*dir;
        if(isNaN(a))return 1;if(isNaN(b))return -1;
        return (a-b)*dir;
      });
      rows.forEach(function(r){tb.appendChild(r)});
    });
  });
});
</script>
</body></html>`;
}

/** 上位の発見を Markdown ダイジェストにする */
export function renderMarkdown(analysis, config, generatedAt) {
  const a = analysis;
  const lines = [];
  lines.push(`# ${config.storeName} 分析ダイジェスト`);
  lines.push(`生成: ${generatedAt} ／ 範囲: ${a.coverage.from} 〜 ${a.coverage.to}（${a.coverage.nDays}日${a.coverage.windowMonths ? `・直近${a.coverage.windowMonths}か月窓` : ""}）`);
  lines.push("");
  lines.push("## イベント日仮説");
  lines.push("| 仮説 | n | 差枚Δ | G数Δ | 勝率Δ | 直近の判定 |");
  lines.push("|---|---|---|---|---|---|");
  for (const g of a.eventGroups) {
    lines.push(
      `| ${g.label} | ${g.win.nEvent} | ${formatSigned(g.diff.uplift)} | ${formatSigned(g.games ? g.games.uplift : null)}G | ${pctPt(g.win.uplift)} | ${g.recent ? g.recent.verdict : "-"} |`
    );
  }
  lines.push("");
  lines.push("## 機種別ランキング（サンプル100台×日以上・平均差枚トップ10）");
  const mdModels = (a.models || []).filter((m) => m.samples >= 100).sort((x, y) => (y.meanDiff ?? -1e9) - (x.meanDiff ?? -1e9));
  for (const m of mdModels.slice(0, 10)) {
    lines.push(`- ${m.model}: 差枚 ${formatSigned(m.meanDiff)}・${num(m.meanGames)}G（${m.count ?? "?"}台・サンプル ${num(m.samples)}台×日・直近60日差枚 ${formatSigned(m.recent.meanDiff)}）`);
  }
  lines.push("");
  const strongDays = a.byDayOfMonth
    .filter((r) => r.n >= 5 && (r.upliftDiff != null || r.upliftWin != null))
    .sort((x, y) => (y.upliftDiff ?? y.upliftWin * 5000) - (x.upliftDiff ?? x.upliftWin * 5000));
  lines.push("## 出てる日トップ8 / ワースト3（差枚Δ）");
  for (const r of strongDays.slice(0, 8)) lines.push(`- ${r.d}日: 差枚Δ ${formatSigned(r.upliftDiff)}（平均差枚 ${formatSigned(r.meanDiff)}, G数Δ ${formatSigned(r.upliftGames)}, n=${r.n}）`);
  for (const r of strongDays.slice(-3)) lines.push(`- ${r.d}日: 差枚Δ ${formatSigned(r.upliftDiff)}（n=${r.n}）`);
  lines.push("");
  const busyDays = a.byDayOfMonth.filter((r) => r.n >= 5 && r.upliftGames != null).sort((x, y) => y.upliftGames - x.upliftGames);
  lines.push("## 稼働（G数）が伸びる日トップ5");
  lines.push(`全期間の平均G数/台: ${num(a.coverage.meanGames)}G`);
  for (const r of busyDays.slice(0, 5)) lines.push(`- ${r.d}日: 平均 ${num(r.meanGames)}G（uplift ${formatSigned(r.upliftGames)}G, 勝率uplift ${pctPt(r.upliftWin)}, n=${r.n}）`);
  lines.push("");
  lines.push("## 日付末尾一致");
  const dt = a.suffix.dateTailMatch;
  lines.push(`- n=${dt.n}日, 差枚Δ ${formatSigned(dt.meanDeltaDiff)} (p=${dt.pDiff == null ? "-" : dt.pDiff.toFixed(3)}), 勝率Δ ${pctPt(dt.meanDeltaWin)} (p=${dt.pWin == null ? "-" : dt.pWin.toFixed(3)})`);
  lines.push("");
  lines.push("## シリーズ×イベントの見どころ（差枚Δ ±300枚以上 or p<0.1）");
  for (const s of a.series) {
    if (!s.nDays || s.active === false) continue;
    for (const e of s.byEvent || []) {
      const du = e.diff ? e.diff.uplift : null;
      const dp = e.diff ? e.diff.p : null;
      if (du == null) continue;
      if (Math.abs(du) >= 300 || (dp != null && dp < 0.1)) {
        lines.push(`- ${s.name} × ${e.label}: 差枚Δ ${formatSigned(du)}（n=${e.diff.nEvent}・G数Δ ${formatSigned(e.games ? e.games.uplift : null)}・勝率Δ ${pctPt(e.win.uplift)}）`);
      }
    }
  }
  lines.push("");
  lines.push("## 直近の入替検知（10件）");
  const ev = [...a.lineup.events].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 10);
  for (const e of ev) lines.push(`- ${e.date} ${e.kind}: ${e.model}（${e.from}→${e.to}台）`);
  lines.push("");
  lines.push("詳細は report.html を参照。");
  return lines.join("\n") + "\n";
}
