#!/usr/bin/env node
// 焼き込みの過去実績 (kanshi-data.js の SEED_MONTHLY_ENTRIES, 122日分) を
// Google Sheets の「実績入力」シートへ行として移行するスクリプト。
//
// 使い方:
//   node scripts/migrate-seed-history.mjs        # ドライラン (何も書き込まない)
//   node scripts/migrate-seed-history.mjs --run  # 実際にシートへ書き込む
//
// 仕組み:
// - 各収支は「その干支の過去の出現日」に推定日付で割り当てる (buildPastSeedEntries)。
//   推定日付は最初の実エントリ (2026-04-07) より前になるため、実記録とは衝突しない。
// - メモに SEED_MIGRATION_MARKER を入れる。アプリはこの目印を見つけると
//   焼き込みの実績を使わずシートのエントリ全量から再構成する (二重計上防止)。
// - 既に目印つきの行がシートにあれば何もしない (二重移行防止)。
//
// 注意: 公開サイトが移行対応版 (v=20260612b 以降) になってから実行すること。
// 旧版のアプリで移行後のシートを読むと実績が二重計上されて表示される。
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import {
  SEED_MONTHLY_ENTRIES,
  SEED_MIGRATION_MARKER,
  buildPastSeedEntries
} from "../kanshi-data.js";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const indexHtml = fs.readFileSync(path.join(here, "../index.html"), "utf8");
const endpoint = indexHtml.match(/syncEndpoint:\s*"([^"]+)"/)?.[1];
const secret = indexHtml.match(/syncSecret:\s*"([^"]*)"/)?.[1] ?? "";
if (!endpoint) {
  console.error("index.html から syncEndpoint を読み取れませんでした。");
  process.exit(1);
}

const RUN = process.argv.includes("--run");
const MEMO = `${SEED_MIGRATION_MARKER} 日付は干支からの推定`;

async function fetchDashboard() {
  const res = await fetch(`${endpoint}?secret=${encodeURIComponent(secret)}&action=dashboard`, {
    redirect: "follow"
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`dashboard 取得失敗: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

// デプロイ済み Apps Script が「現行版」かを確認する。
// 旧版は addResult が成功しても { appended } を返さず dashboard を返すため、
// 成功を失敗と誤判定して 3 重書き込みする事故が起きた。さらに旧版は
// deleteResult 未対応で、書き込んだ行を後から消せない (ロールバック不能)。
// よって deleteResult が通る版でなければ移行を拒否する。
async function assertDeployIsCurrent() {
  const res = await fetch(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "deleteResult", secret, id: "__preflight_probe__" })
  });
  const data = await res.json().catch(() => ({}));
  // 現行版は該当行が無ければ { ok:true, notFound:true } を返す。
  // 旧版は { ok:false, error:"unknown_action" }。
  if (data.error === "unknown_action") {
    console.error(
      "中止: デプロイ済み Apps Script が旧版です (deleteResult 未対応)。\n" +
      "  旧版に移行すると (1) addResult の応答形が違い 3 重書き込みになり、\n" +
      "  (2) 書き込んだ行を後で消せません。\n" +
      "  先に README『Apps Script を更新する手順 (再デプロイ)』で現行 Code.gs を\n" +
      "  新バージョンとしてデプロイしてから再実行してください。"
    );
    process.exit(1);
  }
}

await assertDeployIsCurrent();
const dashboard = await fetchDashboard();
const existing = dashboard.entries || [];
const alreadyMigrated = existing.filter((e) => String(e.memo || "").includes(SEED_MIGRATION_MARKER));
if (alreadyMigrated.length > 0) {
  console.log(`既に移行済みの行が ${alreadyMigrated.length} 件あります。二重移行を避けるため何もしません。`);
  process.exit(0);
}

const realDates = existing.map((e) => e.targetDate).filter(Boolean).sort();
const referenceDateKey = realDates[0] || "2026-04-07";
const exclude = new Set(existing.map((e) => `${e.kanshi}|${e.targetDate}`));
const rows = buildPastSeedEntries(SEED_MONTHLY_ENTRIES, referenceDateKey, undefined, exclude)
  .sort((a, b) => a.targetDate.localeCompare(b.targetDate));

console.log(`シートの既存行: ${existing.length} 件 (最古 ${referenceDateKey})`);
console.log(`移行対象: ${rows.length} 件 (推定日付 ${rows[0]?.targetDate} 〜 ${rows[rows.length - 1]?.targetDate})`);

if (!RUN) {
  for (const row of rows) console.log(`  ${row.targetDate} ${row.kanshi} ${row.profit}`);
  console.log("\nドライランです。実際に書き込むには --run を付けてください。");
  process.exit(0);
}

let appended = 0;
const failed = [];
for (let i = 0; i < rows.length; i += 1) {
  const row = rows[i];
  const body = {
    action: "addResult",
    secret,
    allowSameDateProfit: true,
    entry: { targetDate: row.targetDate, kanshi: row.kanshi, profit: row.profit, memo: MEMO }
  };
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt += 1) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      // 成功判定は data.ok を主軸にする。appended/duplicate が付かない応答でも
      // ok:true なら書き込みは通っているので、リトライで二重書き込みしない。
      if (data.ok) {
        ok = true;
        if (data.appended) appended += 1;
      } else {
        throw new Error(JSON.stringify(data).slice(0, 200));
      }
    } catch (error) {
      if (attempt === 2) failed.push({ row, error: String(error) });
      else await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${rows.length} 件送信...`);
  await new Promise((r) => setTimeout(r, 250));
}

const after = await fetchDashboard();
const markerCount = (after.entries || []).filter((e) => String(e.memo || "").includes(SEED_MIGRATION_MARKER)).length;
console.log(`\n完了: 追加 ${appended} 件 / シート上の移行行 ${markerCount}/${rows.length} / 失敗 ${failed.length} 件`);
for (const f of failed) console.log("  失敗:", f.row.targetDate, f.row.kanshi, f.row.profit, "-", f.error);
process.exit(failed.length > 0 || markerCount !== rows.length ? 1 : 0);
