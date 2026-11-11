// tools/minrepo の手動取り込み（保存したページの判別・手入力の日別データ・分析期間の絞り込み）のテスト。
// 実行: node tests/minrepo-import.test.mjs

import assert from "node:assert/strict";
import { classifySavedPage, savedFromUrl, inferDate, missingDates } from "../tools/minrepo/lib/import.mjs";
import { parseDays, mergeDays, templateCsv, MANUAL_FILES } from "../tools/minrepo/lib/manual.mjs";
import { limitDataset, monthsBefore } from "../tools/minrepo/lib/dataset.mjs";
import { CONFIG } from "../tools/minrepo/config.mjs";

// 既定では自動取得しない・分析は直近 6 か月
assert.equal(CONFIG.autoFetch, false, "サイトへの自動アクセスは既定でオフ");
assert.equal(CONFIG.analysis.windowMonths, 6);
assert.equal(CONFIG.backfillMonths, 6);

// ---- 年の推定・集め残し ----
assert.equal(inferDate("11/10(火) タイホウ亀島店", "2026-11-12"), "2026-11-10");
assert.equal(inferDate("12/30(水) タイホウ亀島店", "2026-11-12"), "2025-12-30", "未来になる日付は前の年とみなす");
assert.equal(inferDate("2025/9/3(水) タイホウ亀島店", "2026-11-12"), "2025-09-03");
assert.equal(inferDate("みんレポ トップ", "2026-11-12"), null);
assert.deepEqual(missingDates(["2026-11-02"], "2026-11-01", "2026-11-03"), ["2026-11-01", "2026-11-03"]);
assert.deepEqual(missingDates(["2026-11-01"], "2026-11-01", "2026-11-01"), []);

// ---- 保存したページの判別 ----
const MAIN = `<!DOCTYPE html>
<!-- saved from url=(0033)https://min-repo.com/2712345/ -->
<html><head><meta charset="utf-8"><title>11/10(火) タイホウ亀島店 | みんレポ</title></head><body>
<table><tbody><tr><th>状況</th><td>通常</td></tr><tr><th>平均G数</th><td>3,100</td></tr><tr><th>勝率</th><td>130/320</td></tr></tbody></table>
<table><tbody><tr><th>機種</th><th>平均差枚</th><th>平均G数</th><th>勝率</th><th>出率</th></tr>
<tr data-count="20"><td>Lスマスロ北斗の拳</td><td>+120</td><td>3,100</td><td>9/20</td><td>101%</td></tr></tbody></table></body></html>`;
const KISHU = `<!DOCTYPE html>
<!-- saved from url=(0099)https://min-repo.com/2712345/?kishu=${encodeURIComponent("マイジャグラーV")} -->
<html><head><title>11/10(火) タイホウ亀島店 | みんレポ</title></head><body>
<table><tbody><tr><th>台番</th><th>差枚</th><th>G数</th><th>BB</th><th>RB</th><th>出率</th></tr>
<tr><td>501</td><td>+1,200</td><td>6,000</td><td>24</td><td>20</td><td>106%</td></tr></tbody></table>
<table><tbody><tr><th>機種</th><th>平均差枚</th><th>平均G数</th><th>勝率</th><th>出率</th></tr>
<tr data-count="3"><td>マイジャグラーV</td><td>+400</td><td>6,000</td><td>2/3</td><td>102%</td></tr></tbody></table></body></html>`;
{
  assert.equal(savedFromUrl(MAIN), "https://min-repo.com/2712345/");
  assert.equal(savedFromUrl('<link rel="canonical" href="https://min-repo.com/1/">'), "https://min-repo.com/1/");
  assert.equal(savedFromUrl("<p>x</p>"), null);

  const opts = { today: "2026-11-12", storeQuery: "タイホウ亀島", fileName: "x.html" };
  const main = classifySavedPage(MAIN, opts);
  assert.deepEqual([main.kind, main.date, main.model, main.warnings.length], ["report", "2026-11-10", null, 0]);

  // URL に ?kishu= があれば、機種一覧の表が付いていても機種別ページとして扱う
  const kishu = classifySavedPage(KISHU, opts);
  assert.deepEqual([kishu.kind, kishu.date, kishu.model, kishu.units], ["kishu", "2026-11-10", "マイジャグラーV", 1]);

  // 保存元 URL が無い機種別ページは、ファイル名を機種名の手がかりにする
  const noUrl = KISHU.replace(/<!-- saved from[^>]*-->/, "").replace(/<table><tbody><tr><th>機種<[\s\S]*<\/table>/, "");
  assert.deepEqual([classifySavedPage(noUrl, { ...opts, fileName: "ゴーゴージャグラー3.html" }).kind, classifySavedPage(noUrl, { ...opts, fileName: "ゴーゴージャグラー3.html" }).model], ["kishu", "ゴーゴージャグラー3"]);
  const unnamed = classifySavedPage(noUrl, { ...opts, fileName: "11_10(火) タイホウ亀島店.html" });
  assert.equal(unnamed.kind, "unknown");
  assert.ok(unnamed.reason.includes("機種名"));

  // 投稿日時が入っていればそれを使って年を決める（年跨ぎ）
  const yearEnd = MAIN.replace("11/10(火)", "12/31(水)").replace("<title>", '<meta property="article:published_time" content="2026-01-01T03:00:00+09:00"><title>');
  assert.equal(classifySavedPage(yearEnd, { ...opts, today: "2026-11-12" }).date, "2025-12-31");

  // 別の店・関係ないページ
  const other = classifySavedPage(MAIN.replace("タイホウ亀島店", "よその店"), opts);
  assert.equal(other.kind, "report");
  assert.equal(other.warnings.length, 1, "店名が違えば注意を出す");
  const junk = classifySavedPage("<html><head><title>みんレポ トップ</title></head><body><p>hello</p></body></html>", opts);
  assert.equal(junk.kind, "unknown");
  assert.ok(junk.reason.includes("表"));
  assert.equal(classifySavedPage("", opts).kind, "unknown");
}

