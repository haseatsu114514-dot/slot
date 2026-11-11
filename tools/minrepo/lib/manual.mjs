// 手入力データ（公式台データの写し・現地メモ・入替日カレンダー）の読み込みと統合。純粋関数のみ。
//
// 自動取得できない／してはいけない情報を、自分の目で見て CSV に書き足すための仕組み:
//   counts.csv        公式台データ（台データオンライン等）で見た 総G・BIG・REG・差枚 の写し、自分の実戦カウント
//   observations.csv  現地で気づいたこと（示唆景品・札・据え置き判別 等）を台番×タグで記録
//   calendar.csv      入替日・店休・取材などの日付メモ
// ファイルは tools/minrepo/data/manual/ に置く（gitignore 済み。公開リポジトリに載せない）。

import { parseNumber } from "./util.mjs";

export const MANUAL_FILES = {
  counts: {
    name: "counts.csv",
    columns: ["date", "unit", "model", "games", "bb", "rb", "diff", "grape", "grapeGames", "note"],
  },
  observations: {
    name: "observations.csv",
    columns: ["date", "unit", "tag", "note"],
  },
  days: {
    name: "days.csv",
    columns: ["date", "avgDiff", "win", "total", "avgGames", "note"],
  },
  calendar: {
    name: "calendar.csv",
    columns: ["date", "dateTo", "kind", "target", "note"],
  },
};

/** CSV テキスト → 行（文字列配列）の配列。ダブルクォート・改行入りセル・BOM・CRLF に対応。 */
export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** ヘッダ行つき CSV → オブジェクト配列（キーはヘッダ名、値は trim 済み文字列） */
export function csvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => {
      if (h) o[h] = (r[i] ?? "").trim();
    });
    return o;
  });
}

