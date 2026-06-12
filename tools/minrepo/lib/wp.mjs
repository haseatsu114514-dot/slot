// WordPress REST API で店舗の記事一覧（日付 → 記事ID/URL）を列挙する。

import { politeFetchJson } from "./http.mjs";
import { parseDateFromTitle } from "./util.mjs";

/**
 * 店舗の全レポート記事を新しい順に列挙する。
 * sinceDate（"YYYY-MM-DD"）より古いデータ日になったら打ち切る。
 * 戻り値: [{ postId, link, title, postDate, dataDate }]
 */
export async function listStorePosts(config, sinceDate, log = console.log) {
  const fields = "id,date,link,title";
  const perPage = 100;
  const results = [];
  const tryQueries = [
    (page) => `${config.baseUrl}/wp-json/wp/v2/posts?search=${encodeURIComponent(config.searchQuery)}&per_page=${perPage}&page=${page}&_fields=${fields}`,
    (page) => `${config.baseUrl}/wp-json/wp/v2/posts?tags=${config.tagId}&per_page=${perPage}&page=${page}&_fields=${fields}`,
  ];
  for (const buildUrl of tryQueries) {
    results.length = 0;
    let page = 1;
    let ok = true;
    for (;;) {
      const url = buildUrl(page);
      log(`  記事一覧 page=${page} を取得中…`);
      const r = await politeFetchJson(url, config);
      if (!r.ok || !Array.isArray(r.json)) {
        // page が範囲外になると 400 が返る（rest_post_invalid_page_number）
        if (page > 1 && r.status === 400) break;
        ok = page > 1;
        break;
      }
      if (!r.json.length) break;
      let reachedEnd = false;
      for (const post of r.json) {
        const title = post.title && post.title.rendered ? post.title.rendered : "";
        if (!title.includes(config.searchQuery)) continue;
        const dataDate = parseDateFromTitle(title, post.date);
        if (!dataDate) continue;
        if (sinceDate && dataDate < sinceDate) {
          reachedEnd = true;
          continue;
        }
        results.push({ postId: post.id, link: post.link, title, postDate: post.date, dataDate });
      }
      if (reachedEnd || r.json.length < perPage) break;
      page++;
      if (page > 60) break; // 安全弁
    }
    if (ok && results.length) return dedupe(results);
  }
  return dedupe(results);
}

function dedupe(posts) {
  const byDate = new Map();
  for (const p of posts) {
    // 同じデータ日に複数記事がある場合は新しい記事を採用
    const cur = byDate.get(p.dataDate);
    if (!cur || p.postId > cur.postId) byDate.set(p.dataDate, p);
  }
  return [...byDate.values()].sort((a, b) => (a.dataDate < b.dataDate ? 1 : -1));
}
