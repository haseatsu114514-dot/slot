// ジャグラー/ハナハナ（Aタイプ）設定推定のレポート部品。純粋関数のみ。
// report.mjs から呼ばれ、結論カード・各セクション・設定判別電卓（オフライン動作）を返す。

import { formatSigned, toDateParts } from "./util.mjs";
import { esc, pct, pctPt, num, pv, heat, table, td, chip } from "./html.mjs";
import { ATYPE_SPECS } from "./specs.mjs";
import { ATYPE_DEFAULTS } from "./atype.mjs";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const SET_COLORS = ["#90a4ae", "#b0bec5", "#ffe082", "#ffb74d", "#ff8a65", "#e53935"];

function dateLabel(date) {
  const p = toDateParts(date);
  return p ? `${p.m}/${p.d}(${WEEKDAYS[p.weekday]})` : esc(date);
}

function mixBar(pi) {
  if (!pi) return "-";
  const segs = pi
    .map((v, s) => `<span style="width:${(v * 100).toFixed(1)}%;background:${SET_COLORS[s]}" title="設定${s + 1}: ${(v * 100).toFixed(1)}%"></span>`)
    .join("");
  return `<div class="mixbar">${segs}</div>`;
}

function mixLegend() {
  return `<p class="note">${SET_COLORS.map((c, s) => `<span class="sw" style="background:${c}"></span>設定${s + 1}`).join(" ")}</p>`;
}

const payoutCell = (v) => td(v == null ? "-" : `${(v * 100).toFixed(1)}%`, heat(v == null ? null : v - 1, 0.06));

/**
 * 効果の大きさ（同日比Δq など）と p から、仮説の効き具合を言葉にする。
 * minEffect: これ未満の差は p が小さくても「効いてる」と言わない（サンプルが多いと微差でも有意になるため）。
 * 「むしろ逆」は minEffect の 2 倍以上のマイナスに限る（どれかの条件が強いと、他の条件は相対的に少しマイナスに見えるだけなので）。
 */
function effectChip(effect, p, n, minEffect = 0.03) {
  if (effect == null || p == null || !n) return chip("データ不足", "gray");
  if (effect >= minEffect && p < 0.05) return chip("効いてる", "good");
  if (effect > 0 && p < 0.2) return chip("弱い傾向", "warn");
  if (effect <= -2 * minEffect && p < 0.05) return chip("むしろ逆", "bad");
  return chip("差は確認できず", "gray");
}

/** q の差を評価するときの最小効果量: 全体平均 q の 2 割（下限 3pt） */
const minQ = (t) => Math.max(0.03, 0.2 * (t.baseQ ?? 0));

/** 凹み系の条件のうち、いちばん裏付けの強いもの（無ければ直近7日の大凹み） */
function bestHole(t) {
  const cands = [
    { label: `前日 ${t.hole.prev1[0].bucket}`, row: t.hole.prev1[0] },
    { label: `直近7日合計 ${t.hole.prev7[0].bucket}`, row: t.hole.prev7[0] },
    { label: t.hole.streak[t.hole.streak.length - 1].bucket, row: t.hole.streak[t.hole.streak.length - 1] },
  ].filter((c) => c.row && c.row.n > 0);
  const positive = cands.filter((c) => c.row.dq > 0 && c.row.p != null).sort((a, b) => a.row.p - b.row.p || b.row.dq - a.row.dq);
  return positive[0] || cands[1] || cands[0] || null;
}

function verdictChip(verdict) {
  const kind = verdict === "裏付けあり" ? "good" : verdict === "弱い裏付け" ? "warn" : verdict === "裏付けなし" ? "bad" : "gray";
  return chip(esc(verdict), kind);
}

function bucketRows(rows, minEffect) {
  return rows.map((r) => [
    td(`<b>${esc(r.bucket)}</b>`),
    td(num(r.n)),
    td(pct(r.high), heat(r.high == null ? null : r.high - 0.15, 0.3)),
    td(pct(r.meanQ)),
    td(pctPt(r.dq), heat(r.dq, 0.06)),
    td(pv(r.p)),
    td(formatSigned(r.meanDiff), heat(r.meanDiff, 800)),
    td(formatSigned(r.dDiff), heat(r.dDiff, 600)),
    payoutCell(r.payout),
    td(effectChip(r.dq, r.p, r.n, minEffect)),
  ]);
}

const BUCKET_HEADERS = ["条件", "台×日", "高設定率", "平均q", "同日比Δq", "p", "平均差枚", "同日比Δ差枚", "出率", "判定"];

function dayGroupRows(rows, minEffect) {
  return rows.map((r) => [
    td(`<b>${esc(r.label)}</b>`),
    td(r.nDays),
    td(num(r.n)),
    td(`${pct(r.high)} / ${pct(r.highRest)}`),
    td(pctPt(r.upliftQ), heat(r.upliftQ, 0.06)),
    td(pv(r.p)),
    td(`${formatSigned(r.meanDiff)} / ${formatSigned(r.meanDiffRest)}`),
    td(`${r.payout == null ? "-" : (r.payout * 100).toFixed(1) + "%"} / ${r.payoutRest == null ? "-" : (r.payoutRest * 100).toFixed(1) + "%"}`, heat(r.payout == null || r.payoutRest == null ? null : r.payout - r.payoutRest, 0.04)),
    td(effectChip(r.upliftQ, r.p, r.nDays, minEffect)),
  ]);
}

