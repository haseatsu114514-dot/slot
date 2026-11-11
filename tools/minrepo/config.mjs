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

  // サイトへの自動アクセスをするか。既定は false（しない）: ブラウザで自分で開いて保存したページを
  // data/inbox/ に置いて取り込む運用にしている。true にすると run.mjs が新しい日を自動で取りに行く
  autoFetch: false,

  // 自動取得（--backfill）で遡る範囲（か月）。分析期間と同じ半年
  backfillMonths: 6,

  // 分析設定:
  //   iterations   = 並べ替え検定の反復数。多いほど p値が安定する（計算は遅くなる）
  //   windowMonths = 分析に使う期間（か月）。直近この期間だけを見る。店の運用は変わるので半年を既定にしている
  analysis: { iterations: 4000, windowMonths: 6 },

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

  // ジャグラー/ハナハナ（Aタイプ）の設定推定。書いていない項目は lib/atype.mjs の ATYPE_DEFAULTS が使われる。
  // 機種のスペック表（ボーナス確率・機械割）は lib/specs.mjs。
  atype: {
    seriesPattern: "ジャグラー|ハナハナ", // 対象機種（機種名への正規表現）
    highFrom: 4, // 「高設定」とみなす下限の設定
    // 設定配分の初期値（設定1〜6）。データが貯まると店の実態に合わせて自動で推定し直される
    prior: [0.45, 0.25, 0.14, 0.08, 0.05, 0.03],
    // 凹み台の区切り（枚）: 前日の差枚 / 直近7日の合計差枚
    hole: { prev1: [-2000, -1000, 0, 1000, 2000], prev7: [-5000, -2500, 0, 2500] },
    // 告知などで分かっている入替日（"YYYY-MM-DD"）。data/manual/calendar.csv に書いてもよい
    replacementDays: [],
    replacementMinUnits: 3, // 自動検知: 新台+増台がこの台数以上あった日を入替日とみなす
    picks: 10, // 翌日の狙い台を何台出すか
    skillLossPct: 0, // 一般客の取りこぼし補正（%）。差枚だけで推定するときに機械割から引く
  },

  // 換金まわり（攻略シートの「お金の計算」に使う）。みんパチ掲載値なので、店で確かめて直すこと
  exchange: {
    coinsPer100Yen: 7.0, // 何枚で 100 円か（7.0枚交換）。等価なら 5
    lendYenPerCoin: 20, // 貸し出し 1 枚あたりの円（1000円/50枚）
    replayLimitCoins: 500, // 貯メダル再プレイの 1 日あたり上限（手数料なし）
  },

  // 営業カレンダー分析（全台・日単位）。書いていない項目は lib/calendar.mjs の CALENDAR_DEFAULTS が使われる。
  // 年金支給日・給料日・月初/月末・連休・入替前後・イベント前日/翌日は自動でタグが付く。
  // 景品示唆・おすすめ週間など店側の動きは data/manual/calendar.csv に書く（期間・対象機種の指定可）。
  calendar: {
    recoveryQuantile: 0.15, // 平均差枚が下位 15% の日を「回収日」、上位 15% の日を「放出日」と呼ぶ
    // 機種の分類（上から順に当てはめる）。スマスロは機種名の先頭が L のもの
    categories: [
      { name: "ジャグラー/ハナハナ", pattern: "ジャグラー|ハナハナ" },
      { name: "スマスロ", pattern: "^L|スマスロ|スマート" },
      { name: "その他", pattern: "" },
    ],
  },
};
