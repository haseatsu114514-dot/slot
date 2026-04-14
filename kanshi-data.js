export const HEAVENLY_STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
export const EARTHLY_BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export const STEM_ELEMENT = Object.freeze({
  "甲": "木", "乙": "木",
  "丙": "火", "丁": "火",
  "戊": "土", "己": "土",
  "庚": "金", "辛": "金",
  "壬": "水", "癸": "水"
});

export const BRANCH_ELEMENT = Object.freeze({
  "寅": "木", "卯": "木",
  "巳": "火", "午": "火",
  "辰": "土", "戌": "土", "丑": "土", "未": "土",
  "申": "金", "酉": "金",
  "子": "水", "亥": "水"
});

export const ELEMENT_ORDER = Object.freeze(["木", "火", "土", "金", "水"]);

export const STEM_LABELS = Object.freeze({
  "甲": "正財",
  "乙": "偏財",
  "丙": "正官,調",
  "丁": "偏官",
  "戊": "印綬,補",
  "己": "偏印",
  "庚": "劫財",
  "辛": "比肩",
  "壬": "傷官,補",
  "癸": "食神"
});

export const BRANCH_LABELS = Object.freeze({
  "子": "半空,破",
  "丑": "真空",
  "寅": "",
  "卯": "冲",
  "辰": "合,飛",
  "巳": "",
  "午": "",
  "未": "",
  "申": "",
  "酉": "刑",
  "戌": "害,羊",
  "亥": ""
});

export const HOURS_PER_DAY = 3.5;

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
  perfectMin: 9,
  specialMin: 7,
  goMin: 5,
  holdMin: 3
});

const RAW_MONTH_PILLAR_TRANSITIONS = [
  { startsAt: "2025-05-05T14:57:00+09:00", kanshi: "辛巳" },
  { startsAt: "2025-06-05T18:57:00+09:00", kanshi: "壬午" },
  { startsAt: "2025-07-07T05:05:00+09:00", kanshi: "癸未" },
  { startsAt: "2025-08-07T14:52:00+09:00", kanshi: "甲申" },
  { startsAt: "2025-09-07T17:52:00+09:00", kanshi: "乙酉" },
  { startsAt: "2025-10-08T09:41:00+09:00", kanshi: "丙戌" },
  { startsAt: "2025-11-07T13:04:00+09:00", kanshi: "丁亥" },
  { startsAt: "2025-12-07T06:05:00+09:00", kanshi: "戊子" },
  { startsAt: "2026-01-05T17:23:00+09:00", kanshi: "己丑" },
  { startsAt: "2026-02-04T05:02:00+09:00", kanshi: "庚寅" },
  { startsAt: "2026-03-05T22:59:00+09:00", kanshi: "辛卯" },
  { startsAt: "2026-04-05T03:40:00+09:00", kanshi: "壬辰" },
  { startsAt: "2026-05-05T20:49:00+09:00", kanshi: "癸巳" },
  { startsAt: "2026-06-06T00:48:00+09:00", kanshi: "甲午" },
  { startsAt: "2026-07-07T10:57:00+09:00", kanshi: "乙未" }
];

export const MONTH_PILLAR_TRANSITIONS = Object.freeze(
  RAW_MONTH_PILLAR_TRANSITIONS.map((item) =>
    Object.freeze({
      ...item,
      startsAtMs: new Date(item.startsAt).getTime()
    })
  )
);

export const MONTH_STATUS_EFFECTS = Object.freeze({
  "半空": -0.5,
  "真空": -2,
  "冲": -1
});

export const MONTH_BRANCH_STATUS_MAP = Object.freeze({
  "子": ["半空"],
  "丑": ["真空"],
  "卯": ["冲"]
});

export const WEEKDAY_EFFECTS = Object.freeze({
  0: Object.freeze({ adjustment: -0.1, label: "日曜はやや逆風", shortLabel: "日曜弱め", tone: "caution" }),
  1: Object.freeze({ adjustment: 0, label: "月曜は中立", shortLabel: "月曜中立", tone: "neutral" }),
  2: Object.freeze({ adjustment: 0.3, label: "火曜はやや追い風", shortLabel: "火曜追い風", tone: "good" }),
  3: Object.freeze({ adjustment: -0.5, label: "水曜は弱め", shortLabel: "水曜弱め", tone: "rough" }),
  4: Object.freeze({ adjustment: 0.5, label: "木曜は強めの追い風", shortLabel: "木曜強め", tone: "good" }),
  5: Object.freeze({ adjustment: 0.2, label: "金曜はやや追い風", shortLabel: "金曜追い風", tone: "good" }),
  6: Object.freeze({ adjustment: 0, label: "土曜は荒れやすく中立", shortLabel: "土曜中立", tone: "neutral" })
});

