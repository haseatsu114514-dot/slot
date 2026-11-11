// ジャグラー / ハナハナ（Aタイプ）の設定狙い分析。依存なし・純粋関数のみ。
//
// やること:
//  1. 台×日ごとに設定の事後確率を出す（settei.mjs）。店全体の設定配分も推定する。
//  2. 「凹み台に入れる」「入替日に入れる」「示唆景品」「据え置き」「台番・末尾・並び」などの仮説を、
//     高設定らしさ q = P(設定4以上 | その日の結果) を目的変数にして検証する。
//  3. 検証した特徴から翌日の狙い台ランキングを作り、過去データでウォークフォワード検証する
//     （その日より前のデータだけで選んだ台が、実際に全台平均より出たか）。
//
// 用語:
//  - q       : その台×日の「設定 highFrom 以上」の事後確率（0〜1）。1台1日では粗いが、束ねると傾向が出る。
//  - 同日比Δq: q からその日の Aタイプ全台の平均 q を引いたもの。「出す日/出さない日」の影響を消して台選びの効果だけを見る。
//  - 高設定率: その群の台×日だけで設定配分を EM 推定し直したときの 設定 highFrom 以上の割合。

import { matchSpec } from "./specs.mjs";
import { unitLogLik, posterior, probAtLeast, prepareLik, emMix, bootstrapHighShare, summarizeMix, normalize, IN_PER_GAME, N_SETTINGS } from "./settei.mjs";
import { mean, mulberry32, addDays, permutationPValue, signFlipPValue, matchesEvent, dayInfo } from "./util.mjs";

export const ATYPE_DEFAULTS = {
  seriesPattern: "ジャグラー|ハナハナ",
  minGames: 200, // これ未満の台×日は設定推定しない（情報がほぼ無い）。凹み計算の履歴には使う
  highFrom: 4, // 「高設定」とみなす下限
  prior: [0.45, 0.25, 0.14, 0.08, 0.05, 0.03], // 設定配分の初期値。データが増えると EM 推定に置き換わる
  priorStrength: 20, // 上の初期値を「何台ぶんの擬似データ」として扱うか
  groupPriorStrength: 10, // 群別の再推定を全体配分へ寄せる強さ（少サンプルの暴れ防止）
  skillLossPct: 0, // 一般客の取りこぼし補正（機械割から引く %）。差枚ベースの推定にだけ効く
  diffNoiseSd: 150, // データサイトの差枚の誤差（枚）
  hole: { prev1: [-2000, -1000, 0, 1000, 2000], prev7: [-5000, -2500, 0, 2500], streakMax: 4 },
  carry: [0.15, 0.4], // 据え置き検証: 前日の q をこの境界で 低そう/中間/高そう に分ける
  replacementDays: [], // 手動で分かっている入替日（"YYYY-MM-DD"）。calendar.csv でも足せる
  replacementMinUnits: 3, // 自動検知: 新台+増台がこの台数以上あった日を入替日とみなす
  picks: 10, // 翌日の狙い台を何台出すか
  // warmupDays: 最初は学習だけする日数 / shrink: 条件ごとの推定を全体配分へ寄せる擬似データ数 /
  // damp: 条件どうしの重なりの割引 / refitDays: 何日おきに学習し直すか
  backtest: { warmupDays: 45, topK: [1, 3, 5], shrink: 30, damp: 0.6, refitDays: 7 },
  iterations: 1000, // 並べ替え検定の反復数
};

export function atypeConfig(config) {
  const c = (config && config.atype) || {};
  return {
    ...ATYPE_DEFAULTS,
    ...c,
    hole: { ...ATYPE_DEFAULTS.hole, ...(c.hole || {}) },
    backtest: { ...ATYPE_DEFAULTS.backtest, ...(c.backtest || {}) },
  };
}

// ---- 小道具 ----

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clampP = (p) => Math.min(0.999, Math.max(0.001, p));

function signedNum(v) {
  const s = Math.abs(v).toLocaleString("ja-JP");
  return v > 0 ? `+${s}` : v < 0 ? `-${s}` : "0";
}

/** edges=[a,b,c] → 値のバケツ番号（0..edges.length）。v<=a→0, a<v<=b→1, … */
export function bucketIndex(v, edges) {
  for (let i = 0; i < edges.length; i++) if (v <= edges[i]) return i;
  return edges.length;
}

export function bucketLabels(edges, unit = "枚") {
  const out = [];
  for (let i = 0; i <= edges.length; i++) {
    if (i === 0) out.push(`${signedNum(edges[0])}${unit}以下`);
    else if (i === edges.length) out.push(`${signedNum(edges[i - 1])}${unit}超`);
    else out.push(`${signedNum(edges[i - 1])}〜${signedNum(edges[i])}${unit}`);
  }
  return out;
}

/**
 * 並べ替え検定（two-sided, 平均差）の高速版。小さい方の群だけを抜き出して合計するので O(小さい群) / 反復。
 * サンプル不足（どちらかが 3 未満）なら null。
 */
export function fastPermutationP(groupA, groupB, iterations, rng) {
  const a = groupA.filter((x) => typeof x === "number" && Number.isFinite(x));
  const b = groupB.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (a.length < 3 || b.length < 3) return null;
  const small = a.length <= b.length ? a : b;
  const pool = Float64Array.from(a.concat(b));
  const N = pool.length;
  const nS = small.length;
  let total = 0;
  for (let i = 0; i < N; i++) total += pool[i];
  let sumS = 0;
  for (const v of small) sumS += v;
  const stat = (s) => Math.abs(s / nS - (total - s) / (N - nS));
  const observed = stat(sumS);
  let hits = 0;
  for (let it = 0; it < iterations; it++) {
    let s = 0;
    for (let i = 0; i < nS; i++) {
      const j = i + Math.floor(rng() * (N - i));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
      s += pool[i];
    }
    if (stat(s) >= observed - 1e-12) hits++;
  }
  return (hits + 1) / (iterations + 1);
}

