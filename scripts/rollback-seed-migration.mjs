#!/usr/bin/env node
// 過去実績シート移行 (migrate-seed-history.mjs) を取り消すスクリプト。
//
// 使い方:
//   node scripts/rollback-seed-migration.mjs        # ドライラン (何件消すか表示のみ)
//   node scripts/rollback-seed-migration.mjs --run  # 実際に削除する
//
// 背景:
// - migrate-seed-history.mjs が旧版 Apps Script (addResult が appended を返さない)
//   に対して走り、書き込み成功を「失敗」と誤判定して 3 回リトライ。結果 122 件が
//   3 重に書き込まれ 366 行になった。さらに推定日付なので「打っていない日に大金」が
//   出てしまった。
// - このスクリプトはメモに SEED_MIGRATION_MARKER を含む行を **すべて** 削除し、
//   移行前 (実記録のみ) の状態へ戻す。
//
// 安全性:
// - 削除は行の id 指定。マーカーの無い実記録 (手入力分) には一切触れない。
// - 削除は id キーなので何度リトライしても多重削除にならない (idempotent)。
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { SEED_MIGRATION_MARKER } from "../kanshi-data.js";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const indexHtml = fs.readFileSync(path.join(here, "../index.html"), "utf8");
const endpoint = indexHtml.match(/syncEndpoint:\s*"([^"]+)"/)?.[1];
const secret = indexHtml.match(/syncSecret:\s*"([^"]*)"/)?.[1] ?? "";
if (!endpoint) {
  console.error("index.html から syncEndpoint を読み取れませんでした。");
  process.exit(1);
}

const RUN = process.argv.includes("--run");

async function fetchDashboard() {
  const res = await fetch(`${endpoint}?secret=${encodeURIComponent(secret)}&action=dashboard`, {
    redirect: "follow"
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`dashboard 取得失敗: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

function markerRows(entries) {
  return (entries || []).filter((e) => String(e.memo || "").includes(SEED_MIGRATION_MARKER));
}

const dashboard = await fetchDashboard();
const entries = dashboard.entries || [];
const targets = markerRows(entries).filter((e) => e.id);
const realCount = entries.length - markerRows(entries).length;

console.log(`シート総行数: ${entries.length} 件`);
console.log(`削除対象 (移行マーカー行): ${markerRows(entries).length} 件`);
console.log(`残る実記録: ${realCount} 件`);

if (markerRows(entries).length !== targets.length) {
  console.warn(`注意: id の無いマーカー行が ${markerRows(entries).length - targets.length} 件あります (id 指定で消せない分)`);
}

if (!RUN) {
  console.log("\nドライランです。実際に削除するには --run を付けてください。");
  process.exit(0);
}

let deleted = 0;
const failed = [];
for (let i = 0; i < targets.length; i += 1) {
  const row = targets[i];
  const body = { action: "deleteResult", secret, id: row.id, entry: { id: row.id } };
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt += 1) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      // 旧版/新版どちらのレスポンス形でも ok:true なら受理 (id 削除は idempotent)。
      if (data.ok) {
        ok = true;
        if (data.deleted) deleted += 1;
      } else {
        throw new Error(JSON.stringify(data).slice(0, 160));
      }
    } catch (error) {
      if (attempt === 3) failed.push({ id: row.id, error: String(error) });
      else await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${targets.length} 件処理...`);
  await new Promise((r) => setTimeout(r, 200));
}

const after = await fetchDashboard();
const remaining = markerRows(after.entries).length;
console.log(`\n完了: deleted応答 ${deleted} 件 / 残存マーカー行 ${remaining} / 失敗 ${failed.length} 件`);
console.log(`現在のシート総行数: ${(after.entries || []).length} 件`);
for (const f of failed.slice(0, 10)) console.log("  失敗:", f.id, "-", f.error);
process.exit(remaining !== 0 || failed.length > 0 ? 1 : 0);
