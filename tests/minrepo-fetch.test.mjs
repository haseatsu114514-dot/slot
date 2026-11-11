// tools/minrepo の取得処理（check / once）のテスト。サイトには繋がず、fetch を差し替えて確かめる。
//  - ブロックされている（空の応答）ときは、すぐ止まって空ページを溜め込まない
//  - 取れるときは、日別ページとジャグラー/ハナハナの台番別ページだけを取る
//  - 途中で止まっても、次回その日の残りから取り直す
// 実行: node tests/minrepo-fetch.test.mjs

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "minrepo-fetch-"));
process.env.MINREPO_DATA_DIR = dir;
const { fetchStep, checkStep, DATA_DIR } = await import("../tools/minrepo/lib/pipeline.mjs");
const { CONFIG } = await import("../tools/minrepo/config.mjs");
assert.equal(DATA_DIR, dir, "データの置き場所を差し替えられる");

const config = { ...CONFIG, delayMs: 0, jitterMs: 0, retries: 0 };
const silent = () => {};
const today = new Date(Date.now() + 9 * 3600 * 1000);
const ymd = (daysAgo) => new Date(today.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
const posts = [1, 2, 3, 4].map((ago) => {
  const date = ymd(ago);
  const [, m, d] = date.split("-").map(Number);
  return { id: 1000 + ago, date: `${ymd(ago - 1)}T03:00:00`, link: `https://min-repo.com/${1000 + ago}/`, title: { rendered: `${m}/${d}(x) タイホウ亀島店` } };
});
const DAY_PAGE = `<table><tbody><tr><th>機種</th><th>平均差枚</th><th>平均G数</th><th>勝率</th><th>出率</th></tr>
<tr data-count="20"><td>Lスマスロ北斗の拳</td><td>+120</td><td>3,100</td><td>9/20</td><td>101%</td></tr>
<tr data-count="8"><td>マイジャグラーV</td><td>-50</td><td>5,000</td><td>3/8</td><td>99%</td></tr>
<tr data-count="6"><td>キングハナハナ-30</td><td>+80</td><td>4,800</td><td>3/6</td><td>101%</td></tr>
<tr data-count="1"><td>ハッピージャグラーVⅢ</td><td>+10</td><td>4,000</td><td>1/1</td><td>100%</td></tr></tbody></table>`;
const KISHU_PAGE = `<table><tbody><tr><th>台番</th><th>差枚</th><th>G数</th><th>BB</th><th>RB</th><th>出率</th></tr><tr><td>501</td><td>+1,200</td><td>6,000</td><td>24</td><td>20</td><td>106%</td></tr></tbody></table>`;

/** fetch を差し替える。handler(url) → { status, body } */
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const { status = 200, body = "" } = handler(String(url), calls.length);
    if (status === "network") throw new Error("ECONNRESET");
    return new Response(body, { status });
  };
  return calls;
}
const reset = () => {
  rmSync(dir, { recursive: true, force: true });
};

// ---- ブロックされている: 一覧が空 ----
{
  reset();
  const calls = mockFetch(() => ({ body: "" }));
  const origError = console.error;
  console.error = silent;
  const r = await fetchStep(config, { backfill: true }, silent);
  const c = await checkStep(config, silent);
  console.error = origError;
  assert.equal(r.aborted, "empty");
  assert.equal(c.ok, false);
  assert.equal(c.reason, "empty");
  assert.ok(calls.length <= 6, `空の一覧で深追いしない: ${calls.length}回`);
  assert.ok(!existsSync(join(dir, "raw")) || readdirSync(join(dir, "raw")).filter((f) => f.endsWith(".html")).length === 0, "空ページを保存しない");
}

// ---- 一覧は取れるが、日別ページが空: 3 枚で止まる ----
{
  reset();
  const calls = mockFetch((url) => (url.includes("/wp-json/") ? { body: JSON.stringify(posts) } : { body: "" }));
  const origError = console.error;
  console.error = silent;
  const r = await fetchStep(config, { backfill: true }, silent);
  console.error = origError;
  assert.equal(r.aborted, "empty");
  assert.equal(calls.filter((u) => !u.includes("/wp-json/")).length, 3, "空の日別ページは 3 枚で見切る");
  assert.equal(readdirSync(join(dir, "raw")).filter((f) => f.endsWith(".html")).length, 0);
}

// ---- ダミー値（差枚 0/±1・出率 100% 張り付き）: 1 枚目で止まる ----
{
  reset();
  const masked = `<table><tbody><tr><th>機種</th><th>平均差枚</th><th>平均G数</th><th>勝率</th><th>出率</th></tr>${Array.from({ length: 12 }, (_, i) => `<tr data-count="10"><td>機種${i}</td><td>${i % 3 - 1}</td><td>2,000</td><td>5/10</td><td>100%</td></tr>`).join("")}</tbody></table>`;
  mockFetch((url) => (url.includes("/wp-json/") ? { body: JSON.stringify(posts) } : { body: masked }));
  const origError = console.error;
  console.error = silent;
  const r = await fetchStep(config, { backfill: true }, silent);
  const c = await checkStep(config, silent);
  console.error = origError;
  assert.equal(r.aborted, "masked");
  assert.equal(c.reason, "masked");
}

