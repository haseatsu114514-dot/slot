// データセットから「設定が入ってそうな場所・法則性」を炙り出す分析エンジン。純粋関数のみ。
//
// 出力は「差枚」「勝率」に加えて「G数（稼働）」も観察対象にする。
// 差枚は外れ値（万枚事故等）に引っ張られるので、判断は勝率・中央値も併せて見ること。
// G数は客側の行動。高稼働=高設定の証明ではないが、イベント日が客に信じられているかの傍証になる。

import { mean, median, mulberry32, permutationPValue, signFlipPValue, dayContainsDigit, addDays, toDateParts } from "./util.mjs";

/** イベント日定義をその日が満たすか */
export function matchesEvent(day, def) {
  switch (def.type) {
    case "digitContains":
      return dayContainsDigit(day.d, def.digit);
    case "nthWeekday":
      return day.weekday === def.weekday && day.nthWeekday === def.nth;
    case "weekday":
      return day.weekday === def.weekday;
    case "daysOfMonth":
      return def.days.includes(day.d);
    case "monthDay":
      return day.m === def.month && day.d === def.day;
    default:
      return false;
  }
}

function compareGroups(eventRows, restRows, pick, iterations, rng) {
  const ev = eventRows.map(pick).filter((v) => v != null && Number.isFinite(v));
  const rest = restRows.map(pick).filter((v) => v != null && Number.isFinite(v));
  const meanEvent = mean(ev);
  const meanRest = mean(rest);
  return {
    nEvent: ev.length,
    nRest: rest.length,
    meanEvent,
    meanRest,
    medianEvent: median(ev),
    uplift: meanEvent != null && meanRest != null ? meanEvent - meanRest : null,
    p: permutationPValue(ev, rest, iterations, rng),
  };
}

function ym(date) {
  return date.slice(0, 7);
}

function monthlyTrend(eventDays, restDays) {
  const months = new Map();
  const add = (d, isEvent) => {
    const key = ym(d.date);
    if (!months.has(key)) months.set(key, { ym: key, event: [], rest: [] });
    months.get(key)[isEvent ? "event" : "rest"].push(d);
  };
  eventDays.forEach((d) => add(d, true));
  restDays.forEach((d) => add(d, false));
  return [...months.values()]
    .sort((a, b) => (a.ym < b.ym ? -1 : 1))
    .map((m) => ({
      ym: m.ym,
      nEvent: m.event.length,
      upliftDiff: diffUplift(m.event, m.rest, (d) => d.avgDiff),
      upliftWin: diffUplift(m.event, m.rest, (d) => d.winRate),
    }));
}

function diffUplift(eventRows, restRows, pick) {
  const e = mean(eventRows.map(pick).filter((v) => v != null));
  const r = mean(restRows.map(pick).filter((v) => v != null));
  return e != null && r != null ? e - r : null;
}