// ---- 台×日の行を作る ----

/**
 * dataset.units から Aタイプ（スペック登録済み）の台×日を取り出し、尤度を付ける。
 * 戻り値: { rows, unknownModels: [{model, n}] }
 */
export function buildATypeRows(dataset, config) {
  const cfg = atypeConfig(config);
  const re = new RegExp(cfg.seriesPattern, "i");
  const rows = [];
  const unknown = new Map();
  for (const u of dataset.units || []) {
    if (!u.model || u.unit == null || !re.test(u.model)) continue;
    const spec = matchSpec(u.model);
    if (!spec) {
      unknown.set(u.model, (unknown.get(u.model) || 0) + 1);
      continue;
    }
    const row = {
      date: u.date,
      unit: u.unit,
      model: u.model,
      specId: spec.id,
      specName: spec.name,
      series: spec.series,
      games: u.games ?? null,
      diff: u.diff ?? null,
      bb: u.bb ?? null,
      rb: u.rb ?? null,
      grape: u.grape ?? null,
      grapeGames: u.grapeGames ?? null,
      src: u.src || "site",
      ll: null,
      basis: null,
      post: null,
      q: null,
      cq: null,
      cdiff: null,
      feat: null,
    };
    if (row.games != null && row.games >= cfg.minGames) {
      const r = unitLogLik(row, spec, cfg);
      if (r) {
        row.ll = r.ll;
        row.basis = r.basis;
      }
    }
    rows.push(row);
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.unit - b.unit));
  return { rows, unknownModels: [...unknown.entries()].map(([model, n]) => ({ model, n })).sort((a, b) => b.n - a.n) };
}

// ---- 集計の部品 ----

function describe(rows, ctx) {
  const est = rows.filter((r) => r.ll);
  const withDiff = rows.filter((r) => r.diff != null && r.games > 0);
  let sumDiff = 0;
  let sumGames = 0;
  let wins = 0;
  for (const r of withDiff) {
    sumDiff += r.diff;
    sumGames += r.games;
    if (r.diff > 0) wins++;
  }
  let high = null;
  let pi = null;
  if (est.length >= 5) {
    const em = emMix(prepareLik(est.map((r) => r.ll)), est.length, null, {
      priorPi: ctx.pi,
      priorStrength: ctx.cfg.groupPriorStrength,
      init: ctx.pi,
      maxIter: 150,
      tol: 1e-5,
    });
    pi = em.pi;
    high = probAtLeast(pi, ctx.cfg.highFrom);
  }
  return {
    n: est.length,
    nRows: rows.length,
    nDays: new Set(rows.map((r) => r.date)).size,
    meanQ: mean(est.map((r) => r.q)),
    high,
    pi,
    meanDiff: withDiff.length ? sumDiff / withDiff.length : null,
    meanGames: withDiff.length ? sumGames / withDiff.length : null,
    payout: sumGames > 0 ? 1 + sumDiff / (IN_PER_GAME * sumGames) : null,
    winRate: withDiff.length ? wins / withDiff.length : null,
  };
}

/** 特徴 pick(row) のバケツごとに、成績と「同日比Δq」の検定を出す */
function bucketTable(rows, pick, labels, ctx) {
  const defined = rows.filter((r) => pick(r) != null);
  return labels.map((label, b) => {
    const inRows = defined.filter((r) => pick(r) === b);
    const outRows = defined.filter((r) => pick(r) !== b);
    const cqIn = inRows.filter((r) => r.cq != null).map((r) => r.cq);
    const cqOut = outRows.filter((r) => r.cq != null).map((r) => r.cq);
    return {
      bucket: label,
      ...describe(inRows, ctx),
      dq: mean(cqIn),
      dDiff: mean(inRows.filter((r) => r.cdiff != null).map((r) => r.cdiff)),
      p: fastPermutationP(cqIn, cqOut, ctx.cfg.iterations, ctx.rng),
    };
  });
}

/** 日単位の集計（その日の Aタイプ全台の平均 q・平均差枚） */
function buildDayStats(rows) {
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, day: dayInfo(r.date), rows: [] });
    byDate.get(r.date).rows.push(r);
  }
  const days = [];
  for (const d of byDate.values()) {
    const est = d.rows.filter((r) => r.q != null);
    const wd = d.rows.filter((r) => r.diff != null && r.games > 0);
    d.q = est.length ? mean(est.map((r) => r.q)) : null;
    d.diff = wd.length ? mean(wd.map((r) => r.diff)) : null;
    d.nEst = est.length;
    days.push(d);
  }
  days.sort((a, b) => (a.date < b.date ? -1 : 1));
  return days;
}

/** 日を単位に「該当日 vs それ以外」を比べる（同じ日の台は連動するので、検定は日単位で行う） */
function compareDayGroups(days, isIn, ctx, isRest = (d) => !isIn(d)) {
  const inDays = days.filter(isIn);
  const restDays = days.filter((d) => !isIn(d) && isRest(d));
  const stats = describe(inDays.flatMap((d) => d.rows), ctx);
  const rest = describe(restDays.flatMap((d) => d.rows), ctx);
  const qIn = inDays.map((d) => d.q).filter((v) => v != null);
  const qRest = restDays.map((d) => d.q).filter((v) => v != null);
  const meanQIn = mean(qIn);
  const meanQRest = mean(qRest);
  return {
    nDays: inDays.length,
    nDaysRest: restDays.length,
    n: stats.n,
    high: stats.high,
    highRest: rest.high,
    meanQ: meanQIn,
    meanQRest,
    upliftQ: meanQIn != null && meanQRest != null ? meanQIn - meanQRest : null,
    p: permutationPValue(qIn, qRest, ctx.cfg.iterations, ctx.rng),
    meanDiff: stats.meanDiff,
    meanDiffRest: rest.meanDiff,
    payout: stats.payout,
    payoutRest: rest.payout,
    winRate: stats.winRate,
  };
}