// ---- 通信できない ----
{
  reset();
  mockFetch(() => ({ status: "network" }));
  const origWarn = console.warn;
  console.warn = silent;
  const c = await checkStep({ ...config, retries: 0 }, silent);
  console.warn = origWarn;
  assert.deepEqual([c.ok, c.reason], [false, "network"]);
}

// ---- 取れる: check は 2 回のアクセスだけ ----
{
  reset();
  const calls = mockFetch((url) => (url.includes("/wp-json/") ? { body: JSON.stringify(posts) } : { body: DAY_PAGE }));
  const c = await checkStep(config, silent);
  assert.equal(c.ok, true);
  assert.equal(calls.length, 2, `check のアクセスは 2 回: ${calls.length}`);
  assert.equal(c.newest, ymd(1));
  assert.deepEqual(c.aType, ["マイジャグラーV", "キングハナハナ-30", "ハッピージャグラーVⅢ"]);
}

// ---- 取れる: 日別ページ + ジャグラー/ハナハナ（2 台以上）の台番別だけを取る。途中で止まっても続きから ----
{
  reset();
  let failKishuOnce = true;
  const calls = mockFetch((url) => {
    if (url.includes("/wp-json/")) return { body: JSON.stringify(posts) };
    if (url.includes("?kishu=")) {
      // 1 日目のキングハナハナで 1 回だけ失敗させる（途中で止まった想定）
      if (failKishuOnce && url.includes(encodeURIComponent("キングハナハナ-30"))) {
        failKishuOnce = false;
        return { status: 404, body: "" };
      }
      return { body: KISHU_PAGE };
    }
    return { body: DAY_PAGE };
  });
  const r = await fetchStep(config, { backfill: true }, silent);
  assert.equal(r.aborted, null);
  assert.equal(r.fetched, 4);
  const kishuCalls = calls.filter((u) => u.includes("?kishu="));
  assert.ok(kishuCalls.every((u) => /%E3%82%B8%E3%83%A3%E3%82%B0%E3%83%A9%E3%83%BC|%E3%83%8F%E3%83%8A%E3%83%8F%E3%83%8A/.test(u)), "台番別はジャグラー/ハナハナだけ");
  assert.ok(!kishuCalls.some((u) => u.includes(encodeURIComponent("北斗"))), "スマスロの台番別は取らない");
  assert.ok(!kishuCalls.some((u) => u.includes(encodeURIComponent("ハッピー"))), "1 台だけの機種は台番別を取らない");
  assert.equal(kishuCalls.length, 4 * 2, "4 日 × 2 機種（失敗した 1 回を含む）");
  assert.equal(readdirSync(join(dir, "raw")).filter((f) => f.endsWith(".html")).length, 4);

  // 2 回目: 日別ページまで保存済みの日は取り直さない（404 だった機種別ページも、無いものとして扱う）
  const before = calls.length;
  const again = await fetchStep(config, { backfill: true }, silent);
  assert.equal(again.fetched, 0);
  assert.equal(calls.length - before, 1, "2 回目は一覧の確認 1 回だけ（取得済みの日は取り直さない）");
  const meta = JSON.parse(readFileSync(join(dir, "raw", "kishu", ymd(1), "_index.json"), "utf8"));
  assert.ok(Object.values(meta).includes("マイジャグラーV"));
}

// ---- 途中で止まった日（日別ページ未保存）は、次回その日の残りの機種別だけ取る ----
{
  reset();
  let stop = true;
  const calls = mockFetch((url) => {
    if (url.includes("/wp-json/")) return { body: JSON.stringify(posts.slice(0, 1)) };
    if (url.includes("?kishu=") && url.includes(encodeURIComponent("キングハナハナ-30")) && stop) return { status: "network" };
    if (url.includes("?kishu=")) return { body: KISHU_PAGE };
    return { body: DAY_PAGE };
  });
  const origWarn = console.warn;
  console.warn = silent;
  await assert.rejects(fetchStep(config, { backfill: true }, silent), /取得失敗/);
  console.warn = origWarn;
  assert.ok(!existsSync(join(dir, "raw", `${ymd(1)}.html`)), "機種別を取り終える前に止まった日は、日別ページをまだ保存しない");
  stop = false;
  const before = calls.length;
  const r = await fetchStep(config, { backfill: true }, silent);
  assert.equal(r.fetched, 1);
  const kishuAfter = calls.slice(before).filter((u) => u.includes("?kishu="));
  assert.deepEqual(kishuAfter.map((u) => decodeURIComponent(u.split("?kishu=")[1])), ["キングハナハナ-30"], "取り済みのマイジャグラーは取り直さない");
  assert.ok(existsSync(join(dir, "raw", `${ymd(1)}.html`)));
}

rmSync(dir, { recursive: true, force: true });
console.log("minrepo-fetch: all tests passed");
