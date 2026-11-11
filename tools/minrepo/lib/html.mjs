// レポート HTML 用の小さな整形ヘルパ。純粋関数のみ。

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function pct(v, digits = 1) {
  return v == null ? "-" : `${(v * 100).toFixed(digits)}%`;
}

export function pctPt(v, digits = 1) {
  return v == null ? "-" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}pt`;
}

export function num(v, digits = 0) {
  return v == null ? "-" : Number(v).toLocaleString("ja-JP", { maximumFractionDigits: digits });
}

export function pv(p) {
  if (p == null) return "-";
  const s = p < 0.001 ? "<0.001" : p.toFixed(3);
  return p < 0.05 ? `<b>${s}</b>` : s;
}

/** -1..1 に正規化した値を背景色にする（負=青, 正=赤） */
export function heat(v, scale) {
  if (v == null || !Number.isFinite(v)) return "";
  const t = Math.max(-1, Math.min(1, v / scale));
  const alpha = Math.abs(t) * 0.5;
  const color = t >= 0 ? `rgba(229,57,53,${alpha})` : `rgba(30,136,229,${alpha})`;
  return ` style="background:${color}"`;
}

export function table(headers, rows, { sortable = true } = {}) {
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows.map((cells) => `<tr>${cells.join("")}</tr>`).join("\n");
  return `<div class="tw"><table class="${sortable ? "sortable" : ""}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export const td = (content, attr = "") => `<td${attr}>${content}</td>`;

export function chip(text, kind) {
  return `<span class="chip ${kind}">${text}</span>`;
}