const DAY_HEADERS = ["日の種類", "日数", "台×日", "高設定率(該当/他)", "平均q uplift", "p", "平均差枚(該当/他)", "出率(該当/他)", "判定"];

/** 結論サマリーに差し込むカード */
export function atypeSummaryCard(a) {
  const t = a.atype;
  if (!t || !t.available) {
    return `<div class="card"><h3>ジャグラー・ハナハナ 設定推定</h3><ul class="plain"><li>${chip("データ待ち", "gray")} ${esc(t ? t.reason : "未分析")}</li>
<li class="sub">台番別の 総G・BIG・REG が貯まると、設定配分の推定・凹み台/入替日/示唆景品の検証・翌日の狙い台が出る。<a href="#atype">設定推定</a> の説明を参照。</li></ul></div>`;
  }
  const lines = [];
  const ci = t.mix.highCi;
  lines.push(
    `<li>推定 <b>高設定率（設定${t.config.highFrom}以上）${pct(t.mix.high)}</b>${ci && ci.lo != null ? `（90%区間 ${pct(ci.lo)}〜${pct(ci.hi)}）` : ""}<br><span class="sub">実測出率 ${t.all.payout == null ? "-" : (t.all.payout * 100).toFixed(1) + "%"}・${num(t.coverage.nEstimated)}台×日（${t.coverage.nDays}日）・根拠 BIG/REG ${num(t.coverage.basisCounts.counts)}件 / 差枚のみ ${num(t.coverage.basisCounts.diff)}件</span></li>`
  );
  const mq = minQ(t);
  const bh = bestHole(t);
  if (bh) {
    const h = bh.row;
    lines.push(`<li>${effectChip(h.dq, h.p, h.n, mq)} <b>凹み台（${esc(bh.label)}）</b> — 当日の高設定率 ${pct(h.high)}（全体 ${pct(t.mix.high)}）・同日比 ${pctPt(h.dq)}<br><span class="sub">${num(h.n)}台×日・p=${h.p == null ? "-" : h.p.toFixed(3)}　<a href="#ahole">詳細</a></span></li>`);
  }
  const rep = t.replacement.offsets.find((o) => o.label === "入替当日");
  if (rep && rep.nDays > 0) lines.push(`<li>${effectChip(rep.upliftQ, rep.p, rep.nDays, mq)} <b>入替当日</b> — 高設定率 ${pct(rep.high)}（他の日 ${pct(rep.highRest)}）<br><span class="sub">${rep.nDays}日・p=${rep.p == null ? "-" : rep.p.toFixed(3)}</span></li>`);
  else lines.push(`<li>${chip("データ不足", "gray")} <b>入替日</b> — まだ検知・登録なし</li>`);
  if (t.tags.length) {
    for (const g of t.tags.slice(0, 2)) lines.push(`<li>${effectChip(g.dDiff, g.pDiff, g.nMatched, 300)} <b>${esc(g.tag)}</b> — 同日比 ${formatSigned(g.dDiff)}枚・記録 ${g.nObs}件</li>`);
  } else lines.push(`<li>${chip("記録待ち", "gray")} <b>示唆景品</b> — observations.csv に記録を始めると検証される</li>`);
  const top = t.picks.rows.slice(0, 3).map((r) => `<b>${r.unit}</b>`).join("・");
  lines.push(`<li>${verdictChip(t.backtest.verdict)} <b>${dateLabel(t.picks.targetDate)} の狙い台</b>: ${top || "-"}　<a href="#picks">一覧へ</a></li>`);
  return `<div class="card"><h3>ジャグラー・ハナハナ 設定推定</h3><ul class="plain">${lines.join("")}</ul></div>`;
}

function unavailableSection(t, config) {
  const unknown = t && t.unknownModels && t.unknownModels.length ? `<p class="note">スペック未登録で除外した機種: ${t.unknownModels.map((u) => `${esc(u.model)}（${u.n}件）`).join("、")} → <code>lib/specs.mjs</code> に追加すると対象になる。</p>` : "";
  return `<section id="atype"><h2>ジャグラー・ハナハナ 設定推定</h2>
<p class="desc">${esc(t ? t.reason : "未分析")}</p>
<ul>
<li>みんレポの機種別詳細（<code>?kishu=</code>）が取得できていれば、差枚とG数から自動で推定が始まる（<code>config.mjs</code> の <code>kishuDetail</code> と <code>seriesWatchlist</code> にジャグラー/ハナハナが入っていること）。</li>
<li>BIG・REG 回数が分かるとずっと正確になる。店の公式台データを見て <code>node tools/minrepo/run.mjs sheet</code> で作った <code>data/manual/counts.csv</code> に書き写すと統合される。</li>
<li>その場で1台だけ判別したいときは下の「<a href="#judge">設定判別</a>」が使える。</li>
</ul>${unknown}</section>`;
}