// ---- 特徴量（その日より前の履歴だけから作る） ----

/**
 * list: ある台番（同一機種）の行を日付昇順に並べたもの。i 番目より前の行だけを使って targetDate 用の特徴を作る。
 */
function historyFeatures(list, i, targetDate, cfg, baseQ) {
  const d1 = addDays(targetDate, -1);
  const d7 = addDays(targetDate, -7);
  const d60 = addDays(targetDate, -60);
  let prev1 = null;
  let prevQ = null;
  let sum7 = 0;
  let n7 = 0;
  let streak = 0;
  let streakOpen = true;
  let lastSeen = null;
  let rollSum = 0;
  let rollN = 0;
  for (let j = i - 1; j >= 0; j--) {
    const h = list[j];
    if (h.date >= targetDate) continue;
    if (h.date < d60) break;
    if (lastSeen == null) lastSeen = h.date;
    if (h.date === d1) {
      prev1 = h.diff;
      prevQ = h.q;
    }
    if (h.diff != null) {
      if (h.date >= d7) {
        sum7 += h.diff;
        n7++;
      }
      if (streakOpen) {
        if (h.diff < 0) streak++;
        else streakOpen = false;
      }
    }
    if (h.cq != null) {
      rollSum += h.cq;
      rollN++;
    }
  }
  const fresh = lastSeen != null && lastSeen >= addDays(targetDate, -2); // 直近2日以内にデータがある
  const rollRel = rollN >= 10 && baseQ > 0 ? rollSum / rollN / baseQ : null;
  return {
    prev1,
    prev7: n7 >= 4 ? sum7 : null,
    streak: fresh ? Math.min(streak, cfg.hole.streakMax) : null,
    streakRaw: fresh ? streak : null,
    prevQ,
    rollRel,
    b: {
      prev1: prev1 == null ? null : bucketIndex(prev1, cfg.hole.prev1),
      prev7: n7 >= 4 ? bucketIndex(sum7, cfg.hole.prev7) : null,
      prevQ: prevQ == null ? null : bucketIndex(prevQ, cfg.carry),
      roll: rollRel == null ? null : bucketIndex(rollRel, [-0.25, 0.25]),
    },
  };
}

/** 同じ日・同じ機種の台番の並びから「端（角）」を推定する。3台以上続く並びの両端=1、内側=0、それ以外=null */
function markEdges(dayRows) {
  const bySpec = new Map();
  for (const r of dayRows) {
    if (!bySpec.has(r.specId)) bySpec.set(r.specId, []);
    bySpec.get(r.specId).push(r);
  }
  const runs = [];
  for (const list of bySpec.values()) {
    list.sort((a, b) => a.unit - b.unit);
    let run = [];
    const flush = () => {
      if (run.length >= 3) {
        run.forEach((r, k) => (r.edge = k === 0 || k === run.length - 1 ? 1 : 0));
        runs.push(run);
      }
      run = [];
    };
    for (const r of list) {
      // 4・9 を欠番にしている店があるので、台番の差が 2 までは「隣」とみなす
      if (run.length && r.unit - run[run.length - 1].unit > 2) flush();
      run.push(r);
    }
    flush();
  }
  return runs;
}

function primaryEventLabel(day, eventDefs) {
  for (const def of eventDefs) if (matchesEvent(day, def)) return def.label;
  return "通常日";
}

/** ランキングモデルが使う特徴キー（その日より前に分かる情報だけ） */
function featureKeys(row, feat, ctx) {
  const keys = [`model:${row.specId}`, `ev:${feat.eventLabel}`];
  if (ctx.hasReplacement) keys.push(`rep:${feat.rep ? 1 : 0}`);
  if (feat.b.prev1 != null) keys.push(`p1:${feat.b.prev1}`);
  if (feat.b.prev7 != null) keys.push(`p7:${feat.b.prev7}`);
  if (feat.streak != null) keys.push(`st:${feat.streak}`);
  if (feat.b.prevQ != null) keys.push(`pq:${feat.b.prevQ}`);
  if (feat.b.roll != null) keys.push(`rq:${feat.b.roll}`);
  if (row.edge != null) keys.push(`edge:${row.edge}`);
  return keys;
}

function describeKey(key, ctx) {
  const [kind, raw] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  const cfg = ctx.cfg;
  switch (kind) {
    case "model":
      return `機種: ${ctx.specNames.get(raw) || raw}`;
    case "ev":
      return raw;
    case "rep":
      return raw === "1" ? "入替日" : "入替日ではない";
    case "p1":
      return `前日の差枚 ${bucketLabels(cfg.hole.prev1)[Number(raw)]}`;
    case "p7":
      return `直近7日の合計 ${bucketLabels(cfg.hole.prev7)[Number(raw)]}`;
    case "st":
      return Number(raw) === 0 ? "前日はプラス" : `${raw}${Number(raw) >= cfg.hole.streakMax ? "日以上" : "日"}連続マイナス`;
    case "pq":
      return `前日の推定設定が${["低そう", "中間", "高そう"][Number(raw)]}`;
    case "rq":
      return `この台番の最近60日が${["低め", "並", "高め"][Number(raw)]}`;
    case "edge":
      return raw === "1" ? "並びの端（角）" : "並びの内側";
    default:
      return key;
  }
}

