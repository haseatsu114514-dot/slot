// Aタイプ（ジャグラー / ハナハナ）の設定推定エンジン。依存なし・純粋関数のみ。
//
// 考え方（根拠）:
//  - 設定 s のボーナス確率は解析サイトの掲載値で分かっている（specs.mjs）。
//    「総ゲーム数 G・BIG 回数・REG 回数」が観測できれば、各設定でその結果が出る確率（尤度）を
//    厳密に計算できる（多項分布）。これが一番信頼できる根拠。
//  - BIG/REG が取れず「差枚と G数」しか無い場合は、差枚の平均と分散を設定ごとに計算し、
//    正規近似で尤度を出す（精度は落ちるが、台×日を大量に束ねれば店の傾向は見える）。
//  - 尤度に「この店の設定配分（事前分布）」を掛けて正規化したものが事後確率（ベイズ推定）。
//    事前分布そのものも、全台×日の尤度から EM 法で推定する（＝店の設定配分の推定）。
//
// 1台1日の結果だけで設定を断定することはできない。束ねて傾向を見るための道具。

export const N_SETTINGS = 6;

/**
 * 通常ゲーム 1G あたりの IN 枚数（3枚掛け + ボーナス中の投入ぶんの上乗せ）。
 * 機械割は「総OUT/総IN」なので、差枚の期待値 = IN × (機械割 − 1)。
 * ボーナス中の IN は通常ゲーム比で数%しかなく、設定間の差に比べて無視できるので定数で近似する。
 */
export const IN_PER_GAME = 3.1;

const DEFAULT_OPTS = {
  skillLossPct: 0, // 一般客の取りこぼしぶん（機械割から引く %）
  diffNoiseSd: 150, // データサイトの差枚の測定誤差（枚、台×日あたり）
  smallRoleVar: 9, // 小役（ぶどう/ベル・リプレイ等）による 1G あたりの差枚の分散
};

function isCount(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * BIG/REG 回数からの対数尤度（設定1〜6）。多項分布。
 * obs: { games, bb, rb, grape?, grapeGames? }
 *   grape = ぶどう（ジャグラー）/ ベル（ハナハナ）を自分で数えた回数。grapeGames はその間の G数（省略時 games）。
 * 計算できないときは null。
 */
export function logLikCounts(obs, spec) {
  const { games, bb, rb } = obs;
  if (!isCount(games) || games <= 0 || !isCount(bb) || !isCount(rb)) return null;
  if (bb + rb > games) return null;
  const out = new Array(N_SETTINGS);
  for (let s = 0; s < N_SETTINGS; s++) {
    const pB = 1 / spec.big[s];
    const pR = 1 / spec.reg[s];
    let ll = bb * Math.log(pB) + rb * Math.log(pR) + (games - bb - rb) * Math.log(1 - pB - pR);
    if (isCount(obs.grape) && spec.grape) {
      const trials = isCount(obs.grapeGames) && obs.grapeGames > 0 ? obs.grapeGames : games;
      if (obs.grape <= trials) {
        const pG = 1 / spec.grape[s];
        ll += obs.grape * Math.log(pG) + (trials - obs.grape) * Math.log(1 - pG);
      }
    }
    out[s] = ll;
  }
  return out;
}

/** 設定 s・G ゲームでの差枚の平均と分散 */
export function diffMoments(games, spec, s, opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts };
  const pB = 1 / spec.big[s];
  const pR = 1 / spec.reg[s];
  const bonusMean = pB * spec.bigNet + pR * spec.regNet;
  const perGameVar = pB * spec.bigNet ** 2 + pR * spec.regNet ** 2 - bonusMean ** 2 + o.smallRoleVar;
  const perGameMean = IN_PER_GAME * (spec.payout[s] / 100 - 1 - o.skillLossPct / 100);
  return { mean: games * perGameMean, variance: games * perGameVar + o.diffNoiseSd ** 2 };
}

/** 差枚と G数だけからの対数尤度（設定1〜6）。正規近似。計算できないときは null。 */
export function logLikDiff(obs, spec, opts = {}) {
  const { games, diff } = obs;
  if (!isCount(games) || games <= 0 || typeof diff !== "number" || !Number.isFinite(diff)) return null;
  const out = new Array(N_SETTINGS);
  for (let s = 0; s < N_SETTINGS; s++) {
    const { mean, variance } = diffMoments(games, spec, s, opts);
    out[s] = -0.5 * Math.log(2 * Math.PI * variance) - (diff - mean) ** 2 / (2 * variance);
  }
  return out;
}

/**
 * 1台1日ぶんの対数尤度。BIG/REG があればそれを使い、無ければ差枚で代用する。
 * 戻り値: { ll: number[6], basis: "counts" | "diff" } | null
 */
export function unitLogLik(obs, spec, opts = {}) {
  const byCounts = logLikCounts(obs, spec);
  if (byCounts) return { ll: byCounts, basis: "counts" };
  const byDiff = logLikDiff(obs, spec, opts);
  if (byDiff) return { ll: byDiff, basis: "diff" };
  return null;
}

export function uniformPrior() {
  return new Array(N_SETTINGS).fill(1 / N_SETTINGS);
}

export function normalize(weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return uniformPrior();
  return weights.map((w) => w / sum);
}

/** 対数尤度 × 事前分布 → 事後確率（設定1〜6、合計1） */
export function posterior(ll, prior = uniformPrior()) {
  let max = -Infinity;
  for (const v of ll) if (v > max) max = v;
  return normalize(ll.map((v, s) => Math.exp(v - max) * prior[s]));
}