function judgeSection(t, config) {
  const options = ATYPE_SPECS.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  return `<section id="judge"><h2>設定判別（実戦用）</h2>
<p class="desc">打っている台・気になる台の 総G数・BIG・REG を入れると、設定1〜6 の確率を出す（通信なしで動く）。
データカウンタの数字をそのまま入れればよい。ぶどう/ベルは自分で数えたときだけ入れる。</p>
<div class="judge">
<label>機種<select id="jg-model">${options}</select></label>
<label>総G数<input id="jg-g" type="number" inputmode="numeric" min="0" placeholder="例 3200"></label>
<label>BIG<input id="jg-bb" type="number" inputmode="numeric" min="0" placeholder="例 13"></label>
<label>REG<input id="jg-rb" type="number" inputmode="numeric" min="0" placeholder="例 14"></label>
<label class="jg-grape"><span><span id="jg-grl">ぶどう</span>の回数（数えたときだけ）</span><input id="jg-gr" type="number" inputmode="numeric" min="0"></label>
<label class="jg-grape"><span>数えた間のG数（空なら総G数）</span><input id="jg-grg" type="number" inputmode="numeric" min="0"></label>
<label>前提<select id="jg-prior"><option value="store">この店の推定配分</option><option value="flat">全設定が同じ確率</option></select></label>
</div>
<div id="jg-out" class="jg-out"><p class="note">数字を入れると結果が出る。</p></div>
<p class="note">「この店の推定配分」= 低設定が多い店では、少し良い数字が出ても低設定の上振れである可能性が高い、という事情を織り込む前提。
「全設定が同じ確率」は一般的な判別ツールと同じ前提（高設定を過大評価しやすい）。3,000G 未満は参考程度に。</p></section>`;
}

