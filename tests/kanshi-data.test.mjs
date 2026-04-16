// Lightweight test runner: plain `node tests/kanshi-data.test.mjs`.
// No framework — just node:assert. Each test logs ✓ / ✗ and the file
// exits non-zero if any assertion fails. Keep this fast (no DOM, no fetch).
import assert from "node:assert/strict";
import {
  SEXAGENARY_CYCLE,
  HEAVENLY_STEMS,
  EARTHLY_BRANCHES,
  RATING_THRESHOLDS,
  DEFAULT_CONFIG,
  mod,
  formatDateKey,
  parseDateKey,
  toUtcDate,
  getDaysInMonth,
  getKanshiForDateKey,
  getMonthSequence,
  normalizeTags,
  toNumberOrNull,
  normalizeRecord,
  blendExpected,
  clamp,
  getRating,
  applyEntriesToRecords,
  buildBaseRecords,
  buildCalendarMonth,
  isPerfectRecord,
  resolveConfig,
  buildDailyBoard,
  getKichoDirections
} from "../kanshi-data.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  \u2717 ${name}\n      ${error.message}`);
    failures.push({ name, error });
    failed += 1;
  }
}

function suite(label, fn) {
  console.log(`\n${label}`);
  fn();
}

// --- helpers -----------------------------------------------------------

suite("constants", () => {
  test("60干支サイクルが10×12=60件", () => {
    assert.equal(SEXAGENARY_CYCLE.length, 60);
  });
  test("天干10件・地支12件", () => {
    assert.equal(HEAVENLY_STEMS.length, 10);
    assert.equal(EARTHLY_BRANCHES.length, 12);
  });
  test("辛亥がサイクルに含まれる", () => {
    assert.ok(SEXAGENARY_CYCLE.includes("辛亥"));
  });
  test("RATING_THRESHOLDS が降順関係", () => {
    assert.ok(RATING_THRESHOLDS.perfectMin > RATING_THRESHOLDS.specialMin);
    assert.ok(RATING_THRESHOLDS.specialMin > RATING_THRESHOLDS.goMin);
    assert.ok(RATING_THRESHOLDS.goMin > RATING_THRESHOLDS.holdMin);
  });
});

suite("数値ユーティリティ", () => {
  test("mod は負の数でも正の余りを返す", () => {
    assert.equal(mod(-1, 60), 59);
    assert.equal(mod(61, 60), 1);
    assert.equal(mod(0, 60), 0);
  });
  test("clamp は範囲外をクリップ", () => {
    assert.equal(clamp(15, 0, 9), 9);
    assert.equal(clamp(-9, -6, 9), -6);
    assert.equal(clamp(3, 0, 9), 3);
  });
  test("toNumberOrNull は不正値で fallback", () => {
    assert.equal(toNumberOrNull("12"), 12);
    assert.equal(toNumberOrNull(""), null);
    assert.equal(toNumberOrNull("abc", 0), 0);
  });
  test("normalizeTags はカンマ区切りも配列も受け付ける", () => {
    assert.deepEqual(normalizeTags("実績◎,安定型"), ["実績◎", "安定型"]);
    assert.deepEqual(normalizeTags(["a", "", "b"]), ["a", "b"]);
    assert.deepEqual(normalizeTags(null), []);
  });
});

suite("日付ユーティリティ", () => {
  test("formatDateKey ↔ parseDateKey が往復", () => {
    const date = toUtcDate(2026, 4, 7);
    assert.equal(formatDateKey(date), "2026-04-07");
    assert.equal(formatDateKey(parseDateKey("2026-04-07")), "2026-04-07");
  });
  test("getDaysInMonth", () => {
    assert.equal(getDaysInMonth(2026, 2), 28);
    assert.equal(getDaysInMonth(2024, 2), 29); // 閏年
    assert.equal(getDaysInMonth(2026, 4), 30);
    assert.equal(getDaysInMonth(2026, 12), 31);
  });
  test("getMonthSequence は count 件返し、年跨ぎを処理", () => {
    const months = getMonthSequence("2026-11", 3);
    assert.equal(months.length, 3);
    assert.deepEqual(months.map((m) => `${m.year}-${m.month}`), [
      "2026-11",
      "2026-12",
      "2027-1"
    ]);
  });
});

