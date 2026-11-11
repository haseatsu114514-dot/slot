// ジャグラー / ハナハナ（Aタイプ）の設定別スペック表。純粋データ + 機種名の照合のみ。
//
// 値は解析サイトの掲載値（メーカー公表値、または各サイトの独自調査値）。2026-11-11 に各機種 2 サイト以上で突き合わせた。
//   big / reg  : ボーナス確率の分母（1/273.1 → 273.1）。配列は設定1〜6 の順
//   combined   : ボーナス合算確率の分母（掲載値。big / reg と矛盾していないかを validateSpecs が確かめる）
//   payout     : 機械割（%）
//   bigNet / regNet : BIG / REG 1回あたりのおおよその獲得枚数。差枚だけから推定するときの「ばらつき」の計算にだけ使う
//   grape      : ぶどう（ジャグラー）/ ベル（ハナハナ）確率の分母。設定差が小さく、掲載値もサイトにより揺れるため現状は未収録（null）。
//                確かな値が分かれば設定1〜6 の配列を入れると、設定判別でぶどう/ベルの回数も使えるようになる
//
// 新機種が入ったらここに1件足す（sources に確認元を書く）。未登録の機種はレポートに警告が出る。
// 並び順に patterns を試すので、名前が紛らわしい機種（ネオアイム / アイム、マイジャグ VI / V）は先に書く。

const S = {
  pachi7: (id) => `https://pachiseven.jp/machines/${id}`,
  nana: (path) => `https://nana-press.com/kaiseki/machine/${path}`,
};

// アイムジャグラーEX（6号機）とネオアイムジャグラーEX はボーナス確率・機械割が同じ
const IM_JUGGLER = {
  big: [273.1, 269.7, 269.7, 259.0, 259.0, 255.0],
  reg: [439.8, 399.6, 331.0, 315.1, 255.0, 255.0],
  combined: [168.5, 161.0, 148.6, 142.2, 128.5, 127.5],
  payout: [97.0, 98.0, 99.5, 101.1, 103.3, 105.5],
  bigNet: 252,
  regNet: 96,
};

// マイジャグラーV と マイジャグラーVI はボーナス確率・機械割が同じ
const MY_JUGGLER = {
  big: [273.1, 270.8, 266.4, 254.0, 240.1, 229.1],
  reg: [409.6, 385.5, 336.1, 290.0, 268.6, 229.1],
  combined: [163.8, 159.1, 148.6, 135.4, 126.8, 114.6],
  payout: [97.0, 98.0, 99.9, 102.8, 105.3, 109.4],
  bigNet: 240,
  regNet: 96,
};

const juggler = (spec) => ({ series: "ジャグラー", maker: "北電子", grape: null, grapeLabel: "ぶどう", ...spec });
const hanahana = (spec) => ({ series: "ハナハナ", maker: "パイオニア", grape: null, grapeLabel: "ベル", ...spec });