/**
 * 条件キーごとの高設定率から「高設定らしさ」を採点する。
 * 各条件の高設定率と全体の高設定率の対数オッズ差を damp 倍して足し合わせる（条件どうしが重なるぶんの割引）。
 * model: { base, rates: Map(key → { rate, n }) }
 */
function scoreKeys(keys, model, bt) {
  const base = clampP(model.base);
  const lb = logit(base);
  let s = lb;
  const parts = [];
  for (const key of keys) {
    const t = model.rates.get(key);
    if (!t) continue;
    const rate = clampP(t.rate);
    const c = bt.damp * (logit(rate) - lb);
    s += c;
    parts.push({ key, contribution: c, rate, n: t.n });
  }
  return { p: sigmoid(s), parts, base };
}

/**
 * ランキングモデル（学習テーブル）。台×日の尤度を条件キーごとに貯めておき、
 * refit() でキーごとの設定配分を EM 推定して高設定率にする（少サンプルのキーは全体配分へ寄せる）。
 * 学習に使うのは尤度そのものなので、「全期間で推定した配分」に依存しない＝先読みが無い。
 */
function createRankModel(cfg) {
  const bt = cfg.backtest;
  let buf = new Float64Array(N_SETTINGS * 4096);
  const model = { n: 0, base: null, pi: normalize(cfg.prior), rates: new Map(), keyRows: new Map() };
  model.add = (ll, keys) => {
    if ((model.n + 1) * N_SETTINGS > buf.length) {
      const next = new Float64Array(buf.length * 2);
      next.set(buf);
      buf = next;
    }
    let max = -Infinity;
    for (let s = 0; s < N_SETTINGS; s++) if (ll[s] > max) max = ll[s];
    for (let s = 0; s < N_SETTINGS; s++) buf[model.n * N_SETTINGS + s] = Math.exp(ll[s] - max);
    for (const key of keys) {
      if (!model.keyRows.has(key)) model.keyRows.set(key, []);
      model.keyRows.get(key).push(model.n);
    }
    model.n++;
  };
  // final=true のときは収束するまで回す。途中の再学習は前回の結果の続きから数回だけ回す
  // （データは少しずつしか増えないので、再学習を重ねるうちに収束していく。計算時間の節約）
  model.refit = (final = false) => {
    if (!model.n) return;
    const g = emMix(buf, model.n, null, { priorPi: normalize(cfg.prior), priorStrength: cfg.priorStrength, init: model.pi, maxIter: final ? 400 : 12, tol: final ? 1e-7 : 1e-5 });
    model.pi = g.pi;
    model.base = probAtLeast(g.pi, cfg.highFrom);
    for (const [key, indices] of model.keyRows) {
      const prev = model.rates.get(key);
      const em = emMix(buf, 0, null, { indices, priorPi: model.pi, priorStrength: bt.shrink, init: prev ? prev.pi : model.pi, maxIter: final ? 200 : 10, tol: final ? 1e-6 : 1e-5 });
      model.rates.set(key, { rate: probAtLeast(em.pi, cfg.highFrom), n: indices.length, pi: em.pi });
    }
  };
  return model;
}

/**
 * ウォークフォワード検証: 各日について「その日より前のデータだけ」で台を採点し、
 * 上位 k 台の成績を、その日の Aタイプ全台平均と比べる。
 */
function walkForward(days, ctx) {
  const bt = ctx.cfg.backtest;
  const model = createRankModel(ctx.cfg);
  let trainedDays = 0;
  const perK = new Map(bt.topK.map((k) => [k, { deltaDiff: [], deltaQ: [], pickDiff: [], allDiff: [], pickQ: [], allQ: [], sumDiff: 0, sumGames: 0, wins: 0, nPicks: 0 }]));
  let allSumDiff = 0;
  let allSumGames = 0;
  let evalDays = 0;

  for (const d of days) {
    const cand = d.rows.filter((r) => r.feat);
    if (trainedDays >= bt.warmupDays && model.base != null && cand.length >= Math.max(...bt.topK) + 1) {
      const scored = cand
        .map((r) => ({ r, s: scoreKeys(featureKeys(r, r.feat, ctx), model, bt).p }))
        .sort((x, y) => y.s - x.s || x.r.unit - y.r.unit);
      const allDiffs = cand.filter((r) => r.diff != null).map((r) => r.diff);
      const allQs = cand.filter((r) => r.q != null).map((r) => r.q);
      const allDiff = mean(allDiffs);
      const allQ = mean(allQs);
      if (allDiff != null) {
        evalDays++;
        for (const r of cand) {
          if (r.diff != null && r.games > 0) {
            allSumDiff += r.diff;
            allSumGames += r.games;
          }
        }
        for (const k of bt.topK) {
          const acc = perK.get(k);
          const picks = scored.slice(0, k).map((x) => x.r);
          const pd = mean(picks.filter((r) => r.diff != null).map((r) => r.diff));
          const pq = mean(picks.filter((r) => r.q != null).map((r) => r.q));
          if (pd != null) {
            acc.deltaDiff.push(pd - allDiff);
            acc.pickDiff.push(pd);
            acc.allDiff.push(allDiff);
          }
          if (pq != null && allQ != null) {
            acc.deltaQ.push(pq - allQ);
            acc.pickQ.push(pq);
            acc.allQ.push(allQ);
          }
          for (const r of picks) {
            if (r.diff != null && r.games > 0) {
              acc.sumDiff += r.diff;
              acc.sumGames += r.games;
              acc.nPicks++;
              if (r.diff > 0) acc.wins++;
            }
          }
        }
      }
    }
    // その日の結果を学習テーブルに足す（翌日以降の採点に使う）
    let any = false;
    for (const r of cand) {
      if (!r.ll) continue;
      any = true;
      model.add(r.ll, featureKeys(r, r.feat, ctx));
    }
    if (any) {
      trainedDays++;
      if (trainedDays === bt.warmupDays || trainedDays % bt.refitDays === 0) model.refit();
    }
  }
  model.refit(true); // 翌日の狙い台用に、全データで学習し直す

  const results = bt.topK.map((k) => {
    const acc = perK.get(k);
    return {
      k,
      nDays: acc.deltaDiff.length,
      pickDiff: mean(acc.pickDiff),
      allDiff: mean(acc.allDiff),
      edgeDiff: mean(acc.deltaDiff),
      pDiff: signFlipPValue(acc.deltaDiff, ctx.cfg.iterations, ctx.rng),
      pickQ: mean(acc.pickQ),
      allQ: mean(acc.allQ),
      edgeQ: mean(acc.deltaQ),
      pQ: signFlipPValue(acc.deltaQ, ctx.cfg.iterations, ctx.rng),
      pickPayout: acc.sumGames > 0 ? 1 + acc.sumDiff / (IN_PER_GAME * acc.sumGames) : null,
      pickWinRate: acc.nPicks ? acc.wins / acc.nPicks : null,
    };
  });
  const main = results.find((r) => r.k === 3) || results[results.length - 1];
  let verdict = "データ不足";
  if (main && main.nDays >= 20 && main.edgeDiff != null && main.pDiff != null) {
    if (main.edgeDiff > 0 && main.pDiff < 0.05) verdict = "裏付けあり";
    else if (main.edgeDiff > 0 && main.pDiff < 0.2) verdict = "弱い裏付け";
    else verdict = "裏付けなし";
  }
  return {
    evalDays,
    trainedDays,
    warmupDays: bt.warmupDays,
    allPayout: allSumGames > 0 ? 1 + allSumDiff / (IN_PER_GAME * allSumGames) : null,
    results,
    verdict,
    model,
  };
}