/** "2026-11-08" "2026/11/8" → "2026-11-08" | null */
export function normalizeDate(text) {
  const m = String(text ?? "").trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const isComment = (o) => String(Object.values(o)[0] ?? "").startsWith("#");

/**
 * counts.csv の内容を正規化する。games が空の行（テンプレの未記入行）は捨てる。
 * 戻り値: { rows: [{date, unit, model, games, bb, rb, diff, grape, grapeGames, note}], errors: [string] }
 */
export function parseCounts(text) {
  const rows = [];
  const errors = [];
  csvToObjects(text).forEach((o, idx) => {
    if (isComment(o)) return;
    const line = idx + 2;
    const date = normalizeDate(o.date);
    const unit = parseNumber(o.unit);
    const games = parseNumber(o.games);
    if (games == null) return; // 未記入
    if (!date || unit == null) {
      errors.push(`counts.csv ${line}行目: date か unit が読めない（${o.date ?? ""}, ${o.unit ?? ""}）`);
      return;
    }
    const bb = parseNumber(o.bb);
    const rb = parseNumber(o.rb);
    if (bb != null && rb != null && bb + rb > games) {
      errors.push(`counts.csv ${line}行目: BIG+REG が総G数を超えている（台番 ${unit}）`);
      return;
    }
    rows.push({
      date,
      unit,
      model: o.model || null,
      games,
      bb,
      rb,
      diff: parseNumber(o.diff),
      grape: parseNumber(o.grape),
      grapeGames: parseNumber(o.grapeGames),
      note: o.note || null,
    });
  });
  return { rows, errors };
}

/**
 * days.csv（店全体の日ごとの数字を手で写したもの）→ { rows: [{date, avgDiff, win, total, winRate, avgGames}], errors }
 * 勝率は win / total（勝った台数 / 全台数）で書く。total が空で win が 0〜100 の数なら「勝率%」として読む。
 */
export function parseDays(text) {
  const rows = [];
  const errors = [];
  csvToObjects(text).forEach((o, idx) => {
    if (isComment(o)) return;
    const date = normalizeDate(o.date);
    const avgDiff = parseNumber(o.avgDiff);
    const win = parseNumber(String(o.win ?? "").replace(/[%％]/g, ""));
    const total = parseNumber(o.total);
    const avgGames = parseNumber(o.avgGames);
    if (!date && avgDiff == null && win == null) return;
    if (!date) {
      errors.push(`days.csv ${idx + 2}行目: date が読めない（${o.date ?? ""}）`);
      return;
    }
    if (avgDiff == null && win == null) return; // 未記入
    let winRate = null;
    if (win != null && total) winRate = win / total;
    else if (win != null && win >= 0 && win <= 100) winRate = win / 100;
    if ((win != null && !total && win > 100) || (winRate != null && (winRate < 0 || winRate > 1))) {
      errors.push(`days.csv ${idx + 2}行目: 勝率が 0〜100% に収まっていない（win に台数を書くときは total に全台数も書く）`);
      return;
    }
    rows.push({ date, avgDiff, win: total ? win : null, total: total || null, winRate, avgGames });
  });
  return { rows, errors };
}

/**
 * 手入力の日別データを dataset.days に統合する。保存ページから読めた日はそちらを優先し、
 * データの無い日（またはその日の平均差枚が空）だけを手入力で埋める。
 */
export function mergeDays(days, manualDays) {
  const out = days.map((d) => ({ ...d }));
  if (!manualDays || !manualDays.length) return out;
  const byDate = new Map(out.map((d) => [d.date, d]));
  for (const m of manualDays) {
    const cur = byDate.get(m.date);
    if (cur && cur.avgDiff != null && !cur.masked) continue;
    const [y, mo, d] = m.date.split("-").map(Number);
    const row = {
      date: m.date,
      postId: cur ? cur.postId : null,
      y,
      m: mo,
      d,
      weekday: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(),
      nthWeekday: Math.ceil(d / 7),
      status: cur ? cur.status : null,
      oldEventDays: cur ? cur.oldEventDays : null,
      avgGames: m.avgGames ?? (cur ? cur.avgGames : null),
      win: m.win ?? (cur ? cur.win : null),
      total: m.total ?? (cur ? cur.total : null),
      winRate: m.winRate ?? (cur ? cur.winRate : null),
      avgDiff: m.avgDiff,
      masked: false,
      src: "manual",
    };
    if (cur) out[out.indexOf(cur)] = row;
    else out.push(row);
    byDate.set(m.date, row);
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

/**
 * 台番の指定を展開する。"512" → [512] / "501-508"（〜 も可）→ 範囲 / "512/515 520" → 複数。
 * 読めないときは null。範囲は 200 台まで（打ち間違い対策）。
 */
export function expandUnits(text) {
  const src = String(text ?? "").normalize("NFKC").trim();
  if (!src) return null;
  const out = [];
  for (const part of src.split(/[\/、,\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*[-~〜]\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to < from || to - from >= 200) return null;
      for (let u = from; u <= to; u++) out.push(u);
    } else if (/^\d+$/.test(part)) out.push(Number(part));
    else return null;
  }
  return out.length ? [...new Set(out)] : null;
}

/**
 * observations.csv → { rows: [{date, unit, tag, note}], errors }
 * unit は範囲（501-508）や複数（512/515）で書いてもよく、台ごとの行に展開される。
 */
export function parseObservations(text) {
  const rows = [];
  const errors = [];
  csvToObjects(text).forEach((o, idx) => {
    if (isComment(o)) return;
    const date = normalizeDate(o.date);
    const units = expandUnits(o.unit);
    const tag = (o.tag || "").trim();
    if (!date && !o.unit && !tag) return;
    if (!date || !units || !tag) {
      errors.push(`observations.csv ${idx + 2}行目: date / unit / tag が揃っていない（台ではなく日単位のメモは calendar.csv へ）`);
      return;
    }
    for (const unit of units) rows.push({ date, unit, tag, note: o.note || null });
  });
  return { rows, errors };
}

/**
 * calendar.csv → { rows: [{date, kind, target, note}], errors }
 *  - 期間は dateTo 列、または date 列に "2026-11-10〜2026-11-16"（~ も可）と書く。1 日ごとの行に展開する（最長 92 日）
 *  - target（任意）は対象機種名への正規表現。「おすすめ週間の対象機種」のように、特定の機種に紐づくメモに使う
 */
export function parseCalendar(text) {
  const rows = [];
  const errors = [];
  csvToObjects(text).forEach((o, idx) => {
    if (isComment(o)) return;
    const kind = (o.kind || "").trim();
    const rawDate = String(o.date ?? "").normalize("NFKC").trim();
    if (!rawDate && !kind) return;
    const parts = rawDate.split(/\s*[~〜]\s*/);
    const from = normalizeDate(parts[0]);
    const to = parts[1] ? normalizeDate(parts[1]) : o.dateTo ? normalizeDate(o.dateTo) : from;
    if (!from || !to || !kind) {
      errors.push(`calendar.csv ${idx + 2}行目: date / kind が揃っていない`);
      return;
    }
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    const span = Math.round((end - start) / 86400000);
    if (!(span >= 0) || span > 92) {
      errors.push(`calendar.csv ${idx + 2}行目: 期間が逆か、長すぎる（最長 92 日）`);
      return;
    }
    for (let i = 0; i <= span; i++) {
      const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
      rows.push({ date, kind, target: (o.target || "").trim() || null, note: o.note || null });
    }
  });
  return { rows, errors };
}

/**
 * 手入力の counts を dataset.units に統合する（dataset を書き換えずに新しい units を返す）。
 * 同じ 日付×台番 が両方にある場合は、手入力の games / bb / rb / grape を優先する
 * （公式台データの数値の方がデータサイトの推定値より確かなため）。差枚は手入力があればそれ、無ければ既存値。
 * 機種名が手入力に無いときは、その台番の直近の機種名で補う。
 */
export function mergeCounts(units, counts) {
  const out = units.map((u) => ({ ...u }));
  if (!counts || !counts.length) return out;
  const byKey = new Map(out.map((u) => [`${u.date}|${u.unit}`, u]));
  const byUnit = new Map();
  for (const u of out) {
    if (!byUnit.has(u.unit)) byUnit.set(u.unit, []);
    byUnit.get(u.unit).push(u);
  }
  const modelNear = (unit, date) => {
    const list = byUnit.get(unit);
    if (!list || !list.length) return null;
    let best = null;
    for (const u of list) {
      if (!u.model) continue;
      if (u.date <= date) best = u; // date 昇順なので最後に当たったものが直近
      else if (!best) best = u;
    }
    return best ? best.model : null;
  };
  for (const c of counts) {
    const key = `${c.date}|${c.unit}`;
    const cur = byKey.get(key);
    if (cur) {
      cur.games = c.games;
      if (c.bb != null) cur.bb = c.bb;
      if (c.rb != null) cur.rb = c.rb;
      if (c.diff != null) cur.diff = c.diff;
      if (c.grape != null) cur.grape = c.grape;
      if (c.grapeGames != null) cur.grapeGames = c.grapeGames;
      if (c.model && !cur.model) cur.model = c.model;
      cur.src = "manual";
    } else {
      const row = {
        date: c.date,
        model: c.model || modelNear(c.unit, c.date),
        unit: c.unit,
        suffix: String(c.unit % 10),
        diff: c.diff,
        games: c.games,
        payout: null,
        bb: c.bb,
        rb: c.rb,
        grape: c.grape,
        grapeGames: c.grapeGames,
        src: "manual",
      };
      out.push(row);
      byKey.set(key, row);
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.unit - b.unit));
  return out;
}

const escCsv = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 空のテンプレ CSV（ヘッダ + 記入例コメント行） */
export function templateCsv(kind) {
  const def = MANUAL_FILES[kind];
  const examples = {
    counts: ["# 例: 2026-11-08", "512", "マイジャグラーV", "6480", "28", "31", "+1850", "", "", "公式台データより（#で始まる行は無視される）"],
    observations: ["# 例: 2026-11-08", "512", "示唆景品", "台上にお菓子の景品が置いてあった（#で始まる行は無視される）"],
    days: ["# 例: 2026-11-10", "-85", "128", "320", "3150", "店全体の 平均差枚 / 勝った台数 / 全台数 / 平均G数（#で始まる行は無視される）"],
    calendar: ["# 例: 2026-11-10", "2026-11-16", "おすすめ週間", "北斗|カバネリ", "期間は dateTo に終わりの日、target は対象機種（任意）。#で始まる行は無視される"],
  };
  return `${def.columns.join(",")}\n${examples[kind].map(escCsv).join(",")}\n`;
}

/**
 * 記入用の行（games 以降が空）を作る。公式台データを見ながら埋める用。
 * targets: [{unit, model}]。existingText にすでに同じ 日付×台番 の行があれば追加しない。
 * 戻り値: 追記すべき CSV 文字列（行が無ければ ""）
 */
export function buildCountsSheet(date, targets, existingText = "") {
  const have = new Set();
  for (const o of csvToObjects(existingText)) {
    const d = normalizeDate(o.date);
    const u = parseNumber(o.unit);
    if (d && u != null) have.add(`${d}|${u}`);
  }
  const lines = [];
  for (const t of [...targets].sort((a, b) => a.unit - b.unit)) {
    if (have.has(`${date}|${t.unit}`)) continue;
    lines.push([date, t.unit, t.model ?? "", "", "", "", "", "", "", ""].map(escCsv).join(","));
  }
  return lines.length ? lines.join("\n") + "\n" : "";
}
