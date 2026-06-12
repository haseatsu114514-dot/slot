// パース済みの日次レポート群を、分析しやすい tidy なテーブル群に変換する。純粋関数のみ。

import { toDateParts, nthWeekdayOfMonth, parseTitleTotals } from "./util.mjs";

/**
 * 1日分のレコードを正規化する。
 * input: { date: "YYYY-MM-DD", postId, title, report: parseReportPage の戻り値, masked, kishuUnits?: parseUnitTable の戻り値 }
 */
export function buildDay(record) {
  const { date, postId, title, report, masked } = record;
  const parts = toDateParts(date);
  const titleTotals = parseTitleTotals(title);

  // 店全体の平均差枚: 機種テーブルの台数加重平均（マスク日は信用しない）。旧記事はタイトルから。
  let avgDiff = null;
  if (!masked && report && report.models.length) {
    let sum = 0;
    let n = 0;
    for (const m of report.models) {
      if (m.avgDiff != null && m.count != null) {
        sum += m.avgDiff * m.count;
        n += m.count;
      }
    }
    if (n > 0) avgDiff = sum / n;
  }
  if (avgDiff == null && titleTotals && titleTotals.avgDiff != null) avgDiff = titleTotals.avgDiff;

  const win = report ? report.win : null;
  const total = report ? report.total : null;
  return {
    date,
    postId: postId ?? null,
    y: parts.y,
    m: parts.m,
    d: parts.d,
    weekday: parts.weekday, // 0=日..6=土
    nthWeekday: nthWeekdayOfMonth(date),
    status: report ? report.status : null,
    oldEventDays: report ? report.oldEventDays : null,
    avgGames: report ? report.avgGames : null,
    win,
    total,
    winRate: win != null && total ? win / total : null,
    avgDiff,
    masked: !!masked,
  };
}

/** 機種ごとの台番付き行（バラエティ + kishu 詳細）をその日の units として統合する */
function mergeUnits(record) {
  const seen = new Map();
  const push = (u) => {
    if (u.unit == null) return;
    const key = String(u.unit);
    // kishu 詳細の方が情報が多いことがあるので後勝ちにしない（先勝ち + 欠損補完）
    if (seen.has(key)) {
      const cur = seen.get(key);
      for (const k of ["model", "diff", "games", "payout", "bb", "rb"]) {
        if (cur[k] == null && u[k] != null) cur[k] = u[k];
      }
    } else {
      seen.set(key, { model: u.model ?? null, unit: u.unit, diff: u.diff ?? null, games: u.games ?? null, payout: u.payout ?? null, bb: u.bb ?? null, rb: u.rb ?? null });
    }
  };
  if (record.report) for (const u of record.report.units) push(u);
  if (record.kishuUnits) {
    for (const ku of record.kishuUnits) {
      for (const u of ku.rows) push({ ...u, model: u.model ?? ku.model });
    }
  }
  return [...seen.values()];
}

/**
 * 全日分のレコードから tidy データセットを作る。
 * records: buildDay の input と同じ形の配列。
 * 戻り値: { days, models, units, suffixes } 各配列は date 昇順。
 */
export function buildDataset(records) {
  const sorted = [...records].filter((r) => r.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const days = [];
  const models = [];
  const units = [];
  const suffixes = [];
  for (const rec of sorted) {
    const day = buildDay(rec);
    days.push(day);
    if (!rec.report) continue;
    for (const m of rec.report.models) {
      models.push({
        date: rec.date,
        model: m.model,
        count: m.count,
        avgDiff: rec.masked ? null : m.avgDiff,
        avgGames: m.avgGames,
        win: m.win,
        total: m.total,
        payout: rec.masked ? null : m.payout,
      });
    }
    for (const u of mergeUnits(rec)) {
      units.push({
        date: rec.date,
        model: u.model,
        unit: u.unit,
        suffix: String(u.unit % 10),
        diff: rec.masked ? null : u.diff,
        games: u.games,
        payout: rec.masked ? null : u.payout,
        bb: u.bb ?? null,
        rb: u.rb ?? null,
      });
    }
    for (const s of rec.report.suffixes) {
      suffixes.push({
        date: rec.date,
        suffix: s.suffix,
        avgDiff: rec.masked ? null : s.avgDiff,
        avgGames: s.avgGames,
        win: s.win,
        total: s.total,
        winRate: s.win != null && s.total ? s.win / s.total : null,
        payout: rec.masked ? null : s.payout,
      });
    }
  }
  return { days, models, units, suffixes };
}

/** CSV 文字列化（Excel 向けに BOM 付き）。rows はオブジェクト配列、columns は列名配列。 */
export function toCsv(rows, columns) {
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(",")];
  for (const r of rows) lines.push(columns.map((c) => esc(r[c])).join(","));
  return "﻿" + lines.join("\n") + "\n";
}