export const ATYPE_SPECS = [
  juggler({
    id: "neo-im-juggler-ex",
    name: "ネオアイムジャグラーEX",
    release: "2025-09",
    patterns: ["ネオアイムジャグラー"],
    ...IM_JUGGLER,
    sources: [S.pachi7(7179), S.nana("978/30873/")],
  }),
  juggler({
    id: "im-juggler-ex",
    name: "アイムジャグラーEX",
    patterns: ["アイムジャグラー"],
    ...IM_JUGGLER,
    // ネオアイムの解説が「ボーナス確率はアイムジャグラーEXと全く一緒」としている
    sources: ["https://p-town.dmm.com/specials/4486", S.pachi7(7179)],
  }),
  juggler({
    id: "my-juggler-6",
    name: "マイジャグラーVI",
    patterns: ["マイジャグラー(VI|6)"],
    ...MY_JUGGLER,
    // 「前作マイジャグラーVと BIG・REG・合算・機械割すべて同じ」
    sources: ["https://p-town.dmm.com/specials/5444", S.pachi7(6421)],
  }),
  juggler({
    id: "my-juggler-5",
    name: "マイジャグラーV",
    patterns: ["マイジャグラー(V|5)"],
    ...MY_JUGGLER,
    sources: [S.pachi7(6421), S.nana("191/8706/")],
  }),
  juggler({
    id: "funky-juggler-2",
    name: "ファンキージャグラー2",
    release: "2021-10",
    patterns: ["ファンキージャグラー"],
    big: [266.4, 259.0, 256.0, 249.2, 240.1, 219.9],
    reg: [439.8, 407.1, 366.1, 322.8, 299.3, 262.1],
    combined: [165.9, 158.3, 150.7, 140.6, 133.2, 119.6],
    payout: [97.0, 98.5, 99.8, 102.0, 104.3, 109.0],
    bigNet: 240,
    regNet: 96,
    sources: [S.pachi7(6338), S.nana("142/8879/")],
  }),
  juggler({
    id: "happy-juggler-v3",
    name: "ハッピージャグラーVⅢ",
    release: "2022-10",
    patterns: ["ハッピージャグラー"],
    big: [273.1, 270.8, 263.2, 254.0, 239.2, 226.0],
    reg: [397.2, 362.1, 332.7, 300.6, 273.1, 256.0],
    combined: [161.8, 154.9, 146.9, 137.7, 127.5, 120.0],
    payout: [97.0, 98.1, 99.9, 102.9, 105.8, 108.4],
    bigNet: 240,
    regNet: 96,
    sources: ["https://www.p-world.co.jp/machine/database/9705", S.pachi7(6617)],
  }),
  juggler({
    id: "gogo-juggler-3",
    name: "ゴーゴージャグラー3",
    patterns: ["(ゴーゴー|GOGO)ジャグラー"],
    big: [259.0, 258.0, 257.0, 254.0, 247.3, 234.9],
    reg: [354.2, 332.7, 306.2, 268.6, 247.3, 234.9],
    combined: [149.6, 145.3, 139.7, 130.5, 123.7, 117.4],
    payout: [97.2, 98.2, 99.4, 101.6, 103.8, 106.5],
    bigNet: 240,
    regNet: 96,
    sources: [S.pachi7(6760), S.nana("565/15058/")],
  }),
  juggler({
    id: "juggler-girls-ss",
    name: "ジャグラーガールズSS",
    patterns: ["ジャグラーガールズ"],
    big: [273.1, 270.8, 260.1, 250.1, 243.6, 226.0],
    reg: [381.0, 350.5, 316.6, 281.3, 270.8, 252.1],
    combined: [159.1, 152.8, 142.8, 132.4, 128.3, 119.2],
    payout: [97.0, 97.9, 99.9, 102.1, 104.0, 107.5],
    bigNet: 240,
    regNet: 96,
    sources: [S.pachi7(6903), S.nana("719/19023/")],
  }),
  juggler({
    id: "mister-juggler",
    name: "ミスタージャグラー",
    patterns: ["ミスタージャグラー"],
    big: [268.6, 267.5, 260.1, 249.2, 240.9, 237.4],
    reg: [374.5, 354.2, 331.0, 291.3, 257.0, 237.4],
    combined: [156.4, 152.4, 145.6, 134.3, 124.4, 118.7],
    payout: [97.0, 98.0, 99.8, 102.7, 105.5, 107.3],
    bigNet: 240,
    regNet: 96,
    sources: [S.nana("779/21679/"), S.pachi7(6968)],
  }),
  juggler({
    id: "ultra-miracle-juggler",
    name: "ウルトラミラクルジャグラー",
    patterns: ["ウルトラミラクルジャグラー"],
    big: [267.5, 261.1, 256.0, 242.7, 233.2, 216.3],
    reg: [425.6, 402.1, 350.5, 322.8, 297.9, 277.7],
    combined: [164.3, 158.3, 147.9, 138.6, 130.8, 121.6],
    payout: [97.0, 98.1, 99.8, 102.1, 104.5, 108.1],
    bigNet: 240,
    regNet: 96,
    sources: [S.pachi7(7054), S.nana("838/24962/")],
  }),
  hanahana({
    id: "king-hanahana-30",
    name: "キングハナハナ-30",
    release: "2023-03",
    // ニューキングハナハナV（BT 搭載の別機種）とグレートキングハナハナは対象外
    patterns: ["^(?!.*(ニュー|グレート)).*キングハナハナ"],
    big: [292, 280, 268, 257, 244, 232],
    reg: [489, 452, 420, 390, 360, 332],
    combined: [183, 172, 163, 154, 145, 136],
    payout: [97, 99, 101, 104, 107, 110],
    bigNet: 240,
    regNet: 120,
    sources: [S.pachi7(6693), "https://p-town.dmm.com/machines/4311"],
  }),
  hanahana({
    id: "dragon-hanahana-senkou-30",
    name: "ドラゴンハナハナ〜閃光〜-30",
    // スマスロ版（スマート沖スロ ドラゴンハナハナ〜閃光〜）もボーナス確率・出玉性能は同じ
    patterns: ["ドラゴンハナハナ"],
    big: [256, 246, 235, 224, 212, 199],
    reg: [642, 585, 537, 489, 442, 399],
    combined: [183, 173, 163, 153, 143, 133],
    payout: [97, 99, 101, 104, 107, 110],
    bigNet: 240,
    regNet: 120,
    sources: [S.pachi7(6846), "https://1geki.jp/slot/s_drahana_senko30/0/"],
  }),
  hanahana({
    id: "star-hanahana-30",
    name: "スターハナハナ-30",
    release: "2025-01",
    patterns: ["スターハナハナ"],
    big: [270, 262, 252, 240, 229, 218],
    reg: [387, 354, 322, 293, 267, 242],
    combined: [159, 150, 141, 132, 123, 114],
    payout: [97, 99, 101, 104, 107, 110],
    bigNet: 240,
    regNet: 96,
    sources: [S.pachi7(7052), S.nana("861/")],
  }),
  hanahana({
    id: "hanahana-houou-tensho-30",
    name: "ハナハナホウオウ〜天翔〜-30",
    release: "2022-01",
    patterns: ["ハナハナ(ホウオウ|鳳凰).*天翔"],
    big: [297, 284, 273, 262, 249, 236],
    reg: [496, 458, 425, 397, 366, 337],
    combined: [186, 175, 166, 157, 148, 139],
    payout: [97, 99, 101, 103, 106, 109],
    bigNet: 240,
    regNet: 120,
    sources: ["https://pachiseven.jp/machines_v3/6428", "https://1geki.jp/slot/s_hanahana_houoh_tensho30/0/"],
  }),
];

