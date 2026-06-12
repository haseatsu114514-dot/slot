// analysis.json から HTML レポートと Markdown ダイジェストを生成する。純粋関数のみ。

import { formatSigned, round1 } from "./util.mjs";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
  const alpha = Math.abs(t) * 0.55;
  const color = t >= 0 ? `rgba(220,53,69,${alpha})` : `rgba(13,110,253,${alpha})`;
  return ` style="background:${color}"`;
}

function table(headers, rows) {
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows.map((cells) => `<tr>${cells.join("")}</tr>`).join("\n");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const td = (content, attr = "") => `<td${attr}>${content}</td>`;

export function renderHtml(analysis, config, generatedAt) {
  const a = analysis;
  const sections = [];

  sections.push(`<section><h2>データ範囲</h2>
<p>${esc(a.coverage.from)} 〜 ${esc(a.coverage.to)}（${a.coverage.nDays}日分、うち差枚が使える日 ${a.coverage.nDiffDays}日、マスク検知 ${a.coverage.nMasked}日、台番付きレコード ${num(a.coverage.nUnits)}件）</p>
<p class="note">差枚は外れ値に弱いので、<b>勝率（プラス台の割合）と p値（並べ替え検定）</b>を主に見るのがおすすめ。p値が太字（&lt;0.05）なら偶然では説明しにくい差。</p></section>`);

  // 日別ヒートマップ
  sections.push(`<section><h2>日にち別の成績（1〜31日）</h2>
${table(
    ["日", "n", "平均差枚", "差枚中央値", "勝率", "平均G数", "差枚uplift", "勝率uplift", "p(勝率)"],
    a.byDayOfMonth.map((r) => [
      td(`<b>${r.d}</b>`),
      td(r.n),
      td(formatSigned(r.meanDiff), heat(r.meanDiff, 1500)),
      td(formatSigned(r.medianDiff)),
      td(pct(r.winRate), heat((r.winRate ?? 0.5) - 0.5, 0.15)),
      td(num(r.meanGames)),
      td(formatSigned(r.upliftDiff), heat(r.upliftDiff, 1500)),
      td(pctPt(r.upliftWin), heat(r.upliftWin, 0.12)),
      td(pv(r.pWin)),
    ])
  )}</section>`);

  sections.push(`<section><h2>曜日別</h2>
${table(
    ["曜日", "n", "平均差枚", "勝率", "平均G数", "差枚uplift", "勝率uplift"],
    a.byWeekday.map((r) => [
      td(r.weekday),
      td(r.n),
      td(formatSigned(r.meanDiff), heat(r.meanDiff, 1000)),
      td(pct(r.winRate), heat((r.winRate ?? 0.5) - 0.5, 0.15)),
      td(num(r.meanGames)),
      td(formatSigned(r.upliftDiff), heat(r.upliftDiff, 1000)),
      td(pctPt(r.upliftWin), heat(r.upliftWin, 0.1)),
    ])
  )}</section>`);

  // イベント仮説
  const evRows = a.eventGroups.map((g) => [
    td(`<b>${esc(g.label)}</b>`),
    td(g.win.nEvent),
    td(formatSigned(g.diff.meanEvent) + " / " + formatSigned(g.diff.meanRest)),
    td(formatSigned(g.diff.uplift), heat(g.diff.uplift, 1500)),
    td(pv(g.diff.p)),
    td(pct(g.win.meanEvent) + " / " + pct(g.win.meanRest)),
    td(pctPt(g.win.uplift), heat(g.win.uplift, 0.12)),
    td(pv(g.win.p)),
    td(formatSigned(g.games.uplift)),
    td(esc(g.recent ? g.recent.verdict : "-")),
  ]);
  sections.push(`<section><h2>イベント日仮説の検証</h2>
${table(["仮説", "n", "平均差枚(イベ/通常)", "差枚uplift", "p", "勝率(イベ/通常)", "勝率uplift", "p", "G数uplift", "直近6か月の判定"], evRows)}
${a.eventGroups
    .map((g) => {
      const rows = g.monthly.filter((m) => m.nEvent > 0);
      if (!rows.length) return "";
      const bars = rows
        .map((m) => {
          const v = m.upliftWin;
          const h = v == null ? 2 : Math.max(2, Math.min(40, Math.abs(v) * 250));
          const cls = v == null ? "na" : v >= 0 ? "pos" : "neg";
          return `<div class="bar ${cls}" style="height:${h}px" title="${m.ym}: 勝率uplift ${pctPt(v)} (n=${m.nEvent})"></div>`;
        })
        .join("");
      return `<details><summary>${esc(g.label)} の月次トレンド（勝率uplift、ホバーで値）</summary><div class="spark">${bars}</div></details>`;
    })
    .join("\n")}</section>`);

  // 状況ラベル
  sections.push(`<section><h2>min-repo の「状況」ラベル別</h2>
${table(
    ["ラベル", "n", "平均差枚", "勝率", "平均G数"],
    a.statusLabels.map((r) => [td(esc(r.label)), td(r.n), td(formatSigned(r.meanDiff), heat(r.meanDiff, 1500)), td(pct(r.winRate), heat((r.winRate ?? 0.5) - 0.5, 0.15)), td(num(r.meanGames))])
  )}</section>`);

  // 末尾
  const sx = a.suffix;
  sections.push(`<section><h2>末尾分析</h2>
<p>日付末尾一致（n日の末尾n、例: 13日の末尾3）: n=${sx.dateTailMatch.n}日、差枚Δ ${formatSigned(sx.dateTailMatch.meanDeltaDiff)}（p=${pv(sx.dateTailMatch.pDiff)}）、勝率Δ ${pctPt(sx.dateTailMatch.meanDeltaWin)}（p=${pv(sx.dateTailMatch.pWin)}）</p>
${sx.byEvent
    .map(
      (g) => `<h3>${esc(g.label)}（${g.nDays}日）</h3>
${table(
        ["末尾", "n", "平均差枚", "勝率", "平均G数", "差枚uplift vs 通常日", "勝率uplift vs 通常日"],
        g.table.map((r) => [
          td(`<b>${esc(r.suffix === "zorome" ? "ゾロ目" : r.suffix)}</b>`),
          td(r.n),
          td(formatSigned(r.meanDiff), heat(r.meanDiff, 1500)),
          td(pct(r.winRate), heat((r.winRate ?? 0.5) - 0.5, 0.15)),
          td(num(r.meanGames)),
          td(formatSigned(r.upliftDiffVsNormal), heat(r.upliftDiffVsNormal, 1500)),
          td(pctPt(r.upliftWinVsNormal), heat(r.upliftWinVsNormal, 0.12)),
        ])
      )}`
    )
    .join("\n")}</section>`);

  // シリーズ
  sections.push(`<section><h2>注目機種シリーズ × イベント日</h2>
${a.series
    .map((s) => {
      if (!s.nDays) return `<h3>${esc(s.name)}</h3><p>データ無し</p>`;
      const rows = s.byEvent.map((e) => [
        td(esc(e.label)),
        td(e.win.nEvent),
        td(formatSigned(e.diff.uplift), heat(e.diff.uplift, 2000)),
        td(pv(e.diff.p)),
        td(pct(e.win.meanEvent)),
        td(pctPt(e.win.uplift), heat(e.win.uplift, 0.15)),
        td(pv(e.win.p)),
        td(
          e.byYear
            .filter((y) => y.nEvent > 0)
            .map((y) => `${y.y}: ${pctPt(y.upliftWin)} (n=${y.nEvent})`)
            .join("<br>")
        ),
      ]);
      return `<h3>${esc(s.name)}（${s.nDays}日、平均${num(s.avgCount, 1)}台、通常時勝率 ${pct(s.winRate)}）</h3>
${table(["イベント", "n", "差枚uplift", "p", "イベ日勝率", "勝率uplift", "p", "年別 勝率uplift"], rows)}`;
    })
    .join("\n")}</section>`);

  // 凹み
  const hole = a.hole;
  const holeTable = (label, rows) =>
    `<h3>${label}</h3>${table(
      ["直近" + hole.config.window + "日合計", "範囲", "n", "当日勝率", "当日平均差枚"],
      rows.map((r) => [td(r.bucket), td(esc(r.range)), td(r.n), td(pct(r.winRate), heat((r.winRate ?? 0.5) - 0.5, 0.15)), td(formatSigned(r.meanDiff), heat(r.meanDiff, 1500))])
    )}`;
  sections.push(`<section><h2>凹み台の扱い（台番が取れているデータのみ、n=${num(hole.nSamples)}）</h2>
${holeTable("全日", hole.allDays)}
${holeTable("イベント日のみ", hole.eventDays)}
${holeTable("通常日のみ", hole.normalDays)}
<p class="note">「大凹みの台がイベント日に勝率が跳ねる」なら凹み台救済の傾向あり。逆に差がなければ末尾や機種で選ぶ方がよい。</p></section>`);

  // 入替
  const lineupEvents = [...a.lineup.events].sort((x, y) => (x.date < y.date ? 1 : -1));
  sections.push(`<section><h2>新台・増台・撤去の検知（設置構成の変化から自動検出）</h2>
${table(
    ["日付", "種別", "機種", "台数", "導入後7日 勝率/差枚", "8〜37日 勝率/差枚"],
    lineupEvents.slice(0, 80).map((e) => {
      const intro = a.lineup.intro.find((i) => i.date === e.date && i.model === e.model);
      return [
        td(esc(e.date)),
        td(`<b>${esc(e.kind)}</b>`),
        td(esc(e.model)),
        td(`${e.from}→${e.to}`),
        td(intro ? `${pct(intro.firstWeek.winRate)} / ${formatSigned(intro.firstWeek.meanDiff)}` : "-"),
        td(intro ? `${pct(intro.later.winRate)} / ${formatSigned(intro.later.meanDiff)}` : "-"),
      ];
    })
  )}
<p class="note">データ欠損日を跨いだ変化もここに出るため、実際の入替日と1〜2日ずれることがある。直近80件のみ表示（全件は data/analysis.json）。</p></section>`);

  // 記念日
  const ann = a.anniversaries;
  sections.push(`<section><h2>キャラ誕生日・記念日</h2>
<h3>設定した仮説（config.mjs の anniversaries）</h3>
${table(
    ["仮説", "月日", "n", "平均差枚", "シリーズ平常時", "勝率"],
    ann.explicit.map((r) => [td(esc(r.label)), td(r.monthDay), td(r.n), td(formatSigned(r.meanDiff), heat(r.meanDiff - (r.baselineDiff ?? 0), 2000)), td(formatSigned(r.baselineDiff)), td(pct(r.winRate))])
  )}
<h3>自動スキャン: シリーズ別に突出した（月,日）トップ25</h3>
${table(
    ["シリーズ", "月日", "n", "平均差枚", "uplift", "勝率"],
    ann.autoScan.map((r) => [td(esc(r.series)), td(esc(r.monthDay)), td(r.n), td(formatSigned(r.meanDiff)), td(formatSigned(r.uplift), heat(r.uplift, 3000)), td(pct(r.winRate))])
  )}
<p class="note">自動スキャンは「3のつく日」等のイベント日と重なるものも混ざる。n が小さいものは話半分に。</p></section>`);

  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(config.storeName)} 分析レポート</title>
<style>
body{font-family:"Hiragino Sans","Noto Sans JP",sans-serif;margin:16px auto;max-width:1100px;padding:0 12px;color:#222;background:#fafafa}
h1{font-size:1.4rem}h2{font-size:1.15rem;border-left:4px solid #c00;padding-left:8px;margin-top:2em}h3{font-size:1rem;margin:1em 0 .3em}
table{border-collapse:collapse;font-size:.82rem;margin:.4em 0;background:#fff}
th,td{border:1px solid #ddd;padding:3px 8px;text-align:right;white-space:nowrap}
th{background:#f0f0f0}td:first-child,th:first-child{text-align:left}
.note{color:#666;font-size:.8rem}
.spark{display:flex;align-items:flex-end;gap:2px;height:46px;margin:4px 0 12px}
.bar{width:8px;min-height:2px}.bar.pos{background:#dc3545}.bar.neg{background:#0d6efd}.bar.na{background:#ccc}
details{margin:.3em 0}summary{cursor:pointer;font-size:.85rem}
footer{margin:2em 0;color:#888;font-size:.75rem}
</style></head><body>
<h1>${esc(config.storeName)} 設定狙い分析レポート</h1>
<p class="note">生成: ${esc(generatedAt)} ／ データ出典: min-repo.com（独自調査値）。私的な分析用途のみ。レポートや元データの転載はしないこと。</p>
${sections.join("\n")}
<footer>このレポートは tools/minrepo の自動生成。仮説の追加・変更は config.mjs を編集して <code>node tools/minrepo/run.mjs report</code>。</footer>
</body></html>`;
}

/** 上位の発見を Markdown ダイジェストにする */
export function renderMarkdown(analysis, config, generatedAt) {
  const a = analysis;
  const lines = [];
  lines.push(`# ${config.storeName} 分析ダイジェスト`);
  lines.push(`生成: ${generatedAt} ／ 範囲: ${a.coverage.from} 〜 ${a.coverage.to}（${a.coverage.nDays}日）`);
  lines.push("");
  lines.push("## イベント日仮説");
  lines.push("| 仮説 | n | 勝率(イベ/通常) | 勝率uplift | p | 差枚uplift | 直近6か月 |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const g of a.eventGroups) {
    lines.push(
      `| ${g.label} | ${g.win.nEvent} | ${pct(g.win.meanEvent)} / ${pct(g.win.meanRest)} | ${pctPt(g.win.uplift)} | ${g.win.p == null ? "-" : g.win.p.toFixed(3)} | ${formatSigned(g.diff.uplift)} | ${g.recent ? g.recent.verdict : "-"} |`
    );
  }
  lines.push("");
  const strongDays = a.byDayOfMonth.filter((r) => r.n >= 5 && r.upliftWin != null).sort((x, y) => y.upliftWin - x.upliftWin);
  lines.push("## 勝率が高い日トップ5 / ワースト3");
  for (const r of strongDays.slice(0, 5)) lines.push(`- ${r.d}日: 勝率 ${pct(r.winRate)}（uplift ${pctPt(r.upliftWin)}, n=${r.n}, p=${r.pWin == null ? "-" : r.pWin.toFixed(3)}）`);
  for (const r of strongDays.slice(-3)) lines.push(`- ${r.d}日: 勝率 ${pct(r.winRate)}（uplift ${pctPt(r.upliftWin)}, n=${r.n}）`);
  lines.push("");
  lines.push("## 日付末尾一致");
  const dt = a.suffix.dateTailMatch;
  lines.push(`- n=${dt.n}日, 差枚Δ ${formatSigned(dt.meanDeltaDiff)} (p=${dt.pDiff == null ? "-" : dt.pDiff.toFixed(3)}), 勝率Δ ${pctPt(dt.meanDeltaWin)} (p=${dt.pWin == null ? "-" : dt.pWin.toFixed(3)})`);
  lines.push("");
  lines.push("## シリーズ×イベントの見どころ（勝率uplift ±3pt 以上 or p<0.1）");
  for (const s of a.series) {
    if (!s.nDays) continue;
    for (const e of s.byEvent || []) {
      const u = e.win.uplift;
      if (u == null) continue;
      if (Math.abs(u) >= 0.03 || (e.win.p != null && e.win.p < 0.1)) {
        lines.push(`- ${s.name} × ${e.label}: 勝率uplift ${pctPt(u)} (n=${e.win.nEvent}, p=${e.win.p == null ? "-" : e.win.p.toFixed(3)}), 差枚uplift ${formatSigned(e.diff.uplift)}`);
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