// ---- 並び（隣どうしが一緒に高設定になりやすいか） ----

function analyzeNeighbors(runsByDay, ctx) {
  const groups = [];
  for (const runs of runsByDay) {
    for (const run of runs) {
      const qs = run.map((r) => r.q);
      if (qs.filter((v) => v != null).length < 3) continue;
      groups.push(qs.filter((v) => v != null));
    }
  }
  if (groups.length < 10) return { nPairs: 0, corr: null, p: null };
  const stat = (gs) => {
    let num = 0;
    let den = 0;
    let pairs = 0;
    for (const g of gs) {
      const m = g.reduce((a, b) => a + b, 0) / g.length;
      for (let i = 0; i < g.length; i++) {
        den += (g[i] - m) ** 2;
        if (i + 1 < g.length) {
          num += (g[i] - m) * (g[i + 1] - m);
          pairs++;
        }
      }
    }
    return { corr: den > 0 ? num / den : 0, pairs };
  };
  const observed = stat(groups);
  const iter = Math.min(500, ctx.cfg.iterations);
  const work = groups.map((g) => g.slice());
  let hits = 0;
  for (let it = 0; it < iter; it++) {
    for (const g of work) {
      for (let i = g.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.rng() * (i + 1));
        const tmp = g[i];
        g[i] = g[j];
        g[j] = tmp;
      }
    }
    if (stat(work).corr >= observed.corr - 1e-12) hits++;
  }
  // corr: 隣どうしの q の相関っぽい指標（+ なら並びで入れる傾向）。p は「偶然でこれ以上になる確率」（片側）
  return { nPairs: observed.pairs, corr: observed.corr, p: (hits + 1) / (iter + 1) };
}

// ---- 台番ごとの偏り ----

function analyzeUnits(rows, lastDate, ctx) {
  const byUnit = new Map();
  for (const r of rows) {
    const key = `${r.unit}|${r.specId}`;
    if (!byUnit.has(key)) byUnit.set(key, []);
    byUnit.get(key).push(r);
  }
  const recentFrom = lastDate ? addDays(lastDate, -30) : null;
  const table = [];
  for (const list of byUnit.values()) {
    const est = list.filter((r) => r.cq != null);
    if (est.length < 10) continue;
    const d = describe(list, ctx);
    const recent = est.filter((r) => recentFrom && r.date >= recentFrom);
    table.push({
      unit: list[0].unit,
      model: list[list.length - 1].model,
      n: d.n,
      meanQ: d.meanQ,
      dq: mean(est.map((r) => r.cq)),
      meanDiff: d.meanDiff,
      payout: d.payout,
      recentDq: recent.length >= 5 ? mean(recent.map((r) => r.cq)) : null,
      active: lastDate ? list.some((r) => r.date === lastDate) : true,
    });
  }
  table.sort((a, b) => (b.dq ?? -1) - (a.dq ?? -1));

  // 「台番による偏りは偶然の範囲か」: 台番ごとの平均Δq のばらつきを、日ごとに台番をシャッフルした場合と比べる
  const est = rows.filter((r) => r.cq != null);
  let p = null;
  if (table.length >= 5) {
    const unitKeys = [...new Set(est.map((r) => `${r.unit}|${r.specId}`))];
    const idx = new Map(unitKeys.map((k, i) => [k, i]));
    const byDate = new Map();
    for (const r of est) {
      if (!byDate.has(r.date)) byDate.set(r.date, { u: [], v: [] });
      const g = byDate.get(r.date);
      g.u.push(idx.get(`${r.unit}|${r.specId}`));
      g.v.push(r.cq);
    }
    const groups = [...byDate.values()];
    const sums = new Float64Array(unitKeys.length);
    const counts = new Float64Array(unitKeys.length);
    for (const g of groups) for (const u of g.u) counts[u]++;
    const stat = () => {
      sums.fill(0);
      for (const g of groups) for (let i = 0; i < g.u.length; i++) sums[g.u[i]] += g.v[i];
      let s = 0;
      for (let u = 0; u < sums.length; u++) if (counts[u] > 0) s += (sums[u] * sums[u]) / counts[u];
      return s;
    };
    const observed = stat();
    const iter = Math.min(300, ctx.cfg.iterations);
    let hits = 0;
    for (let it = 0; it < iter; it++) {
      for (const g of groups) {
        for (let i = g.v.length - 1; i > 0; i--) {
          const j = Math.floor(ctx.rng() * (i + 1));
          const tmp = g.v[i];
          g.v[i] = g.v[j];
          g.v[j] = tmp;
        }
      }
      if (stat() >= observed - 1e-12) hits++;
    }
    p = (hits + 1) / (iter + 1);
  }
  return { table, pHeterogeneity: p };
}