/** Aタイプ関連のセクション群。戻り値: [{ id, nav, html }] */
export function atypeSections(a, config, meta) {
  const t = a.atype;
  const out = [];
  if (!t || !t.available) {
    out.push({ id: "atype", nav: "A設定", html: unavailableSection(t, config) });
    out.push({ id: "judge", nav: "判別", html: judgeSection(t, config) });
    return out;
  }
  const hf = t.config.highFrom;
  const cov = t.coverage;
  const mq = minQ(t);

  // --- 設定配分 ---
  const unknown = t.unknownModels.length
    ? `<p class="note">${chip("注意", "warn")} スペック未登録で除外した機種: ${t.unknownModels.map((u) => `${esc(u.model)}（${u.n}件）`).join("、")} → <code>lib/specs.mjs</code> に追加すると対象になる。</p>`
    : "";
  const basisNote =
    cov.basisCounts.counts === 0
      ? `${chip("精度:粗", "warn")} BIG/REG 回数が無いため<b>差枚だけ</b>で推定している。1台1日の判定はかなり粗い（束ねた傾向だけ信用する）。公式台データの BIG/REG を <code>counts.csv</code> に写すと精度が上がる。`
      : `${chip("精度:良", "good")} ${num(cov.basisCounts.counts)}件は BIG/REG 回数から、${num(cov.basisCounts.diff)}件は差枚から推定。`;
  out.push({
    id: "atype",
    nav: "A設定",
    html: `<section id="atype"><h2>ジャグラー・ハナハナ 設定推定 <span class="dim">（${esc(cov.from)}〜${esc(cov.to)}・${cov.nDays}日・${num(cov.nEstimated)}台×日）</span></h2>
<p class="desc">設定ごとのボーナス確率・機械割（解析サイト掲載値）と、台ごとの結果（総G・BIG・REG・差枚）を突き合わせて、設定1〜6 の確率を計算している。
<b>q</b> = その台×日が設定${hf}以上である確率。<b>高設定率</b> = その条件の台×日だけで設定配分を推定し直したときの設定${hf}以上の割合。</p>
<p class="legend">${basisNote}${cov.nManual ? `<br>手入力データ ${num(cov.nManual)}件を統合済み。` : ""}</p>
<h3>店全体の推定設定配分</h3>
${mixBar(t.mix.pi)}${mixLegend()}
<p>低設定(1-2) <b>${pct(t.mix.low)}</b>・中間(3) <b>${pct(t.mix.mid)}</b>・高設定(${hf}以上) <b>${pct(t.mix.high)}</b>${t.mix.highCi.lo != null ? `（90%区間 ${pct(t.mix.highCi.lo)}〜${pct(t.mix.highCi.hi)}）` : ""}・うち設定5-6 <b>${pct(t.mix.top)}</b> ／ 実測出率 <b>${t.all.payout == null ? "-" : (t.all.payout * 100).toFixed(1) + "%"}</b>・平均差枚 ${formatSigned(t.all.meanDiff)}・平均 ${num(t.all.meanGames)}G</p>
<h3>機種別</h3>
${table(
      ["機種", "現在の台数", "台×日", "配分", "低(1-2)", "中(3)", `高(${hf}+)`, "5-6", "実測出率", "平均差枚", "平均G数"],
      t.byModel.map((m) => [
        td(`<b>${esc(m.name)}</b>${m.siteNames.some((n) => n !== m.name) ? `<br><span class="sub">${m.siteNames.map(esc).join(" / ")}</span>` : ""}`),
        td(m.nUnits),
        td(num(m.n)),
        td(mixBar(m.pi)),
        td(m.mix ? pct(m.mix.low) : "-"),
        td(m.mix ? pct(m.mix.mid) : "-"),
        td(m.mix ? pct(m.mix.high) : "-", heat(m.mix ? m.mix.high - t.mix.high : null, 0.2)),
        td(m.mix ? pct(m.mix.top) : "-"),
        payoutCell(m.payout),
        td(formatSigned(m.meanDiff), heat(m.meanDiff, 800)),
        td(num(m.meanGames)),
      ])
    )}
${unknown}
<p class="note">設定1と2、5と6 のように機械割が近い設定どうしは区別がつきにくいので、個々の割合より「低/中/高」のまとまりで見ること。
配分は「設定を毎日入れ直している」前提の平均像で、特定の日・特定の台の答えではない。</p></section>`,
  });

  // --- 狙い台 ---
  const bt = t.backtest;
  const stale = meta && meta.today && meta.today > t.picks.targetDate;
  const btRows = bt.results.map((r) => [
    td(`<b>上位${r.k}台</b>`),
    td(r.nDays),
    td(formatSigned(r.pickDiff), heat(r.pickDiff, 800)),
    td(formatSigned(r.allDiff)),
    td(formatSigned(r.edgeDiff), heat(r.edgeDiff, 600)),
    td(pv(r.pDiff)),
    td(pct(r.pickQ)),
    td(pctPt(r.edgeQ), heat(r.edgeQ, 0.06)),
    td(pv(r.pQ)),
    payoutCell(r.pickPayout),
    td(pct(r.pickWinRate)),
  ]);
  const reasonText = (list) => (list.length ? list.map((x) => `${esc(x.text)}<span class="dim">（その条件の高設定率 ${pct(x.rate)}・${num(x.n)}件）</span>`).join("<br>") : "-");
  out.push({
    id: "picks",
    nav: "狙い台",
    html: `<section id="picks"><h2>${dateLabel(t.picks.targetDate)} の狙い台 <span class="dim">（データ最終日 ${esc(t.latest.date)} の翌日・${esc(t.picks.eventLabel)}${t.picks.rep ? "・入替日" : ""}）</span></h2>
<p class="desc">下の各仮説（凹み・据え置き・日の種類・台番のクセ・機種）で実際に差が出たものを足し合わせて、台ごとに「高設定らしさ」を採点したランキング。
<b>必ず下の検証結果とセットで見ること</b>（検証で裏付けが無ければ、このランキングは運と変わらない）。</p>
${stale ? `<p class="legend">${chip("注意", "warn")} データが古い（最終日 ${esc(t.latest.date)}）。今日 ${esc(meta.today)} 向けには、先にデータを取得し直すこと。</p>` : ""}
<p class="legend">検証結果: ${verdictChip(bt.verdict)} ${
      bt.results.length && bt.results.some((r) => r.nDays > 0)
        ? `過去 ${bt.evalDays}日ぶん「その日より前のデータだけで選んだ台」の成績を確認（最初の${bt.warmupDays}日は学習のみ）。全台の実測出率 ${bt.allPayout == null ? "-" : (bt.allPayout * 100).toFixed(1) + "%"}。`
        : `検証に必要な日数がまだ足りない（学習 ${bt.warmupDays}日 + 検証 20日以上が必要。現在 ${bt.trainedDays}日）。`
    }</p>
${table(
      ["順位", "台番", "機種", "高設定らしさ", "プラス要因", "マイナス要因", "前日差枚", "7日合計", "連続マイナス", "前日のq"],
      t.picks.rows.map((r, i) => [
        td(i + 1),
        td(`<b>${r.unit}</b>`),
        td(esc(r.model)),
        td(pct(r.p), heat(r.p - (t.picks.baseRate ?? 0), 0.15)),
        td(reasonText(r.reasons), ' class="l"'),
        td(reasonText(r.cautions), ' class="l"'),
        td(formatSigned(r.prev1), heat(r.prev1, 2000)),
        td(formatSigned(r.prev7), heat(r.prev7, 5000)),
        td(r.streak == null ? "-" : `${r.streak}日`),
        td(pct(r.prevQ)),
      ]),
      { sortable: false }
    )}
<p class="note">「高設定らしさ」= その台が設定${hf}以上である見込み。条件なしの平均は ${pct(t.picks.baseRate)}（${t.picks.nCandidates}台中の上位 ${t.picks.rows.length}台を表示）。平均との差が小さいなら、台選びより「行く日選び」の方が効く。</p>
<h3>このランキングは過去に通用したか（ウォークフォワード検証）</h3>
${table(["選び方", "検証日数", "選んだ台の平均差枚", "全台の平均差枚", "差", "p", "選んだ台の平均q", "qの差", "p", "選んだ台の出率", "勝率"], btRows, { sortable: false })}
<p class="note">「差」がプラスで p が小さい（0.05未満）なら、ランキング上位は実際に全台平均より出ていた。p が大きい間は「まだ分からない」。
上位1台は運の振れが大きいので、上位3〜5台の行を主に見る。</p>
<details><summary>採点に使っている条件ごとの実績（高設定率の高い順）</summary>
${table(["条件", "台×日", "高設定率"], t.featureTable.map((f) => [td(esc(f.text), ' class="l"'), td(num(f.n)), td(pct(f.rate), heat(f.rate == null ? null : f.rate - (t.picks.baseRate ?? 0), 0.2))]))}
<p class="note">高設定率 = その条件の台×日だけで設定配分を推定した値（件数が少ない条件は全体の配分へ寄せてある）。日の種類（イベント日・入替日）は同じ日の全台に同じだけ効くので、台どうしの順位には影響しない。</p></details>
<details><summary>${dateLabel(t.latest.date)} の答え合わせ（台ごとの推定）</summary>
${table(
      ["台番", "機種", "G数", "BIG", "REG", "合成", "差枚", `設定${hf}以上`, "設定1〜6 の確率", "根拠"],
      t.latest.rows.map((r) => [
        td(`<b>${r.unit}</b>`),
        td(esc(r.model)),
        td(num(r.games)),
        td(r.bb ?? "-"),
        td(r.rb ?? "-"),
        td(r.games && r.bb != null && r.rb != null && r.bb + r.rb > 0 ? `1/${(r.games / (r.bb + r.rb)).toFixed(0)}` : "-"),
        td(formatSigned(r.diff), heat(r.diff, 2000)),
        td(pct(r.q), heat(r.q == null ? null : r.q - t.baseQ, 0.4)),
        td(mixBar(r.post)),
        td(r.basis === "counts" ? "BIG/REG" : r.basis === "diff" ? "差枚" : "稼働不足"),
      ])
    )}${mixLegend()}</details></section>`,
  });

  // --- 凹み台・据え置き ---
  out.push({
    id: "ahole",
    nav: "A凹み",
    html: `<section id="ahole"><h2>凹み台・据え置き（ジャグラー/ハナハナ）</h2>
<p class="desc">「凹んだ台に翌日設定を入れる」「良かった台を据え置く」を検証する。条件はすべて<b>その日より前</b>の成績で決め、結果は<b>その日</b>の推定設定で見る。
<b>同日比Δq</b> がプラスで p が小さければ、その条件の台は同じ日の他の台より高設定になりやすい。</p>
<h3>前日の差枚 → 当日</h3>
${table(BUCKET_HEADERS, bucketRows(t.hole.prev1, mq), { sortable: false })}
<h3>直近7日の合計差枚 → 当日</h3>
${table(BUCKET_HEADERS, bucketRows(t.hole.prev7, mq), { sortable: false })}
<details><summary>イベント日だけ / 通常日だけで見る</summary>
<h3>イベント日のみ</h3>${table(BUCKET_HEADERS, bucketRows(t.hole.prev7Event, mq), { sortable: false })}
<h3>通常日のみ</h3>${table(BUCKET_HEADERS, bucketRows(t.hole.prev7Normal, mq), { sortable: false })}</details>
<h3>連続マイナス日数 → 当日</h3>
${table(BUCKET_HEADERS, bucketRows(t.hole.streak, mq), { sortable: false })}
<h3>据え置き: 前日の推定設定 → 当日</h3>
${table(BUCKET_HEADERS, bucketRows(t.carry, mq), { sortable: false })}
<p class="note">読み方: 「前日 高そう」の当日 q が高い → 据え置きが多い店。「前日 低そう」「大凹み」の当日 q が高い → 上げ（凹み台救済）が多い店。どちらも差が無ければ毎日ランダムに近い。
設定が据え置かれていると「凹んだ台＝低設定のまま」で翌日も弱く出るので、凹み狙いが逆効果になる店もある。</p></section>`,
  });

  // --- 入替日・示唆景品 ---
  const repDays = t.replacement.days.slice(0, 40);
  const tagRows = t.tags.map((g) => [
    td(`<b>${esc(g.tag)}</b>`),
    td(g.nObs),
    td(g.nMatched),
    td(formatSigned(g.meanDiff), heat(g.meanDiff, 1500)),
    td(formatSigned(g.dDiff), heat(g.dDiff, 1500)),
    td(pv(g.pDiff)),
    td(pct(g.winRate)),
    td(g.nAType),
    td(pct(g.meanQ)),
    td(pctPt(g.dq), heat(g.dq, 0.1)),
    td(pv(g.pQ)),
    td(esc(g.lastDate)),
    td(g.nAType >= 5 ? effectChip(g.dq, g.pQ, g.nAType, mq) : effectChip(g.dDiff, g.pDiff, g.nMatched, 300)),
  ]);
  out.push({
    id: "arep",
    nav: "入替/示唆",
    html: `<section id="arep"><h2>入替日・示唆景品</h2>
<h3>新台入替の前後（ジャグラー/ハナハナへの配分）</h3>
<p class="desc">入替日は「設置構成の変化から自動検知した日（新台+増台 ${(config.atype && config.atype.replacementMinUnits) ?? ATYPE_DEFAULTS.replacementMinUnits}台以上）」と、<code>calendar.csv</code> / <code>config.mjs</code> で手動登録した日の合計。比較対象は入替の前後にかからない日。</p>
${t.replacement.days.length ? table(DAY_HEADERS, dayGroupRows(t.replacement.offsets, mq), { sortable: false }) : `<p>${chip("データ不足", "gray")} 入替日がまだ1日も検知・登録されていない。</p>`}
${repDays.length ? `<details><summary>入替日として扱った日（${t.replacement.days.length}日）</summary>${table(["日付", "出どころ", "増えた台数", "機種"], repDays.map((d) => [td(esc(d.date)), td(esc(d.source)), td(d.units ?? "-"), td(esc((d.models || []).slice(0, 6).join("、")), ' class="l"')]))}</details>` : ""}
<p class="note">自動検知はデータ欠損日を跨ぐと1〜2日ずれる。店の告知（公式X・P-WORLD・DMMぱちタウン）で分かった入替日は <code>calendar.csv</code> に <code>日付,入替</code> と書くと正確になり、これから来る入替日は狙い台の採点にも反映される。</p>
<h3>示唆景品・現地メモ（observations.csv）</h3>
<p class="desc">店内で見た「示唆っぽいもの」を 日付×台番×タグ で記録しておくと、その台が同じ日の他の台より出たか・高設定らしかったかを検証する。
<b>当たった時だけ記録すると必ず「効いてる」に見える</b>ので、見かけたら結果を知る前に（朝のうちに）全部記録すること。</p>
${t.tags.length ? table(["タグ", "記録数", "照合できた数", "平均差枚", "同日比Δ差枚", "p", "勝率", "Aタイプ件数", "平均q", "同日比Δq", "p", "最終記録", "判定"], tagRows) : `<p>${chip("記録待ち", "gray")} まだ記録が無い。<code>node tools/minrepo/run.mjs sheet</code> で <code>data/manual/observations.csv</code> が作られる。例: <code>2026-11-08,512,示唆景品,台上にお菓子</code></p>`}
${t.calendarKinds.length ? `<h3>その他の日付メモ（calendar.csv）</h3>${table(DAY_HEADERS, dayGroupRows(t.calendarKinds, mq), { sortable: false })}` : ""}</section>`,
  });

  // --- 台番・末尾・並び・日の種類 ---
  const unitRows = t.units.table.slice(0, 60).map((u) => [
    td(`<b>${u.unit}</b>`),
    td(esc(u.model)),
    td(num(u.n)),
    td(pct(u.meanQ)),
    td(pctPt(u.dq), heat(u.dq, 0.08)),
    td(pctPt(u.recentDq), heat(u.recentDq, 0.08)),
    td(formatSigned(u.meanDiff), heat(u.meanDiff, 800)),
    payoutCell(u.payout),
    td(u.active ? "設置中" : chip("撤去/移動?", "gray")),
  ]);
  const nb = t.neighbors;
  out.push({
    id: "aunit",
    nav: "台番/日",
    html: `<section id="aunit"><h2>台番・末尾・並び・日の種類（ジャグラー/ハナハナ）</h2>
<h3>よく入る台番</h3>
<p class="desc">台番ごとの「同日比Δq」の平均（その日の他の台よりどれだけ高設定らしかったか）。
台番による偏りが偶然の範囲かの検定: <b>p=${t.units.pHeterogeneity == null ? "-" : t.units.pHeterogeneity.toFixed(3)}</b>${t.units.pHeterogeneity != null ? (t.units.pHeterogeneity < 0.05 ? "（偏りあり＝特定の台を贔屓している可能性）" : "（偶然の範囲＝上位の台番も運かもしれない）") : ""}</p>
${table(["台番", "機種", "台×日", "平均q", "同日比Δq", "直近30日Δq", "平均差枚", "出率", "状態"], unitRows)}
<h3>末尾</h3>
${table(BUCKET_HEADERS, bucketRows(t.suffix.filter((r) => r.nRows > 0), mq))}
<h3>日付末尾との一致（例: 13日の末尾3）</h3>
${table(BUCKET_HEADERS, bucketRows(t.tailMatch, mq), { sortable: false })}
<h3>並びの端（角）</h3>
${table(BUCKET_HEADERS, bucketRows(t.edge, mq), { sortable: false })}
<p class="note">「端」は同機種の台番が3台以上続く並びの両端を機械的に取ったもの。実際の島の角とは限らない。</p>
<h3>並び（隣どうしで一緒に入るか）</h3>
<p>隣り合う台の q の連動: <b>${nb.corr == null ? "-" : nb.corr.toFixed(3)}</b>（${num(nb.nPairs)}ペア・p=${nb.p == null ? "-" : nb.p.toFixed(3)}）${nb.p != null ? (nb.p < 0.05 && nb.corr > 0 ? " → 並びで入れる傾向あり（強い台の隣も見る価値あり）" : " → 並びの傾向は確認できず") : ""}</p>
<h3>イベント日（日単位で比較）</h3>
${table(DAY_HEADERS, dayGroupRows(t.byEvent, mq), { sortable: false })}
<h3>曜日</h3>
${table(DAY_HEADERS, dayGroupRows(t.byWeekday, mq), { sortable: false })}
<h3>全台系っぽかった 機種×日（平均q 上位20）</h3>
${table(
      ["日付", "機種", "台数", "平均q", "出率", "日の種類"],
      t.modelDays.map((m) => [td(`${esc(m.date)}(${WEEKDAYS[toDateParts(m.date).weekday]})`), td(esc(m.name)), td(m.n), td(pct(m.meanQ), heat(m.meanQ - t.baseQ, 0.4)), payoutCell(m.payout), td(`${esc(m.eventLabel)}${m.rep ? "・入替日" : ""}`)])
    )}
<p class="note">同じ日の種類が何度も上位に出るなら、その日は機種単位で入れている可能性がある。</p></section>`,
  });

  out.push({ id: "judge", nav: "判別", html: judgeSection(t, config) });
  return out;
}

