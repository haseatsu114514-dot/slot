// fetch → parse → analyze → report の各ステップ（ファイルIOあり）。

import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { politeFetchText } from "./http.mjs";
import { listStorePosts } from "./wp.mjs";
import { parseReportPage, parseUnitTable, detectMasked } from "./parse.mjs";
import { buildDataset, toCsv } from "./dataset.mjs";
import { analyze } from "./analyze.mjs";
import { renderHtml, renderMarkdown } from "./report.mjs";

const TOOL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = join(TOOL_DIR, "data");
const RAW_DIR = join(DATA_DIR, "raw");
const KISHU_DIR = join(DATA_DIR, "raw", "kishu");

function ensureDirs() {
  for (const d of [DATA_DIR, RAW_DIR, KISHU_DIR]) mkdirSync(d, { recursive: true });
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function monthsAgo(n) {
  const t = new Date();
  t.setMonth(t.getMonth() - n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64url");

function isEventOrWeekendDate(dateStr, config) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (weekday === 0 || weekday === 6) return true;
  for (const def of config.eventDays || []) {
    if (def.type === "digitContains" && String(d).includes(String(def.digit))) return true;
    if (def.type === "daysOfMonth" && def.days.includes(d)) return true;
    if (def.type === "monthDay" && def.month === m && def.day === d) return true;
    if (def.type === "nthWeekday" && weekday === def.weekday && Math.ceil(d / 7) === def.nth) return true;
  }
  return false;
}

export const MASKED_MESSAGE = `
!! 取得したページの差枚が 0/±1、出率が 100% 付近に張り付いています。
!! min-repo はデータセンターIP等からのアクセスにダミー値を返すことがあります。
!! このまま続けてもゴミデータが溜まるだけなので中断しました。
!! 自宅回線など、ブラウザで普通に数値が見える環境で実行してください。
`;

/**
 * 記事一覧の更新と、レポートHTML（+ 機種別詳細）のダウンロード。
 * opts: { backfill, months, limit, noKishu }
 */
export async function fetchStep(config, opts = {}, log = console.log) {
  ensureDirs();
  const indexPath = join(DATA_DIR, "index.json");
  const index = readJson(indexPath, []);
  const byDate = new Map(index.map((p) => [p.dataDate, p]));

  const horizon = monthsAgo(opts.months ?? config.backfillMonths);
  let since = horizon;
  if (!opts.backfill && index.length) {
    const newest = index.map((p) => p.dataDate).sort().at(-1);
    if (newest > since) {
      const t = new Date(newest);
      t.setDate(t.getDate() - 3);
      since = t.toISOString().slice(0, 10);
    }
  }
  log(`記事一覧を更新（${since} 以降）…`);
  const posts = await listStorePosts(config, since, log);
  for (const p of posts) byDate.set(p.dataDate, p);
  const merged = [...byDate.values()].sort((a, b) => (a.dataDate < b.dataDate ? -1 : 1));
  writeFileSync(indexPath, JSON.stringify(merged, null, 1));
  log(`記事一覧: ${merged.length}件（最古 ${merged[0]?.dataDate} / 最新 ${merged.at(-1)?.dataDate}）`);

  const targets = merged.filter((p) => p.dataDate >= horizon && !existsSync(join(RAW_DIR, `${p.dataDate}.html`)));
  targets.sort((a, b) => (a.dataDate < b.dataDate ? 1 : -1)); // 新しい順
  const limit = opts.limit ?? Infinity;
  const plan = targets.slice(0, limit);
  log(`未取得のレポート: ${targets.length}件 → 今回取得 ${plan.length}件（目安 ${Math.round((plan.length * (config.delayMs + config.jitterMs / 2)) / 1000 / 60)}分 + 機種別詳細）`);

  let fetched = 0;
  for (const post of plan) {
    log(`[${post.dataDate}] ${post.link}`);
    const r = await politeFetchText(post.link, config);
    if (!r.ok) {
      log(`  スキップ（HTTP ${r.status}）`);
      continue;
    }
    const report = parseReportPage(r.text);
    if (detectMasked(report)) {
      console.error(MASKED_MESSAGE);
      return { fetched, aborted: "masked" };
    }
    writeFileSync(join(RAW_DIR, `${post.dataDate}.html`), r.text);
    fetched++;
    if (!report.models.length && !report.units.length) {
      log(`  注意: テーブルが見つからない（古いレイアウト？）。保存だけした。`);
      continue;
    }

    // 機種別詳細（台番ごとの差枚）。watchlist 該当機種のみ等、config に従う。
    const kd = config.kishuDetail || { mode: "none" };
    if (!opts.noKishu && kd.mode !== "none") {
      if (kd.days === "event" && !isEventOrWeekendDate(post.dataDate, config)) continue;
      const patterns = (config.seriesWatchlist || []).map((s) => new RegExp(s.pattern, "i"));
      const models = report.models
        .filter((m) => m.model && (m.count == null || m.count >= 2)) // 1台機種はバラエティ表で台番が取れている
        .filter((m) => kd.mode === "all" || patterns.some((re) => re.test(m.model)));
      if (!models.length) continue;
      const dayDir = join(KISHU_DIR, post.dataDate);
      mkdirSync(dayDir, { recursive: true });
      const metaPath = join(dayDir, "_index.json");
      const meta = readJson(metaPath, {});
      for (const m of models) {
        const file = `${b64(m.model)}.html`;
        if (existsSync(join(dayDir, file))) continue;
        const url = `${post.link.replace(/\/?$/, "/")}?kishu=${encodeURIComponent(m.model)}`;
        const kr = await politeFetchText(url, config);
        if (!kr.ok) continue;
        writeFileSync(join(dayDir, file), kr.text);
        meta[file] = m.model;
      }
      writeFileSync(metaPath, JSON.stringify(meta, null, 1));
      log(`  機種別詳細 ${models.length}機種`);
    }
  }
  log(`取得完了: レポート ${fetched}件`);
  return { fetched, aborted: null };
}

/** raw/*.html をパースして dataset.json と CSV 群を書き出す */
export function parseStep(config, log = console.log) {
  ensureDirs();
  const index = readJson(join(DATA_DIR, "index.json"), []);
  const postByDate = new Map(index.map((p) => [p.dataDate, p]));
  const files = readdirSync(RAW_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f)).sort();
  const records = [];
  let maskedCount = 0;
  for (const f of files) {
    const date = f.slice(0, 10);
    const html = readFileSync(join(RAW_DIR, f), "utf8");
    const report = parseReportPage(html);
    const masked = detectMasked(report);
    if (masked) maskedCount++;
    const kishuUnits = [];
    const dayDir = join(KISHU_DIR, date);
    if (existsSync(dayDir)) {
      const meta = readJson(join(dayDir, "_index.json"), {});
      for (const kf of readdirSync(dayDir)) {
        if (!kf.endsWith(".html")) continue;
        const rows = parseUnitTable(readFileSync(join(dayDir, kf), "utf8"));
        if (rows.length) kishuUnits.push({ model: meta[kf] ?? null, rows: rows.filter((r) => !r.date) });
      }
    }
    const post = postByDate.get(date);
    records.push({ date, postId: post?.postId ?? null, title: post?.title ?? null, report, masked, kishuUnits });
  }
  // 記事一覧にだけ存在する日（旧レイアウト等で raw 不在）もタイトル情報で拾う
  for (const p of index) {
    if (records.some((r) => r.date === p.dataDate)) continue;
    if (/総差枚|平均差枚/.test(p.title || "")) {
      records.push({ date: p.dataDate, postId: p.postId, title: p.title, report: null, masked: false, kishuUnits: [] });
    }
  }
  const dataset = buildDataset(records);
  writeFileSync(join(DATA_DIR, "dataset.json"), JSON.stringify(dataset));
  writeFileSync(join(DATA_DIR, "days.csv"), toCsv(dataset.days, ["date", "y", "m", "d", "weekday", "nthWeekday", "status", "avgGames", "win", "total", "winRate", "avgDiff", "masked"]));
  writeFileSync(join(DATA_DIR, "models.csv"), toCsv(dataset.models, ["date", "model", "count", "avgDiff", "avgGames", "win", "total", "payout"]));
  writeFileSync(join(DATA_DIR, "units.csv"), toCsv(dataset.units, ["date", "model", "unit", "suffix", "diff", "games", "payout", "bb", "rb"]));
  writeFileSync(join(DATA_DIR, "suffixes.csv"), toCsv(dataset.suffixes, ["date", "suffix", "avgDiff", "avgGames", "win", "total", "winRate", "payout"]));
  log(`パース完了: ${dataset.days.length}日 / models ${dataset.models.length}行 / units ${dataset.units.length}行（マスク日 ${maskedCount}）→ data/*.csv, dataset.json`);
  return dataset;
}

export function analyzeStep(config, log = console.log) {
  const dataset = readJson(join(DATA_DIR, "dataset.json"), null);
  if (!dataset) throw new Error("dataset.json が無い。先に parse を実行すること。");
  const analysis = analyze(dataset, config);
  writeFileSync(join(DATA_DIR, "analysis.json"), JSON.stringify(analysis, null, 1));
  log(`分析完了 → data/analysis.json`);
  return analysis;
}

export function reportStep(config, log = console.log) {
  const analysis = readJson(join(DATA_DIR, "analysis.json"), null);
  if (!analysis) throw new Error("analysis.json が無い。先に analyze を実行すること。");
  const generatedAt = new Date().toLocaleString("ja-JP");
  writeFileSync(join(DATA_DIR, "report.html"), renderHtml(analysis, config, generatedAt));
  writeFileSync(join(DATA_DIR, "report.md"), renderMarkdown(analysis, config, generatedAt));
  log(`レポート生成 → data/report.html, data/report.md`);
}

export { todayStr };