// ---- 入替日 ----

/** 入替日（自動検知 + 手動）を決める。戻り値: Map(date → { source, units, models }) */
export function replacementDates(lineupEvents, calendar, cfg) {
  const out = new Map();
  const auto = new Map();
  for (const e of lineupEvents || []) {
    if (e.kind !== "新台" && e.kind !== "増台") continue;
    const added = Math.max(1, (e.to ?? 1) - (e.from ?? 0));
    if (!auto.has(e.date)) auto.set(e.date, { units: 0, models: [] });
    const a = auto.get(e.date);
    a.units += added;
    a.models.push(e.model);
  }
  for (const [date, a] of auto) {
    if (a.units >= cfg.replacementMinUnits) out.set(date, { source: "自動検知", units: a.units, models: a.models });
  }
  const manual = [...(cfg.replacementDays || [])];
  for (const c of calendar || []) if (/入替|新台/.test(c.kind)) manual.push(c.date);
  for (const date of manual) {
    const cur = out.get(date);
    out.set(date, { source: cur ? "自動検知+手動" : "手動", units: cur ? cur.units : null, models: cur ? cur.models : [] });
  }
  return out;
}

// ---- 示唆景品などの現地メモ ----

function analyzeTags(dataset, rows, observations, ctx) {
  if (!observations || !observations.length) return [];
  const aRow = new Map(rows.map((r) => [`${r.date}|${r.unit}`, r]));
  // Aタイプ以外の台でも差枚は比べられるよう、全台番の「同日比Δ差枚」を作る
  const byDate = new Map();
  for (const u of dataset.units || []) {
    if (u.diff == null) continue;
    if (!byDate.has(u.date)) byDate.set(u.date, []);
    byDate.get(u.date).push(u);
  }
  const dayMeanDiff = new Map([...byDate.entries()].map(([d, list]) => [d, mean(list.map((u) => u.diff))]));
  const anyUnit = new Map((dataset.units || []).map((u) => [`${u.date}|${u.unit}`, u]));

  const byTag = new Map();
  for (const o of observations) {
    if (!byTag.has(o.tag)) byTag.set(o.tag, []);
    byTag.get(o.tag).push(o);
  }
  const out = [];
  for (const [tag, list] of byTag) {
    const matched = list.map((o) => anyUnit.get(`${o.date}|${o.unit}`)).filter((u) => u && u.diff != null);
    const dDiffs = matched.map((u) => u.diff - (dayMeanDiff.get(u.date) ?? 0));
    const aRows = list.map((o) => aRow.get(`${o.date}|${o.unit}`)).filter(Boolean);
    const cqs = aRows.filter((r) => r.cq != null).map((r) => r.cq);
    const d = describe(aRows, ctx);
    out.push({
      tag,
      nObs: list.length,
      nMatched: matched.length,
      meanDiff: mean(matched.map((u) => u.diff)),
      winRate: matched.length ? matched.filter((u) => u.diff > 0).length / matched.length : null,
      dDiff: mean(dDiffs),
      pDiff: signFlipPValue(dDiffs, ctx.cfg.iterations, ctx.rng),
      nAType: d.n,
      meanQ: d.meanQ,
      high: d.high,
      dq: mean(cqs),
      pQ: signFlipPValue(cqs, ctx.cfg.iterations, ctx.rng),
      lastDate: list.map((o) => o.date).sort().at(-1),
    });
  }
  out.sort((a, b) => b.nObs - a.nObs);
  return out;
}

// ---- 本体 ----

/**
 * opts: { lineupEvents: analysis.lineup.events, seed }
 * dataset.manual = { observations: [...], calendar: [...] } があれば使う。
 */