/** 直近 nMonths か月とそれ以前で「効きが続いているか」を見る */
function recentSplit(eventDays, restDays, lastDate, nMonths = 6) {
  if (!lastDate) return null;
  const cutoff = `${lastDate.slice(0, 7)}-01`;
  const cutParts = cutoff.split("-").map(Number);
  const co = new Date(Date.UTC(cutParts[0], cutParts[1] - 1 - (nMonths - 1), 1));
  const cut = `${co.getUTCFullYear()}-${String(co.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const seg = (rows) => ({ recent: rows.filter((d) => d.date >= cut), past: rows.filter((d) => d.date < cut) });
  const e = seg(eventDays);
  const r = seg(restDays);
  const out = {
    cutoff: cut,
    months: nMonths,
    recent: {
      nEvent: e.recent.length,
      upliftDiff: diffUplift(e.recent, r.recent, (d) => d.avgDiff),
      upliftWin: diffUplift(e.recent, r.recent, (d) => d.winRate),
    },
    past: {
      nEvent: e.past.length,
      upliftDiff: diffUplift(e.past, r.past, (d) => d.avgDiff),
      upliftWin: diffUplift(e.past, r.past, (d) => d.winRate),
    },
  };
  out.verdict = verdictText(out);
  return out;
}

function verdictText(split) {
  const rw = split.recent.upliftWin;
  const pw = split.past.upliftWin;
  if (rw == null && pw == null) return "データ不足";
  if (rw == null) return "直近データ不足";
  if (rw >= 0.02) return pw != null && pw >= 0.02 ? "以前から直近まで機能してそう" : "直近は機能してそう";
  if (rw <= 0.005 && pw != null && pw >= 0.02) return "以前は効いていたが直近は怪しい（やめた可能性）";
  if (rw <= 0.005) return "直近は効いていない";
  return "微妙（誤差の範囲）";
}

function analyzeEventGroup(def, days, iterations, rng, recentMonths = 6) {
  const usable = days.filter((d) => d.winRate != null || d.avgDiff != null);
  const eventDays = usable.filter((d) => matchesEvent(d, def));
  const restDays = usable.filter((d) => !matchesEvent(d, def));
  const lastDate = usable.length ? usable[usable.length - 1].date : null;
  return {
    label: def.label,
    def,
    diff: compareGroups(eventDays, restDays, (d) => d.avgDiff, iterations, rng),
    win: compareGroups(eventDays, restDays, (d) => d.winRate, iterations, rng),
    games: compareGroups(eventDays, restDays, (d) => d.avgGames, iterations, rng),
    monthly: monthlyTrend(eventDays, restDays),
    recent: recentSplit(eventDays, restDays, lastDate, recentMonths),
  };
}

/** 機種ウォッチリストの日別集計行を作る */
export function buildSeriesDays(dataset, seriesWatchlist) {
  const dayByDate = new Map(dataset.days.map((d) => [d.date, d]));
  const out = new Map(seriesWatchlist.map((s) => [s.name, []]));
  const grouped = new Map(); // date → series → rows
  for (const m of dataset.models) {
    for (const s of seriesWatchlist) {
      if (!new RegExp(s.pattern, "i").test(m.model || "")) continue;
      const key = `${m.date}|${s.name}`;
      if (!grouped.has(key)) grouped.set(key, { date: m.date, series: s.name, rows: [] });
      grouped.get(key).rows.push(m);
    }
  }
  for (const g of grouped.values()) {
    const day = dayByDate.get(g.date);
    if (!day) continue;
    let wSum = 0;
    let wN = 0;
    let gSum = 0;
    let gN = 0;
    let win = 0;
    let total = 0;
    for (const r of g.rows) {
      const c = r.count ?? r.total ?? 1;
      if (r.avgDiff != null) {
        wSum += r.avgDiff * c;
        wN += c;
      }
      if (r.avgGames != null) {
        gSum += r.avgGames * c;
        gN += c;
      }
      if (r.win != null && r.total != null) {
        win += r.win;
        total += r.total;
      }
    }
    out.get(g.series).push({
      date: g.date,
      y: day.y,
      m: day.m,
      d: day.d,
      weekday: day.weekday,
      nthWeekday: day.nthWeekday,
      count: g.rows.reduce((a, r) => a + (r.count ?? 0), 0),
      avgDiff: wN > 0 ? wSum / wN : null,
      avgGames: gN > 0 ? gSum / gN : null,
      win: total ? win : null,
      total: total || null,
      winRate: total ? win / total : null,
    });
  }
  for (const rows of out.values()) rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

function analyzeSeries(seriesDaysMap, eventDefs, iterations, rng, lastDate) {
  const result = [];
  for (const [name, rows] of seriesDaysMap) {
    if (!rows.length) {
      // ウォッチリストにあるが設置が確認できないシリーズ（レポートでは非表示になる）
      result.push({ name, nDays: 0, active: false });
      continue;
    }
    const lastSeen = rows[rows.length - 1].date;
    const active = lastDate ? lastSeen >= addDays(lastDate, -14) : true;
    const byEvent = eventDefs.map((def) => {
      const ev = rows.filter((d) => matchesEvent(d, def));
      const rest = rows.filter((d) => !matchesEvent(d, def));
      const byYear = [];
      const years = [...new Set(rows.map((r) => r.y))].sort();
      for (const y of years) {
        const e = ev.filter((r) => r.y === y);
        const r2 = rest.filter((r) => r.y === y);
        byYear.push({
          y,
          nEvent: e.length,
          upliftDiff: diffUplift(e, r2, (d) => d.avgDiff),
          upliftWin: diffUplift(e, r2, (d) => d.winRate),
        });
      }
      return {
        label: def.label,
        diff: compareGroups(ev, rest, (d) => d.avgDiff, iterations, rng),
        win: compareGroups(ev, rest, (d) => d.winRate, iterations, rng),
        games: compareGroups(ev, rest, (d) => d.avgGames, iterations, rng),
        byYear,
      };
    });
    result.push({
      name,
      nDays: rows.length,
      lastSeen,
      active,
      avgCount: mean(rows.map((r) => r.count).filter((v) => v)),
      meanDiff: mean(rows.map((r) => r.avgDiff)),
      winRate: mean(rows.map((r) => r.winRate)),
      meanGames: mean(rows.map((r) => r.avgGames)),
      byEvent,
    });
  }
  return result;
}

/** 末尾分析: イベント日ごとの末尾成績 + 「日付末尾一致」の効き */
function analyzeSuffix(dataset, eventDefs, iterations, rng) {
  const dayByDate = new Map(dataset.days.map((d) => [d.date, d]));
  const rows = dataset.suffixes
    .map((s) => ({ ...s, day: dayByDate.get(s.date) }))
    .filter((s) => s.day);

  const byEvent = [];
  const groups = [{ label: "全日", def: null }, ...eventDefs.map((def) => ({ label: def.label, def }))];
  for (const g of groups) {
    const inGroup = rows.filter((s) => (g.def ? matchesEvent(s.day, g.def) : true));
    const outGroup = g.def ? rows.filter((s) => !matchesEvent(s.day, g.def)) : [];
    const suffixKeys = [...new Set(rows.map((s) => s.suffix))].sort();
    const table = suffixKeys.map((key) => {
      const e = inGroup.filter((s) => s.suffix === key);
      const o = outGroup.filter((s) => s.suffix === key);
      const meanDiff = mean(e.map((s) => s.avgDiff));
      const winRate = mean(e.map((s) => s.winRate));
      return {
        suffix: key,
        n: e.length,
        meanDiff,
        winRate,
        meanGames: mean(e.map((s) => s.avgGames)),
        upliftDiffVsNormal: g.def ? diffUplift(e, o, (s) => s.avgDiff) : null,
        upliftWinVsNormal: g.def ? diffUplift(e, o, (s) => s.winRate) : null,
        upliftGamesVsNormal: g.def ? diffUplift(e, o, (s) => s.avgGames) : null,
      };
    });
    byEvent.push({ label: g.label, nDays: new Set(inGroup.map((s) => s.date)).size, table });
  }

  // 日付末尾一致（例: 13日の末尾3）: その日の他末尾との差分を1日1サンプルとして符号反転検定
  const byDate = new Map();
  for (const s of rows) {
    if (!/^\d$/.test(s.suffix)) continue;
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }
  const deltasDiff = [];
  const deltasWin = [];
  const deltasGames = [];
  const matchRows = [];
  for (const [date, list] of byDate) {
    const day = dayByDate.get(date);
    const tail = String(day.d % 10);
    const match = list.find((s) => s.suffix === tail);
    if (!match) continue;
    const others = list.filter((s) => s.suffix !== tail);
    const oDiff = mean(others.map((s) => s.avgDiff));
    const oWin = mean(others.map((s) => s.winRate));
    const oGames = mean(others.map((s) => s.avgGames));
    if (match.avgDiff != null && oDiff != null) deltasDiff.push(match.avgDiff - oDiff);
    if (match.winRate != null && oWin != null) deltasWin.push(match.winRate - oWin);
    if (match.avgGames != null && oGames != null) deltasGames.push(match.avgGames - oGames);
    matchRows.push({ date, day });
  }
  return {
    byEvent,
    dateTailMatch: {
      n: matchRows.length,
      meanDeltaDiff: mean(deltasDiff),
      meanDeltaWin: mean(deltasWin),
      meanDeltaGames: mean(deltasGames),
      pDiff: signFlipPValue(deltasDiff, iterations, rng),
      pWin: signFlipPValue(deltasWin, iterations, rng),
      pGames: signFlipPValue(deltasGames, iterations, rng),
    },
  };
}

/** 凹み台の翌日・イベント日の扱いを見る */
function analyzeHole(dataset, eventDefs, holeConfig, iterations, rng) {
  const cfg = { window: 7, minObs: 4, buckets: [-8000, -3000, 3000], ...(holeConfig || {}) };
  const dayByDate = new Map(dataset.days.map((d) => [d.date, d]));
  const byUnit = new Map();
  for (const u of dataset.units) {
    if (!byUnit.has(u.unit)) byUnit.set(u.unit, []);
    byUnit.get(u.unit).push(u);
  }
  const samples = [];
  for (const list of byUnit.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      if (cur.diff == null) continue;
      const from = addDays(cur.date, -cfg.window);
      const prev = list.filter((u) => u.date >= from && u.date < cur.date && u.diff != null);
      if (prev.length < cfg.minObs) continue;
      const holeSum = prev.reduce((a, u) => a + u.diff, 0);
      const day = dayByDate.get(cur.date);
      samples.push({
        holeSum,
        diff: cur.diff,
        games: cur.games ?? null,
        win: cur.diff > 0 ? 1 : 0,
        isEvent: day ? eventDefs.some((def) => matchesEvent(day, def)) : false,
      });
    }
  }
  const labels = ["大凹み", "凹み", "フラット", "出てた"];
  const bucketOf = (v) => {
    for (let i = 0; i < cfg.buckets.length; i++) if (v <= cfg.buckets[i]) return i;
    return cfg.buckets.length;
  };
  const summarize = (rows) =>
    labels.map((label, i) => {
      const xs = rows.filter((s) => bucketOf(s.holeSum) === i);
      return {
        bucket: label,
        range: i === 0 ? `≤${cfg.buckets[0]}` : i === labels.length - 1 ? `>${cfg.buckets[cfg.buckets.length - 1]}` : `${cfg.buckets[i - 1]}〜${cfg.buckets[i]}`,
        n: xs.length,
        winRate: xs.length ? mean(xs.map((s) => s.win)) : null,
        meanDiff: xs.length ? mean(xs.map((s) => s.diff)) : null,
        meanGames: xs.length ? mean(xs.map((s) => s.games)) : null,
      };
    });
  return {
    config: cfg,
    nSamples: samples.length,
    allDays: summarize(samples),
    eventDays: summarize(samples.filter((s) => s.isEvent)),
    normalDays: summarize(samples.filter((s) => !s.isEvent)),
  };
}

/** 設置構成の変化（新台/増台/減台/撤去）を検知し、導入直後の扱いを集計する */
function analyzeLineup(dataset) {
  const byDate = new Map();
  for (const m of dataset.models) {
    if (!byDate.has(m.date)) byDate.set(m.date, new Map());
    if (m.model) byDate.get(m.date).set(m.model, m.count ?? m.total ?? null);
  }
  const dates = [...byDate.keys()].sort();
  const events = [];
  for (let i = 1; i < dates.length; i++) {
    const prev = byDate.get(dates[i - 1]);
    const cur = byDate.get(dates[i]);
    for (const [model, count] of cur) {
      if (!prev.has(model)) {
        events.push({ date: dates[i], model, kind: "新台", from: 0, to: count });
      } else if (count != null && prev.get(model) != null && count > prev.get(model)) {
        events.push({ date: dates[i], model, kind: "増台", from: prev.get(model), to: count });
      } else if (count != null && prev.get(model) != null && count < prev.get(model)) {
        events.push({ date: dates[i], model, kind: "減台", from: prev.get(model), to: count });
      }
    }
    for (const [model, count] of prev) {
      if (!cur.has(model)) events.push({ date: dates[i], model, kind: "撤去", from: count, to: 0 });
    }
  }
  // 導入直後（7日）とその後（30日）の比較
  const modelRows = new Map();
  for (const m of dataset.models) {
    if (!modelRows.has(m.model)) modelRows.set(m.model, []);
    modelRows.get(m.model).push(m);
  }
  const intro = events
    .filter((e) => e.kind === "新台" || e.kind === "増台")
    .map((e) => {
      const rows = (modelRows.get(e.model) || []).filter((r) => r.date >= e.date);
      const week = rows.filter((r) => r.date < addDays(e.date, 7));
      const later = rows.filter((r) => r.date >= addDays(e.date, 7) && r.date < addDays(e.date, 37));
      const wr = (xs) => {
        const w = xs.reduce((a, r) => a + (r.win ?? 0), 0);
        const t = xs.reduce((a, r) => a + (r.total ?? 0), 0);
        return t ? w / t : null;
      };
      return {
        ...e,
        firstWeek: { n: week.length, meanDiff: mean(week.map((r) => r.avgDiff)), winRate: wr(week), meanGames: mean(week.map((r) => r.avgGames)) },
        later: { n: later.length, meanDiff: mean(later.map((r) => r.avgDiff)), winRate: wr(later), meanGames: mean(later.map((r) => r.avgGames)) },
      };
    });
  return { events, intro };
}

/** 記念日・周年: 明示リスト + 機種シリーズ×(月,日) の自動スキャン */
function analyzeAnniversaries(dataset, seriesDaysMap, anniversaries) {
  const explicit = [];
  for (const a of anniversaries || []) {
    let rows;
    let baseline;
    if (a.seriesPattern) {
      const all = [...seriesDaysMap.values()].flat();
      const matched = [];
      for (const [name, list] of seriesDaysMap) {
        if (new RegExp(a.seriesPattern, "i").test(name)) matched.push(...list);
      }
      rows = (matched.length ? matched : all).filter((d) => d.m === a.month && d.d === a.day);
      baseline = mean((matched.length ? matched : all).map((d) => d.avgDiff));
    } else {
      rows = dataset.days.filter((d) => d.m === a.month && d.d === a.day);
      baseline = mean(dataset.days.map((d) => d.avgDiff));
    }
    explicit.push({
      label: a.label,
      monthDay: `${a.month}/${a.day}`,
      n: rows.length,
      dates: rows.map((r) => r.date),
      meanDiff: mean(rows.map((r) => r.avgDiff)),
      winRate: mean(rows.map((r) => r.winRate)),
      baselineDiff: baseline,
    });
  }
  const autoScan = [];
  for (const [name, list] of seriesDaysMap) {
    const base = mean(list.map((d) => d.avgDiff));
    if (base == null) continue;
    const byMd = new Map();
    for (const d of list) {
      const key = `${d.m}/${d.d}`;
      if (!byMd.has(key)) byMd.set(key, []);
      byMd.get(key).push(d);
    }
    for (const [md, rows] of byMd) {
      if (rows.length < 2) continue;
      const m = mean(rows.map((r) => r.avgDiff));
      if (m == null) continue;
      autoScan.push({ series: name, monthDay: md, n: rows.length, meanDiff: m, uplift: m - base, winRate: mean(rows.map((r) => r.winRate)) });
    }
  }
  autoScan.sort((a, b) => (b.uplift ?? -Infinity) - (a.uplift ?? -Infinity));
  return { explicit, autoScan: autoScan.slice(0, 40) };
}

/**
 * 全機種の総合成績ランキング。ウォッチリスト外の「他に強い台」を見つける用。
 * winRate は勝ち台数/延べ台数のプール値、meanDiff/meanGames は台数加重平均。
 * recent は直近 recentDays 日のみの再集計（今も強いかを見る）。
 */
export function analyzeModels(dataset, lastDate, recentDays = 60) {
  const byModel = new Map();
  for (const m of dataset.models) {
    if (!m.model) continue;
    if (!byModel.has(m.model)) byModel.set(m.model, []);
    byModel.get(m.model).push(m); // dataset.models は date 昇順
  }
  const cutoff = lastDate ? addDays(lastDate, -recentDays) : null;
  const activeFrom = lastDate ? addDays(lastDate, -7) : null;
  const agg = (xs) => {
    let win = 0;
    let total = 0;
    let dSum = 0;
    let dN = 0;
    let gSum = 0;
    let gN = 0;
    for (const r of xs) {
      if (r.win != null && r.total != null) {
        win += r.win;
        total += r.total;
      }
      const c = r.count ?? r.total ?? 1;
      if (r.avgDiff != null) {
        dSum += r.avgDiff * c;
        dN += c;
      }
      if (r.avgGames != null) {
        gSum += r.avgGames * c;
        gN += c;
      }
    }
    return { samples: total, winRate: total ? win / total : null, meanDiff: dN ? dSum / dN : null, meanGames: gN ? gSum / gN : null };
  };
  const rows = [];
  for (const [model, list] of byModel) {
    const all = agg(list);
    const recent = agg(cutoff ? list.filter((r) => r.date >= cutoff) : []);
    const last = list[list.length - 1];
    rows.push({
      model,
      count: last.count ?? last.total ?? null, // 直近の設置台数
      nDays: new Set(list.map((r) => r.date)).size, // 観測日数
      samples: all.samples, // 延べサンプル（台×日）
      winRate: all.winRate,
      meanDiff: all.meanDiff,
      meanGames: all.meanGames,
      recent,
      active: activeFrom ? list.some((r) => r.date >= activeFrom) : true, // 直近1週間に設置あり
    });
  }
  rows.sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1));
  return rows;
}

/** min-repo が付けている「状況」ラベルごとの成績 */
function analyzeStatusLabels(days) {
  const byLabel = new Map();
  for (const d of days) {
    const label = (d.status || "（ラベル無し）").replace(/\s+/g, "");
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(d);
  }
  return [...byLabel.entries()]
    .map(([label, rows]) => ({
      label,
      n: rows.length,
      meanDiff: mean(rows.map((r) => r.avgDiff)),
      winRate: mean(rows.map((r) => r.winRate)),
      meanGames: mean(rows.map((r) => r.avgGames)),
    }))
    .sort((a, b) => b.n - a.n);
}

export function analyze(dataset, config, opts = {}) {
  // サンプル数（並べ替え検定の反復数）は config.analysis.iterations でも上げられる
  const iterations = opts.iterations ?? config.analysis?.iterations ?? 2000;
  const seed = opts.seed ?? 20260612;
  const rng = mulberry32(seed);

  // 分析窓: config.analysisMonths が設定されていれば「最終データ日から遡って nか月」だけを使う。
  // 古い営業方針が今の判断を汚さないようにするため。収集済みデータ自体は消えない。
  const windowMonths = opts.windowMonths !== undefined ? opts.windowMonths : (config.analysisMonths ?? null);
  const totalDaysAvailable = dataset.days.length;
  let data = dataset;
  let windowFrom = null;
  if (windowMonths && dataset.days.length) {
    const lp = toDateParts(dataset.days[dataset.days.length - 1].date);
    const co = new Date(Date.UTC(lp.y, lp.m - 1 - windowMonths, lp.d + 1));
    windowFrom = `${co.getUTCFullYear()}-${String(co.getUTCMonth() + 1).padStart(2, "0")}-${String(co.getUTCDate()).padStart(2, "0")}`;
    const inWindow = (r) => r.date >= windowFrom;
    data = {
      days: dataset.days.filter(inWindow),
      models: dataset.models.filter(inWindow),
      units: dataset.units.filter(inWindow),
      suffixes: dataset.suffixes.filter(inWindow),
    };
  }
  const days = data.days;
  // 窓が短いときは「直近 vs それ以前」の比較も半分ずつに縮める
  const recentMonths = windowMonths ? Math.max(2, Math.round(windowMonths / 2)) : 6;
  const eventDefs = config.eventDays || [];

  const byDayOfMonth = [];
  for (let dd = 1; dd <= 31; dd++) {
    const ev = days.filter((d) => d.d === dd);
    const rest = days.filter((d) => d.d !== dd);
    if (!ev.length) continue;
    byDayOfMonth.push({
      d: dd,
      n: ev.length,
      meanDiff: mean(ev.map((x) => x.avgDiff)),
      medianDiff: median(ev.map((x) => x.avgDiff)),
      winRate: mean(ev.map((x) => x.winRate)),
      meanGames: mean(ev.map((x) => x.avgGames)),
      upliftDiff: diffUplift(ev, rest, (x) => x.avgDiff),
      upliftWin: diffUplift(ev, rest, (x) => x.winRate),
      upliftGames: diffUplift(ev, rest, (x) => x.avgGames),
      pWin: permutationPValue(
        ev.map((x) => x.winRate).filter((v) => v != null),
        rest.map((x) => x.winRate).filter((v) => v != null),
        iterations,
        rng
      ),
    });
  }

  const weekdayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const byWeekday = weekdayNames.map((name, w) => {
    const ev = days.filter((d) => d.weekday === w);
    const rest = days.filter((d) => d.weekday !== w);
    return {
      weekday: name,
      n: ev.length,
      meanDiff: mean(ev.map((x) => x.avgDiff)),
      winRate: mean(ev.map((x) => x.winRate)),
      meanGames: mean(ev.map((x) => x.avgGames)),
      upliftDiff: diffUplift(ev, rest, (x) => x.avgDiff),
      upliftWin: diffUplift(ev, rest, (x) => x.winRate),
      upliftGames: diffUplift(ev, rest, (x) => x.avgGames),
    };
  });

  const lastDate = days.length ? days[days.length - 1].date : null;
  const eventGroups = eventDefs.map((def) => analyzeEventGroup(def, days, iterations, rng, recentMonths));
  const seriesDaysMap = buildSeriesDays(data, config.seriesWatchlist || []);
  // 記念日は年1回しか起きないので、窓に関係なく全期間で評価する
  const fullSeriesDaysMap = windowMonths ? buildSeriesDays(dataset, config.seriesWatchlist || []) : seriesDaysMap;

  const diffDays = days.filter((d) => d.avgDiff != null);
  return {
    params: { iterations, seed, windowMonths, recentMonths },
    coverage: {
      from: days.length ? days[0].date : null,
      to: lastDate,
      nDays: days.length,
      totalDaysAvailable,
      windowMonths,
      windowFrom,
      nMasked: days.filter((d) => d.masked).length,
      nDiffDays: diffDays.length,
      nUnits: data.units.length,
      nModelRows: data.models.length,
      meanGames: mean(days.map((d) => d.avgGames)),
    },
    byDayOfMonth,
    byWeekday,
    eventGroups,
    models: analyzeModels(data, lastDate),
    statusLabels: analyzeStatusLabels(days),
    suffix: analyzeSuffix(data, eventDefs, iterations, rng),
    series: analyzeSeries(seriesDaysMap, eventDefs, iterations, rng, lastDate),
    hole: analyzeHole(data, eventDefs, config.hole, iterations, rng),
    lineup: analyzeLineup(data),
    anniversaries: analyzeAnniversaries(dataset, fullSeriesDaysMap, config.anniversaries),
  };
}