export const ATYPE_CSS = `
[hidden]{display:none!important}
.mixbar{display:flex;height:14px;min-width:120px;border-radius:4px;overflow:hidden;background:#eceff1}
.mixbar span{display:block;height:100%}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 3px 0 8px;vertical-align:-1px}
td.l{text-align:left;white-space:normal;min-width:180px}
.judge{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:8px 0}
.judge label{display:flex;flex-direction:column;font-size:.76rem;color:#556;gap:3px}
.judge input,.judge select{font-size:1rem;padding:8px;border:1px solid var(--line);border-radius:8px;background:#fff;width:100%}
.jg-out{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#fcfcfd}
.jg-row{display:flex;align-items:center;gap:8px;font-size:.84rem;margin:3px 0}
.jg-row .lab{width:3.6em}.jg-row .val{width:4em;text-align:right}
.jg-row .track{flex:1;height:14px;background:#eceff1;border-radius:4px;overflow:hidden}
.jg-row .fill{height:100%}
.jg-head{font-size:.95rem;margin:.2em 0 .5em}
`;

/**
 * 設定判別電卓のスクリプト（レポート / 攻略シートの HTML に埋め込む。依存なし）
 * opts.colors: 設定1〜6 のバーの色（CSS の色指定。既定は固定色、攻略シートではテーマ変数を渡す）
 */