/** 機種名を照合用に正規化する（全角→半角、ローマ数字記号→英字、空白と記号を除去、大文字化） */
export function normalizeModelName(name) {
  return String(name ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-‐~〜・]/g, "");
}

/** 機種名 → スペック（未登録なら null）。ATYPE_SPECS の並び順に patterns を試すので、紛らわしい機種は先に書く。 */
export function matchSpec(modelName) {
  const n = normalizeModelName(modelName);
  if (!n) return null;
  for (const spec of ATYPE_SPECS) {
    for (const pattern of spec.patterns) {
      if (new RegExp(pattern).test(n)) return spec;
    }
  }
  return null;
}

/** スペック表の整合性チェック（テストから呼ぶ）。問題を文字列の配列で返す。 */
export function validateSpecs(specs = ATYPE_SPECS) {
  const problems = [];
  const ids = new Set();
  for (const s of specs) {
    const tag = s.name || s.id;
    if (ids.has(s.id)) problems.push(`${tag}: id が重複`);
    ids.add(s.id);
    for (const key of ["big", "reg", "payout"]) {
      if (!Array.isArray(s[key]) || s[key].length !== 6 || s[key].some((v) => !(v > 0))) problems.push(`${tag}: ${key} は正の数6個`);
    }
    if (problems.length) continue;
    for (let i = 1; i < 6; i++) {
      if (s.big[i] > s.big[i - 1] + 1e-9) problems.push(`${tag}: BIG 確率が設定${i + 1}で悪化している`);
      if (s.reg[i] > s.reg[i - 1] + 1e-9) problems.push(`${tag}: REG 確率が設定${i + 1}で悪化している`);
      if (s.payout[i] < s.payout[i - 1] - 1e-9) problems.push(`${tag}: 機械割が設定${i + 1}で下がっている`);
    }
    if (s.combined) {
      for (let i = 0; i < 6; i++) {
        const calc = 1 / (1 / s.big[i] + 1 / s.reg[i]);
        const tolerance = Number.isInteger(s.combined[i]) ? 1.0 : 0.6; // 整数で掲載されている機種は丸めぶん緩く見る
        if (Math.abs(calc - s.combined[i]) > tolerance) problems.push(`${tag}: 設定${i + 1}の合成確率 1/${s.combined[i]} が BIG/REG からの計算値 1/${calc.toFixed(1)} と合わない`);
      }
    }
    if (s.grape && (s.grape.length !== 6 || s.grape.some((v) => !(v > 1)))) problems.push(`${tag}: grape は1より大きい数6個`);
    if (!(s.bigNet > 0) || !(s.regNet > 0)) problems.push(`${tag}: bigNet / regNet が必要`);
    if (!Array.isArray(s.patterns) || !s.patterns.length) problems.push(`${tag}: patterns が必要`);
    if (!Array.isArray(s.sources) || !s.sources.length) problems.push(`${tag}: sources（確認元）が必要`);
  }
  return problems;
}
