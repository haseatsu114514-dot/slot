// tools/minrepo のパーサ・ユーティリティのテスト
// 実行: node tests/minrepo-parse.test.mjs

import assert from "node:assert/strict";
import { parseReportPage, parseUnitTable, detectMasked, decodeEntities, stripTags } from "../tools/minrepo/lib/parse.mjs";
import { parseNumber, parsePercent, parseFraction, parseDateFromTitle, parseTitleTotals, nthWeekdayOfMonth, toDateParts, permutationPValue, mulberry32 } from "../tools/minrepo/lib/util.mjs";

// ---- util ----
assert.equal(parseNumber("2,871"), 2871);
assert.equal(parseNumber("+1,192"), 1192);
assert.equal(parseNumber("-36,348"), -36348);
assert.equal(parseNumber("−151"), -151); // 全角マイナス
assert.equal(parseNumber("-"), null);
assert.equal(parseNumber(""), null);
assert.equal(parsePercent("100.2%"), 100.2);
assert.equal(parsePercent("-"), null);
assert.deepEqual(parseFraction("130/320"), { win: 130, total: 320 });

assert.equal(parseDateFromTitle("6/11(木) タイホウ亀島店", "2026-06-12T03:14:28"), "2026-06-11");
assert.equal(parseDateFromTitle("2025/9/3(水) タイホウ亀島店", "2025-09-04T03:03:33"), "2025-09-03");
// 年跨ぎ: 12月分が1月に投稿される
assert.equal(parseDateFromTitle("12/31(水) タイホウ亀島店", "2026-01-01T03:00:00"), "2025-12-31");

assert.deepEqual(parseTitleTotals("11/3(日) タイホウ亀島店 総差枚：-36,348 平均差枚：-151"), { totalDiff: -36348, avgDiff: -151 });
assert.equal(parseTitleTotals("6/11(木) タイホウ亀島店"), null);

assert.deepEqual(toDateParts("2026-06-06"), { y: 2026, m: 6, d: 6, weekday: 6 });
assert.equal(nthWeekdayOfMonth("2026-06-06"), 1); // 第1土曜
assert.equal(nthWeekdayOfMonth("2026-06-13"), 2);

{
  const rng = mulberry32(42);
  const a = [10, 12, 11, 13, 12, 11, 10, 12];
  const b = [0, 1, 2, 1, 0, 2, 1, 1];
  const p = permutationPValue(a, b, 500, rng);
  assert.ok(p != null && p < 0.05, `明確な差は有意になるはず: ${p}`);
  const p2 = permutationPValue([1, 2, 3, 4, 5], [1.1, 2.1, 2.9, 4.2, 4.8], 500, rng);
  assert.ok(p2 != null && p2 > 0.3, `差がなければ有意にならないはず: ${p2}`);
}

// ---- parse ----
assert.equal(decodeEntities("A&amp;B &#x30AB;&#12490;"), "A&B カナ");
assert.equal(stripTags('<a href="?kishu=x">L東京喰種</a>'), "L東京喰種");

const FIXTURE = `
<html><body>
<table class="sou"><tbody>
<tr><th>状況</th><td>旧イベント日<br>（3のつく日）</td></tr>
<tr><th>平均G数</th><td>2,871</td></tr>
<tr><th>勝率</th><td>130/320</td></tr>
<tr><th>旧イベント日</th><td><span>3のつく日、</span><span>第1土曜日</span><br><div>※追加・修正する必要がある場合は<a href="/contact/">お問い合わせ</a>ください</div></td></tr>
</tbody></table>
<table class="kishu _2dai"><tbody>
<tr data-count="0"><th>機種</th><th class="samai_cell">平均差枚</th><th>平均G数</th><th>勝率</th><th class="samai_cell _deritsu">出率</th></tr>
<tr data-count="36"><td><a href="?kishu=L%E5%8C%97%E6%96%97">Lスマスロ北斗の拳</a></td><td>+1,234</td><td>2,047</td><td>15/36</td><td>108.5%</td></tr>
<tr data-count="34"><td><a href="?kishu=mj">マイジャグラーV</a></td><td>-567</td><td>3,777</td><td>17/34</td><td>97.2%</td></tr>
<tr data-count="0"><th>機種</th><th>平均差枚</th><th>平均G数</th><th>勝率</th><th>出率</th></tr>
<tr data-count="12"><td><a href="?kishu=tg">L東京喰種 &amp; TEST</a></td><td>2,000</td><td>5,307</td><td>6/12</td><td>112%</td></tr>
</tbody></table>
<table class="kishu"><tbody>
<tr><th>機種</th><th>台番</th><th class="samai_cell">差枚</th><th>G数</th><th>出率</th></tr>
<tr><td><a href="?num=1318">L真・一騎当千</a></td><td>1318</td><td>-1,914</td><td>1,914</td><td>66.7%</td></tr>
<tr><td><a href="?num=2705">新ハナビ</a></td><td>2705</td><td>+3,732</td><td>3,732</td><td>133.3%</td></tr>
</tbody></table>
<table><tbody>
<tr><th>末尾</th><th>平均差枚</th><th>平均G数</th><th>勝率</th><th>出率</th></tr>
<tr><td><a href="?kishu=0">0</a></td><td>+500</td><td>3,367</td><td>15/29</td><td>105%</td></tr>
<tr><td><a href="?kishu=1">1</a></td><td>-</td><td>2,658</td><td>13/36</td><td>-</td></tr>
<tr><td><a href="?kishu=z">ゾロ目 (下二桁)</a></td><td>-200</td><td>2,693</td><td>11/26</td><td>98%</td></tr>
</tbody></table>
<table class="halllist"><tbody>
<tr><td>1</td><td>6/6(土) 銀星</td><td>長野県</td><td>+1,192</td></tr>
</tbody></table>
</body></html>`;

