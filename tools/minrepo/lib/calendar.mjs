// 営業カレンダー分析（全台・日単位）。依存なし・純粋関数のみ。
//
// スマスロを含む全台について「どういう日に出して、どういう日に回収しているか」を、店全体の
// 平均差枚・勝率・稼働（G数）で見る。設定そのものは分からない機種でも、日の種類ごとに束ねれば
// 店の営業のクセ（イベント日・入替・年金支給日・給料日・連休・示唆のあった日・おすすめ期間…）は見える。
//
// 日の種類（タグ）は 3 系統:
//   1. 自動: config.eventDays とその前日/翌日、年金支給日、給料日、月初/月末、大型連休、入替の前後
//   2. 手入力: data/manual/calendar.csv の kind（景品示唆・おすすめ週間・取材 など。期間指定可）
//   3. 現地メモ由来: observations.csv にそのタグの記録が 1 件でもあった日

import { mean, mulberry32, permutationPValue, signFlipPValue, addDays, dayInfo, matchesEvent, toDateParts } from "./util.mjs";
import { replacementDates, atypeConfig } from "./atype.mjs";

export const CALENDAR_DEFAULTS = {
  iterations: 1000,
  recoveryQuantile: 0.15, // 平均差枚が下位この割合の日を「回収日」、上位この割合の日を「放出日」と呼ぶ
  minDays: 4, // これ未満の日数しか無い種類は判定しない
  // 機種の分類（上から順に当てはめる。pattern は機種名への正規表現）
  categories: [
    { name: "ジャグラー/ハナハナ", pattern: "ジャグラー|ハナハナ" },
    { name: "スマスロ", pattern: "^L|スマスロ|スマート" },
    { name: "その他", pattern: "" },
  ],
  neighborTypes: ["digitContains", "nthWeekday", "daysOfMonth", "monthDay"], // 前日/翌日タグを作るイベント日の型
  modelMinTagDays: 5, // 日の種類×機種の表に出す最低日数
};

export function calendarConfig(config) {
  return { ...CALENDAR_DEFAULTS, ...((config && config.calendar) || {}) };
}

const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** day 日が土日なら直前の平日（金曜）へ前倒しした日付 */
function shiftToWeekday(y, m, day) {
  const w = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  const d = w === 6 ? day - 1 : w === 0 ? day - 2 : day;
  return ymd(y, m, d);
}

/** 年金支給日: 偶数月の 15 日（土日なら直前の平日）。奇数月は null */
export function pensionPayday(y, m) {
  return m % 2 === 0 ? shiftToWeekday(y, m, 15) : null;
}

/** 給料日の目安: 25 日（土日なら直前の平日） */
export function salaryPayday(y, m) {
  return shiftToWeekday(y, m, 25);
}

