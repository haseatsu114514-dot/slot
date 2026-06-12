// 数値・日付・統計の小道具。依存なし・純粋関数のみ。

/** "2,871" "+1,192" "-36,348" "−151" "-" "" → number | null */
export function parseNumber(text) {
  if (text == null) return null;
  const s = String(text).replace(/[，,\s]/g, "").replace(/[−ー―‐]/g, "-").replace(/＋/g, "+");
  if (s === "" || s === "-" || s === "+") return null;
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** "100.2%" "99.8％" "-" → number | null */
export function parsePercent(text) {
  if (text == null) return null;
  const s = String(text).replace(/[%％\s]/g, "");
  return parseNumber(s);
}

/** "130/320" → {win, total} | null */
export function parseFraction(text) {
  if (text == null) return null;
  const m = String(text).match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { win: Number(m[1]), total: Number(m[2]) };
}

/**
 * 記事タイトルからデータ日付を推定する。
 * "6/11(木) タイホウ亀島店" + 投稿日時 "2026-06-12T03:14:28" → "2026-06-11"
 * "2025/9/3(水) タイホウ亀島店" のように年付きの場合はそのまま使う。
 */
export function parseDateFromTitle(title, postDateIso) {
  if (!title) return null;
  const t = String(title);
  let y = null;
  let m = null;
  let d = null;
  let match = t.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else {
    match = t.match(/(\d{1,2})\/(\d{1,2})/);
    if (!match) return null;
    m = Number(match[1]);
    d = Number(match[2]);
    const post = new Date(postDateIso);
    if (Number.isNaN(post.getTime())) return null;
    y = post.getFullYear();
    // 投稿は通常データ日の翌日未明。年跨ぎ（12月分が1月に投稿）を補正する。
    if (m - (post.getMonth() + 1) > 6) y -= 1;
    if (m - (post.getMonth() + 1) < -6) y += 1;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 旧形式タイトル "… 総差枚：-36,348 平均差枚：-151" → {totalDiff, avgDiff} */
export function parseTitleTotals(title) {
  if (!title) return null;
  const t = String(title).replace(/[−ー]/g, "-");
  const total = t.match(/総差枚[：:]\s*([+-]?[\d,]+)/);
  const avg = t.match(/平均差枚[：:]\s*([+-]?[\d,]+)/);
  if (!total && !avg) return null;
  return {
    totalDiff: total ? parseNumber(total[1]) : null,
    avgDiff: avg ? parseNumber(avg[1]) : null,
  };
}

/** "YYYY-MM-DD" → {y, m, d, weekday(0=日..6=土)} ローカルタイムに依存しない。 */
export function toDateParts(dateStr) {
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return { y, m: mo, d, weekday };
}

/** その日が「月の第n回目のその曜日」の n（1始まり） */
export function nthWeekdayOfMonth(dateStr) {
  const p = toDateParts(dateStr);
  if (!p) return null;
  return Math.ceil(p.d / 7);
}

/** 日付の「日」に数字 digit が含まれるか（例: digit=3 → 3,13,23,30,31日） */
export function dayContainsDigit(day, digit) {
  return String(day).includes(String(digit));
}

export function isLastDayOfMonth(dateStr) {
  const p = toDateParts(dateStr);
  if (!p) return false;
  return new Date(Date.UTC(p.y, p.m, 0)).getUTCDate() === p.d;
}

export function addDays(dateStr, n) {
  const p = toDateParts(dateStr);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** 決定的な乱数生成器（テスト再現用） */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(arr) {
  const xs = arr.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(arr) {
  const xs = arr.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * 並べ替え検定（two-sided, 平均差）。groupA/groupB は数値配列。
 * 戻り値: p値（0..1）。サンプル不足なら null。
 */
export function permutationPValue(groupA, groupB, iterations = 2000, rng = Math.random) {
  const a = groupA.filter((x) => typeof x === "number" && Number.isFinite(x));
  const b = groupB.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (a.length < 3 || b.length < 3) return null;
  const observed = Math.abs(mean(a) - mean(b));
  const pool = a.concat(b);
  const nA = a.length;
  let hits = 0;
  for (let it = 0; it < iterations; it++) {
    // Fisher-Yates の部分シャッフルで先頭 nA 個を擬似グループAにする
    for (let i = 0; i < nA; i++) {
      const j = i + Math.floor(rng() * (pool.length - i));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    let sumA = 0;
    for (let i = 0; i < nA; i++) sumA += pool[i];
    let sumB = 0;
    for (let i = nA; i < pool.length; i++) sumB += pool[i];
    const diff = Math.abs(sumA / nA - sumB / (pool.length - nA));
    if (diff >= observed - 1e-12) hits++;
  }
  return (hits + 1) / (iterations + 1);
}

/**
 * 符号反転検定（one-sample, two-sided）。「差の平均が 0 か」を見る。
 * deltas: 数値配列。戻り値: p値 | null。
 */
export function signFlipPValue(deltas, iterations = 2000, rng = Math.random) {
  const xs = deltas.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (xs.length < 5) return null;
  const observed = Math.abs(mean(xs));
  let hits = 0;
  for (let it = 0; it < iterations; it++) {
    let sum = 0;
    for (const x of xs) sum += rng() < 0.5 ? x : -x;
    if (Math.abs(sum / xs.length) >= observed - 1e-12) hits++;
  }
  return (hits + 1) / (iterations + 1);
}

export function formatSigned(n, digits = 0) {
  if (n == null || !Number.isFinite(n)) return "-";
  const v = n.toFixed(digits);
  return n > 0 ? `+${v}` : v;
}

export function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}
