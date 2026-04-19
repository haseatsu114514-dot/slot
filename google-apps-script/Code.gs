const PROP = PropertiesService.getScriptProperties();

const CONFIG = Object.freeze({
  ANCHOR_DATE: "2026-04-07",
  ANCHOR_KANSHI: "辛亥",
  DEFAULT_MASTER_SHEET: "干支マスタ",
  DEFAULT_RESULTS_SHEET: "実績入力",
  MASTER_HEADER: ["干支", "通変星", "初期スコア", "平均収支", "日数", "占断予想", "タグ"],
  RESULTS_HEADER: ["ID", "記録日時", "対象日", "干支", "収支", "店舗", "機種", "メモ"],
  HEAVENLY_STEMS: ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"],
  EARTHLY_BRANCHES: ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"],
  SEED_DATA: {
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
  }
});

const SEXAGENARY_CYCLE = Array.from(
  { length: 60 },
  (_, index) => CONFIG.HEAVENLY_STEMS[index % 10] + CONFIG.EARTHLY_BRANCHES[index % 12]
);

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (!isAuthorized_(params.secret)) {
    return json_({ ok: false, error: "unauthorized" });
  }

  const action = params.action || "dashboard";
  if (action === "dashboard") {
    return json_(buildDashboard_());
  }
  if (action === "setup") {
    setupSheets();
    seedMasterSheet();
    return json_({ ok: true, message: "setup completed" });
  }
  return json_({ ok: false, error: "unknown_action" });
}

function doPost(e) {
  const body = parseBody_(e);
  if (!isAuthorized_(body.secret)) {
    return json_({ ok: false, error: "unauthorized" });
  }

  if (body.action === "addResult") {
    const entry = normalizeEntry_(body.entry || {});
    var appended = appendResultIfNew_(entry);
    var payload = buildDashboard_();
    payload.appended = appended;
    payload.duplicate = !appended;
    return json_(payload);
  }

  return json_({ ok: false, error: "unknown_action" });
}

function setupSheets() {
  ensureHeader_(getMasterSheet_(), CONFIG.MASTER_HEADER);
  ensureHeader_(getResultsSheet_(), CONFIG.RESULTS_HEADER);
}

function seedMasterSheet() {
  const sheet = getMasterSheet_();
  ensureHeader_(sheet, CONFIG.MASTER_HEADER);
  if (sheet.getLastRow() > 1) return "master already seeded";

  const rows = Object.keys(CONFIG.SEED_DATA).map(function(kanshi) {
    const item = CONFIG.SEED_DATA[kanshi];
    return [
      kanshi,
      item.ts || "",
      item.score || 0,
      item.avg === null || item.avg === undefined ? "" : item.avg,
      item.days || 0,
      item.sendan || 0,
      (item.tags || []).join("、")
    ];
  });
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, CONFIG.MASTER_HEADER.length).setValues(rows);
  }
  return "master seeded";
}

function buildDashboard_() {
  const master = readMasterRecords_();
  const entries = readResultEntries_();
  const records = applyEntriesToRecords_(master, entries);

  const enrichedEntries = entries
    .map(function(entry) {
      const record = records[entry.kanshi] || normalizeRecord_(entry.kanshi, {});
      return {
        id: entry.id,
        createdAt: entry.createdAt,
        targetDate: entry.targetDate,
        kanshi: entry.kanshi,
        profit: entry.profit,
        store: entry.store,
        machine: entry.machine,
        memo: entry.memo,
        liveScore: record.score
      };
    })
    .sort(function(left, right) {
      if (left.targetDate !== right.targetDate) return left.targetDate < right.targetDate ? 1 : -1;
      return String(right.createdAt).localeCompare(String(left.createdAt));
    });

  return {
    ok: true,
    config: {
      anchorDate: CONFIG.ANCHOR_DATE,
      anchorKanshi: CONFIG.ANCHOR_KANSHI
    },
    records: records,
    entries: enrichedEntries,
    syncedAt: new Date().toISOString()
  };
}

function readMasterRecords_() {
  const base = buildSeedRecords_();
  const sheet = getMasterSheet_();
  ensureHeader_(sheet, CONFIG.MASTER_HEADER);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return base;

  const rows = sheet.getRange(2, 1, lastRow - 1, CONFIG.MASTER_HEADER.length).getValues();
  rows.forEach(function(row) {
    const kanshi = String(row[0] || "").trim();
    if (!kanshi) return;
    const seed = base[kanshi] || normalizeRecord_(kanshi, {});
    base[kanshi] = normalizeRecord_(kanshi, {
      ts: row[1] || seed.ts,
      score: toNumberOrNull_(row[2], seed.seedScore),
      avg: toNumberOrNull_(row[3], seed.seedAvg),
      days: toNumberOrNull_(row[4], seed.seedDays),
      sendan: toNumberOrNull_(row[5], seed.sendan),
      tags: normalizeTags_(row[6] || seed.tags)
    });
  });
  return base;
}