suite("干支計算", () => {
  test("基準日が 2026-04-07 = 辛亥", () => {
    assert.equal(getKanshiForDateKey("2026-04-07"), "辛亥");
  });
  test("翌日は次のサイクル要素", () => {
    const idx = SEXAGENARY_CYCLE.indexOf("辛亥");
    const expected = SEXAGENARY_CYCLE[(idx + 1) % 60];
    assert.equal(getKanshiForDateKey("2026-04-08"), expected);
  });
  test("60日後は同じ干支に戻る", () => {
    assert.equal(getKanshiForDateKey("2026-06-06"), "辛亥");
  });
  test("60日前も同じ干支", () => {
    assert.equal(getKanshiForDateKey("2026-02-06"), "辛亥");
  });
});

suite("blendExpected / 評価", () => {
  test("実績ゼロなら sendan をそのまま返す", () => {
    assert.equal(blendExpected(null, 5000, 0), 5000);
  });
  test("実績多いほど avg 寄りになる", () => {
    const result = blendExpected(10000, -2000, 5);
    // 5*10000 + 2*(-2000) = 50000-4000 = 46000 / 7 ≈ 6571
    assert.ok(result > 5000);
    assert.ok(result < 10000);
  });
  test("getRating は閾値で tier が変わる", () => {
    assert.equal(getRating(9).tier, "perfect");
    assert.equal(getRating(7).tier, "special");
    assert.equal(getRating(5).tier, "go");
    assert.equal(getRating(3).tier, "hold");
    assert.equal(getRating(0).tier, "avoid");
  });
  test("isPerfectRecord", () => {
    assert.equal(isPerfectRecord({ score: 9 }), true);
    assert.equal(isPerfectRecord({ score: 8 }), false);
    assert.equal(isPerfectRecord(null), false);
  });
});

suite("レコード変換", () => {
  test("normalizeRecord が欠損値を埋める", () => {
    const rec = normalizeRecord("辛亥", { score: 6 });
    assert.equal(rec.name, "辛亥");
    assert.equal(rec.score, 6);
    assert.equal(rec.days, 0);
    assert.deepEqual(rec.tags, []);
  });
  test("buildBaseRecords は seed 全件を normalize", () => {
    const records = buildBaseRecords();
    assert.ok(records["辛亥"]);
    assert.equal(typeof records["辛亥"].score, "number");
  });
  test("applyEntriesToRecords はエントリで avg と days を更新", () => {
    const base = buildBaseRecords();
    const before = base["辛亥"];
    const beforeDays = before.days || 0;
    const next = applyEntriesToRecords(base, [
      { kanshi: "辛亥", profit: 10000, targetDate: "2026-04-07" }
    ]);
    assert.equal(next["辛亥"].days, beforeDays + 1);
    assert.notEqual(next["辛亥"], before, "新しいオブジェクトを返す（mutation禁止）");
  });
});

suite("カレンダー組み立て", () => {
  test("buildCalendarMonth が 2026年4月を 30日ぶん返す", () => {
    const records = buildBaseRecords();
    const month = buildCalendarMonth(2026, 4, records);
    assert.equal(month.dayRows.length, 30);
    assert.equal(month.label, "2026年4月");
    // 4/1 は水曜 → 先頭に空セルが3つ
    const leadingNulls = month.cells.slice(0, 4).filter((c) => c === null).length;
    assert.equal(leadingNulls, 3);
  });
  test("dayRows は kanshi が60干支に揃う", () => {
    const records = buildBaseRecords();
    const month = buildCalendarMonth(2026, 4, records);
    for (const day of month.dayRows) {
      assert.ok(SEXAGENARY_CYCLE.includes(day.kanshi));
    }
  });
});

suite("config", () => {
  test("resolveConfig が DEFAULT_CONFIG をベースにマージ", () => {
    const cfg = resolveConfig({ anchorDate: "2026-01-01" });
    assert.equal(cfg.anchorDate, "2026-01-01");
    assert.equal(cfg.anchorKanshi, DEFAULT_CONFIG.anchorKanshi);
  });
});

suite("吉方位", () => {
  test("四緑木星では本命殺・本命的殺・五黄殺・暗剣殺・七赤/六白/九紫を除外する", () => {
    const board = buildDailyBoard(1);
    assert.deepEqual(board, {
      NW: 2,
      W: 3,
      NE: 4,
      S: 5,
      N: 6,
      SW: 7,
      E: 8,
      SE: 9
    });

    const result = getKichoDirections(1, 4, [7, 6, 9]);
    assert.deepEqual(result.good, ["E", "W", "NW"]);
    assert.deepEqual(result.goodLabels, ["東", "西", "北西"]);
  });

  test("DEFAULT_CONFIG でも九紫火星を吉方位から除外する", () => {
    assert.deepEqual(DEFAULT_CONFIG.badStars, [7, 6, 9]);
  });
});

// --- summary ------------------------------------------------------------

console.log(`\n結果: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