export function analyzeAType(dataset, config, opts = {}) {
  const cfg = atypeConfig(config);
  const rng = mulberry32(opts.seed ?? 20261111);
  const { rows, unknownModels } = buildATypeRows(dataset, config);
  const est = rows.filter((r) => r.ll);
  const manual = dataset.manual || {};
  const base = { available: false, config: { highFrom: cfg.highFrom, minGames: cfg.minGames, inPerGame: IN_PER_GAME }, unknownModels };
  if (est.length < 30) {
    return {
      ...base,
      reason:
        rows.length === 0
          ? "ジャグラー/ハナハナの台番別データがまだ無い（機種別詳細の取得 or 手入力 counts.csv が必要）"
          : `設定推定できる台×日が ${est.length} 件しか無い（30 件以上で分析を始める）`,
      nRows: rows.length,
    };
  }

  // 1) 店全体の設定配分（EM）→ 各台×日の事後確率
  const lik = prepareLik(est.map((r) => r.ll));
  const em = emMix(lik, est.length, null, { priorPi: normalize(cfg.prior), priorStrength: cfg.priorStrength, maxIter: 500 });
  const pi = em.pi;
  for (const r of est) {
    r.post = posterior(r.ll, pi);
    r.q = probAtLeast(r.post, cfg.highFrom);
  }
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const dateIdx = new Map(dates.map((d, i) => [d, i]));
  const ci = bootstrapHighShare(lik, est.length, Int32Array.from(est.map((r) => dateIdx.get(r.date))), dates.length, rng, {
    priorPi: normalize(cfg.prior),
    priorStrength: cfg.priorStrength,
    init: pi,
    highFrom: cfg.highFrom,
    iterations: 120,
    maxIter: 30,
  });

  const specNames = new Map(rows.map((r) => [r.specId, r.specName]));
  const ctx = { cfg, rng, pi, specNames, hasReplacement: false };

  // 2) 日単位の集計と同日比
  const days = buildDayStats(rows);
  for (const d of days) {
    for (const r of d.rows) {
      if (r.q != null && d.nEst >= 2) r.cq = r.q - d.q;
      if (r.diff != null && d.diff != null) r.cdiff = r.diff - d.diff;
    }
  }
  const baseQ = mean(est.map((r) => r.q));

  // 3) 入替日・イベント日
  const eventDefs = config.eventDays || [];
  const repMap = replacementDates(opts.lineupEvents, manual.calendar, cfg);
  ctx.hasReplacement = repMap.size > 0;

  // 4) 特徴量（履歴）と並びの端
  const byUnit = new Map();
  for (const r of rows) {
    const key = `${r.unit}|${r.specId}`;
    if (!byUnit.has(key)) byUnit.set(key, []);
    byUnit.get(key).push(r);
  }
  for (const list of byUnit.values()) {
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const f = historyFeatures(list, i, r.date, cfg, baseQ);
      const day = dayInfo(r.date);
      f.eventLabel = primaryEventLabel(day, eventDefs);
      f.rep = repMap.has(r.date);
      f.tailMatch = r.unit % 10 === day.d % 10;
      r.feat = f;
    }
  }
  const runsByDay = days.map((d) => markEdges(d.rows));

  const lastDate = dates[dates.length - 1];

  // 5) 仮説ごとの集計
  const all = describe(rows, ctx);
  const basisCounts = { counts: est.filter((r) => r.basis === "counts").length, diff: est.filter((r) => r.basis === "diff").length };

  const byModelMap = new Map();
  for (const r of rows) {
    if (!byModelMap.has(r.specId)) byModelMap.set(r.specId, []);
    byModelMap.get(r.specId).push(r);
  }
  const byModel = [...byModelMap.entries()]
    .map(([specId, list]) => {
      const d = describe(list, ctx);
      return {
        specId,
        name: specNames.get(specId),
        siteNames: [...new Set(list.map((r) => r.model))],
        nUnits: new Set(list.filter((r) => r.date === lastDate).map((r) => r.unit)).size,
        ...d,
        mix: d.pi ? summarizeMix(d.pi) : null,
      };
    })
    .sort((a, b) => b.n - a.n);

  const byEvent = eventDefs.map((def) => ({ label: def.label, ...compareDayGroups(days, (d) => matchesEvent(d.day, def), ctx) }));
  const weekdayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const byWeekday = weekdayNames.map((name, w) => ({ label: name, ...compareDayGroups(days, (d) => d.day.weekday === w, ctx) }));

  const prev1Labels = bucketLabels(cfg.hole.prev1);
  const prev7Labels = bucketLabels(cfg.hole.prev7);
  const streakLabels = Array.from({ length: cfg.hole.streakMax + 1 }, (_, i) => (i === 0 ? "前日プラス（連続なし）" : i === cfg.hole.streakMax ? `${i}日以上連続マイナス` : `${i}日連続マイナス`));
  const isEventRow = (r) => r.feat.eventLabel !== "通常日";
  const hole = {
    prev1: bucketTable(rows, (r) => r.feat.b.prev1, prev1Labels, ctx),
    prev7: bucketTable(rows, (r) => r.feat.b.prev7, prev7Labels, ctx),
    prev7Event: bucketTable(rows.filter(isEventRow), (r) => r.feat.b.prev7, prev7Labels, ctx),
    prev7Normal: bucketTable(rows.filter((r) => !isEventRow(r)), (r) => r.feat.b.prev7, prev7Labels, ctx),
    streak: bucketTable(rows, (r) => r.feat.streak, streakLabels, ctx),
  };

  const carry = bucketTable(rows, (r) => r.feat.b.prevQ, ["前日 低そう", "前日 中間", "前日 高そう"], ctx);

  const inWindow = (date) => {
    for (const k of [-1, 0, 1, 2]) if (repMap.has(addDays(date, -k))) return true;
    return false;
  };
  const replacement = {
    days: [...repMap.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => (a.date < b.date ? 1 : -1)),
    offsets: [
      { label: "入替前日", k: -1 },
      { label: "入替当日", k: 0 },
      { label: "入替翌日", k: 1 },
      { label: "入替2日後", k: 2 },
    ].map((o) => ({ label: o.label, ...compareDayGroups(days, (d) => repMap.has(addDays(d.date, -o.k)), ctx, (d) => !inWindow(d.date)) })),
  };

  const calendarKinds = [];
  const kinds = new Map();
  for (const c of manual.calendar || []) {
    if (/入替|新台/.test(c.kind)) continue;
    if (!kinds.has(c.kind)) kinds.set(c.kind, new Set());
    kinds.get(c.kind).add(c.date);
  }
  for (const [kind, set] of kinds) calendarKinds.push({ label: kind, ...compareDayGroups(days, (d) => set.has(d.date), ctx) });

  const tags = analyzeTags(dataset, rows, manual.observations, ctx);
  const units = analyzeUnits(rows, lastDate, ctx);
  const suffix = bucketTable(rows, (r) => r.unit % 10, Array.from({ length: 10 }, (_, i) => `末尾${i}`), ctx);
  const tailMatch = bucketTable(rows, (r) => (r.feat.tailMatch ? 1 : 0), ["日付末尾と不一致", "日付末尾と一致"], ctx);
  const edge = bucketTable(rows, (r) => r.edge ?? null, ["並びの内側", "並びの端（角）"], ctx);
  const neighbors = analyzeNeighbors(runsByDay, ctx);

  // 全台系っぽい 機種×日
  const mdMap = new Map();
  for (const r of est) {
    const key = `${r.date}|${r.specId}`;
    if (!mdMap.has(key)) mdMap.set(key, []);
    mdMap.get(key).push(r);
  }
  const modelDays = [...mdMap.values()]
    .filter((list) => list.length >= 3)
    .map((list) => {
      let sumDiff = 0;
      let sumGames = 0;
      for (const r of list) {
        if (r.diff != null) {
          sumDiff += r.diff;
          sumGames += r.games;
        }
      }
      return {
        date: list[0].date,
        name: list[0].specName,
        n: list.length,
        meanQ: mean(list.map((r) => r.q)),
        payout: sumGames > 0 ? 1 + sumDiff / (IN_PER_GAME * sumGames) : null,
        eventLabel: list[0].feat.eventLabel,
        rep: list[0].feat.rep,
      };
    })
    .sort((a, b) => b.meanQ - a.meanQ)
    .slice(0, 20);

  // 6) ランキングモデルのウォークフォワード検証と、翌日の狙い台
  const wf = walkForward(days, ctx);
  const targetDate = addDays(lastDate, 1);
  const targetDay = dayInfo(targetDate);
  const targetEvent = primaryEventLabel(targetDay, eventDefs);
  const targetRep = repMap.has(targetDate);
  const lastRows = rows.filter((r) => r.date === lastDate);
  const picksAll = [];
  if (wf.model.base != null) {
    for (const r of lastRows) {
      const list = byUnit.get(`${r.unit}|${r.specId}`);
      const f = historyFeatures(list, list.length, targetDate, cfg, baseQ);
      f.eventLabel = targetEvent;
      f.rep = targetRep;
      const pseudo = { specId: r.specId, edge: r.edge };
      const sc = scoreKeys(featureKeys(pseudo, f, ctx), wf.model, cfg.backtest);
      picksAll.push({
        unit: r.unit,
        model: r.model,
        p: sc.p,
        prev1: f.prev1,
        prev7: f.prev7,
        streak: f.streakRaw,
        prevQ: f.prevQ,
        reasons: sc.parts
          .filter((x) => x.contribution > 0.02)
          .sort((x, y) => y.contribution - x.contribution)
          .slice(0, 3)
          .map((x) => ({ text: describeKey(x.key, ctx), rate: x.rate, n: x.n })),
        cautions: sc.parts
          .filter((x) => x.contribution < -0.02)
          .sort((x, y) => x.contribution - y.contribution)
          .slice(0, 2)
          .map((x) => ({ text: describeKey(x.key, ctx), rate: x.rate, n: x.n })),
      });
    }
    picksAll.sort((a, b) => b.p - a.p || a.unit - b.unit);
  }
  const featureTable = [...wf.model.rates.entries()]
    .map(([key, t]) => ({ key, text: describeKey(key, ctx), n: t.n, rate: t.rate }))
    .filter((x) => x.n >= 20)
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));

  const latest = lastRows
    .map((r) => ({
      unit: r.unit,
      model: r.model,
      games: r.games,
      bb: r.bb,
      rb: r.rb,
      diff: r.diff,
      basis: r.basis,
      post: r.post,
      q: r.q,
      src: r.src,
    }))
    .sort((a, b) => a.unit - b.unit);

  return {
    ...base,
    available: true,
    coverage: {
      from: dates[0],
      to: lastDate,
      nDays: dates.length,
      nRows: rows.length,
      nEstimated: est.length,
      nUnits: new Set(lastRows.map((r) => r.unit)).size,
      basisCounts,
      nManual: rows.filter((r) => r.src === "manual").length,
    },
    mix: { pi, ...summarizeMix(pi), highCi: ci, emIterations: em.iterations },
    baseQ,
    all: { meanDiff: all.meanDiff, payout: all.payout, winRate: all.winRate, meanGames: all.meanGames },
    byModel,
    byEvent,
    byWeekday,
    hole,
    holeLabels: { prev1: cfg.hole.prev1, prev7: cfg.hole.prev7 },
    carry,
    replacement,
    calendarKinds,
    tags,
    units,
    suffix,
    tailMatch,
    edge,
    neighbors,
    modelDays,
    backtest: { evalDays: wf.evalDays, trainedDays: wf.trainedDays, warmupDays: wf.warmupDays, allPayout: wf.allPayout, results: wf.results, verdict: wf.verdict },
    featureTable,
    picks: { targetDate, eventLabel: targetEvent, rep: targetRep, baseRate: wf.model.base, rows: picksAll.slice(0, cfg.picks), nCandidates: picksAll.length },
    latest: { date: lastDate, rows: latest },
  };
}

export { N_SETTINGS };