const report = parseReportPage(FIXTURE);
assert.equal(report.status, "旧イベント日 （3のつく日）");
assert.equal(report.oldEventDays, "3のつく日、第1土曜日");
assert.equal(report.avgGames, 2871);
assert.equal(report.win, 130);
assert.equal(report.total, 320);

assert.equal(report.models.length, 3, "繰り返しヘッダ行はスキップされるはず");
assert.deepEqual(report.models[0], { model: "Lスマスロ北斗の拳", count: 36, avgDiff: 1234, avgGames: 2047, win: 15, total: 36, payout: 108.5 });
assert.equal(report.models[2].model, "L東京喰種 & TEST");
assert.equal(report.models[2].count, 12);

assert.equal(report.units.length, 2);
assert.deepEqual(report.units[1], { model: "新ハナビ", unit: 2705, diff: 3732, games: 3732, payout: 133.3 });

assert.equal(report.suffixes.length, 3);
assert.equal(report.suffixes[1].avgDiff, null);
assert.equal(report.suffixes[2].suffix, "zorome");

assert.equal(detectMasked(report), false, "実数値はマスク扱いしない");

// マスクされたページ（差枚 0/±1・出率 100% 張り付き）は検知する
const maskedModels = Array.from({ length: 12 }, (_, i) => `<tr data-count="10"><td>機種${i}</td><td>${i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : -1}</td><td>2,000</td><td>5/10</td><td>100%</td></tr>`).join("");
const MASKED = `<table><tbody><tr><th>機種</th><th>平均差枚</th><th>平均G数</th><th>勝率</th><th>出率</th></tr>${maskedModels}</tbody></table>`;
assert.equal(detectMasked(parseReportPage(MASKED)), true);

// ---- parseUnitTable（?kishu= 機種別詳細 / ?num= 台番履歴）----
const KISHU_PAGE = `
<table><tbody>
<tr><th>台番</th><th>差枚</th><th>G数</th><th>BB</th><th>RB</th><th>出率</th></tr>
<tr><td>1001</td><td>+2,345</td><td>7,890</td><td>30</td><td>25</td><td>110%</td></tr>
<tr><td>1002</td><td>-1,000</td><td>3,000</td><td>10</td><td>5</td><td>89%</td></tr>
</tbody></table>`;
const kishuRows = parseUnitTable(KISHU_PAGE);
assert.equal(kishuRows.length, 2);
assert.equal(kishuRows[0].unit, 1001);
assert.equal(kishuRows[0].diff, 2345);
assert.equal(kishuRows[0].bb, 30);
assert.equal(kishuRows[1].rb, 5);

const NUM_PAGE = `
<table><tbody>
<tr><th>日付</th><th>差枚</th><th>G数</th><th>出率</th></tr>
<tr><td>9/3(水)</td><td>+1,000</td><td>2,000</td><td>116%</td></tr>
<tr><td>9/2(火)</td><td>-500</td><td>1,500</td><td>89%</td></tr>
</tbody></table>`;
const numRows = parseUnitTable(NUM_PAGE);
assert.equal(numRows.length, 2);
assert.equal(numRows[0].date, "9/3(水)");
assert.equal(numRows[1].diff, -500);

console.log("minrepo-parse: all tests passed");
