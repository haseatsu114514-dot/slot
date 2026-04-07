export const HEAVENLY_STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
export const EARTHLY_BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export const DEFAULT_CONFIG = Object.freeze({
  anchorDate: "2026-04-07",
  anchorKanshi: "辛亥",
  startMonth: "2026-04",
  monthCount: 3,
  syncIntervalMs: 60000,
  spreadsheetUrl: "",
  syncEndpoint: "",
  syncSecret: ""
});

export const RATING_THRESHOLDS = Object.freeze({
  specialMin: 8,
  goMin: 6,
  holdMin: 4
});

export const SEXAGENARY_CYCLE = Array.from(
  { length: 60 },
  (_, index) => HEAVENLY_STEMS[index % 10] + EARTHLY_BRANCHES[index % 12]
);

export const SEED_KANSHI_DATA = {
  "辛亥": { score: 9, ts: "比肩", avg: 70833, days: 3, sendan: 30016, tags: ["実績◎", "占断◎"] },
  "己亥": { score: 9, ts: "偏印", avg: 36000, days: 2, sendan: 23258, tags: ["実績◎", "占断◎"] },
  "戊午": { score: 8, ts: "印綬", avg: 13750, days: 2, sendan: 20701, tags: ["占断◎"] },
  "辛酉": { score: 8, ts: "比肩", avg: 13167, days: 3, sendan: 23004, tags: ["安定型", "占断◎"] },
  "戊辰": { score: 8, ts: "印綬", avg: 18000, days: 2, sendan: 21363, tags: ["合・飛"] },
  "戊戌": { score: 8, ts: "印綬", avg: 32200, days: 2, sendan: 29028, tags: ["実績◎", "占断◎"] },
  "丁亥": { score: 7, ts: "偏官", avg: 12500, days: 3, sendan: 19072, tags: ["安定型"] },
  "庚辰": { score: 7, ts: "劫財", avg: 46667, days: 3, sendan: 12666, tags: ["実績◎", "合・飛"] },
  "己酉": { score: 7, ts: "偏印", avg: 3000, days: 1, sendan: 16245, tags: ["占断◎"] },
  "戊寅": { score: 7, ts: "印綬", avg: 53000, days: 1, sendan: 20618, tags: ["占断◎"] },
  "庚午": { score: 6, ts: "劫財", avg: 16500, days: 2, sendan: 12004, tags: ["実績◎"] },
  "丁酉": { score: 6, ts: "偏官", avg: 18500, days: 2, sendan: 12060, tags: ["実績◎"] },
  "壬寅": { score: 5, ts: "傷官", avg: 19667, days: 3, sendan: 8135, tags: ["安定型"] },
  "丙寅": { score: 5, ts: "正官", avg: 15500, days: 2, sendan: 7611, tags: ["実績◎"] },
  "丙戌": { score: 5, ts: "正官", avg: 23000, days: 2, sendan: 5244, tags: ["実績◎"] },
  "庚戌": { score: 4, ts: "劫財", avg: -42000, days: 1, sendan: 20330, tags: ["占断◎", "実績×", "※要検証"] },
  "庚子": { score: 4, ts: "劫財", avg: 21333, days: 3, sendan: 8293, tags: ["空亡(半)", "実績◎"] },
  "辛未": { score: 4, ts: "比肩", avg: 5000, days: 2, sendan: 16804, tags: ["占断◎"] },
  "丙午": { score: 4, ts: "正官", avg: 38000, days: 1, sendan: 7694, tags: [] },
  "癸酉": { score: 4, ts: "食神", avg: 12500, days: 2, sendan: 6560, tags: [] },
  "戊子": { score: 4, ts: "印綬", avg: -36000, days: 1, sendan: 16990, tags: ["空亡(半)", "実績×", "※要検証"] },
  "辛卯": { score: 3, ts: "比肩", avg: 14650, days: 2, sendan: 15234, tags: ["冲", "実績◎"] },
  "辛巳": { score: 3, ts: "比肩", avg: -10233, days: 3, sendan: 15797, tags: ["占断◎", "実績×"] },
  "己未": { score: 3, ts: "偏印", avg: 3250, days: 2, sendan: 10045, tags: [] },
  "己巳": { score: 3, ts: "偏印", avg: 18500, days: 1, sendan: 9038, tags: [] },
  "丁未": { score: 3, ts: "偏官", avg: 10750, days: 2, sendan: 5860, tags: [] },
  "庚寅": { score: 3, ts: "劫財", avg: -25500, days: 2, sendan: 11921, tags: ["実績×"] },
  "丙辰": { score: 3, ts: "正官", avg: -7250, days: 2, sendan: 8356, tags: ["合・飛"] },
  "壬午": { score: 3, ts: "傷官", avg: -7000, days: 2, sendan: 8218, tags: [] },
  "壬子": { score: 2, ts: "傷官", avg: 14333, days: 3, sendan: 4507, tags: ["空亡(半)"] },
  "壬辰": { score: 2, ts: "傷官", avg: -17500, days: 2, sendan: 8880, tags: ["合・飛", "実績×"] },
  "壬戌": { score: 2, ts: "傷官", avg: -6000, days: 2, sendan: 5768, tags: [] },
  "丁巳": { score: 2, ts: "偏官", avg: 2625, days: 4, sendan: 4853, tags: ["データ多"] },
  "癸亥": { score: 2, ts: "食神", avg: -9667, days: 3, sendan: 13572, tags: ["実績×"] },
  "乙亥": { score: 1, ts: "偏財", avg: 20500, days: 1, sendan: 10938, tags: [] },
  "乙酉": { score: 1, ts: "偏財", avg: 9500, days: 2, sendan: 525, tags: [] },
  "甲午": { score: 1, ts: "正財", avg: 3000, days: 2, sendan: 2611, tags: [] },
  "甲寅": { score: 1, ts: "正財", avg: -9000, days: 1, sendan: 2528, tags: [] },
  "辛丑": { score: 1, ts: "比肩", avg: -28000, days: 1, sendan: 15154, tags: ["空亡(真)"] },
  "己卯": { score: 1, ts: "偏印", avg: 2750, days: 2, sendan: 8476, tags: ["冲"] },
  "戊申": { score: 1, ts: "印綬", avg: 6750, days: 2, sendan: 13986, tags: ["占断◎"] },
  "丙子": { score: 1, ts: "正官", avg: -81000, days: 1, sendan: 3983, tags: ["空亡(半)", "実績×"] },
  "己丑": { score: 0, ts: "偏印", avg: 4600, days: 2, sendan: 8395, tags: ["空亡(真)"] },
  "甲辰": { score: 0, ts: "正財", avg: -7500, days: 2, sendan: 3273, tags: ["合・飛"] },
  "丁卯": { score: 0, ts: "偏官", avg: null, days: 0, sendan: 4290, tags: ["冲", "データ無"] },
  "癸巳": { score: 0, ts: "食神", avg: 7000, days: 2, sendan: -647, tags: [] },
  "甲子": { score: 0, ts: "正財", avg: 22500, days: 2, sendan: -1100, tags: ["空亡(半)"] },
  "庚申": { score: -1, ts: "劫財", avg: -14000, days: 3, sendan: 5289, tags: ["実績×"] },
  "壬申": { score: -1, ts: "傷官", avg: 3000, days: 2, sendan: 1503, tags: [] },
  "甲戌": { score: -1, ts: "正財", avg: -6500, days: 2, sendan: 161, tags: [] },
  "丙申": { score: -1, ts: "正官", avg: 2375, days: 4, sendan: 979, tags: ["データ多"] },
  "癸丑": { score: -1, ts: "食神", avg: 28500, days: 2, sendan: -1290, tags: ["空亡(真)", "実績◎"] },
  "癸未": { score: -1, ts: "食神", avg: -7500, days: 2, sendan: 360, tags: [] },
  "乙巳": { score: -3, ts: "偏財", avg: -35000, days: 1, sendan: -6682, tags: ["実績×"] },
  "丁丑": { score: -3, ts: "偏官", avg: -16500, days: 2, sendan: 4210, tags: ["空亡(真)", "実績×"] },
  "乙未": { score: -4, ts: "偏財", avg: -11750, days: 2, sendan: -5675, tags: ["実績×"] },
  "癸卯": { score: -4, ts: "食神", avg: -28500, days: 2, sendan: -1210, tags: ["冲", "実績×"] },
  "乙卯": { score: -5, ts: "偏財", avg: -833, days: 3, sendan: -7244, tags: ["冲", "実績×"] },
  "甲申": { score: -5, ts: "正財", avg: -36500, days: 1, sendan: -4104, tags: ["実績×"] },
  "乙丑": { score: -6, ts: "偏財", avg: -35000, days: 1, sendan: -7325, tags: ["空亡(真)", "実績×"] }
};

