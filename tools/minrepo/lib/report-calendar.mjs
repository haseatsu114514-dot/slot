// 営業カレンダー分析（全台・日単位）のレポート部品。純粋関数のみ。

import { formatSigned, toDateParts } from "./util.mjs";
import { esc, pct, pctPt, num, pv, heat, table, td, chip } from "./html.mjs";
import { upcomingCalendar } from "./calendar.mjs";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function dateLabel(date) {
  const p = toDateParts(date);
  return p ? `${p.m}/${p.d}(${WEEKDAYS[p.weekday]})` : esc(date);
}

function verdictChip(verdict) {
  const kind = verdict === "放出寄り" ? "good" : verdict === "やや放出" ? "warn" : verdict === "回収寄り" ? "bad" : "gray";
  return chip(esc(verdict), kind);
}

const pText = (p) => (p == null ? "-" : p.toFixed(3));

/** 結論サマリーに差し込むカード */
export function calendarSummaryCard(a) {
  const c = a.calendar;
  if (!c || !c.available) {
    return `<div class="card"><h3>出す日・回収する日（全台）</h3><ul class="plain"><li>${chip("データ待ち", "gray")} ${esc(c ? c.reason : "未分析")}</li></ul></div>`;
  }
  const judged = c.tags.filter((t) => t.verdict !== "データ不足" && t.diff.uplift != null);
  const line = (t) => `<li>${verdictChip(t.verdict)} <b>${esc(t.label)}</b> — 他の日より <b>${formatSigned(t.diff.uplift)}枚</b>/台<br><span class="sub">${t.nDays}日・p=${pText(t.diff.p)}・勝率 ${pctPt(t.win.uplift)}・稼働 ${formatSigned(t.games.uplift)}G</span></li>`;
  const release = judged.filter((t) => t.diff.uplift > 0 && t.diff.p != null && t.diff.p < 0.2).sort((x, y) => x.diff.p - y.diff.p).slice(0, 3);
  const recovery = judged.filter((t) => t.diff.uplift < 0 && t.diff.p != null && t.diff.p < 0.2).sort((x, y) => x.diff.p - y.diff.p).slice(0, 3);
  const lines = [];
  lines.push(release.length ? release.map(line).join("") : `<li>${chip("該当なし", "gray")} はっきり出している日の種類はまだ見つからない</li>`);
  lines.push(recovery.length ? recovery.map(line).join("") : `<li>${chip("該当なし", "gray")} はっきり回収している日の種類はまだ見つからない</li>`);
  const ar = c.recovery.afterRelease;
  if (ar.uplift != null && ar.nIn >= 5) {
    lines.push(`<li>${chip(ar.uplift < 0 && ar.p != null && ar.p < 0.1 ? "翌日は回収" : "翌日の傾向なし", ar.uplift < 0 && ar.p != null && ar.p < 0.1 ? "bad" : "gray")} <b>大きく出した日の翌日</b> — ${formatSigned(ar.uplift)}枚/台<span class="sub">（${ar.nIn}日・p=${pText(ar.p)}）</span></li>`);
  }
  return `<div class="card"><h3>出す日・回収する日（全台）</h3><ul class="plain">${lines.join("")}</ul><p class="note">スマスロを含む全台の平均差枚で比較。詳細と今後2週間の見通しは「<a href="#cal">営業日</a>」へ。</p></div>`;
}