function readResultEntries_() {
  const sheet = getResultsSheet_();
  ensureHeader_(sheet, CONFIG.RESULTS_HEADER);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rows = sheet.getRange(2, 1, lastRow - 1, CONFIG.RESULTS_HEADER.length).getValues();
  return rows
    .map(function(row) {
      return {
        id: String(row[0] || ""),
        createdAt: row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ""),
        targetDate: normalizeDateCell_(row[2]),
        kanshi: String(row[3] || "").trim(),
        profit: Number(row[4] || 0),
        store: String(row[5] || "").trim(),
        machine: String(row[6] || "").trim(),
        memo: String(row[7] || "").trim()
      };
    })
    .filter(function(entry) {
      return entry.targetDate && entry.kanshi;
    });
}

function appendResultIfNew_(entry) {
  const sheet = getResultsSheet_();
  ensureHeader_(sheet, CONFIG.RESULTS_HEADER);
  if (hasDuplicateEntry_(sheet, entry)) return false;
  sheet.appendRow([
    entry.id,
    entry.createdAt,
    entry.targetDate,
    entry.kanshi,
    entry.profit,
    entry.store,
    entry.machine,
    entry.memo
  ]);
  return true;
}

function hasDuplicateEntry_(sheet, entry) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var rows = sheet.getRange(2, 1, lastRow - 1, CONFIG.RESULTS_HEADER.length).getValues();
  return rows.some(function(row) {
    var existing = {
      id: String(row[0] || ""),
      targetDate: normalizeDateCell_(row[2]),
      kanshi: String(row[3] || "").trim(),
      profit: Number(row[4] || 0),
      store: String(row[5] || "").trim(),
      machine: String(row[6] || "").trim(),
      memo: String(row[7] || "").trim()
    };
    return isSameEntry_(existing, entry);
  });
}

function isSameEntry_(left, right) {
  if (left.id && right.id && left.id === right.id) return true;
  return (
    normalizeDateString_(left.targetDate) === normalizeDateString_(right.targetDate) &&
    String(left.kanshi || "").trim() === String(right.kanshi || "").trim() &&
    Number(left.profit || 0) === Number(right.profit || 0) &&
    String(left.store || "").trim() === String(right.store || "").trim() &&
    String(left.machine || "").trim() === String(right.machine || "").trim() &&
    String(left.memo || "").trim() === String(right.memo || "").trim()
  );
}

function normalizeEntry_(input) {
  const targetDate = normalizeDateString_(input.targetDate || input.playDate);
  if (!targetDate) throw new Error("targetDate is required");

  const profit = Number(input.profit);
  if (!Number.isFinite(profit)) throw new Error("profit must be a number");

  return {
    id: String(input.id || Utilities.getUuid()),
    createdAt: String(input.createdAt || new Date().toISOString()),
    targetDate: targetDate,
    kanshi: String(input.kanshi || getKanshiForDate_(targetDate)),
    profit: profit,
    store: String(input.store || "").trim(),
    machine: String(input.machine || "").trim(),
    memo: String(input.memo || "").trim()
  };
}

function getKanshiForDate_(dateKey) {
  const anchorIndex = SEXAGENARY_CYCLE.indexOf(CONFIG.ANCHOR_KANSHI);
  const diffDays = Math.round((parseDateKey_(dateKey).getTime() - parseDateKey_(CONFIG.ANCHOR_DATE).getTime()) / 86400000);
  return SEXAGENARY_CYCLE[mod_(anchorIndex + diffDays, SEXAGENARY_CYCLE.length)];
}

function buildSeedRecords_() {
  const records = {};
  Object.keys(CONFIG.SEED_DATA).forEach(function(kanshi) {
    records[kanshi] = normalizeRecord_(kanshi, CONFIG.SEED_DATA[kanshi]);
  });
  return records;
}

function normalizeRecord_(name, input) {
  const seedScore = toNumberOrNull_(input.seedScore, toNumberOrNull_(input.score, 0));
  const seedAvg = toNumberOrNull_(input.seedAvg, toNumberOrNull_(input.avg, null));
  const seedDays = toNumberOrNull_(input.seedDays, toNumberOrNull_(input.days, 0));
  return {
    name: name,
    ts: input.ts || "",
    seedScore: seedScore,
    score: toNumberOrNull_(input.score, seedScore),
    seedAvg: seedAvg,
    avg: toNumberOrNull_(input.avg, seedAvg),
    seedDays: seedDays,
    days: toNumberOrNull_(input.days, seedDays),
    sendan: toNumberOrNull_(input.sendan, 0),
    tags: normalizeTags_(input.tags)
  };
}

