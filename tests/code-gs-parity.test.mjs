// Code.gs (Google Apps Script) と kanshi-data.js は同じスコアリングロジックを
// 双方に持つ約束になっている。このテストは Code.gs を vm サンドボックスで評価し、
// 片方だけ変更して乖離した場合に検知する。実行: node tests/code-gs-parity.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import vm from "node:vm";
import {
  SEED_KANSHI_DATA,
  normalizeRecord,
  blendExpected,
  computeLiveScore,
  getKanshiForDateKey,
  formatDateKey,
  parseDateKey
} from "../kanshi-data.js";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const codeGsSource = fs.readFileSync(path.join(here, "../google-apps-script/Code.gs"), "utf8");

// GAS グローバルのスタブ。トップレベルで触られる PropertiesService だけ実体が要る。
// 他 (SpreadsheetApp / LockService / Utilities など) は関数内でしか使われないので
// 呼ばれたら例外になるダミーで十分 (純粋関数のパリティ確認しかしないため)。
const sandbox = {
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: () => null })
  }
};
vm.createContext(sandbox);
vm.runInContext(codeGsSource, sandbox, { filename: "Code.gs" });
// const/let は vm のグローバルオブジェクトに付かないので、式として取り出す。
const GS_CONFIG = vm.runInContext("CONFIG", sandbox);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  ✗ ${name}\n      ${error.message}`);
    failed += 1;
  }
}

function suite(label, fn) {
  console.log(`\n${label}`);
  fn();
}

suite("seed データのパリティ", () => {
  test("SEED_DATA (Code.gs) と SEED_KANSHI_DATA (kanshi-data.js) が一致する", () => {
    const gsSeed = GS_CONFIG.SEED_DATA;
    const jsKeys = Object.keys(SEED_KANSHI_DATA).sort();
    const gsKeys = Object.keys(gsSeed).sort();
    assert.deepEqual(gsKeys, jsKeys, "干支のキー集合が異なる");
    for (const kanshi of jsKeys) {
      const js = SEED_KANSHI_DATA[kanshi];
      const gs = gsSeed[kanshi];
      // vm 由来の配列は別 realm でプロトタイプが異なるため、スプレッドで現 realm に写す。
      assert.deepEqual(
        { score: gs.score, ts: gs.ts, avg: gs.avg, days: gs.days, sendan: gs.sendan, tags: [...gs.tags] },
        { score: js.score, ts: js.ts, avg: js.avg, days: js.days, sendan: js.sendan, tags: [...js.tags] },
        `${kanshi} の seed が双方で異なる`
      );
    }
  });
});

suite("干支計算のパリティ", () => {
  test("getKanshiForDate_ と getKanshiForDateKey が 120 日ぶん一致する", () => {
    const base = parseDateKey("2026-04-07");
    for (let offset = -60; offset < 60; offset += 1) {
      const date = new Date(base.getTime());
      date.setUTCDate(date.getUTCDate() + offset);
      const key = formatDateKey(date);
      assert.equal(sandbox.getKanshiForDate_(key), getKanshiForDateKey(key), key);
    }
  });
});

suite("スコアリングのパリティ", () => {
  test("blendExpected が双方で一致する (代表値の総当たり)", () => {
    const avgs = [null, -20000, -3000, 0, 4000, 10000, 25000];
    const sendans = [-8000, 0, 4500, 12000, 21000];
    const dayss = [0, 1, 2, 3, 6, 12];
    for (const avg of avgs) {
      for (const sendan of sendans) {
        for (const days of dayss) {
          assert.equal(
            sandbox.blendExpected_(avg, sendan, days),
            blendExpected(avg, sendan, days),
            `avg=${avg} sendan=${sendan} days=${days}`
          );
        }
      }
    }
  });

  test("computeLiveScore が双方で一致する (合成レコードの総当たり)", () => {
    const avgs = [null, -40000, -12000, -2000, 0, 3000, 8000, 15000, 22000, 31000];
    const sendans = [-8000, 0, 4500, 9000, 14000, 21000];
    const dayss = [0, 1, 2, 3, 5, 8, 12];
    const seedScores = [-6, -2, 0, 3, 5, 7, 9];
    const tagSets = [[], ["実績×"], ["※要検証"]];
    for (const avg of avgs) {
      for (const sendan of sendans) {
        for (const days of dayss) {
          for (const seedScore of seedScores) {
            for (const tags of tagSets) {
              const input = {
                seedScore,
                seedAvg: avg === null ? null : avg - 4000,
                seedDays: Math.max(0, days - 1),
                sendan,
                avg,
                days,
                tags
              };
              const jsScore = computeLiveScore(normalizeRecord("検", input));
              const gsScore = sandbox.computeLiveScore_(sandbox.normalizeRecord_("検", input));
              assert.equal(
                gsScore,
                jsScore,
                `avg=${avg} sendan=${sendan} days=${days} seedScore=${seedScore} tags=${tags.join(",")}`
              );
            }
          }
        }
      }
    }
  });

  test("seed 全干支の素のスコアが双方で一致する", () => {
    for (const [kanshi, seed] of Object.entries(SEED_KANSHI_DATA)) {
      const jsScore = computeLiveScore(normalizeRecord(kanshi, seed));
      const gsScore = sandbox.computeLiveScore_(sandbox.normalizeRecord_(kanshi, seed));
      assert.equal(gsScore, jsScore, kanshi);
    }
  });
});

console.log(`\n結果: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