/** 事後確率から「設定 from 以上」の確率 */
export function probAtLeast(post, from = 4) {
  let sum = 0;
  for (let s = from - 1; s < N_SETTINGS; s++) sum += post[s];
  return sum;
}

/** 事後確率での期待機械割（%） */
export function expectedPayout(post, spec) {
  return post.reduce((a, p, s) => a + p * spec.payout[s], 0);
}

/** 配分 pi の要約: 低(1-2) / 中(3) / 高(4-6) / 最上位(5-6) */
export function summarizeMix(pi) {
  return { low: pi[0] + pi[1], mid: pi[2], high: pi[3] + pi[4] + pi[5], top: pi[4] + pi[5] };
}

/** 対数尤度の行列を、行ごとに最大値 1 へ正規化した尤度の Float64Array（n×6）にする */
export function prepareLik(llRows) {
  const n = llRows.length;
  const lik = new Float64Array(n * N_SETTINGS);
  for (let i = 0; i < n; i++) {
    const ll = llRows[i];
    let max = -Infinity;
    for (let s = 0; s < N_SETTINGS; s++) if (ll[s] > max) max = ll[s];
    for (let s = 0; s < N_SETTINGS; s++) lik[i * N_SETTINGS + s] = Math.exp(ll[s] - max);
  }
  return lik;
}

/**
 * 設定配分の推定（混合比の EM 法）。
 * 「各台×日は配分 pi に従って設定が決まり、その設定の確率で結果が出た」というモデルで、
 * 観測全体がもっとも起こりやすくなる pi を求める。
 *
 * lik: prepareLik の戻り値 / n: 行数 / weights: 行ごとの重み（ブートストラップ用、省略可）
 * opts.priorPi + opts.priorStrength: 「priorStrength 台ぶんの擬似データが priorPi の配分で既にある」とみなして
 *   少サンプルの暴れを抑える（0 なら純粋な最尤推定）。
 * opts.indices: lik のうち使う行番号の配列（一部の行だけで推定するとき。このとき n は無視され、weights は使えない）。
 */
export function emMix(lik, n, weights = null, opts = {}) {
  const maxIter = opts.maxIter ?? 300;
  const tol = opts.tol ?? 1e-7;
  const priorPi = opts.priorPi || uniformPrior();
  const strength = opts.priorStrength ?? 0;
  const indices = opts.indices || null;
  if (indices) {
    n = indices.length;
    weights = null;
  }
  let pi = (opts.init || priorPi).map((v) => Math.max(v, 1e-6));
  pi = normalize(pi);
  let total = 0;
  if (weights) for (let i = 0; i < n; i++) total += weights[i];
  else total = n;
  if (!(total > 0)) return { pi: normalize(priorPi), iterations: 0, n: 0 };

  let iterations = 0;
  const acc = new Float64Array(N_SETTINGS);
  for (; iterations < maxIter; iterations++) {
    acc.fill(0);
    for (let k = 0; k < n; k++) {
      const i = indices ? indices[k] : k;
      const w = weights ? weights[i] : 1;
      if (w === 0) continue;
      const base = i * N_SETTINGS;
      let denom = 0;
      for (let s = 0; s < N_SETTINGS; s++) denom += pi[s] * lik[base + s];
      if (!(denom > 0)) continue;
      const scale = w / denom;
      for (let s = 0; s < N_SETTINGS; s++) acc[s] += scale * pi[s] * lik[base + s];
    }
    let delta = 0;
    const next = new Array(N_SETTINGS);
    for (let s = 0; s < N_SETTINGS; s++) {
      next[s] = (acc[s] + strength * priorPi[s]) / (total + strength);
      delta = Math.max(delta, Math.abs(next[s] - pi[s]));
    }
    pi = normalize(next);
    if (delta < tol) {
      iterations++;
      break;
    }
  }
  return { pi, iterations, n: total };
}

/** 対数尤度の配列から直接配分を推定するショートカット */
export function estimateMix(llRows, opts = {}) {
  if (!llRows.length) return { pi: normalize(opts.priorPi || uniformPrior()), iterations: 0, n: 0 };
  return emMix(prepareLik(llRows), llRows.length, null, opts);
}

/**
 * 高設定率の信頼区間（日付クラスタのブートストラップ）。
 * 同じ日の台どうしは店の方針で連動するので、台×日ではなく「日」を単位に復元抽出する。
 * dateIndex: 行ごとの日付番号（0..nDates-1）。戻り値: { lo, hi }（highFrom 以上の割合の 90% 区間）
 */
export function bootstrapHighShare(lik, n, dateIndex, nDates, rng, opts = {}) {
  const B = opts.iterations ?? 200;
  const highFrom = opts.highFrom ?? 4;
  if (n === 0 || nDates < 2) return { lo: null, hi: null };
  const draws = new Float64Array(nDates);
  const weights = new Float64Array(n);
  const values = [];
  for (let b = 0; b < B; b++) {
    draws.fill(0);
    for (let k = 0; k < nDates; k++) draws[Math.floor(rng() * nDates)]++;
    for (let i = 0; i < n; i++) weights[i] = draws[dateIndex[i]];
    const { pi } = emMix(lik, n, weights, { ...opts, maxIter: opts.maxIter ?? 60, tol: 1e-5 });
    values.push(probAtLeast(pi, highFrom));
  }
  values.sort((a, b) => a - b);
  const at = (q) => values[Math.min(values.length - 1, Math.max(0, Math.floor(q * values.length)))];
  return { lo: at(0.05), hi: at(0.95) };
}