export function atypeScript(a, config, opts = {}) {
  const t = a.atype;
  const cfgPrior = (config.atype && config.atype.prior) || ATYPE_DEFAULTS.prior;
  const data = {
    specs: ATYPE_SPECS.map((s) => ({ id: s.id, name: s.name, big: s.big, reg: s.reg, payout: s.payout, grape: s.grape || null, grapeLabel: s.grapeLabel || "ぶどう" })),
    storePi: t && t.available ? t.mix.pi : cfgPrior,
    modelPi: t && t.available ? Object.fromEntries(t.byModel.filter((m) => m.pi && m.n >= 100).map((m) => [m.specId, m.pi])) : {},
    highFrom: (t && t.config && t.config.highFrom) || ATYPE_DEFAULTS.highFrom,
    colors: opts.colors || SET_COLORS,
  };
  return `
// 設定判別（BIG/REG 回数からのベイズ推定。lib/settei.mjs の logLikCounts と同じ式）
(function(){
  var JG=${JSON.stringify(data)};
  var $=function(id){return document.getElementById(id)};
  if(!$("jg-model"))return;
  var numOf=function(id){var v=$(id).value;if(v==="")return null;var n=Number(v);return isFinite(n)&&n>=0?n:null};
  function calc(){
    var spec=JG.specs.filter(function(s){return s.id===$("jg-model").value})[0];
    $("jg-grl").textContent=spec.grapeLabel;
    Array.prototype.forEach.call(document.querySelectorAll(".jg-grape"),function(el){el.hidden=!spec.grape});
    var g=numOf("jg-g"),bb=numOf("jg-bb"),rb=numOf("jg-rb"),gr=numOf("jg-gr"),grg=numOf("jg-grg");
    var out=$("jg-out");
    if(g==null||bb==null||rb==null||g<=0){out.innerHTML='<p class="note">総G数・BIG・REG を入れると結果が出る。</p>';return}
    if(bb+rb>g){out.innerHTML='<p class="note">BIG+REG が総G数を超えている。</p>';return}
    var prior=$("jg-prior").value==="flat"?[1,1,1,1,1,1]:(JG.modelPi[spec.id]||JG.storePi);
    var ll=[],max=-Infinity,s;
    for(s=0;s<6;s++){
      var pB=1/spec.big[s],pR=1/spec.reg[s];
      var v=bb*Math.log(pB)+rb*Math.log(pR)+(g-bb-rb)*Math.log(1-pB-pR);
      if(gr!=null&&spec.grape){var tr=grg!=null&&grg>0?grg:g;if(gr<=tr){var pG=1/spec.grape[s];v+=gr*Math.log(pG)+(tr-gr)*Math.log(1-pG)}}
      ll.push(v);if(v>max)max=v;
    }
    var post=[],sum=0;
    for(s=0;s<6;s++){post.push(Math.exp(ll[s]-max)*prior[s]);sum+=post[s]}
    var high=0,pay=0;
    for(s=0;s<6;s++){post[s]/=sum;if(s>=JG.highFrom-1)high+=post[s];pay+=post[s]*spec.payout[s]}
    var h='<p class="jg-head">設定'+JG.highFrom+'以上の確率 <b>'+(high*100).toFixed(1)+'%</b>　期待機械割 <b>'+pay.toFixed(1)+'%</b></p>';
    h+='<p class="note">合成 1/'+(bb+rb>0?(g/(bb+rb)).toFixed(1):"-")+'・BIG 1/'+(bb>0?(g/bb).toFixed(1):"-")+'・REG 1/'+(rb>0?(g/rb).toFixed(1):"-")+(gr!=null&&gr>0?'・'+spec.grapeLabel+' 1/'+((grg!=null&&grg>0?grg:g)/gr).toFixed(2):"")+'</p>';
    for(s=0;s<6;s++){
      h+='<div class="jg-row"><span class="lab">設定'+(s+1)+'</span><span class="track"><span class="fill" style="display:block;width:'+(post[s]*100).toFixed(1)+'%;background:'+JG.colors[s]+'"></span></span><span class="val">'+(post[s]*100).toFixed(1)+'%</span><span class="dim">BIG 1/'+spec.big[s].toFixed(1)+' REG 1/'+spec.reg[s].toFixed(1)+'</span></div>';
    }
    out.innerHTML=h;
  }
  ["jg-model","jg-g","jg-bb","jg-rb","jg-gr","jg-grg","jg-prior"].forEach(function(id){$(id).addEventListener("input",calc);$(id).addEventListener("change",calc)});
  calc();
})();`;
}

