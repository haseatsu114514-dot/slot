// min-repo レポートページの HTML パーサ。依存なし・純粋関数のみ（DOM/fetch 不使用）。
// テーブルはヘッダ行の文言で判別する（class 名の変更に強くするため）。

import { parseNumber, parsePercent, parseFraction } from "./util.mjs";

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  yen: "￥",
  hellip: "…",
};

export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m));
}

export function stripTags(s) {
  return decodeEntities(String(s).replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function attrOf(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i")) || tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i"));
  return m ? m[1] : null;
}

/**
 * HTML 中の全 <table> を行列に分解する。
 * 戻り値: [{ tableTag, rows: [{ trTag, cells: [{ tag, html, text }] }] }]
 */
export function extractTables(html) {
  const tables = [];
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tableTag = m[0].slice(0, m[0].indexOf(">") + 1);
    const body = m[1];
    const rows = [];
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(body))) {
      const trTag = tr[0].slice(0, tr[0].indexOf(">") + 1);
      const cells = [];
      const cellRe = /<(t[dh])\b[^>]*>([\s\S]*?)<\/\1>/gi;
      let c;
      while ((c = cellRe.exec(tr[1]))) {
        const tag = c[0].slice(0, c[0].indexOf(">") + 1);
        cells.push({ tag, html: c[2], text: stripTags(c[2]) });
      }
      if (cells.length) rows.push({ trTag, cells });
    }
    tables.push({ tableTag, rows });
  }
  return tables;
}

function headerSignature(row) {
  return row.cells.map((c) => c.text).join("|");
}

function isModelHeader(sig) {
  return sig.includes("機種") && sig.includes("平均差枚") && sig.includes("勝率");
}

function isUnitHeader(sig) {
  return sig.includes("台番") && (sig.includes("差枚") || sig.includes("G数"));
}

function isSuffixHeader(sig) {
  return sig.startsWith("末尾");
}

function isDateHeader(sig) {
  return sig.includes("日付") && (sig.includes("差枚") || sig.includes("G数"));
}

/** ヘッダ行のテキスト → 列インデックスの対応表 */
function columnMap(headerRow) {
  const map = {};
  headerRow.cells.forEach((c, i) => {
    const t = c.text;
    if (/^機種/.test(t)) map.model = i;
    else if (t.includes("台番")) map.unit = i;
    else if (t.includes("日付")) map.date = i;
    else if (t.includes("末尾")) map.suffix = i;
    else if (t.includes("平均差枚")) map.avgDiff = i;
    else if (t === "差枚" || (t.includes("差枚") && map.avgDiff == null)) map.diff = i;
    else if (t.includes("平均G数")) map.avgGames = i;
    else if (t === "G数" || t.includes("G数")) map.games = i;
    else if (t.includes("勝率")) map.winRate = i;
    else if (t.includes("出率")) map.payout = i;
    else if (t.includes("BB")) map.bb = i;
    else if (t.includes("RB")) map.rb = i;
  });
  return map;
}

function cellText(row, idx) {
  if (idx == null || idx >= row.cells.length) return null;
  return row.cells[idx].text;
}

