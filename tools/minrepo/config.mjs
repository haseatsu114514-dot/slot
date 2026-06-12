// タイホウ亀島店 分析ツールの設定。自由に編集してよい。

export const CONFIG = {
  baseUrl: "https://min-repo.com",
  storeName: "タイホウ亀島店",
  // WordPress REST API の検索語（記事タイトルに含まれる店名）
  searchQuery: "タイホウ亀島",
  // 店舗タグID（min-repo の tag アーカイブ）。search が引っかからない場合のフォールバック
  tagId: 1000,

  // 取得マナー: リクエスト間隔（ミリ秒）+ ランダムジッタ。短くしすぎないこと。
  delayMs: 2000,
  jitterMs: 800,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",

  // バックフィル範囲（か月）。サンプル数確保のため1年。数字を上げて --backfill し直せば差分だけ取得する
  backfillMonths: 12,

  // 分析設定: iterations = 並べ替え検定の反復数（サンプル数）。多いほど p値が安定する（計算は遅くなる）
  analysis: { iterations: 4000 },

  // 機種別詳細（?kishu=）の取得対象。
  //   mode: "watchlist" = 下の seriesWatchlist に該当する機種のみ / "all" = 全機種 / "none" = 取得しない
  //   days: "all" = 毎日 / "event" = eventDays に該当する日 + 土日のみ（リクエスト数を節約）
  kishuDetail: { mode: "watchlist", days: "all" },

  // 検証したいイベント日仮説。type: digitContains | nthWeekday | weekday | daysOfMonth | monthDay
  eventDays: [
    { label: "3のつく日", type: "digitContains", digit: 3 }, // 3,13,23,30,31日
    { label: "4のつく日", type: "digitContains", digit: 4 }, // 4,14,24日
    { label: "7のつく日", type: "digitContains", digit: 7 }, // 7,17,27日
    { label: "第1土曜日", type: "nthWeekday", weekday: 6, nth: 1 },
    { label: "土曜日", type: "weekday", weekday: 6 },
    { label: "日曜日", type: "weekday", weekday: 0 },
    { label: "ゾロ目日(11,22)", type: "daysOfMonth", days: [11, 22] },
  ],

  // 注目機種シリーズ（pattern は機種名への正規表現、大文字小文字無視）
  seriesWatchlist: [
    { name: "北斗", pattern: "北斗" },
    { name: "東京喰種", pattern: "喰種" },
    { name: "カバネリ", pattern: "カバネリ" },
    { name: "ゴッド/ハーデス", pattern: "ゴッド|ハーデス|GOD" },
    { name: "沖ドキ", pattern: "沖ドキ" },
    { name: "ジャグラー", pattern: "ジャグラー" },
    { name: "ハナハナ", pattern: "ハナハナ" },
  ],

  // キャラ誕生日・記念日仮説。seriesPattern を入れるとそのシリーズの成績だけを見る。
  // ※日付は必ず自分で確認して直すこと（自動スキャン結果も報告書に出るのでそちらも参考に）
  anniversaries: [
    { label: "金木研 誕生日（東京喰種）", month: 12, day: 20, seriesPattern: "喰種" },
    { label: "北斗の拳の日（連載開始 9/13・要確認）", month: 9, day: 13, seriesPattern: "北斗" },
    { label: "ジャグラーの日（5/5 GO!GO!・要確認）", month: 5, day: 5, seriesPattern: "ジャグラー" },
    { label: "ハナハナの日（8/7・要確認）", month: 8, day: 7, seriesPattern: "ハナハナ" },
  ],

  // 凹み分析: 直近 window 日の合計差枚でバケツ分け（minObs 日以上データがある台のみ）
  hole: { window: 7, minObs: 4, buckets: [-8000, -3000, 3000] },
};
