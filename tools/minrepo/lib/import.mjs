// 手で保存したページの取り込み。純粋関数のみ（ファイル IO は pipeline.mjs）。
//
// 自動取得を使わない運用のための入口。ブラウザでみんレポの日別ページを開いて
// 「名前を付けて保存」した HTML を data/inbox/ に置くと、中身から
//   - その日の店全体ページ（機種一覧の表がある）
//   - 機種別の詳細ページ（台番ごとの表がある。URL に ?kishu= が付く）
// のどちらかを見分け、日付と機種名を読み取って所定の場所へ振り分ける。

import { parseReportPage, parseUnitTable, decodeEntities, stripTags } from "./parse.mjs";
import { parseDateFromTitle, toDateParts } from "./util.mjs";

/** 保存元の URL。Chrome/Edge は保存時に <!-- saved from url=(0073)https://… --> を先頭に書く。無ければ canonical / og:url */
export function savedFromUrl(html) {
  const head = String(html).slice(0, 20000);
  const saved = head.match(/<!--\s*saved from url=\(\d+\)(\S+?)\s*-->/i);
  if (saved) return decodeEntities(saved[1]);
  const canonical = head.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || head.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  if (canonical) return decodeEntities(canonical[1]);
  const og = head.match(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i);
  return og ? decodeEntities(og[1]) : null;
}

function pageTitle(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (og) return decodeEntities(og[1]).trim();
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return t ? stripTags(t[1]) : null;
}

function publishedTime(html) {
  const m =
    html.match(/<meta[^>]+property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/"datePublished"\s*:\s*"([^"]+)"/i) ||
    html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

/**
 * タイトルの「11/10(火)」だけで年が分からないとき、today 以前でいちばん新しい年を当てる
 * （手で集めるのは直近半年〜1年なので、これで決まる）。
 */
export function inferDate(title, today) {
  const m = String(title ?? "").match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  const md = String(title ?? "").match(/(\d{1,2})\/(\d{1,2})/);
  const t = toDateParts(today);
  if (!md || !t) return null;
  const mo = Number(md[1]);
  const d = Number(md[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  for (const y of [t.y, t.y - 1]) {
    const cand = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (cand <= today) return cand;
  }
  return null;
}

/**
 * 保存された 1 ページを見分ける。
 * opts: { today: "YYYY-MM-DD", storeQuery: 店名の一部, fileName: 元のファイル名（機種名の手がかり） }
 * 戻り値: { kind: "report" | "kishu" | "unknown", date, model, title, url, warnings: [], reason? }
 */
export function classifySavedPage(html, opts = {}) {
  const src = String(html ?? "");
  const url = savedFromUrl(src);
  const title = pageTitle(src);
  const warnings = [];
  const published = publishedTime(src);
  const date = (published && parseDateFromTitle(title, published)) || inferDate(title, opts.today || "9999-12-31");
  if (opts.storeQuery && !(title || "").includes(opts.storeQuery) && !decodeURIComponentSafe(url || "").includes(opts.storeQuery)) {
    warnings.push(`店名「${opts.storeQuery}」が見当たらない（別の店のページかもしれない）`);
  }

  const report = parseReportPage(src);
  const kishuParam = url ? (url.match(/[?&]kishu=([^&#]+)/) || [])[1] : null;
  // 機種別詳細ページにも末尾の表などが付くことがあるので、URL に ?kishu= があればそちらを優先する
  if (report.models.length && !kishuParam) {
    if (!date) return { kind: "unknown", date: null, model: null, title, url, warnings, reason: "日付が読み取れない（ページのタイトルに 11/10 のような日付が無い）" };
    return { kind: "report", date, model: null, title, url, warnings };
  }

  const unitRows = parseUnitTable(src).filter((r) => r.unit != null && !r.date);
  if (unitRows.length) {
    let model = kishuParam ? decodeURIComponentSafe(kishuParam).replace(/\+/g, " ") : null;
    if (!model) {
      const names = [...new Set(unitRows.map((r) => r.model).filter(Boolean))];
      if (names.length === 1) model = names[0];
    }
    if (!model && opts.fileName) {
      const base = opts.fileName.replace(/\.(html?|htm)$/i, "").trim();
      if (base && !/\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}/.test(base) && !(opts.storeQuery && base.includes(opts.storeQuery))) model = base;
    }
    if (!date) return { kind: "unknown", date: null, model, title, url, warnings, reason: "日付が読み取れない" };
    if (!model) return { kind: "unknown", date, model: null, title, url, warnings, reason: "機種名が分からない（ファイル名を「機種名.html」にして入れ直す）" };
    return { kind: "kishu", date, model, title, url, warnings, units: unitRows.length };
  }
  return { kind: "unknown", date, model: null, title, url, warnings, reason: "機種の表も台番の表も見つからない（保存し直すか、別のページ）" };
}

function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** from〜to（両端含む）のうち have に無い日付を返す（集め残しの確認用） */
export function missingDates(have, from, to) {
  const set = new Set(have);
  const out = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (!set.has(d)) out.push(d);
  }
  return out;
}