/** 営業カレンダーのセクション。戻り値: { id, nav, html } */
export function calendarSection(a, config, meta) {
  const c = a.calendar;
  if (!c || !c.available) {
    return {
      id: "cal",
      nav: "営業日",
      html: `<section id="cal"><h2>出す日・回収する日（全台の営業カレンダー）</h2><p class="desc">${esc(c ? c.reason : "未分析")}</p>
<p class="note">日ごとのデータが貯まると、年金支給日・給料日・連休・入替前後・イベント前後・手入力した景品示唆/おすすめ期間ごとに、店全体が出しているか回収しているかを比べる。</p></section>`,
    };
  }
  const diffScale = Math.max(100, Math.abs(c.recovery.highCut ?? 300));
  const gScale = Math.max(150, (c.overall.avgGames ?? 3000) * 0.12);

  // 今後2週間
  const upcoming = upcomingCalendar(c, config, meta.today, 14);
  const upRows = upcoming.map((u) => [
    td(`<b>${dateLabel(u.date)}</b>`),
    td(verdictChip(u.outlook)),
    td(
      u.tags.length
        ? u.tags
            .map((t) => {
              const s = t.uplift == null ? "実績なし" : `${formatSigned(t.uplift)}枚・${t.nDays}日・p=${pText(t.p)}`;
              const strong = t.verdict === "放出寄り" || t.verdict === "回収寄り";
              return `${strong ? "<b>" : ""}${esc(t.label)}${strong ? "</b>" : ""}<span class="dim">（${s}）</span>`;
            })
            .join("<br>")
        : '<span class="dim">特になし</span>',
      ' class="l"'
    ),
  ]);

  // 日の種類別
  const tagRows = c.tags.map((t) => [
    td(`<b>${esc(t.label)}</b><br><span class="sub">${esc(t.group)}</span>`),
    td(t.nDays),
    td(`${formatSigned(t.diff.meanIn)} / ${formatSigned(t.diff.meanOut)}`),
    td(formatSigned(t.diff.uplift), heat(t.diff.uplift, diffScale)),
    td(pv(t.diff.p)),
    td(formatSigned(t.upliftDiffWeekdayAdj), heat(t.upliftDiffWeekdayAdj, diffScale)),
    td(pctPt(t.win.uplift), heat(t.win.uplift, 0.1)),
    td(pv(t.win.p)),
    td(formatSigned(t.games.uplift), heat(t.games.uplift, gScale)),
    td(pv(t.games.p)),
    td(pct(t.recoveryRate, 0), heat(t.recoveryRate == null ? null : -(t.recoveryRate - c.recovery.quantile), 0.4)),
    td(pct(t.releaseRate, 0), heat(t.releaseRate == null ? null : t.releaseRate - c.recovery.quantile, 0.4)),
    td(t.recentUpliftDiff == null ? "-" : `${formatSigned(t.recentUpliftDiff)}<span class="dim">（${t.recentN}日）</span>`, heat(t.recentUpliftDiff, diffScale)),
    td(verdictChip(t.verdict)),
  ]);

  // 回収日・放出日
  const r = c.recovery;
  const after = (label, s) =>
    `<li><b>${label}</b>: 翌日の平均差枚 ${formatSigned(s.meanIn)}（それ以外の日の翌日 ${formatSigned(s.meanOut)}）・差 <b>${formatSigned(s.uplift)}</b>・${s.nIn}日・p=${pText(s.p)}</li>`;
  const dayList = (list) =>
    table(
      ["日付", "平均差枚", "勝率", "平均G数", "日の種類"],
      list.map((d) => [td(`${esc(d.date)}(${WEEKDAYS[toDateParts(d.date).weekday]})`), td(formatSigned(d.avgDiff), heat(d.avgDiff, diffScale)), td(pct(d.winRate)), td(num(d.avgGames)), td(d.tags.length ? d.tags.map(esc).join("・") : '<span class="dim">特になし</span>', ' class="l"')])
    );

  // カテゴリ別
  const catHead = table(
    ["分類", "延べ台数", "平均差枚", "勝率", "平均G数"],
    c.categories.map((k) => [td(`<b>${esc(k.name)}</b>`), td(num(k.samples)), td(formatSigned(k.avgDiff), heat(k.avgDiff, diffScale)), td(pct(k.winRate), heat((k.winRate ?? 0.5) - 0.5, 0.15)), td(num(k.avgGames))]),
    { sortable: false }
  );
  const matrixTags = c.tags.filter((t) => t.nDays >= 4);
  const catMatrix = table(
    ["日の種類", "日数", ...c.categories.map((k) => `${esc(k.name)} 勝率差`), ...c.categories.map((k) => `${esc(k.name)} 差枚差`)],
    matrixTags.map((t) => {
      const cells = c.categories.map((k) => k.byTag.find((x) => x.key === t.key));
      return [
        td(`<b>${esc(t.label)}</b>`),
        td(t.nDays),
        ...cells.map((x) => td(x && x.upliftWin != null ? `${pctPt(x.upliftWin)}${x.pWin != null && x.pWin < 0.05 ? " ★" : ""}` : "-", heat(x ? x.upliftWin : null, 0.1))),
        ...cells.map((x) => td(x ? formatSigned(x.upliftDiff) : "-", heat(x ? x.upliftDiff : null, diffScale * 1.5))),
      ];
    })
  );

  // 対象機種つきの期間メモ
  const targetRows = c.targets.map((t) =>
    t.error
      ? [td(`<b>${esc(t.kind)}</b>`), td(esc(t.target)), td(esc(t.error), ' class="l"'), td("-"), td("-"), td("-"), td("-"), td("-"), td("-")]
      : [
          td(`<b>${esc(t.kind)}</b>`),
          td(esc(t.target)),
          td(t.models.map(esc).join("、") || "該当機種なし", ' class="l"'),
          td(`${t.nDays} / ${t.nPeriodDays}`),
          td(`${pct(t.win.meanIn)} / ${pct(t.win.meanOut)}`),
          td(pctPt(t.win.uplift), heat(t.win.uplift, 0.12)),
          td(pv(t.win.p)),
          td(formatSigned(t.diff.uplift), heat(t.diff.uplift, diffScale * 2)),
          td(`${pctPt(t.gap.uplift)}（p=${pText(t.gap.p)}）`, heat(t.gap.uplift, 0.12)),
        ]
  );

  // 現地メモ（台単位）
  const unitRows = c.unitTags.map((g) => [
    td(`<b>${esc(g.tag)}</b>`),
    td(g.nObs),
    td(g.nDays),
    td(g.nMatched),
    td(formatSigned(g.meanDiff), heat(g.meanDiff, 1500)),
    td(formatSigned(g.dDiff), heat(g.dDiff, 1500)),
    td(pv(g.pDiff)),
    td(pct(g.winRate)),
    td(g.byCategory.map((k) => `${esc(k.name)}: ${k.n}台 ${formatSigned(k.dDiff)}枚`).join("<br>") || "-", ' class="l"'),
    td(esc(g.lastDate)),
  ]);

  const modelBlocks = c.modelsByTag
    .map((m) => {
      const rows = (list) =>
        list.map((x) => [td(esc(x.model)), td(esc(x.category ?? "-")), td(x.nDays), td(num(x.samples)), td(pct(x.winRate)), td(pctPt(x.upliftWin), heat(x.upliftWin, 0.15)), td(pv(x.p)), td(formatSigned(x.upliftDiff), heat(x.upliftDiff, diffScale * 3))]);
      return `<details><summary>${esc(m.label)}（${m.nDays}日・対象 ${m.nModels}機種）</summary>
${table(["機種", "分類", "日数", "延べ台数", "その日の勝率", "ふだんとの差", "p", "差枚の差"], [...rows(m.top), ...rows(m.bottom.filter((b) => !m.top.some((x) => x.model === b.model)))])}</details>`;
    })
    .join("\n");

  const html = `<section id="cal"><h2>出す日・回収する日（全台の営業カレンダー） <span class="dim">（${esc(c.from)}〜${esc(c.to)}・${c.nDays}日）</span></h2>
<p class="desc">スマスロを含む<b>全台</b>について、日の種類ごとに店全体の平均差枚・勝率・稼働を比べる。設定が直接は分からない機種でも、
「どういう日に出して、どういう日に回収しているか」は束ねれば見える。全期間の平均: 差枚 ${formatSigned(c.overall.avgDiff)}枚/台・勝率 ${pct(c.overall.winRate)}・${num(c.overall.avgGames)}G/台。</p>
<h3>今後2週間の見通し（${dateLabel(meta.today)}〜）</h3>
${table(["日付", "見通し", "その日の種類（過去の実績）"], upRows, { sortable: false })}
<p class="note">「見通し」は下の表で裏付けのあった種類（太字）を足し引きしただけの目安。景品示唆やおすすめ期間は <code>calendar.csv</code> に先の日付で書いておくと反映される。</p>
<h3>日の種類別（全台）</h3>
${table(["日の種類", "日数", "平均差枚(該当/他)", "差", "p", "曜日調整後の差", "勝率の差", "p", "稼働の差(G)", "p", "回収日になる率", "放出日になる率", "直近180日の差", "判定"], tagRows)}
<p class="note">「差」= その種類の日 − それ以外の日（1台あたり枚数）。「曜日調整後」= 曜日ごとの平均を引いてから比べた差（土日に重なりやすい種類の見かけの効果を除く）。
「回収日/放出日になる率」は基準 ${pct(c.recovery.quantile, 0)} と比べる。年金支給日は年 6 回しか無いので、1 年ぶんでは判定がつきにくい。
稼働が増えているのに差枚・勝率が下がる種類は「客は来るが店は回収」の日。
種類どうしは重なる（お盆と 8 月の年金支給日など）ので、片方だけが効いている場合もある。日数の多い方・曜日調整後も残る方を信じる。</p>
<h3>回収日・放出日の出方</h3>
<p class="desc">回収日 = 平均差枚が下位 ${pct(r.quantile, 0)} の日（${formatSigned(r.lowCut)}枚/台以下）、放出日 = 上位 ${pct(r.quantile, 0)} の日（${formatSigned(r.highCut)}枚/台以上）。</p>
<ul>
${after("大きく出した日（放出日）の翌日", r.afterRelease)}
${after("大きく回収した日（回収日）の翌日", r.afterRecovery)}
<li>前日と当日の平均差枚の相関: <b>${r.lagCorr == null ? "-" : r.lagCorr.toFixed(2)}</b>（マイナスなら「出した翌日は締める」、プラスなら「出す時期・締める時期が続く」）</li>
</ul>
<details><summary>直近90日でいちばん回収された10日</summary>${dayList(r.worstRecent)}</details>
<details><summary>直近90日でいちばん出た10日</summary>${dayList(r.bestRecent)}</details>
<h3>機種の分類別（スマスロ / ジャグラー・ハナハナ / その他）</h3>
${catHead}
${catMatrix}
<p class="note">その種類の日に、分類ごとの勝率・平均差枚がふだんとどれだけ違うか。★ = p&lt;0.05。「イベント日はスマスロだけ」「入替日はジャグラーにも入る」のような使い分けを見る。分類は <code>config.mjs</code> の <code>calendar.categories</code>。</p>
<h3>おすすめ期間など（対象機種つきのメモ）</h3>
${
    c.targets.length
      ? table(["種類", "対象", "該当した機種", "データ日数/期間", "対象機種の勝率(期間中/ふだん)", "差", "p", "差枚の差", "他機種との差の変化"], targetRows)
      : `<p>${chip("記録待ち", "gray")} <code>calendar.csv</code> に <code>2026-11-10,2026-11-16,おすすめ週間,北斗|カバネリ,</code> のように期間と対象機種を書くと、対象機種が期間中に強かったかを検証する。</p>`
  }
<p class="note">「他機種との差の変化」= (対象機種 − それ以外) の勝率差が、期間中にふだんよりどれだけ広がったか。店全体が出している時期と重なっただけ、という見かけの効果を除いた数字。</p>
<h3>景品示唆・札などの現地メモ（台単位・全機種）</h3>
${
    c.unitTags.length
      ? table(["タグ", "記録数", "日数", "照合できた数", "平均差枚", "同日の他台との差", "p", "勝率", "分類別", "最終記録"], unitRows)
      : `<p>${chip("記録待ち", "gray")} <code>observations.csv</code> に <code>日付,台番,タグ</code> を書くと、その台が同じ日の他の台より出たかを全機種で検証する（スマスロは差枚で比較）。日単位の示唆（カウンターの景品など）は <code>calendar.csv</code> へ。</p>`
  }
<p class="note">景品の種類ごとにタグを分けて書く（例: <code>景品A</code> <code>景品B</code>）と、どの景品が本物の示唆かを別々に検証できる。結果を見てから書くと必ず当たって見えるので、朝のうちに記録すること。</p>
<h3>日の種類 × 機種（その日に強い機種・弱い機種）</h3>
<p class="desc">いま設置されている機種のうち、その種類の日に勝率がふだんより上がる機種の上位と下位。機種×種類を大量に見比べているので、p の小さいものでも偶然が混ざる。日数と延べ台数の多いものを優先。</p>
${modelBlocks || "<p>データ不足</p>"}</section>`;
  return { id: "cal", nav: "営業日", html };
}