/** Markdown ダイジェストに足す行 */
export function atypeMarkdown(a) {
  const t = a.atype;
  const lines = ["## ジャグラー・ハナハナ 設定推定"];
  if (!t || !t.available) {
    lines.push(`- データ待ち: ${t ? t.reason : "未分析"}`);
    lines.push("");
    return lines;
  }
  const hf = t.config.highFrom;
  lines.push(`- 推定高設定率（設定${hf}以上）: ${pct(t.mix.high)}${t.mix.highCi.lo != null ? `（90%区間 ${pct(t.mix.highCi.lo)}〜${pct(t.mix.highCi.hi)}）` : ""}・実測出率 ${t.all.payout == null ? "-" : (t.all.payout * 100).toFixed(1) + "%"}（${num(t.coverage.nEstimated)}台×日 / BIG・REG根拠 ${num(t.coverage.basisCounts.counts)}件）`);
  const row = (label, r) => `- ${label}: 高設定率 ${pct(r.high)}・同日比Δq ${pctPt(r.dq)}（${num(r.n)}台×日, p=${r.p == null ? "-" : r.p.toFixed(3)}）`;
  if (t.hole.prev7[0]) lines.push(row(`凹み台（直近7日 ${t.hole.prev7[0].bucket}）`, t.hole.prev7[0]));
  if (t.hole.prev1[0]) lines.push(row(`前日大凹み（${t.hole.prev1[0].bucket}）`, t.hole.prev1[0]));
  if (t.carry[2]) lines.push(row("据え置き（前日 高そう）", t.carry[2]));
  const rep = t.replacement.offsets.find((o) => o.label === "入替当日");
  if (rep && rep.nDays) lines.push(`- 入替当日: 高設定率 ${pct(rep.high)}（他の日 ${pct(rep.highRest)}）・${rep.nDays}日, p=${rep.p == null ? "-" : rep.p.toFixed(3)}`);
  for (const g of t.tags) lines.push(`- 現地メモ「${g.tag}」: 記録 ${g.nObs}件・同日比Δ差枚 ${formatSigned(g.dDiff)}（p=${g.pDiff == null ? "-" : g.pDiff.toFixed(3)}）`);
  const main = t.backtest.results.find((r) => r.k === 3);
  lines.push(`- 狙い台ランキングの検証: ${t.backtest.verdict}${main && main.nDays ? `（上位3台 ${formatSigned(main.pickDiff)}枚 vs 全台 ${formatSigned(main.allDiff)}枚・${main.nDays}日, p=${main.pDiff == null ? "-" : main.pDiff.toFixed(3)}）` : ""}`);
  lines.push(`- ${t.picks.targetDate} の狙い台: ${t.picks.rows.slice(0, 5).map((r) => `${r.unit}（${pct(r.p)}）`).join("、") || "-"}`);
  lines.push("");
  return lines;
}