function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** date が base の何日後か（base より前なら負） */
function daysBetween(base, date) {
  const a = toDateParts(base);
  const b = toDateParts(date);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

/**
 * タグ付けに使う文脈を作る。
 * replacement: 入替日の Set / manual: Map(date → [kind]) / obs: Map(date → Set(tag))
 */
export function buildTagContext(config, { replacement = [], calendar = [], observations = [] } = {}) {
  const cfg = calendarConfig(config);
  const manual = new Map();
  for (const c of calendar) {
    if (/入替|新台/.test(c.kind)) continue; // 入替は replacement 側で扱う
    if (!manual.has(c.date)) manual.set(c.date, new Set());
    manual.get(c.date).add(c.kind);
  }
  const obs = new Map();
  for (const o of observations) {
    if (!obs.has(o.date)) obs.set(o.date, new Set());
    obs.get(o.date).add(o.tag);
  }
  return { cfg, eventDefs: config.eventDays || [], replacement: new Set(replacement), manual, obs };
}

/** その日のタグ一覧。戻り値: [{ key, label, group }] */
export function dayTags(date, ctx) {
  const day = dayInfo(date);
  const tags = [];
  const add = (group, label) => tags.push({ key: `${group}|${label}`, label, group });

  for (const def of ctx.eventDefs) {
    if (matchesEvent(day, def)) add("イベント日", def.label);
    if (!ctx.cfg.neighborTypes.includes(def.type)) continue;
    if (matchesEvent(dayInfo(addDays(date, 1)), def)) add("イベント前後", `${def.label}の前日`);
    if (matchesEvent(dayInfo(addDays(date, -1)), def)) add("イベント前後", `${def.label}の翌日`);
  }

  // 年金（偶数月15日）: 当日と、その後 3 日
  for (const [y, m] of [[day.y, day.m], day.m === 1 ? [day.y - 1, 12] : [day.y, day.m - 1]]) {
    const p = pensionPayday(y, m);
    if (!p) continue;
    const gap = daysBetween(p, date);
    if (gap === 0) add("お金の日", "年金支給日");
    else if (gap >= 1 && gap <= 3) add("お金の日", "年金支給日の後3日");
  }
  // 給料日（25日）: 当日と、その後 3 日
  for (const [y, m] of [[day.y, day.m], day.m === 1 ? [day.y - 1, 12] : [day.y, day.m - 1]]) {
    const gap = daysBetween(salaryPayday(y, m), date);
    if (gap === 0) add("お金の日", "給料日(25日)");
    else if (gap >= 1 && gap <= 3) add("お金の日", "給料日の後3日");
  }

  if (day.d <= 3) add("暦", "月初(1〜3日)");
  if (day.d > lastDayOfMonth(day.y, day.m) - 3) add("暦", "月末(最後の3日)");
  const md = day.m * 100 + day.d;
  if (md >= 429 && md <= 505) add("暦", "GW(4/29〜5/5)");
  if (md >= 811 && md <= 816) add("暦", "お盆(8/11〜8/16)");
  if (md >= 1229 || md <= 103) add("暦", "年末年始(12/29〜1/3)");

  if (ctx.replacement.size) {
    if (ctx.replacement.has(addDays(date, 1))) add("入替", "入替前日");
    if (ctx.replacement.has(date)) add("入替", "入替当日");
    if (ctx.replacement.has(addDays(date, -1))) add("入替", "入替翌日");
    for (let k = 2; k <= 7; k++) {
      if (ctx.replacement.has(addDays(date, -k))) {
        add("入替", "入替後2〜7日");
        break;
      }
    }
  }
  for (const kind of ctx.manual.get(date) || []) add("手入力", kind);
  for (const tag of ctx.obs.get(date) || []) add("現地メモ", `${tag}の記録があった日`);
  return tags;
}

function numbers(arr) {
  return arr.filter((v) => typeof v === "number" && Number.isFinite(v));
}

function compare(inValues, outValues, iterations, rng) {
  const a = numbers(inValues);
  const b = numbers(outValues);
  const mi = mean(a);
  const mo = mean(b);
  return { nIn: a.length, nOut: b.length, meanIn: mi, meanOut: mo, uplift: mi != null && mo != null ? mi - mo : null, p: permutationPValue(a, b, iterations, rng) };
}

/** 曜日ごとの平均を引いた残差（曜日の影響を消して比べる用） */
function weekdayResiduals(days, pick) {
  const sums = Array.from({ length: 7 }, () => ({ s: 0, n: 0 }));
  for (const d of days) {
    const v = pick(d);
    if (v == null) continue;
    sums[d.weekday].s += v;
    sums[d.weekday].n++;
  }
  return new Map(days.map((d) => [d.date, pick(d) == null || !sums[d.weekday].n ? null : pick(d) - sums[d.weekday].s / sums[d.weekday].n]));
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** 機種名 → カテゴリ名 */
export function categoryOf(model, categories) {
  for (const c of categories) {
    if (!c.pattern || new RegExp(c.pattern, "i").test(model || "")) return c.name;
  }
  return null;
}

/** 機種行を束ねて 台数加重の平均差枚・勝率・平均G数 にする */
function pool(rows) {
  let dSum = 0;
  let dN = 0;
  let gSum = 0;
  let gN = 0;
  let win = 0;
  let total = 0;
  for (const r of rows) {
    const c = r.count ?? r.total ?? 1;
    if (r.avgDiff != null) {
      dSum += r.avgDiff * c;
      dN += c;
    }
    if (r.avgGames != null) {
      gSum += r.avgGames * c;
      gN += c;
    }
    if (r.win != null && r.total) {
      win += r.win;
      total += r.total;
    }
  }
  return { avgDiff: dN ? dSum / dN : null, avgGames: gN ? gSum / gN : null, winRate: total ? win / total : null, samples: total };
}

/**
 * 営業カレンダー分析の本体。
 * opts: { lineupEvents, seed }。dataset.manual = { observations, calendar } があれば使う。
 */
export function analyzeCalendar(dataset, config, opts = {}) {
  const cfg = calendarConfig(config);
  const rng = mulberry32(opts.seed ?? 20261112);
  const manual = dataset.manual || {};
  const repMap = replacementDates(opts.lineupEvents, manual.calendar, atypeConfig(config));
  const ctx = buildTagContext(config, { replacement: [...repMap.keys()], calendar: manual.calendar || [], observations: manual.observations || [] });

  const days = (dataset.days || []).filter((d) => !d.masked && (d.avgDiff != null || d.winRate != null));
  const base = {
    available: days.length >= 14,
    nDays: days.length,
    context: {
      replacement: [...repMap.keys()].sort(),
      manual: (manual.calendar || []).filter((c) => !/入替|新台/.test(c.kind)).map((c) => ({ date: c.date, kind: c.kind })),
    },
  };
  if (!base.available) return { ...base, reason: `日単位のデータが ${days.length} 日ぶんしか無い（14 日以上で分析を始める）` };

  // 1) 各日のタグ
  const tagsByDate = new Map(days.map((d) => [d.date, dayTags(d.date, ctx)]));
  const tagInfo = new Map();
  for (const list of tagsByDate.values()) for (const t of list) if (!tagInfo.has(t.key)) tagInfo.set(t.key, t);
  const hasTag = (d, key) => tagsByDate.get(d.date).some((t) => t.key === key);

  // 2) 回収日 / 放出日（平均差枚の下位・上位）
  const sortedDiff = numbers(days.map((d) => d.avgDiff)).sort((a, b) => a - b);
  const lowCut = quantile(sortedDiff, cfg.recoveryQuantile);
  const highCut = quantile(sortedDiff, 1 - cfg.recoveryQuantile);
  const isRecovery = (d) => d.avgDiff != null && d.avgDiff <= lowCut;
  const isRelease = (d) => d.avgDiff != null && d.avgDiff >= highCut;
  const baseRecovery = mean(days.filter((d) => d.avgDiff != null).map((d) => (isRecovery(d) ? 1 : 0)));

  // 3) 日の種類ごとの成績
  const resDiff = weekdayResiduals(days, (d) => d.avgDiff);
  const lastDate = days[days.length - 1].date;
  const recentFrom = addDays(lastDate, -180);
  const tags = [];
  for (const [key, info] of tagInfo) {
    const inDays = days.filter((d) => hasTag(d, key));
    const outDays = days.filter((d) => !hasTag(d, key));
    const diff = compare(inDays.map((d) => d.avgDiff), outDays.map((d) => d.avgDiff), cfg.iterations, rng);
    const win = compare(inDays.map((d) => d.winRate), outDays.map((d) => d.winRate), cfg.iterations, rng);
    const games = compare(inDays.map((d) => d.avgGames), outDays.map((d) => d.avgGames), cfg.iterations, rng);
    const adjIn = mean(numbers(inDays.map((d) => resDiff.get(d.date))));
    const adjOut = mean(numbers(outDays.map((d) => resDiff.get(d.date))));
    const withDiff = inDays.filter((d) => d.avgDiff != null);
    const recIn = withDiff.map((d) => (isRecovery(d) ? 1 : 0));
    const relIn = withDiff.map((d) => (isRelease(d) ? 1 : 0));
    const outWithDiff = outDays.filter((d) => d.avgDiff != null);
    const recent = compare(
      inDays.filter((d) => d.date >= recentFrom).map((d) => d.avgDiff),
      outDays.filter((d) => d.date >= recentFrom).map((d) => d.avgDiff),
      0,
      rng
    );
    const enough = inDays.length >= cfg.minDays;
    let verdict = "データ不足";
    if (enough && diff.uplift != null && diff.p != null) {
      if (diff.uplift > 0 && diff.p < 0.05) verdict = "放出寄り";
      else if (diff.uplift < 0 && diff.p < 0.05) verdict = "回収寄り";
      else if (diff.uplift > 0 && diff.p < 0.2) verdict = "やや放出";
      else if (diff.uplift < 0 && diff.p < 0.2) verdict = "やや回収";
      else verdict = "差は確認できず";
    }
    tags.push({
      key,
      label: info.label,
      group: info.group,
      nDays: inDays.length,
      diff,
      win,
      games,
      upliftDiffWeekdayAdj: adjIn != null && adjOut != null ? adjIn - adjOut : null,
      recentUpliftDiff: recent.nIn >= 2 ? recent.uplift : null,
      recentN: recent.nIn,
      recoveryRate: recIn.length ? mean(recIn) : null,
      recoveryP: permutationPValue(recIn, outWithDiff.map((d) => (isRecovery(d) ? 1 : 0)), cfg.iterations, rng),
      releaseRate: relIn.length ? mean(relIn) : null,
      releaseP: permutationPValue(relIn, outWithDiff.map((d) => (isRelease(d) ? 1 : 0)), cfg.iterations, rng),
      lastDate: inDays.length ? inDays[inDays.length - 1].date : null,
      verdict,
    });
  }
  const groupOrder = ["イベント日", "イベント前後", "入替", "お金の日", "暦", "手入力", "現地メモ"];
  tags.sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) || (b.diff.uplift ?? -Infinity) - (a.diff.uplift ?? -Infinity));

  // 4) 出した翌日・回収した翌日はどうなるか
  const byDate = new Map(days.map((d) => [d.date, d]));
  const nextOf = (d) => byDate.get(addDays(d.date, 1));
  const afterStats = (pred) => {
    const after = days.filter((d) => pred(d) && nextOf(d) && nextOf(d).avgDiff != null).map((d) => nextOf(d).avgDiff);
    const others = days.filter((d) => !pred(d) && nextOf(d) && nextOf(d).avgDiff != null).map((d) => nextOf(d).avgDiff);
    return compare(after, others, cfg.iterations, rng);
  };
  const pairs = days.filter((d) => d.avgDiff != null && nextOf(d) && nextOf(d).avgDiff != null).map((d) => [d.avgDiff, nextOf(d).avgDiff]);
  let lagCorr = null;
  if (pairs.length >= 10) {
    const mx = mean(pairs.map((p) => p[0]));
    const my = mean(pairs.map((p) => p[1]));
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (const [x, y] of pairs) {
      sxy += (x - mx) * (y - my);
      sxx += (x - mx) ** 2;
      syy += (y - my) ** 2;
    }
    lagCorr = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  }
  const describeDay = (d) => ({ date: d.date, avgDiff: d.avgDiff, winRate: d.winRate, avgGames: d.avgGames, tags: tagsByDate.get(d.date).map((t) => t.label) });
  const recentDays = days.filter((d) => d.date >= addDays(lastDate, -90) && d.avgDiff != null);
  const recovery = {
    quantile: cfg.recoveryQuantile,
    lowCut,
    highCut,
    baseRate: baseRecovery,
    afterRelease: afterStats(isRelease),
    afterRecovery: afterStats(isRecovery),
    lagCorr,
    worstRecent: [...recentDays].sort((a, b) => a.avgDiff - b.avgDiff).slice(0, 10).map(describeDay),
    bestRecent: [...recentDays].sort((a, b) => b.avgDiff - a.avgDiff).slice(0, 10).map(describeDay),
  };

  // 5) 機種カテゴリ別（スマスロ / ジャグラー・ハナハナ / その他）
  const modelRows = (dataset.models || []).filter((m) => m.model && byDate.has(m.date));
  const catNames = cfg.categories.map((c) => c.name);
  const catDay = new Map(catNames.map((n) => [n, new Map()]));
  for (const m of modelRows) {
    const cat = categoryOf(m.model, cfg.categories);
    if (!cat) continue;
    const map = catDay.get(cat);
    if (!map.has(m.date)) map.set(m.date, []);
    map.get(m.date).push(m);
  }
  const catSeries = new Map(catNames.map((n) => [n, new Map([...catDay.get(n).entries()].map(([date, rows]) => [date, pool(rows)]))]));
  const categories = catNames.map((name) => {
    const series = catSeries.get(name);
    const all = pool([...catDay.get(name).values()].flat());
    return {
      name,
      nDays: series.size,
      samples: all.samples,
      avgDiff: all.avgDiff,
      winRate: all.winRate,
      avgGames: all.avgGames,
      byTag: tags
        .filter((t) => t.nDays >= cfg.minDays)
        .map((t) => {
          const inV = [];
          const outV = [];
          const inD = [];
          const outD = [];
          for (const d of days) {
            const s = series.get(d.date);
            if (!s) continue;
            (hasTag(d, t.key) ? inV : outV).push(s.winRate);
            (hasTag(d, t.key) ? inD : outD).push(s.avgDiff);
          }
          const win = compare(inV, outV, cfg.iterations, rng);
          const diff = compare(inD, outD, 0, rng);
          return { key: t.key, label: t.label, nDays: win.nIn, upliftWin: win.uplift, pWin: win.p, upliftDiff: diff.uplift };
        }),
    };
  });

  // 6) 日の種類 × 機種（その日に強い機種）
  const byModel = new Map();
  for (const m of modelRows) {
    if (!byModel.has(m.model)) byModel.set(m.model, []);
    byModel.get(m.model).push(m);
  }
  const activeFrom = addDays(lastDate, -7);
  const modelsByTag = [];
  for (const t of tags) {
    if (t.nDays < cfg.minDays) continue;
    const tagDates = new Set(days.filter((d) => hasTag(d, t.key)).map((d) => d.date));
    const cands = [];
    for (const [model, rows] of byModel) {
      if (!rows.some((r) => r.date >= activeFrom)) continue; // いま設置されている機種だけ
      const inRows = rows.filter((r) => tagDates.has(r.date));
      const outRows = rows.filter((r) => !tagDates.has(r.date));
      if (inRows.length < cfg.modelMinTagDays || outRows.length < 10) continue;
      const a = pool(inRows);
      const b = pool(outRows);
      if (a.winRate == null || b.winRate == null || a.samples < 30) continue;
      cands.push({ model, category: categoryOf(model, cfg.categories), nDays: inRows.length, samples: a.samples, winRate: a.winRate, upliftWin: a.winRate - b.winRate, avgDiff: a.avgDiff, upliftDiff: a.avgDiff != null && b.avgDiff != null ? a.avgDiff - b.avgDiff : null, inRows, outRows });
    }
    cands.sort((x, y) => y.upliftWin - x.upliftWin);
    const withP = (c) => {
      const rate = (r) => (r.win != null && r.total ? r.win / r.total : null);
      const { inRows, outRows, ...rest } = c;
      return { ...rest, p: permutationPValue(numbers(inRows.map(rate)), numbers(outRows.map(rate)), Math.min(500, cfg.iterations), rng) };
    };
    if (cands.length) modelsByTag.push({ key: t.key, label: t.label, group: t.group, nDays: t.nDays, top: cands.slice(0, 6).map(withP), bottom: cands.slice(-3).reverse().map(withP), nModels: cands.length });
  }

  // 7) 対象機種つきの期間メモ（おすすめ週間など）: 対象機種が期間中に、ふだんより・他機種より強いか
  const targets = [];
  const targetGroups = new Map();
  for (const c of manual.calendar || []) {
    if (!c.target) continue;
    const key = `${c.kind}|${c.target}`;
    if (!targetGroups.has(key)) targetGroups.set(key, { kind: c.kind, target: c.target, dates: new Set() });
    targetGroups.get(key).dates.add(c.date);
  }
  const modelRowsByDate = new Map();
  for (const m of modelRows) {
    if (!modelRowsByDate.has(m.date)) modelRowsByDate.set(m.date, []);
    modelRowsByDate.get(m.date).push(m);
  }
  for (const g of targetGroups.values()) {
    let re;
    try {
      re = new RegExp(g.target, "i");
    } catch {
      targets.push({ kind: g.kind, target: g.target, error: "target の正規表現が読めない" });
      continue;
    }
    const gapIn = [];
    const gapOut = [];
    const tIn = [];
    const tOut = [];
    const matched = new Set();
    for (const d of days) {
      const rows = modelRowsByDate.get(d.date) || [];
      const tRows = rows.filter((r) => re.test(r.model));
      const oRows = rows.filter((r) => !re.test(r.model));
      if (!tRows.length) continue;
      tRows.forEach((r) => matched.add(r.model));
      const tp = pool(tRows);
      const op = pool(oRows);
      const inPeriod = g.dates.has(d.date);
      (inPeriod ? tIn : tOut).push(tp);
      if (tp.winRate != null && op.winRate != null) (inPeriod ? gapIn : gapOut).push(tp.winRate - op.winRate);
    }
    const win = compare(tIn.map((x) => x.winRate), tOut.map((x) => x.winRate), cfg.iterations, rng);
    const diff = compare(tIn.map((x) => x.avgDiff), tOut.map((x) => x.avgDiff), cfg.iterations, rng);
    const gap = compare(gapIn, gapOut, cfg.iterations, rng);
    targets.push({ kind: g.kind, target: g.target, models: [...matched].slice(0, 8), nDays: win.nIn, nPeriodDays: g.dates.size, win, diff, gap });
  }

  // 8) 現地メモ（台単位）: 全機種について、記録のあった台が同じ日の他の台より出たか
  const unitTags = [];
  const observations = manual.observations || [];
  if (observations.length) {
    const unitByKey = new Map();
    const dayDiffs = new Map();
    for (const u of dataset.units || []) {
      if (u.diff == null) continue;
      unitByKey.set(`${u.date}|${u.unit}`, u);
      if (!dayDiffs.has(u.date)) dayDiffs.set(u.date, []);
      dayDiffs.get(u.date).push(u.diff);
    }
    const dayMean = new Map([...dayDiffs.entries()].map(([date, list]) => [date, mean(list)]));
    const groups = new Map();
    for (const o of observations) {
      if (!groups.has(o.tag)) groups.set(o.tag, []);
      groups.get(o.tag).push(o);
    }
    for (const [tag, list] of groups) {
      const matched = list.map((o) => unitByKey.get(`${o.date}|${o.unit}`)).filter(Boolean);
      const deltas = matched.map((u) => u.diff - dayMean.get(u.date));
      const byCat = catNames
        .map((name) => {
          const us = matched.filter((u) => categoryOf(u.model, cfg.categories) === name);
          const ds = us.map((u) => u.diff - dayMean.get(u.date));
          return { name, n: us.length, dDiff: mean(ds), winRate: us.length ? us.filter((u) => u.diff > 0).length / us.length : null };
        })
        .filter((c) => c.n > 0);
      unitTags.push({
        tag,
        nObs: list.length,
        nMatched: matched.length,
        nDays: new Set(list.map((o) => o.date)).size,
        meanDiff: mean(matched.map((u) => u.diff)),
        dDiff: mean(deltas),
        pDiff: signFlipPValue(deltas, cfg.iterations, rng),
        winRate: matched.length ? matched.filter((u) => u.diff > 0).length / matched.length : null,
        byCategory: byCat,
        lastDate: list.map((o) => o.date).sort().at(-1),
      });
    }
    unitTags.sort((a, b) => b.nObs - a.nObs);
  }

  return {
    ...base,
    from: days[0].date,
    to: lastDate,
    overall: { avgDiff: mean(days.map((d) => d.avgDiff)), winRate: mean(days.map((d) => d.winRate)), avgGames: mean(days.map((d) => d.avgGames)) },
    tags,
    recovery,
    categories,
    modelsByTag,
    targets,
    unitTags,
  };
}