/** <a href="?kishu=..."> のような行から data-count 属性を読む（設置台数） */
function rowDataCount(row) {
  const v = attrOf(row.trTag, "data-count");
  const n = v == null ? null : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * レポートページ全体をパースする。
 * 戻り値:
 * {
 *   status, oldEventDays, avgGames, win, total,
 *   models:   [{ model, count, avgDiff, avgGames, win, total, payout }],
 *   units:    [{ model, unit, diff, games, payout }],          // バラエティ等の台番付き行
 *   suffixes: [{ suffix, avgDiff, avgGames, win, total, payout }],
 * }
 */
export function parseReportPage(html) {
  const tables = extractTables(html);
  const out = { status: null, oldEventDays: null, avgGames: null, win: null, total: null, models: [], units: [], suffixes: [] };

  for (const table of tables) {
    if (!table.rows.length) continue;
    const first = table.rows[0];
    const firstSig = headerSignature(first);

    // 概況テーブル（th/td の縦持ち）
    if (first.cells.length === 2 && /^(状況|平均G数|勝率)/.test(first.cells[0].text)) {
      for (const row of table.rows) {
        if (row.cells.length < 2) continue;
        const key = row.cells[0].text;
        const val = row.cells[1].text;
        if (key.includes("状況")) out.status = val || null;
        else if (key.includes("平均G数")) out.avgGames = parseNumber(val);
        else if (key.includes("勝率")) {
          const f = parseFraction(val);
          if (f) {
            out.win = f.win;
            out.total = f.total;
          }
        } else if (key.includes("旧イベント日")) {
          out.oldEventDays = val.replace(/※.*$/, "").trim() || null;
        }
      }
      continue;
    }

    if (isSuffixHeader(firstSig)) {
      const cols = columnMap(first);
      for (const row of table.rows.slice(1)) {
        if (headerSignature(row) === firstSig) continue; // 途中に繰り返されるヘッダ行
        const label = cellText(row, cols.suffix ?? 0);
        if (label == null || label === "") continue;
        const suffix = /^\d$/.test(label) ? label : label.includes("ゾロ目") ? "zorome" : label;
        const f = parseFraction(cellText(row, cols.winRate));
        out.suffixes.push({
          suffix,
          avgDiff: parseNumber(cellText(row, cols.avgDiff)),
          avgGames: parseNumber(cellText(row, cols.avgGames)),
          win: f ? f.win : null,
          total: f ? f.total : null,
          payout: parsePercent(cellText(row, cols.payout)),
        });
      }
      continue;
    }

    if (isUnitHeader(firstSig)) {
      const cols = columnMap(first);
      for (const row of table.rows.slice(1)) {
        if (headerSignature(row) === firstSig) continue;
        const unit = parseNumber(cellText(row, cols.unit));
        if (unit == null) continue;
        out.units.push({
          model: cellText(row, cols.model),
          unit,
          diff: parseNumber(cellText(row, cols.diff ?? cols.avgDiff)),
          games: parseNumber(cellText(row, cols.games ?? cols.avgGames)),
          payout: parsePercent(cellText(row, cols.payout)),
        });
      }
      continue;
    }

    if (isModelHeader(firstSig)) {
      const cols = columnMap(first);
      for (const row of table.rows.slice(1)) {
        if (headerSignature(row) === firstSig) continue;
        const model = cellText(row, cols.model);
        if (!model) continue;
        const f = parseFraction(cellText(row, cols.winRate));
        out.models.push({
          model,
          count: rowDataCount(row) ?? (f ? f.total : null),
          avgDiff: parseNumber(cellText(row, cols.avgDiff)),
          avgGames: parseNumber(cellText(row, cols.avgGames)),
          win: f ? f.win : null,
          total: f ? f.total : null,
          payout: parsePercent(cellText(row, cols.payout)),
        });
      }
      continue;
    }
  }
  return out;
}

/**
 * 機種別詳細ページ（?kishu=）/ 台番履歴ページ（?num=）の台番テーブルをパースする。
 * 台番列か日付列を持つテーブルを総なめにして行を返す。
 * 戻り値: [{ date?, model?, unit?, diff, games, payout, bb?, rb? }]
 */
export function parseUnitTable(html) {
  const tables = extractTables(html);
  const rows = [];
  for (const table of tables) {
    if (!table.rows.length) continue;
    const first = table.rows[0];
    const sig = headerSignature(first);
    if (!isUnitHeader(sig) && !isDateHeader(sig)) continue;
    const cols = columnMap(first);
    for (const row of table.rows.slice(1)) {
      if (headerSignature(row) === sig) continue;
      const unit = cols.unit != null ? parseNumber(cellText(row, cols.unit)) : null;
      const dateText = cols.date != null ? cellText(row, cols.date) : null;
      if (unit == null && !dateText) continue;
      rows.push({
        date: dateText || null,
        model: cols.model != null ? cellText(row, cols.model) : null,
        unit,
        diff: parseNumber(cellText(row, cols.diff ?? cols.avgDiff)),
        games: parseNumber(cellText(row, cols.games ?? cols.avgGames)),
        payout: parsePercent(cellText(row, cols.payout)),
        bb: cols.bb != null ? parseNumber(cellText(row, cols.bb)) : null,
        rb: cols.rb != null ? parseNumber(cellText(row, cols.rb)) : null,
      });
    }
  }
  return rows;
}

/**
 * ボット対策のダミー値（差枚が全部 0/±1、出率が 100% 付近に張り付く）を検知する。
 * これを保存すると分析が静かに壊れるので、fetch 時に必ずチェックする。
 */
export function detectMasked(report) {
  const diffs = report.models.map((m) => m.avgDiff).filter((v) => v != null);
  if (diffs.length < 8) return false;
  const tiny = diffs.filter((v) => Math.abs(v) <= 1).length;
  if (tiny / diffs.length < 0.8) return false;
  const payouts = report.models.map((m) => m.payout).filter((v) => v != null);
  if (!payouts.length) return true;
  const flat = payouts.filter((v) => Math.abs(v - 100) <= 0.5).length;
  return flat / payouts.length >= 0.8;
}
