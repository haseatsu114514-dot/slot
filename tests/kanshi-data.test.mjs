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
  getDynamicRange,
  getMonthKanshiForDateKey,
  MONTH_PILLAR_TRANSITIONS,
  SEED_KANSHI_DATA,
  normalizeTags,
  toNumberOrNull,
  normalizeRecord,
  blendExpected,
  clamp,
  computeLiveScore,
  getRating,
  applyEntriesToRecords,
  buildBaseRecords,
  buildCalendarMonth,
  buildDayInfo,
  isPerfectRecord,
  resolveConfig,
  buildDailyBoard,
  getKichoDirections,
  getKyuseiForDateKey,
  aggregateByKyusei,
  getKyuseiPerformanceContext,
  aggregateByRatingTier,
  buildPastSeedEntries,
  SEED_MONTHLY_ENTRIES
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

function addDays(dateKey, days) {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateKey(date);
}

function findDateForStar(star) {
  for (let offset = 0; offset < SEXAGENARY_CYCLE.length; offset += 1) {
    const dateKey = addDays(DEFAULT_CONFIG.anchorDate, offset);
    if (getKyuseiForDateKey(dateKey).number === star) return dateKey;
  }
  return null;
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

suite("動的表示範囲", () => {
  test("getDynamicRange は既定で過去12か月〜未来3か月 (計16か月)", () => {
    const range = getDynamicRange("2026-06-11");
    assert.equal(range.startMonth, "2025-06");
    assert.equal(range.monthCount, 16);
  });
  test("年跨ぎでも startMonth が正しい", () => {
    const range = getDynamicRange("2026-01-15", { pastMonths: 2, futureMonths: 1 });
    assert.equal(range.startMonth, "2025-11");
    assert.equal(range.monthCount, 4);
  });
  test("getMonthSequence と組むと今日の月を含み futureMonths 先で終わる", () => {
    const range = getDynamicRange("2027-03-01");
    const months = getMonthSequence(range.startMonth, range.monthCount);
    assert.ok(months.some((m) => m.year === 2027 && m.month === 3));
    const last = months[months.length - 1];
    assert.equal(`${last.year}-${last.month}`, "2027-6");
  });
});

suite("月干支 (節入り)", () => {
  test("既存範囲: 2026-06-10 は 甲午", () => {
    assert.equal(getMonthKanshiForDateKey("2026-06-10"), "甲午");
  });
  test("延長分: 立秋 2026-08-07 20:43 → 当日正午はまだ乙未、翌日から丙申", () => {
    assert.equal(getMonthKanshiForDateKey("2026-08-07"), "乙未");
    assert.equal(getMonthKanshiForDateKey("2026-08-08"), "丙申");
  });
  test("2027 立春 (02-04 10:46) は当日正午から 壬寅", () => {
    assert.equal(getMonthKanshiForDateKey("2027-02-03"), "辛丑");
    assert.equal(getMonthKanshiForDateKey("2027-02-04"), "壬寅");
  });
  test("2028 年末まで解決できる", () => {
    assert.equal(getMonthKanshiForDateKey("2028-12-31"), "甲子");
  });
  test("月干支は節入りごとに干支順で1つ進む (打ち間違い検知)", () => {
    for (let i = 1; i < MONTH_PILLAR_TRANSITIONS.length; i += 1) {
      const prev = SEXAGENARY_CYCLE.indexOf(MONTH_PILLAR_TRANSITIONS[i - 1].kanshi);
      const next = SEXAGENARY_CYCLE.indexOf(MONTH_PILLAR_TRANSITIONS[i].kanshi);
      assert.equal(
        next,
        (prev + 1) % 60,
        `${MONTH_PILLAR_TRANSITIONS[i - 1].kanshi} → ${MONTH_PILLAR_TRANSITIONS[i].kanshi}`
      );
    }
  });
  test("節入りデータが表示範囲 (今日+4か月) をカバーしている", () => {
    const guard = new Date();
    guard.setMonth(guard.getMonth() + 4);
    const guardKey = formatDateKey(new Date(Date.UTC(guard.getFullYear(), guard.getMonth(), guard.getDate(), 12)));
    const last = MONTH_PILLAR_TRANSITIONS[MONTH_PILLAR_TRANSITIONS.length - 1];
    assert.ok(
      last.startsAt.slice(0, 10) >= guardKey,
      `節入りデータが ${last.startsAt.slice(0, 10)} までしか無い。国立天文台の暦要項から翌年分を kanshi-data.js に追記すること`
    );
  });
});

suite("seed データ整合性", () => {
  test("SEED_KANSHI_DATA の days/avg が SEED_MONTHLY_ENTRIES と一致する", () => {
    for (const [kanshi, values] of Object.entries(SEED_MONTHLY_ENTRIES)) {
      const seed = SEED_KANSHI_DATA[kanshi];
      assert.ok(seed, `${kanshi} の seed データが無い`);
      const days = values.length;
      const avg = days ? Math.round(values.reduce((sum, v) => sum + v, 0) / days) : null;
      assert.equal(seed.days, days, `${kanshi} の days: seed=${seed.days} entries=${days}`);
      assert.equal(seed.avg, avg, `${kanshi} の avg: seed=${seed.avg} entries=${avg}`);
    }
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
    // (10000*5 + (-2000)*2) / 7 = 46000/7 ≈ 6571
    assert.ok(result > 5000);
    assert.ok(result < 10000);
  });
  test("シュリンクブレンドは days に上限を設けず avg に寄り続ける", () => {
    // 旧実装は days を 6 で頭打ちしていたので、20 日と 6 日で同じ結果。
    // 新実装では 20 日の方が avg に近くなる。
    const six = blendExpected(10000, 0, 6);
    const twenty = blendExpected(10000, 0, 20);
    assert.ok(twenty > six, `${twenty} should be > ${six}`);
    assert.ok(twenty < 10000);
  });
  test("computeLiveScore は +4000 円改善でも shift と data-driven blend で動く", () => {
    // seed と live で +4000 円のずれ → seedBased = 5+1 = 6
    // dataDriven (avg=15600) = 7、days=5 で dataWeight = 5/9 ≈ 0.556
    // blended = round(6*0.444 + 7*0.556) = round(6.556) = 7
    const record = normalizeRecord("辛亥", {
      seedScore: 5,
      seedAvg: 10000,
      seedDays: 5,
      sendan: 10000,
      avg: 15600,
      days: 5,
      tags: []
    });
    assert.equal(computeLiveScore(record), 7);
  });
  test("seedScore が低くても avg が高ければ days に応じて引き上がる", () => {
    // 庚子 のような「seedScore=4, avg=21333, days=3」想定
    // dataDriven = 8 (avg>=18000), seedBased = 4 + (差 / 6000) ≈ 4
    // days=3 → dataWeight = 3/7 ≈ 0.429
    // blended = round(4*0.571 + 8*0.429) ≈ round(5.71) = 6
    // sendan=8293 で sendan_cap=7、avg-sendan=13040 かつ days<5 なので緩和なし → 6 に着地
    const record = normalizeRecord("庚子", {
      seedScore: 4,
      seedAvg: 21333,
      seedDays: 3,
      sendan: 8293,
      avg: 21333,
      days: 3,
      tags: []
    });
    const score = computeLiveScore(record);
    assert.ok(score >= 5, `expected uplift to >= 5, got ${score}`);
  });
  test("days が増えるほどデータ駆動寄りになる (同じ avg でも score が上がる)", () => {
    const make = (days) => normalizeRecord("X", {
      seedScore: 2, seedAvg: 14000, seedDays: 1,
      sendan: 14000, avg: 14000, days, tags: []
    });
    const few = computeLiveScore(make(2));
    const many = computeLiveScore(make(15));
    assert.ok(many > few, `days=15 (${many}) should beat days=2 (${few})`);
  });
  test("sendan が低くても avg が大きく上回り days>=5 なら sendan cap が緩和される", () => {
    // 旧: sendan=4000 → cap=6 で頭打ち。新: avg-sendan>8000 かつ days>=5 で cap=7。
    const record = normalizeRecord("X", {
      seedScore: 9, seedAvg: 25000, seedDays: 5,
      sendan: 4000, avg: 20000, days: 6, tags: []
    });
    assert.ok(computeLiveScore(record) >= 7, "cap should expand from 6 to 7");
  });
  test("失望キャップ: sendan は強気でも avg が下回り days>=5 なら avg ベースの cap に抑え込まれる", () => {
    // sendan=22000 → 本来の天井は 9、だが avg=12000 で days=6、差 -10000 > 8000 → avgCap=8 で頭打ち。
    // seedScore=9 のままでは 9 が出てしまうところを、失望キャップで 8 以下に抑える。
    const record = normalizeRecord("X", {
      seedScore: 9, seedAvg: 22000, seedDays: 5,
      sendan: 22000, avg: 12000, days: 6, tags: []
    });
    assert.ok(computeLiveScore(record) <= 8, `expected <= 8, got ${computeLiveScore(record)}`);
  });
  test("getRating は閾値で tier が変わる (★はスコア8以上)", () => {
    assert.equal(getRating(9).tier, "perfect");
    assert.equal(getRating(8).tier, "perfect");
    assert.equal(getRating(7).tier, "special");
    assert.equal(getRating(5).tier, "go");
    assert.equal(getRating(3).tier, "hold");
    assert.equal(getRating(0).tier, "avoid");
  });
  test("isPerfectRecord はスコア8以上で true", () => {
    assert.equal(isPerfectRecord({ score: 9 }), true);
    assert.equal(isPerfectRecord({ score: 8 }), true);
    assert.equal(isPerfectRecord({ score: 7 }), false);
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

suite("九星補正", () => {
  test("2028 の陰遁/陽遁切替日は甲子日で、起点の星が正しい", () => {
    assert.equal(getKanshiForDateKey("2028-06-08"), "甲子");
    assert.equal(getKyuseiForDateKey("2028-06-08").number, 9);
    assert.equal(getKanshiForDateKey("2028-12-05"), "甲子");
    assert.equal(getKyuseiForDateKey("2028-12-05").number, 1);
  });

  test("aggregateByKyusei は9星ぶんの集計を返す", () => {
    const rows = aggregateByKyusei(buildBaseRecords());
    assert.equal(rows.length, 9);
    const row2 = rows.find((row) => row.key === 2);
    const row5 = rows.find((row) => row.key === 5);
    assert.ok(row2.sampleDays > 0);
    assert.ok(row2.avgActual > row5.avgActual);
  });

  test("九星の強弱に応じて補正の正負が分かれる", () => {
    const records = buildBaseRecords();
    const goodDate = findDateForStar(2);
    const badDate = findDateForStar(5);
    const good = getKyuseiPerformanceContext(goodDate, records);
    const bad = getKyuseiPerformanceContext(badDate, records);

    assert.equal(good.kyusei.number, 2);
    assert.equal(bad.kyusei.number, 5);
    assert.ok(good.adjustment > 0);
    assert.ok(bad.adjustment < 0);
  });

  test("buildDayInfo に九星補正が反映される", () => {
    const records = buildBaseRecords();
    const dateKey = findDateForStar(2);
    const info = buildDayInfo(dateKey, records);

    assert.ok(info.kyuseiContext);
    assert.equal(info.record.kyuseiAdjustment, info.kyuseiContext.adjustment);
    assert.equal(info.kyusei.number, info.kyuseiContext.kyusei.number);
  });
});

suite("過去サンプルの合成", () => {
  test("buildPastSeedEntries は各干支の過去出現日に値を割り当てる", () => {
    const refKey = "2026-04-21";
    const synthetic = buildPastSeedEntries(SEED_MONTHLY_ENTRIES, refKey);

    // 全エントリ数 = SEED_MONTHLY_ENTRIES の値の総数
    let expectedCount = 0;
    for (const values of Object.values(SEED_MONTHLY_ENTRIES)) {
      expectedCount += Array.isArray(values) ? values.length : 0;
    }
    assert.equal(synthetic.length, expectedCount);

    // すべての date は参照日より前
    for (const entry of synthetic) {
      assert.ok(entry.targetDate < refKey, `${entry.targetDate} should be before ${refKey}`);
    }

    // 壬子 のエントリがちゃんと壬子日に割り当てられている
    const nezuEntries = synthetic.filter((e) => e.kanshi === "壬子");
    assert.equal(nezuEntries.length, SEED_MONTHLY_ENTRIES["壬子"].length);
    for (const e of nezuEntries) {
      assert.equal(getKanshiForDateKey(e.targetDate), "壬子");
    }
  });

  test("buildPastSeedEntries は excludeDates に指定したペアを避ける", () => {
    const refKey = "2026-04-21";
    // 直近の 壬子 = 2026-04-08 を除外
    const exclude = new Set(["壬子|2026-04-08"]);
    const synthetic = buildPastSeedEntries(SEED_MONTHLY_ENTRIES, refKey, undefined, exclude);
    const nezu = synthetic.filter((e) => e.kanshi === "壬子");
    assert.ok(nezu.every((e) => e.targetDate !== "2026-04-08"));
  });
});

suite("評価別 平均収支の加重", () => {
  test("aggregateByRatingTier は days で重み付けした実績平均を返す", () => {
    const records = {
      A: { score: 6, days: 1, avg: 1000, sendan: 0 },
      B: { score: 6, days: 9, avg: 11000, sendan: 0 }
    };
    const rows = aggregateByRatingTier(records);
    const goRow = rows.find((row) => row.key === "go");
    // 単純平均 (1000+11000)/2 = 6000 ではなく、
    // 加重平均 (1000*1 + 11000*9) / (1+9) = 10000
    assert.equal(goRow.avgActual, 10000);
    assert.equal(goRow.totalDays, 10);
    assert.equal(goRow.count, 2);
  });

  test("aggregateByRatingTier は実績ゼロの tier で avgActual=null を返す", () => {
    const records = {
      A: { score: -3, days: 0, avg: null, sendan: 0 }
    };
    const rows = aggregateByRatingTier(records);
    const avoidRow = rows.find((row) => row.key === "avoid");
    assert.equal(avoidRow.avgActual, null);
    assert.equal(avoidRow.count, 1);
  });
});

// --- summary ------------------------------------------------------------

console.log(`\n結果: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