/**
 * 今後 horizon 日ぶんの「日の種類」と、その種類の過去実績。レポート用。
 * calendar: analyzeCalendar の戻り値。
 */
export function upcomingCalendar(calendar, config, today, horizon = 14) {
  if (!calendar || !calendar.available) return [];
  const ctx = buildTagContext(config, { replacement: calendar.context.replacement, calendar: calendar.context.manual });
  const stats = new Map(calendar.tags.map((t) => [t.key, t]));
  const out = [];
  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i);
    const tags = dayTags(date, ctx).map((t) => {
      const s = stats.get(t.key);
      return { label: t.label, group: t.group, nDays: s ? s.nDays : 0, uplift: s ? s.diff.uplift : null, p: s ? s.diff.p : null, verdict: s ? s.verdict : "実績なし" };
    });
    let score = 0;
    for (const t of tags) {
      if (t.verdict === "放出寄り") score += 2;
      else if (t.verdict === "やや放出") score += 1;
      else if (t.verdict === "回収寄り") score -= 2;
      else if (t.verdict === "やや回収") score -= 1;
    }
    out.push({ date, weekday: dayInfo(date).weekday, tags, score, outlook: score >= 2 ? "放出寄り" : score <= -2 ? "回収寄り" : score > 0 ? "やや放出" : score < 0 ? "やや回収" : "ふつう" });
  }
  return out;
}