export const SPECIAL_DATE_EFFECTS = Object.freeze({
  "年金注意": -1
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

export const SEED_MONTHLY_ENTRIES = Object.freeze({
  "甲子": Object.freeze([49000, -4000]),
  "乙丑": Object.freeze([-35000]),
  "丙寅": Object.freeze([36000, -5000]),
  "丁卯": Object.freeze([]),
  "戊辰": Object.freeze([-9000, 45000]),
  "己巳": Object.freeze([18500]),
  "庚午": Object.freeze([55000, -22000]),
  "辛未": Object.freeze([21000, -11000]),
  "壬申": Object.freeze([14000, -8000]),
  "癸酉": Object.freeze([18000, 7000]),
  "甲戌": Object.freeze([5000, -18000]),
  "乙亥": Object.freeze([20500]),
  "丙子": Object.freeze([-81000]),
  "丁丑": Object.freeze([-30000, -3000]),
  "戊寅": Object.freeze([53000]),
  "己卯": Object.freeze([-8500, 14000]),
  "庚辰": Object.freeze([115000, 35000, -10000]),
  "辛巳": Object.freeze([-13700, 2000, -19000]),
  "壬午": Object.freeze([-17000, 3000]),
  "癸未": Object.freeze([5000, -20000]),
  "甲申": Object.freeze([-36500]),
  "乙酉": Object.freeze([30000, -11000]),
  "丙戌": Object.freeze([32000, 14000]),
  "丁亥": Object.freeze([-9000, 25000, 21500]),
  "戊子": Object.freeze([-36000]),
  "己丑": Object.freeze([1200, 8000]),
  "庚寅": Object.freeze([-21000, -30000]),
  "辛卯": Object.freeze([2300, 27000]),
  "壬辰": Object.freeze([-20000, -15000]),
  "癸巳": Object.freeze([20000, -6000]),
  "甲午": Object.freeze([-13000, 19000]),
  "乙未": Object.freeze([-14000, -9500]),
  "丙申": Object.freeze([17500, -11000, 8000, -5000]),
  "丁酉": Object.freeze([45000, -8000]),
  "戊戌": Object.freeze([61400, 3000]),
  "己亥": Object.freeze([-4000, 76000]),
  "庚子": Object.freeze([-4000, 56000, 12000]),
  "辛丑": Object.freeze([-28000]),
  "壬寅": Object.freeze([11000, 51000, -3000]),
  "癸卯": Object.freeze([-47000, -10000]),
  "甲辰": Object.freeze([-3000, -12000]),
  "乙巳": Object.freeze([-35000]),
  "丙午": Object.freeze([38000]),
  "丁未": Object.freeze([2000, 19500]),
  "戊申": Object.freeze([14000, -500]),
  "己酉": Object.freeze([3000]),
  "庚戌": Object.freeze([-42000]),
  "辛亥": Object.freeze([167000, 48500, -3000]),
  "壬子": Object.freeze([11000, 47000, -15000, 60000]),
  "癸丑": Object.freeze([85000, -28000]),
  "甲寅": Object.freeze([-9000, -21000]),
  "乙卯": Object.freeze([-20000, 18500, -1000]),
  "丙辰": Object.freeze([-36000, 21500]),
  "丁巳": Object.freeze([45000, -15000, -24500, 5000]),
  "戊午": Object.freeze([53500, -26000]),
  "己未": Object.freeze([16000, -9500]),
  "庚申": Object.freeze([-9000, -18000, -15000]),
  "辛酉": Object.freeze([46000, 7500, -14000]),
  "壬戌": Object.freeze([-12500, 500]),
  "癸亥": Object.freeze([22000, -54000, 3000])
});

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

export function getMonthKanshiForDateKey(dateKey) {
  const targetMs = new Date(`${dateKey}T12:00:00+09:00`).getTime();
  let current = null;

  for (const transition of MONTH_PILLAR_TRANSITIONS) {
    if (targetMs >= transition.startsAtMs) {
      current = transition.kanshi;
      continue;
    }
    break;
  }

  return current;
}

export function getMonthStatusesForKanshi(monthKanshi) {
  if (!monthKanshi) return [];
  const branch = monthKanshi.slice(1);
  return [...(MONTH_BRANCH_STATUS_MAP[branch] || [])];
}

export function getMonthAdjustmentForStatuses(statuses = []) {
  const total = statuses.reduce((sum, status) => sum + (MONTH_STATUS_EFFECTS[status] || 0), 0);
  return clamp(total, -2, 0);
}

export function getMonthContext(dateKey) {
  const monthKanshi = getMonthKanshiForDateKey(dateKey);
  const statuses = getMonthStatusesForKanshi(monthKanshi);
  const adjustment = getMonthAdjustmentForStatuses(statuses);
  const transition = MONTH_PILLAR_TRANSITIONS.find((item) => item.startsAt.slice(0, 10) === dateKey) || null;

  return {
    kanshi: monthKanshi,
    statuses,
    adjustment,
    transition: transition
      ? {
          kanshi: transition.kanshi,
          startsAt: transition.startsAt,
          timeLabel: transition.startsAt.slice(11, 16),
          label: `節入 ${transition.startsAt.slice(11, 16)} / ${transition.kanshi}へ`
        }
      : null
  };
}

export function getMonthPillarExpectedInfluence(monthKanshi, records) {
  if (!monthKanshi || !records?.[monthKanshi]) return 0;
  const monthRecord = records[monthKanshi];
  const base = blendExpected(monthRecord.avg, monthRecord.sendan, monthRecord.days);
  return Math.round(clamp(base * 0.22, -7000, 7000));
}

export function getWeekdayContext(weekday) {
  return WEEKDAY_EFFECTS[weekday] || Object.freeze({
    adjustment: 0,
    label: "曜日補正なし",
    shortLabel: "曜日中立",
    tone: "neutral"
  });
}

export function getSpecialDateContext(date) {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const isPensionPayday = month % 2 === 0 && day === 15;
  const statuses = isPensionPayday ? ["年金注意"] : [];
  const adjustment = statuses.reduce((sum, status) => sum + (SPECIAL_DATE_EFFECTS[status] || 0), 0);

  return {
    statuses,
    adjustment,
    label: isPensionPayday ? "年金支給日で危ないかも" : "日付補正なし",
    shortLabel: isPensionPayday ? "年金注意" : "補正なし",
    tone: isPensionPayday ? "caution" : "neutral"
  };
}

export function isPerfectRecord(record) {
  if (!record) return false;
  return record.score >= RATING_THRESHOLDS.perfectMin;
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

export function getQualityScoreCap(record) {
  const avg = toNumberOrNull(record?.avg, null);
  const days = toNumberOrNull(record?.days, 0);
  const sendan = toNumberOrNull(record?.sendan, 0);
  const tags = record?.tags || [];
  const hasActualBad = tags.some((tag) => tag.includes("実績×"));
  const needsMoreData = tags.some((tag) => tag.includes("要検証") || tag.includes("データ無"));
  const strongTwoDayCandidate = avg !== null && avg >= 30000 && sendan >= 20000;

  let cap = 9;

  if (avg === null || days <= 0) return 4;

  if (hasActualBad) cap = Math.min(cap, 4);

  if (avg < 0) cap = Math.min(cap, 4);
  else if (avg < 5000) cap = Math.min(cap, 6);
  else if (avg < 12000) cap = Math.min(cap, 7);
  else if (avg < 20000) cap = Math.min(cap, 8);

  if (sendan < 0) cap = Math.min(cap, 4);
  else if (sendan < 5000) cap = Math.min(cap, 6);
  else if (sendan < 10000) cap = Math.min(cap, 7);
  else if (sendan < 18000) cap = Math.min(cap, 8);

  if (days <= 1) cap = Math.min(cap, 6);
  else if (days === 2 && !strongTwoDayCandidate) cap = Math.min(cap, 8);

  if (needsMoreData) cap = Math.min(cap, 7);

  return clamp(cap, -6, 9);
}

export function applyQualityScoreCap(record, proposedScore) {
  return clamp(Math.min(Number(proposedScore), getQualityScoreCap(record)), -6, 9);
}

export function computeLiveScore(record) {
  const seedBlend = blendExpected(record.seedAvg, record.sendan, record.seedDays);
  const liveBlend = blendExpected(record.avg, record.sendan, record.days);
  const scoreShift = clamp(Math.round((liveBlend - seedBlend) / 12000), -3, 3);
  const shiftedScore = clamp(record.seedScore + scoreShift, -6, 9);
  return applyQualityScoreCap(record, shiftedScore);
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

export function getRating(score, record = null) {
  if (isPerfectRecord(record || { score })) {
    return { label: "★", tier: "perfect", text: "かなり完璧な日" };
  }
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

export function getPlayStyle(record) {
  const tags = record?.tags || [];
  const score = toNumberOrNull(record?.score, 0);
  const avg = toNumberOrNull(record?.avg, null);
  const days = toNumberOrNull(record?.days, 0);
  const sendan = toNumberOrNull(record?.sendan, 0);
  const spread = avg === null ? Math.abs(sendan) : Math.abs(avg - sendan);
  const hasStableTag = tags.includes("安定型");
  const hasActualGood = tags.some((tag) => tag.includes("実績◎"));
  const hasActualBad = tags.some((tag) => tag.includes("実績×"));
  const needsMoreData = tags.some((tag) => tag.includes("要検証") || tag.includes("データ無"));

  if (days <= 0) {
    return { label: "データ待ち", shortLabel: "未知", tone: "neutral", note: "まだ実績が少なく、傾向を判定しづらい日です。", adjustment: 0 };
  }

  if (
    hasStableTag ||
    (days >= 3 && avg !== null && avg >= 8000 && score >= RATING_THRESHOLDS.goMin && !hasActualBad) ||
    (hasActualGood && days >= 2 && avg !== null && avg >= 12000 && score >= RATING_THRESHOLDS.goMin)
  ) {
    return { label: "勝ちやすい", shortLabel: "勝ち筋", tone: "good", note: "プラス実績が比較的安定していて、拾いやすい寄りです。", adjustment: 1 };
  }

  if (
    score >= RATING_THRESHOLDS.goMin &&
    (
      ((days <= 2) && avg !== null && avg >= 10000) ||
      spread >= 18000 ||
      needsMoreData
    )
  ) {
    return { label: "荒い", shortLabel: "荒れ筋", tone: "rough", note: "期待値は高い一方で、ブレ幅が大きめです。", adjustment: 0 };
  }

  if (
    score >= RATING_THRESHOLDS.holdMin &&
    avg !== null &&
    avg >= 3000 &&
    days >= 2 &&
    !hasActualBad
  ) {
    return { label: "安定寄り", shortLabel: "安定", tone: "stable", note: "派手さは薄めでも、比較的まとまりやすいタイプです。", adjustment: 0.5 };
  }

  if (hasActualBad || (avg !== null && avg < 0) || score < RATING_THRESHOLDS.holdMin) {
    return { label: "苦戦寄り", shortLabel: "苦戦", tone: "caution", note: "実績面ではマイナス寄りなので、慎重に見たい日です。", adjustment: -1 };
  }

  return { label: "読みにくい", shortLabel: "読みにくい", tone: "neutral", note: "大きな決め手がまだ薄く、補助情報とあわせて見たい日です。", adjustment: 0 };
}

export function getOpportunityStatus(record) {
  const tags = record?.tags || [];
  const baseScore = toNumberOrNull(record?.baseScore, toNumberOrNull(record?.score, 0));
  const avg = toNumberOrNull(record?.avg, null);
  const days = toNumberOrNull(record?.days, 0);
  const sendan = toNumberOrNull(record?.sendan, 0);
  const hasActualGood = tags.some((tag) => tag.includes("実績◎"));
  const actualLead = avg === null ? 0 : avg - sendan;

  if (
    avg !== null &&
    days >= 2 &&
    avg >= 10000 &&
    baseScore < RATING_THRESHOLDS.specialMin &&
    (hasActualGood || actualLead >= 4000)
  ) {
    return {
      active: true,
      label: "穴場かも",
      shortLabel: "穴場",
      tone: "opportunity",
      note: "実績の伸びに対して、総合スコアがまだ控えめな狙い目候補です。"
    };
  }

  return {
    active: false,
    label: "",
    shortLabel: "",
    tone: "neutral",
    note: ""
  };
}

export function getConfidence(record) {
  const days = Number(record?.days) || 0;
  if (days <= 0) {
    return {
      level: 0,
      label: "データなし",
      shortLabel: "未",
      tone: "neutral",
      note: "この干支の実績がまだありません。予測値だけを参考にしてください。",
      stars: "☆☆☆☆☆",
      sample: days
    };
  }
  if (days === 1) {
    return {
      level: 1,
      label: "参考程度",
      shortLabel: "低",
      tone: "caution",
      note: "サンプルが1件しかないため、偶然の影響が非常に大きいです。",
      stars: "★☆☆☆☆",
      sample: days
    };
  }
  if (days === 2) {
    return {
      level: 2,
      label: "低め",
      shortLabel: "低",
      tone: "caution",
      note: "サンプル2件のみ。ブレが大きい前提で見てください。",
      stars: "★★☆☆☆",
      sample: days
    };
  }
  if (days <= 4) {
    return {
      level: 3,
      label: "中くらい",
      shortLabel: "中",
      tone: "neutral",
      note: "サンプル数はそこそこ。傾向の参考にはなる範囲です。",
      stars: "★★★☆☆",
      sample: days
    };
  }
  if (days <= 7) {
    return {
      level: 4,
      label: "やや高い",
      shortLabel: "高",
      tone: "good",
      note: "サンプル数が十分あり、実績が示す傾向は信頼しやすいです。",
      stars: "★★★★☆",
      sample: days
    };
  }
  return {
    level: 5,
    label: "高い",
    shortLabel: "最高",
    tone: "good",
    note: "サンプル数が豊富で、実績平均の信頼度は高めです。",
    stars: "★★★★★",
    sample: days
  };
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
  const baseRecord = records[kanshi] || normalizeRecord(kanshi, {});
  const monthContextBase = getMonthContext(dateKey);
  const specialDateContext = getSpecialDateContext(date);
  const opportunity = getOpportunityStatus(baseRecord);
  const baseSeedScore = applyQualityScoreCap(baseRecord, baseRecord.score);
  const provisionalScore = applyQualityScoreCap(
    baseRecord,
    clamp(baseSeedScore + monthContextBase.adjustment + specialDateContext.adjustment, -6, 9)
  );
  const provisionalRecord = {
    ...baseRecord,
    baseScore: baseSeedScore,
    score: provisionalScore,
    monthAdjustment: monthContextBase.adjustment,
    specialDateAdjustment: specialDateContext.adjustment
  };
  const playStyle = getPlayStyle(provisionalRecord);
  const qualityCap = getQualityScoreCap(provisionalRecord);
  const record = {
    ...provisionalRecord,
    score: applyQualityScoreCap(provisionalRecord, clamp(provisionalScore + playStyle.adjustment, -6, 9)),
    qualityCap,
    playStyleAdjustment: playStyle.adjustment
  };
  const rating = getRating(record.score, record);
  const weekdayContext = getWeekdayContext(date.getUTCDay());
  const monthContext = {
    ...monthContextBase,
    expectedInfluence: getMonthPillarExpectedInfluence(monthContextBase.kanshi, records)
  };
  const confidence = getConfidence(record);
  const expectedBaseValue = Math.round(blendExpected(record.avg, record.sendan, record.days));
  const expectedAdjustmentValue =
    monthContext.expectedInfluence +
    Math.round(monthContext.adjustment * 2500) +
    Math.round(specialDateContext.adjustment * 2000) +
    Math.round(playStyle.adjustment * 3000) +
    Math.round(weekdayContext.adjustment * 1500);

  return {
    date,
    dateKey,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
    kanshi,
    record,
    rating,
    playStyle,
    opportunity,
    monthContext,
    specialDateContext,
    weekdayContext,
    confidence,
    expectedBaseValue,
    expectedAdjustmentValue,
    expectedValue: expectedBaseValue + expectedAdjustmentValue
  };
}

export function buildEntriesMap(seedEntries = SEED_MONTHLY_ENTRIES, extraEntries = []) {
  const map = {};
  for (const [kanshi, values] of Object.entries(seedEntries || {})) {
    map[kanshi] = Array.isArray(values) ? [...values] : [];
  }
  for (const entry of extraEntries) {
    if (!entry || !entry.kanshi) continue;
    const profit = Number(entry.profit);
    if (!Number.isFinite(profit)) continue;
    if (!map[entry.kanshi]) map[entry.kanshi] = [];
    map[entry.kanshi].push(profit);
  }
  return map;
}

function aggregateValues(values = []) {
  let wins = 0;
  let losses = 0;
  let total = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value > 0) wins += 1;
    else losses += 1;
    total += value;
  }
  const days = wins + losses;
  const rating = wins - losses;
  const daily = days > 0 ? Math.round(total / days) : 0;
  const hourly = days > 0 ? Math.round(total / days / HOURS_PER_DAY) : 0;
  return { wins, losses, rating, total, daily, hourly, days };
}

export function aggregateByStem(entriesMap) {
  return HEAVENLY_STEMS.map((stem) => {
    const values = [];
    for (const branch of EARTHLY_BRANCHES) {
      const key = stem + branch;
      if (!SEXAGENARY_CYCLE.includes(key)) continue;
      const list = entriesMap[key];
      if (Array.isArray(list)) values.push(...list);
    }
    const agg = aggregateValues(values);
    return {
      key: stem,
      label: STEM_LABELS[stem] || "",
      element: STEM_ELEMENT[stem] || "",
      ...agg
    };
  });
}

export function aggregateByBranch(entriesMap) {
  return EARTHLY_BRANCHES.map((branch) => {
    const values = [];
    for (const stem of HEAVENLY_STEMS) {
      const key = stem + branch;
      if (!SEXAGENARY_CYCLE.includes(key)) continue;
      const list = entriesMap[key];
      if (Array.isArray(list)) values.push(...list);
    }
    const agg = aggregateValues(values);
    return {
      key: branch,
      label: BRANCH_LABELS[branch] || "",
      element: BRANCH_ELEMENT[branch] || "",
      ...agg
    };
  });
}

export function aggregateByElement(stemRows, branchRows) {
  return ELEMENT_ORDER.map((element) => {
    const heaven = stemRows
      .filter((row) => row.element === element)
      .reduce((sum, row) => sum + row.rating, 0);
    const earth = branchRows
      .filter((row) => row.element === element)
      .reduce((sum, row) => sum + row.rating, 0);
    return {
      element,
      heaven,
      earth,
      total: heaven + earth
    };
  });
}

export function aggregateByRatingTier(records) {
  const tiers = [
    { key: "special", label: "◎ 絶好 (スコア7以上)", filter: (record) => record.score >= RATING_THRESHOLDS.specialMin },
    { key: "go", label: "○ 行くべき (スコア5-6)", filter: (record) => record.score >= RATING_THRESHOLDS.goMin && record.score < RATING_THRESHOLDS.specialMin },
    { key: "hold", label: "△ どちらでも (スコア3-4)", filter: (record) => record.score >= RATING_THRESHOLDS.holdMin && record.score < RATING_THRESHOLDS.goMin },
    { key: "avoid", label: "× 見送り (スコア2以下)", filter: (record) => record.score < RATING_THRESHOLDS.holdMin }
  ];

  return tiers.map((tier) => {
    const entries = Object.values(records).filter(tier.filter);
    const count = entries.length;
    if (count === 0) {
      return { key: tier.key, label: tier.label, count: 0, avgActual: null, avgSendan: null, avgExpected: null };
    }

    const actualList = entries
      .map((entry) => entry.avg)
      .filter((value) => value !== null && value !== undefined && Number.isFinite(value));
    const sendanList = entries
      .map((entry) => entry.sendan)
      .filter((value) => value !== null && value !== undefined && Number.isFinite(value));
    const expectedList = entries.map((entry) => blendExpected(entry.avg, entry.sendan, entry.days || 0));
    const mean = (list) => (list.length ? Math.round(list.reduce((sum, value) => sum + value, 0) / list.length) : null);

    return {
      key: tier.key,
      label: tier.label,
      count,
      avgActual: mean(actualList),
      avgSendan: mean(sendanList),
      avgExpected: mean(expectedList)
    };
  });
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
    perfect: dayRows.filter((day) => isPerfectRecord(day.record)).length,
    special: dayRows.filter((day) => day.record.score >= RATING_THRESHOLDS.specialMin && !isPerfectRecord(day.record)).length,
    go: dayRows.filter((day) => day.record.score >= RATING_THRESHOLDS.goMin && day.record.score < RATING_THRESHOLDS.specialMin).length,
    hold: dayRows.filter((day) => day.record.score >= RATING_THRESHOLDS.holdMin && day.record.score < RATING_THRESHOLDS.goMin).length,
    avoid: dayRows.filter((day) => day.record.score < RATING_THRESHOLDS.holdMin).length
  };

  const monthPillarSequence = dayRows.reduce((accumulator, dayInfo) => {
    const current = dayInfo.monthContext.kanshi || "月干支未設定";
    if (accumulator[accumulator.length - 1] !== current) {
      accumulator.push(current);
    }
    return accumulator;
  }, []);

  return {
    year,
    month,
    label: `${year}年${month}月`,
    cells,
    dayRows,
    stats,
    monthPillarSummary: monthPillarSequence.join(" → ")
  };
}