export function resolveConfig(overrides = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...overrides
  };
}

export function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

export function toUtcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return toUtcDate(year, month, day);
}

export function formatDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
}

export function getWeekday(year, month, day) {
  return toUtcDate(year, month, day).getUTCDay();
}

export function getKanshiForDateKey(dateKey, config = DEFAULT_CONFIG) {
  const anchorDate = parseDateKey(config.anchorDate);
  const targetDate = parseDateKey(dateKey);
  const anchorIndex = SEXAGENARY_CYCLE.indexOf(config.anchorKanshi);
  const diffDays = Math.round((targetDate.getTime() - anchorDate.getTime()) / 86400000);
  const cycleIndex = mod(anchorIndex + diffDays, SEXAGENARY_CYCLE.length);
  return SEXAGENARY_CYCLE[cycleIndex];
}

export function getMonthSequence(startMonth, count) {
  const [yearText, monthText] = startMonth.split("-");
  const startYear = Number(yearText);
  const startMonthNumber = Number(monthText);
  const months = [];

  for (let offset = 0; offset < count; offset += 1) {
    const nextMonth = startMonthNumber + offset - 1;
    const year = startYear + Math.floor(nextMonth / 12);
    const month = mod(nextMonth, 12) + 1;
    months.push({
      year,
      month,
      label: `${year}年${month}月`
    });
  }

  return months;
}