function normalizeTags_(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value && value !== 0) return [];
  return String(value)
    .split(/[、,\n]/)
    .map(function(item) { return item.trim(); })
    .filter(Boolean);
}

function cloneRecords_(records) {
  const cloned = {};
  Object.keys(records).forEach(function(name) {
    cloned[name] = {
      name: records[name].name,
      ts: records[name].ts,
      seedScore: records[name].seedScore,
      score: records[name].score,
      seedAvg: records[name].seedAvg,
      avg: records[name].avg,
      seedDays: records[name].seedDays,
      days: records[name].days,
      sendan: records[name].sendan,
      tags: [].concat(records[name].tags || [])
    };
  });
  return cloned;
}

function applyEntriesToRecords_(records, entries) {
  const next = cloneRecords_(records);

  entries.forEach(function(entry) {
    if (!entry.kanshi) return;
    const current = next[entry.kanshi] || normalizeRecord_(entry.kanshi, {});
    const currentDays = current.days || 0;
    const currentTotal = current.avg === null || current.avg === undefined ? 0 : current.avg * currentDays;
    const nextDays = currentDays + 1;
    const nextAvg = Math.round((currentTotal + Number(entry.profit)) / nextDays);

    current.days = nextDays;
    current.avg = nextAvg;
    current.score = computeLiveScore_(current);
    next[entry.kanshi] = current;
  });

  return next;
}

function computeLiveScore_(record) {
  const seedBlend = blendExpected_(record.seedAvg, record.sendan, record.seedDays);
  const liveBlend = blendExpected_(record.avg, record.sendan, record.days);
  // 6000 円の改善で ±1 点、±5 点まで動けるように刻みを細かく。
  const scoreShift = clamp_(Math.round((liveBlend - seedBlend) / 6000), -5, 5);
  const shiftedScore = clamp_(record.seedScore + scoreShift, -6, 9);
  return applyQualityScoreCap_(record, shiftedScore);
}

function blendExpected_(avg, sendan, days) {
  const forecast = toNumberOrNull_(sendan, 0);
  if (avg === null || avg === undefined || days <= 0) return forecast;
  // シュリンクブレンド: sendan を k=2 の擬似サンプルとして混ぜ、
  // 実績 days が増えるほど自然に avg 寄りになる。days 上限を設けない。
  const k = 2;
  return (avg * days + forecast * k) / (days + k);
}

function getQualityScoreCap_(record) {
  const avg = toNumberOrNull_(record && record.avg, null);
  const days = toNumberOrNull_(record && record.days, 0);
  const sendan = toNumberOrNull_(record && record.sendan, 0);
  const tags = (record && record.tags) || [];
  const hasActualBad = tags.some(function(tag) { return String(tag).indexOf("実績×") !== -1; });
  const needsMoreData = tags.some(function(tag) {
    const text = String(tag);
    return text.indexOf("要検証") !== -1 || text.indexOf("データ無") !== -1;
  });
  const strongTwoDayCandidate = avg !== null && avg >= 30000 && sendan >= 20000;

  var cap = 9;

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

  return clamp_(cap, -6, 9);
}

function applyQualityScoreCap_(record, proposedScore) {
  return clamp_(Math.min(Number(proposedScore), getQualityScoreCap_(record)), -6, 9);
}

function ensureHeader_(sheet, header) {
  const range = sheet.getRange(1, 1, 1, header.length);
  const current = range.getValues()[0];
  const mismatch = current.some(function(value, index) {
    return value !== header[index];
  });
  if (mismatch) range.setValues([header]);
  sheet.setFrozenRows(1);
}

function getSpreadsheet_() {
  const spreadsheetId = PROP.getProperty("SPREADSHEET_ID");
  return spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
}

function getMasterSheet_() {
  const name = PROP.getProperty("MASTER_SHEET_NAME") || CONFIG.DEFAULT_MASTER_SHEET;
  return getSheet_(name);
}

function getResultsSheet_() {
  const name = PROP.getProperty("RESULTS_SHEET_NAME") || CONFIG.DEFAULT_RESULTS_SHEET;
  return getSheet_(name);
}

function getSheet_(name) {
  const spreadsheet = getSpreadsheet_();
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function isAuthorized_(providedSecret) {
  const expected = PROP.getProperty("API_SECRET");
  if (!expected) return true;
  return String(providedSecret || "") === expected;
}

function parseBody_(e) {
  try {
    return JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (error) {
    throw new Error("invalid JSON body");
  }
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseDateKey_(dateKey) {
  const parts = String(dateKey).split("-").map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
}

function normalizeDateString_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM-dd");
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return Utilities.formatDate(parsed, "Asia/Tokyo", "yyyy-MM-dd");
}

function normalizeDateCell_(value) {
  return normalizeDateString_(value);
}

function toNumberOrNull_(value, fallback) {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mod_(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function clamp_(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