/** Markdown ダイジェストに足す行 */
export function calendarMarkdown(a) {
  const c = a.calendar;
  const lines = ["## 出す日・回収する日（全台）"];
  if (!c || !c.available) {
    lines.push(`- データ待ち: ${c ? c.reason : "未分析"}`, "");
    return lines;
  }
  lines.push("| 日の種類 | 日数 | 差枚の差 | p | 勝率の差 | 稼働の差 | 判定 |", "|---|---|---|---|---|---|---|");
  for (const t of c.tags.filter((x) => x.verdict !== "データ不足")) {
    lines.push(`| ${t.label} | ${t.nDays} | ${formatSigned(t.diff.uplift)} | ${pText(t.diff.p)} | ${pctPt(t.win.uplift)} | ${formatSigned(t.games.uplift)}G | ${t.verdict} |`);
  }
  const r = c.recovery;
  lines.push("", `- 放出日の翌日: ${formatSigned(r.afterRelease.uplift)}枚（${r.afterRelease.nIn}日, p=${pText(r.afterRelease.p)}）／ 回収日の翌日: ${formatSigned(r.afterRecovery.uplift)}枚（${r.afterRecovery.nIn}日, p=${pText(r.afterRecovery.p)}）`);
  for (const t of c.targets.filter((x) => !x.error)) lines.push(`- ${t.kind}（対象 ${t.target}）: 対象機種の勝率 ${pctPt(t.win.uplift)}（p=${pText(t.win.p)}）・他機種との差の変化 ${pctPt(t.gap.uplift)}（p=${pText(t.gap.p)}）`);
  for (const g of c.unitTags) lines.push(`- 現地メモ「${g.tag}」: ${g.nObs}件・同日の他台との差 ${formatSigned(g.dDiff)}枚（p=${pText(g.pDiff)}）`);
  lines.push("");
  return lines;
}