export function normalizeTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split(/[、,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toNumberOrNull(value, fallback = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeRecord(name, input = {}) {
  const seedScore = toNumberOrNull(input.seedScore, toNumberOrNull(input.score, 0));
  const seedAvg = toNumberOrNull(input.seedAvg, toNumberOrNull(input.avg, null));
  const seedDays = toNumberOrNull(input.seedDays, toNumberOrNull(input.days, 0));
  const avg = toNumberOrNull(input.avg, seedAvg);
  const days = toNumberOrNull(input.days, seedDays);

  return {
    name,
    ts: input.ts || "",
    seedScore,
    score: toNumberOrNull(input.score, seedScore),
    seedAvg,
    avg,
    seedDays,
    days,
    sendan: toNumberOrNull(input.sendan, 0),
    tags: normalizeTags(input.tags)
  };
}

export function cloneRecordMap(records) {
  return Object.fromEntries(
    Object.entries(records).map(([name, record]) => [
      name,
      {
        ...record,
        tags: [...record.tags]
      }
    ])
  );
}

export function buildBaseRecords(seedData = SEED_KANSHI_DATA) {
  return Object.fromEntries(
    Object.entries(seedData).map(([name, data]) => [name, normalizeRecord(name, data)])
  );
}

export function buildRecordsFromPayload(recordMap = {}) {
  return Object.fromEntries(
    Object.entries(recordMap).map(([name, data]) => [name, normalizeRecord(name, data)])
  );
}

export function blendExpected(avg, sendan, days) {
  const forecast = toNumberOrNull(sendan, 0);
  if (avg === null || avg === undefined || days <= 0) return forecast;
  const actualWeight = Math.min(Math.max(days, 1), 5);
  const forecastWeight = 2;
  return ((avg * actualWeight) + (forecast * forecastWeight)) / (actualWeight + forecastWeight);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeLiveScore(record) {
  const seedBlend = blendExpected(record.seedAvg, record.sendan, record.seedDays);
  const liveBlend = blendExpected(record.avg, record.sendan, record.days);
  const scoreShift = clamp(Math.round((liveBlend - seedBlend) / 12000), -3, 3);
  return clamp(record.seedScore + scoreShift, -6, 9);
}

export function applyEntriesToRecords(records, entries = []) {
  const nextRecords = cloneRecordMap(records);

  entries.forEach((entry) => {
    if (!entry || !entry.kanshi || !Number.isFinite(Number(entry.profit))) return;
    const profit = Number(entry.profit);
    const current = nextRecords[entry.kanshi] || normalizeRecord(entry.kanshi, { score: 0, days: 0, avg: null, sendan: 0, ts: "" });
    const currentDays = current.days || 0;
    const currentTotal = current.avg === null || current.avg === undefined ? 0 : current.avg * currentDays;
    const nextDays = currentDays + 1;
    const nextAvg = Math.round((currentTotal + profit) / nextDays);

    current.days = nextDays;
    current.avg = nextAvg;
    current.score = computeLiveScore(current);
    nextRecords[entry.kanshi] = current;
  });

  return nextRecords;
}

export function getRating(score) {
  if (score >= RATING_THRESHOLDS.specialMin) {
    return { label: "◎", tier: "special", text: "絶好の日" };
  }
  if (score >= RATING_THRESHOLDS.goMin) {
    return { label: "○", tier: "go", text: "行くべき日" };
  }
  if (score >= RATING_THRESHOLDS.holdMin) {
    return { label: "△", tier: "hold", text: "どちらでもよい日" };
  }
  return { label: "×", tier: "avoid", text: "見送り推奨" };
}

export function formatYen(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "データ無";
  const number = Number(value);
  const sign = number >= 0 ? "+" : "-";
  return `${sign}¥${Math.abs(number).toLocaleString("ja-JP")}`;
}

export function buildDayInfo(dateKey, records, config = DEFAULT_CONFIG) {
  const date = parseDateKey(dateKey);
  const kanshi = getKanshiForDateKey(dateKey, config);
  const record = records[kanshi] || normalizeRecord(kanshi, {});
  const rating = getRating(record.score);
  return {
    date,
    dateKey,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
    kanshi,
    record,
    rating
  };
}

export function buildCalendarMonth(year, month, records, config = DEFAULT_CONFIG) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getWeekday(year, month, 1);
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }

  const dayRows = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatDateKey(toUtcDate(year, month, day));
    const info = buildDayInfo(dateKey, records, config);
    cells.push(info);
    dayRows.push(info);
  }

  const stats = {
    special: dayRows.filter((day) => day.record.score >= RATING_THRESHOLDS.specialMin).length,
    go: dayRows.filter((day) => day.record.score >= RATING_THRESHOLDS.goMin && day.record.score < RATING_THRESHOLDS.specialMin).length,
    hold: dayRows.filter((day) => day.record.score >= RATING_THRESHOLDS.holdMin && day.record.score < RATING_THRESHOLDS.goMin).length,
    avoid: dayRows.filter((day) => day.record.score < RATING_THRESHOLDS.holdMin).length
  };

  return {
    year,
    month,
    label: `${year}年${month}月`,
    cells,
    dayRows,
    stats
  };
}
