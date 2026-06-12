// 行儀のよい fetch ラッパ。間隔を空け、リトライし、失敗は素直に投げる。

let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * テキストを1件取得する。呼び出し間に delayMs+jitter の間隔を強制する。
 * opts: { delayMs, jitterMs, userAgent, retries }
 */
export async function politeFetchText(url, opts = {}) {
  const delayMs = opts.delayMs ?? 2000;
  const jitterMs = opts.jitterMs ?? 800;
  const retries = opts.retries ?? 3;
  const headers = {
    "User-Agent": opts.userAgent || "min-repo-personal-analyzer",
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en;q=0.5",
  };
  let attempt = 0;
  for (;;) {
    const wait = lastRequestAt + delayMs + Math.random() * jitterMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      const res = await fetch(url, { headers, redirect: "follow" });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return { ok: false, status: res.status, text: null };
      const text = await res.text();
      return { ok: true, status: res.status, text };
    } catch (err) {
      attempt++;
      if (attempt > retries) throw new Error(`取得失敗: ${url} (${err.message})`);
      const backoff = Math.min(60000, 2000 * 2 ** attempt);
      console.warn(`  リトライ ${attempt}/${retries} (${err.message}) ${backoff / 1000}s 待機: ${url}`);
      await sleep(backoff);
    }
  }
}

export async function politeFetchJson(url, opts = {}) {
  const r = await politeFetchText(url, opts);
  if (!r.ok || r.text == null) return { ...r, json: null };
  try {
    return { ...r, json: JSON.parse(r.text) };
  } catch {
    return { ...r, json: null };
  }
}