// ---- 手入力の日別データ ----
{
  const { rows, errors } = parseDays(`date,avgDiff,win,total,avgGames,note
# 例,1,1,1,1,コメント
2026-11-10,-85,128,320,"3,150",
2026/11/9,+40,41%,,3000,勝率を%で
2026-11-08,,,,,未記入
bad,10,1,2,3,
2026-11-07,-10,150,,3000,
`);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { date: "2026-11-10", avgDiff: -85, win: 128, total: 320, winRate: 0.4, avgGames: 3150 });
  assert.deepEqual([rows[1].date, rows[1].winRate, rows[1].win, rows[1].total], ["2026-11-09", 0.41, null, null]);
  assert.equal(errors.length, 2, "日付不正と、勝率が 100% を超える行がエラー");
  assert.equal(parseDays(templateCsv("days")).rows.length, 0, "テンプレの例はコメント扱い");
  assert.ok(MANUAL_FILES.days.columns.includes("avgGames"));

  const pageDay = { date: "2026-11-10", y: 2026, m: 11, d: 10, weekday: 2, nthWeekday: 2, avgDiff: 50, winRate: 0.45, avgGames: 3300, win: 144, total: 320, masked: false };
  const emptyDay = { date: "2026-11-09", y: 2026, m: 11, d: 9, weekday: 1, nthWeekday: 2, avgDiff: null, winRate: null, avgGames: null, win: null, total: null, masked: false, status: "通常" };
  const merged = mergeDays([emptyDay, pageDay], [...rows, { date: "2026-11-05", avgDiff: -200, win: null, total: null, winRate: 0.3, avgGames: 2800 }]);
  assert.deepEqual(merged.map((d) => d.date), ["2026-11-05", "2026-11-09", "2026-11-10"]);
  assert.equal(merged[2].avgDiff, 50, "保存ページから読めた日は、手入力で上書きしない");
  assert.deepEqual([merged[1].avgDiff, merged[1].src, merged[1].status, merged[1].weekday], [40, "manual", "通常", 1], "空の日は手入力で埋める");
  assert.deepEqual([merged[0].weekday, merged[0].nthWeekday, merged[0].winRate], [4, 1, 0.3]);
  assert.equal(emptyDay.avgDiff, null, "元の配列は書き換えない");
  assert.deepEqual(mergeDays([pageDay], []), [pageDay]);
}

// ---- 分析期間（直近 N か月）----
{
  assert.equal(monthsBefore("2026-11-10", 6), "2026-05-10");
  assert.equal(monthsBefore("2026-08-31", 6), "2026-02-28", "存在しない日は月末に丸める");
  assert.equal(monthsBefore("2026-03-15", 6), "2025-09-15");
  const ds = {
    days: [{ date: "2026-04-30" }, { date: "2026-05-10" }, { date: "2026-11-10" }],
    models: [{ date: "2026-01-01" }, { date: "2026-06-01" }],
    units: [{ date: "2026-05-09" }, { date: "2026-05-10" }],
    suffixes: [],
    manual: { observations: [{ date: "2026-02-01" }, { date: "2026-10-01" }], calendar: [{ date: "2026-11-17" }, { date: "2025-12-01" }] },
  };
  const cut = limitDataset(ds, "2026-05-10");
  assert.deepEqual([cut.days.length, cut.models.length, cut.units.length, cut.manual.observations.length, cut.manual.calendar.length], [2, 1, 1, 1, 1]);
  assert.equal(cut.manual.calendar[0].date, "2026-11-17", "先の日付のメモは残る");
  assert.equal(ds.days.length, 3, "元の dataset は書き換えない");
  assert.equal(limitDataset({ days: [], models: [], units: [], suffixes: [] }, "2026-01-01").manual, undefined);
}

console.log("minrepo-import: all tests passed");
