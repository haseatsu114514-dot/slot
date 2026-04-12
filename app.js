import {
  WEEKDAYS,
  resolveConfig,
  buildBaseRecords,
  buildRecordsFromPayload,
  applyEntriesToRecords,
  buildCalendarMonth,
  buildDayInfo,
  formatYen,
  getDaysInMonth,
  getOpportunityStatus,
  getMonthSequence,
  getPlayStyle,
  getRating,
  getKanshiForDateKey,
  getConfidence,
  RATING_THRESHOLDS,
  isPerfectRecord,
  buildEntriesMap,
  aggregateByStem,
  aggregateByBranch,
  aggregateByElement,
  aggregateByRatingTier,
  SEED_MONTHLY_ENTRIES
} from "./kanshi-data.js";

const CONFIG = resolveConfig(window.SLOT_APP_CONFIG || {});
const STORAGE_KEY = "slot-kanshi-local-results-v1";
const INITIAL_SELECTED_DATE_KEY = getInitialSelectedDateKey(CONFIG);

const state = {
  remoteRecords: null,
  remoteEntries: [],
  localEntries: loadLocalEntries(),
  selectedDateKey: INITIAL_SELECTED_DATE_KEY,
  sync: {
    mode: CONFIG.syncEndpoint ? "loading" : "offline",
    message: CONFIG.syncEndpoint ? "Google Sheets に接続しています..." : "シート未設定のため保留中です。"
  },
  upcomingExpanded: false
};

const refs = {
  summaryCards: document.getElementById("summaryCards"),
  upcomingList: document.getElementById("upcomingList"),
  calendarGrid: document.getElementById("calendarGrid"),
  dayHoverCard: document.getElementById("dayHoverCard"),
  selectedDayPanel: document.getElementById("selectedDayPanel"),
  recentEntries: document.getElementById("recentEntries"),
  rankingLists: document.getElementById("rankingLists"),
  stemTable: document.getElementById("stemTable"),
  branchTable: document.getElementById("branchTable"),
  elementTable: document.getElementById("elementTable"),
  ratingSummaryTable: document.getElementById("ratingSummaryTable"),
  mobileStickyDetail: document.getElementById("mobileStickyDetail"),
  syncBadgeText: document.getElementById("syncBadgeText"),
  syncNowButton: document.getElementById("syncNowButton"),
  resultForm: document.getElementById("resultForm"),
  playDateInput: document.getElementById("playDateInput"),
  profitInput: document.getElementById("profitInput"),
  memoInput: document.getElementById("memoInput"),
  formPreview: document.getElementById("formPreview"),
  formStatus: document.getElementById("formStatus"),
  retrySyncButton: document.getElementById("retrySyncButton"),
  saveButton: document.getElementById("saveButton")
};

document.addEventListener("DOMContentLoaded", () => {
  refs.playDateInput.value = state.selectedDateKey;
  setFormStatus(
    CONFIG.syncEndpoint
      ? "Google Sheets に接続しています。初回同期が終わるとここに結果が出ます。"
      : "Google Sheets の Web アプリ URL が未設定です。保存は保留されます。",
    CONFIG.syncEndpoint ? "info" : "warn"
  );
  updateFormPreview();
  render();
  wireEvents();
  hydrateRemoteDashboard();
  startAutoSync();
});

function selectDate(dateKey) {
  if (!dateKey) return;
  state.selectedDateKey = dateKey;
  refs.playDateInput.value = state.selectedDateKey;
  updateFormPreview();
  render();
  // Reset the sticky detail panel's internal scroll so that switching days
  // always starts from the top of the new day's detail, avoiding the
  // "shift" users see when the previous scroll position is preserved.
  if (refs.selectedDayPanel && refs.selectedDayPanel.parentElement) {
    const panel = refs.selectedDayPanel.parentElement;
    if (panel.scrollTo) {
      panel.scrollTo({ top: 0, behavior: "auto" });
    } else {
      panel.scrollTop = 0;
    }
  }
}

function wireEvents() {
  refs.calendarGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-date-key]");
    if (!button) return;
    event.preventDefault();
    selectDate(button.dataset.dateKey);
  });

  refs.upcomingList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-date-key]");
    if (!button) return;
    event.preventDefault();
    selectDate(button.dataset.dateKey);
  });

  refs.upcomingList.addEventListener("toggle", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches("details.upcoming-more")) return;
    state.upcomingExpanded = target.open;
  }, true);

  refs.calendarGrid.addEventListener("mouseover", (event) => {
    const button = event.target.closest("[data-date-key]");
    if (!button || !refs.calendarGrid.contains(button)) {
      hideDayHoverCard();
      return;
    }
    showDayHoverCard(button.dataset.dateKey, button);
  });

  refs.calendarGrid.addEventListener("mousemove", (event) => {
    const button = event.target.closest("[data-date-key]");
    if (!button || !refs.calendarGrid.contains(button)) {
      hideDayHoverCard();
      return;
    }
    if (refs.dayHoverCard.hidden) {
      showDayHoverCard(button.dataset.dateKey, button);
      return;
    }
    positionDayHoverCard(button);
  });

  refs.calendarGrid.addEventListener("mouseleave", () => {
    hideDayHoverCard();
  });

  refs.calendarGrid.addEventListener("focusin", (event) => {
    const button = event.target.closest("[data-date-key]");
    if (!button || !refs.calendarGrid.contains(button)) return;
    showDayHoverCard(button.dataset.dateKey, button);
  });

  refs.calendarGrid.addEventListener("focusout", (event) => {
    if (refs.calendarGrid.contains(event.relatedTarget)) return;
    hideDayHoverCard();
  });

  refs.playDateInput.addEventListener("input", () => {
    state.selectedDateKey = refs.playDateInput.value || CONFIG.anchorDate;
    updateFormPreview();
    render();
  });

  refs.resultForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveResult();
  });

  refs.retrySyncButton.addEventListener("click", async () => {
    await hydrateRemoteDashboard(true);
  });

  refs.syncNowButton?.addEventListener("click", async () => {
    await hydrateRemoteDashboard(true);
  });

  // Tap the compact mobile bar to jump to the full day-detail panel.
  refs.mobileStickyDetail?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-scroll-to='detail']");
    if (!button) return;
    event.preventDefault();
    if (refs.selectedDayPanel) {
      refs.selectedDayPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  window.addEventListener("resize", hideDayHoverCard);
  window.addEventListener("scroll", hideDayHoverCard, true);
}

function loadLocalEntries() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && entry.targetDate && entry.kanshi);
  } catch (error) {
    return [];
  }
}

function persistLocalEntries() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.localEntries));
}

function getSeedRecords() {
  return buildBaseRecords();
}

function getComputedRecords() {
  const sourceRecords = state.remoteRecords || getSeedRecords();
  return applyEntriesToRecords(sourceRecords, state.localEntries);
}

function getAllEntries() {
  const merged = [...state.remoteEntries, ...state.localEntries];
  return merged.sort((left, right) => {
    if (left.targetDate !== right.targetDate) {
      return left.targetDate < right.targetDate ? 1 : -1;
    }
    return (right.createdAt || "").localeCompare(left.createdAt || "");
  });
}

function getMonthModels(records) {
  const activeConfig = getActiveConfig();
  return getMonthSequence(CONFIG.startMonth, CONFIG.monthCount).map(({ year, month }) =>
    buildCalendarMonth(year, month, records, activeConfig)
  );
}

function getInitialSelectedDateKey(config) {
  const months = getMonthSequence(config.startMonth, config.monthCount);
  if (!months.length) return config.anchorDate;

  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];
  const firstDateKey = `${firstMonth.year}-${String(firstMonth.month).padStart(2, "0")}-01`;
  const lastDateKey = `${lastMonth.year}-${String(lastMonth.month).padStart(2, "0")}-${String(getDaysInMonth(lastMonth.year, lastMonth.month)).padStart(2, "0")}`;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (todayKey >= firstDateKey && todayKey <= lastDateKey) return todayKey;
  return config.anchorDate;
}

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getFutureDateKey(daysAhead) {
  const next = new Date();
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + daysAhead);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getUpcomingDays(months) {
  const todayKey = getTodayDateKey();
  const endKey = getFutureDateKey(14);
  return months
    .flatMap((month) => month.dayRows)
    .filter((day) => day.dateKey >= todayKey && day.dateKey <= endKey && day.record.score >= RATING_THRESHOLDS.goMin)
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

function getSummary(months) {
  const allDays = months.flatMap((month) => month.dayRows);
  return {
    total: allDays.length,
    perfect: allDays.filter((day) => isPerfectRecord(day.record)).length,
    special: allDays.filter((day) => day.record.score >= RATING_THRESHOLDS.specialMin && !isPerfectRecord(day.record)).length,
    go: allDays.filter((day) => day.record.score >= RATING_THRESHOLDS.goMin && day.record.score < RATING_THRESHOLDS.specialMin).length,
    hold: allDays.filter((day) => day.record.score >= RATING_THRESHOLDS.holdMin && day.record.score < RATING_THRESHOLDS.goMin).length,
    avoid: allDays.filter((day) => day.record.score < RATING_THRESHOLDS.holdMin).length
  };
}

function getSyncLabel() {
  if (state.sync.mode === "online") return "Google Sheets 同期中";
  if (state.sync.mode === "loading") return "Sheets 接続中";
  if (state.sync.mode === "error") return "同期失敗";
  return "同期未設定";
}

function render() {
  hideDayHoverCard();
  const records = getComputedRecords();
  const months = getMonthModels(records);
  const summary = getSummary(months);
  const upcomingDays = getUpcomingDays(months);

  refs.syncBadgeText.textContent = getSyncLabel();
  renderSummary(summary);
  renderUpcoming(upcomingDays);
  renderAggregates(records);
  renderCalendar(months);
  renderSelectedDay();
  renderMobileStickyDetail(records);
  renderRecentEntries();
  renderRankings(records);
}

function renderMobileStickyDetail(records) {
  if (!refs.mobileStickyDetail) return;
  try {
    const day = buildDayInfo(state.selectedDateKey, records, getActiveConfig());
    const weekday = WEEKDAYS[day.weekday];
    const confidence = day.confidence || getConfidence(day.record);
    refs.mobileStickyDetail.innerHTML = `
      <button class="mobile-sticky-card tier-${day.rating.tier}" type="button" data-scroll-to="detail">
        <div class="mobile-sticky-main">
          <span class="mobile-sticky-date">${day.month}/${day.day}(${weekday})</span>
          <strong class="mobile-sticky-kanshi">${day.kanshi}</strong>
          <span class="mobile-sticky-rating">${day.rating.label}</span>
        </div>
        <div class="mobile-sticky-meta">
          <span>実績 ${formatYen(day.record.avg)}</span>
          <span class="mobile-sticky-confidence ${getToneClass(confidence.tone)}">${confidence.stars} ${confidence.shortLabel}</span>
        </div>
      </button>
    `;
    refs.mobileStickyDetail.hidden = false;
  } catch (error) {
    refs.mobileStickyDetail.hidden = true;
  }
}

function normalizeTargetDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const text = String(value).trim();
  if (!text) return "";
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }
  const slashMatch = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slashMatch) {
    return `${slashMatch[1]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[3].padStart(2, "0")}`;
  }
  return text;
}

function getDedupedAggregateEntries() {
  const hasRemote = Array.isArray(state.remoteEntries) && state.remoteEntries.length > 0;
  const source = hasRemote
    ? [...state.remoteEntries, ...state.localEntries]
    : [...state.localEntries];

  // targetDate をキーに重複排除。createdAt が新しい方を優先。
  const map = new Map();
  for (const raw of source) {
    if (!raw || !raw.kanshi) continue;
    if (!Number.isFinite(Number(raw.profit))) continue;
    const normalizedDate = normalizeTargetDate(raw.targetDate);
    if (!normalizedDate) continue;
    const entry = { ...raw, targetDate: normalizedDate };
    const key = normalizedDate;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, entry);
      continue;
    }
    const incomingCreated = String(entry.createdAt || "");
    const existingCreated = String(existing.createdAt || "");
    if (incomingCreated.localeCompare(existingCreated) > 0) {
      map.set(key, entry);
    }
  }
  return { entries: Array.from(map.values()), hasRemote };
}

function getAggregateEntriesMap() {
  // シートと同期できているときは remoteEntries がシート全件を持っているので、
  // SEED_MONTHLY_ENTRIES と足すと二重カウントになる。
  // remote が来ている場合は remote + local (未同期ぶん) のみを使い、
  // それ以外は SEED + local をベースにする。
  const { entries, hasRemote } = getDedupedAggregateEntries();
  if (hasRemote) {
    return buildEntriesMap({}, entries);
  }
  return buildEntriesMap(SEED_MONTHLY_ENTRIES, entries);
}

// 過去成績から「カレンダー月ごとの得意/苦手」を算出する。
// 各月の平均収支を全体平均と比較し、差分に応じて -0.6 〜 +0.6 の補正を付ける。
// データが少ない月 (2日未満) はニュートラル扱い。
function computeMonthlyPerformanceMap() {
  const { entries } = getDedupedAggregateEntries();
  if (!entries.length) return {};

  const byMonth = new Map();
  const allProfits = [];
  for (const entry of entries) {
    const profit = Number(entry.profit);
    if (!Number.isFinite(profit)) continue;
    const date = entry.targetDate;
    if (!date || date.length < 7) continue;
    const month = parseInt(date.slice(5, 7), 10);
    if (!month) continue;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(profit);
    allProfits.push(profit);
  }
  if (allProfits.length === 0) return {};

  const overallAvg = allProfits.reduce((acc, v) => acc + v, 0) / allProfits.length;
  // 差分のスケール係数。±30000 のズレで ±0.5 ほど動く感覚。
  const SCALE = 60000;

  const map = {};
  for (const [month, values] of byMonth.entries()) {
    if (values.length < 2) continue; // 2日未満はサンプル不足
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const delta = avg - overallAvg;
    const rawAdjustment = delta / SCALE;
    const adjustment = Math.max(-0.6, Math.min(0.6, Math.round(rawAdjustment * 10) / 10));
    map[month] = {
      adjustment,
      sample: values.length,
      avg: Math.round(avg)
    };
  }
  return map;
}

function getActiveConfig() {
  // CONFIG をベースに、過去成績ベースの月補正マップを注入して返す。
  return { ...CONFIG, monthlyPerformance: computeMonthlyPerformanceMap() };
}

function renderAggregates(records) {
  const entriesMap = getAggregateEntriesMap();
  const stemRows = aggregateByStem(entriesMap);
  const branchRows = aggregateByBranch(entriesMap);
  const elementRows = aggregateByElement(stemRows, branchRows);
  const ratingRows = aggregateByRatingTier(records);

  if (refs.stemTable) {
    refs.stemTable.innerHTML = buildStemBranchTable(stemRows, "天干");
  }
  if (refs.branchTable) {
    refs.branchTable.innerHTML = buildStemBranchTable(branchRows, "地支");
  }
  if (refs.elementTable) {
    refs.elementTable.innerHTML = buildElementTable(elementRows);
  }
  if (refs.ratingSummaryTable) {
    refs.ratingSummaryTable.innerHTML = buildRatingSummaryTable(ratingRows);
  }
}

function buildStemBranchTable(rows, headerLabel) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.wins += row.wins;
      acc.losses += row.losses;
      acc.total += row.total;
      acc.days += row.days;
      return acc;
    },
    { wins: 0, losses: 0, total: 0, days: 0 }
  );
  const totalDaily = totals.days > 0 ? Math.round(totals.total / totals.days) : 0;
  const totalHourly = totals.days > 0 ? Math.round(totals.total / totals.days / 3.5) : 0;
  const totalWinRate = totals.days > 0 ? (totals.wins / totals.days) * 100 : null;
  const totalLossRate = totals.days > 0 ? (totals.losses / totals.days) * 100 : null;

  const formatRate = (rate) => (rate === null ? "—" : `${rate.toFixed(0)}%`);
  const rateClass = (rate, positiveWhenHigh) => {
    if (rate === null) return "";
    if (rate >= 55) return positiveWhenHigh ? "is-plus" : "is-minus";
    if (rate <= 45) return positiveWhenHigh ? "is-minus" : "is-plus";
    return "";
  };

  const header = `
    <thead>
      <tr>
        <th class="col-label">${headerLabel}</th>
        <th>勝率</th>
        <th>負率</th>
        <th>総収支</th>
        <th>日給</th>
        <th>時給<small>(3.5h)</small></th>
        <th>日数</th>
      </tr>
    </thead>
  `;

  const body = rows
    .map((row) => {
      const winRate = row.days > 0 ? (row.wins / row.days) * 100 : null;
      const lossRate = row.days > 0 ? (row.losses / row.days) * 100 : null;
      const totalClass = row.total > 0 ? "is-plus" : row.total < 0 ? "is-minus" : "";
      const dailyClass = row.daily > 0 ? "is-plus" : row.daily < 0 ? "is-minus" : "";
      const hourlyClass = row.hourly > 0 ? "is-plus" : row.hourly < 0 ? "is-minus" : "";
      return `
        <tr>
          <th class="col-label">
            <span class="agg-key">${row.key}</span>
            ${row.label ? `<small>(${row.label})</small>` : ""}
          </th>
          <td class="${rateClass(winRate, true)}">${formatRate(winRate)}</td>
          <td class="${rateClass(lossRate, false)}">${formatRate(lossRate)}</td>
          <td class="${totalClass}">${formatYen(row.total)}</td>
          <td class="${dailyClass}">${formatYen(row.daily)}</td>
          <td class="${hourlyClass}">${formatYen(row.hourly)}</td>
          <td>${row.days}</td>
        </tr>
      `;
    })
    .join("");

  const footClass = totals.total > 0 ? "is-plus" : totals.total < 0 ? "is-minus" : "";
  const foot = `
    <tfoot>
      <tr>
        <th class="col-label">全体</th>
        <td class="${rateClass(totalWinRate, true)}">${formatRate(totalWinRate)}</td>
        <td class="${rateClass(totalLossRate, false)}">${formatRate(totalLossRate)}</td>
        <td class="${footClass}">${formatYen(totals.total)}</td>
        <td class="${totalDaily > 0 ? "is-plus" : totalDaily < 0 ? "is-minus" : ""}">${formatYen(totalDaily)}</td>
        <td class="${totalHourly > 0 ? "is-plus" : totalHourly < 0 ? "is-minus" : ""}">${formatYen(totalHourly)}</td>
        <td>${totals.days}</td>
      </tr>
    </tfoot>
  `;

  return header + "<tbody>" + body + "</tbody>" + foot;
}

function buildElementTable(rows) {
  const header = `
    <thead>
      <tr>
        <th class="col-label">五行</th>
        <th>天</th>
        <th>地</th>
        <th>評</th>
      </tr>
    </thead>
  `;
  const body = rows
    .map((row) => {
      const toneClass = (value) => (value > 0 ? "is-plus" : value < 0 ? "is-minus" : "");
      return `
        <tr class="element-row element-${row.element}">
          <th class="col-label">${row.element}</th>
          <td class="${toneClass(row.heaven)}">${formatSigned(row.heaven)}</td>
          <td class="${toneClass(row.earth)}">${formatSigned(row.earth)}</td>
          <td class="${toneClass(row.total)}">${formatSigned(row.total)}</td>
        </tr>
      `;
    })
    .join("");
  return header + "<tbody>" + body + "</tbody>";
}

function buildRatingSummaryTable(rows) {
  const header = `
    <thead>
      <tr>
        <th class="col-label">評価帯</th>
        <th>該当数</th>
        <th>実績平均</th>
        <th>占断平均</th>
        <th>最終予想</th>
      </tr>
    </thead>
  `;
  const body = rows
    .map((row) => {
      const tone = (value) => (value === null ? "" : value > 0 ? "is-plus" : value < 0 ? "is-minus" : "");
      return `
        <tr class="tier-${row.key}">
          <th class="col-label">${row.label}</th>
          <td>${row.count}</td>
          <td class="${tone(row.avgActual)}">${row.avgActual === null ? "—" : formatYen(row.avgActual)}</td>
          <td class="${tone(row.avgSendan)}">${row.avgSendan === null ? "—" : formatYen(row.avgSendan)}</td>
          <td class="${tone(row.avgExpected)}">${row.avgExpected === null ? "—" : formatYen(row.avgExpected)}</td>
        </tr>
      `;
    })
    .join("");
  return header + "<tbody>" + body + "</tbody>";
}

function formatSigned(value) {
  if (!Number.isFinite(Number(value))) return "0";
  const n = Number(value);
  if (n > 0) return `+${n}`;
  return String(n);
}

function renderSummary(summary) {
  refs.summaryCards.innerHTML = [
    buildSummaryCard("カレンダー日数", summary.total, "表示中の3か月ぶん", "is-neutral"),
    buildSummaryCard("★ 完璧", summary.perfect, "スコア9", "is-perfect"),
    buildSummaryCard("◎ 絶好", summary.special, "スコア7-8", "is-special"),
    buildSummaryCard("○ 行くべき", summary.go, "スコア5-6", "is-go"),
    buildSummaryCard("△ どちらでも", summary.hold, "スコア3-4", "is-hold"),
    buildSummaryCard("× 見送り", summary.avoid, "スコア2以下", "is-avoid")
  ].join("");
}

function buildSummaryCard(label, value, note, className) {
  return `
    <div class="summary-card ${className}">
      <span class="summary-label">${label}</span>
      <strong class="summary-value">${value}</strong>
      <span class="summary-note">${note}</span>
    </div>
  `;
}

function renderUpcoming(upcomingDays) {
  if (!upcomingDays.length) {
    refs.upcomingList.innerHTML = `<p class="empty-text">これから2週間以内の○以上の日はありません。</p>`;
    return;
  }

  const renderItem = (day) => {
    const weekday = WEEKDAYS[day.weekday];
    return `
      <button class="upcoming-item tier-${day.rating.tier}" type="button" data-date-key="${day.dateKey}">
        <span class="upcoming-date">${day.month}/${day.day}(${weekday})</span>
        <strong class="upcoming-kanshi">${day.kanshi}</strong>
        <span class="upcoming-copy">${day.rating.label} ${day.rating.text} / ${formatScoreValue(day.record.score)}点</span>
        <span class="upcoming-meta">
          ${day.record.ts || "通変星未設定"} / ${buildMonthMeta(day.monthContext)} / 実績平均 ${formatYen(day.record.avg)} (${day.record.days}日平均)
        </span>
        <span class="mini-tag-row">
          ${day.specialDateContext.statuses.length ? buildSpecialDateChip(day.specialDateContext) : ""}
          ${day.opportunity.active ? buildOpportunityChip(day.opportunity) : ""}
          ${buildPlayStyleChip(day.playStyle)}
          ${buildWeekdayChip(day.weekday, day.weekdayContext)}
        </span>
      </button>
    `;
  };

  const [first, ...rest] = upcomingDays;
  const primaryHtml = renderItem(first);

  if (!rest.length) {
    refs.upcomingList.innerHTML = primaryHtml;
    return;
  }

  const openAttr = state.upcomingExpanded ? " open" : "";
  refs.upcomingList.innerHTML = `
    ${primaryHtml}
    <details class="upcoming-more"${openAttr}>
      <summary class="upcoming-more-summary">
        <span class="upcoming-more-open">あと${rest.length}日を見る</span>
        <span class="upcoming-more-close">閉じる</span>
        <span class="upcoming-more-arrow" aria-hidden="true"></span>
      </summary>
      <div class="upcoming-more-list">
        ${rest.map(renderItem).join("")}
      </div>
    </details>
  `;
}

function renderCalendar(months) {
  refs.calendarGrid.innerHTML = months
    .map((month) => {
      const targetDays = month.dayRows.filter((day) => day.record.score >= RATING_THRESHOLDS.goMin);
      const expectedTotal = Math.round(
        targetDays.reduce((sum, day) => sum + day.expectedValue, 0)
      );
      const statChips = [
        buildMonthStat("★", month.stats.perfect, "perfect"),
        buildMonthStat("◎", month.stats.special, "special"),
        buildMonthStat("○", month.stats.go, "go"),
        buildMonthStat("△", month.stats.hold, "hold"),
        buildMonthStat("×", month.stats.avoid, "avoid")
      ].join("");

      const dayCells = month.cells
        .map((day, index) => {
          if (!day) {
            // First-row leading spacers before the first day-of-month.
            // Use an explicit grid-column-start on the first real day card instead
            // of rendering empty nodes so no column can collapse or drift.
            return "";
          }
          const selectedClass = day.dateKey === state.selectedDateKey ? "is-selected" : "";
          const scoreSummary = escapeHtml(`スコア ${formatCompactScore(day.record.score)} / 実績平均 ${formatYen(day.record.avg)} / ${day.record.days}日平均 / ${day.playStyle.label}`);
          // Day 1 is explicitly placed at its weekday column (1-indexed grid column).
          // All subsequent days flow in order.
          const columnStart = day.day === 1 ? ` style="grid-column-start: ${index + 1};"` : "";
          return `
            <button
              class="day-card tier-${day.rating.tier} ${selectedClass}"
              type="button"
              data-date-key="${day.dateKey}"
              aria-label="${scoreSummary}"
              title="${scoreSummary}"${columnStart}
            >
              <div class="day-card-top">
                <span class="day-score-badge">${formatCompactScore(day.record.score)}</span>
                <div class="day-top-right">
                  ${day.specialDateContext.statuses.length ? `<span class="day-marker is-caution">!</span>` : ""}
                  <span class="day-number">${day.day}</span>
                </div>
              </div>
              <strong class="day-rating">${day.rating.label}</strong>
              <span class="day-kanshi">${day.kanshi}</span>
              <span class="day-ts">${day.record.ts || "通変星なし"}</span>
              <span class="day-style ${getToneClass(day.playStyle.tone)}">${day.playStyle.shortLabel}</span>
              ${day.opportunity.active ? `<span class="day-opportunity ${getToneClass(day.opportunity.tone)}">${day.opportunity.label}</span>` : ""}
            </button>
          `;
        })
        .join("");
      return `
        <details class="month-accordion" open>
          <summary class="month-accordion-summary">
            <div class="month-accordion-title">
              <p class="month-kicker">${month.year}</p>
              <h3>${month.label}</h3>
              <p class="month-pillar">月干支: ${month.monthPillarSummary}</p>
            </div>
            <div class="month-accordion-meta">
              <div class="month-stats">${statChips}</div>
              <span class="month-accordion-arrow" aria-hidden="true"></span>
            </div>
          </summary>
          <article class="month-card">
            <p class="month-expectation">
              ★・◎・○だけ全部打つ想定: ${targetDays.length}日 / 期待収支 ${formatYen(expectedTotal)}
            </p>
            <div class="weekday-row">
              ${WEEKDAYS.map((weekday, index) => `<span class="weekday weekday-${index}">${weekday}</span>`).join("")}
            </div>
            <div class="month-day-grid">
              ${dayCells}
            </div>
          </article>
        </details>
      `;
    })
    .join("");
}

function buildMonthStat(label, value, tier) {
  return `<span class="month-stat tier-${tier}">${label} ${value}</span>`;
}

function renderSelectedDay() {
  if (!refs.selectedDayPanel) return;
  try {
    const records = getComputedRecords();
    const day = buildDayInfo(state.selectedDateKey, records, getActiveConfig());
    const weekday = WEEKDAYS[day.weekday];
    const liveDelta = day.record.baseScore - day.record.seedScore;
    const liveDeltaLabel = liveDelta === 0 ? "入力反映なし" : liveDelta > 0 ? `入力反映で +${liveDelta}` : `入力反映で ${liveDelta}`;
    const monthAdjustmentLabel = day.monthContext.adjustment === 0
      ? "月補正なし"
      : `月補正 ${getScoreText(day.monthContext.adjustment)}`;
    const specialDateAdjustmentLabel = day.specialDateContext.adjustment === 0
      ? "日付補正なし"
      : `日付補正 ${getScoreText(day.specialDateContext.adjustment)}`;
    const playStyleAdjustmentLabel = day.playStyle.adjustment === 0
      ? "質感補正なし"
      : `質感補正 ${getScoreText(day.playStyle.adjustment)}`;
    const monthTags = day.monthContext.statuses.length
      ? day.monthContext.statuses.map((status) => `<span class="tag ${getMonthStatusClass(status)}">月${status} ${getScoreText(MONTH_STATUS_SCORE[status] ?? 0)}</span>`).join("")
      : `<span class="tag">月補正なし</span>`;
    const recordTags = (day.record.tags || []).length
      ? day.record.tags.map((tag) => `<span class="tag ${getTagClass(tag)}">${tag}</span>`).join("")
      : "";
    const qualityChip = buildPlayStyleChip(day.playStyle, "質感 ");
    const weekdayChip = buildWeekdayChip(day.weekday, day.weekdayContext);
    const specialDateChip = day.specialDateContext.statuses.length ? buildSpecialDateChip(day.specialDateContext) : "";
    const opportunityChip = day.opportunity.active ? buildOpportunityChip(day.opportunity) : "";

    const confidence = day.confidence || getConfidence(day.record);
    const confidenceToneClass = getToneClass(confidence.tone);

    refs.selectedDayPanel.innerHTML = `
      <div class="selected-top tier-${day.rating.tier}">
        <div>
          <p class="selected-date">${day.year}/${day.month}/${day.day} (${weekday})</p>
          <h3>${day.kanshi}</h3>
        </div>
        <div class="selected-badge">
          <span>${day.rating.label}</span>
          <strong>${day.rating.text}</strong>
        </div>
      </div>

      <div class="confidence-panel ${confidenceToneClass}">
        <div class="confidence-head">
          <span class="confidence-kicker">信頼度</span>
          <strong class="confidence-level">${confidence.stars}</strong>
          <span class="confidence-label">${confidence.label}</span>
        </div>
        <p class="confidence-note">${confidence.note}</p>
        <p class="confidence-sample">サンプル数: <strong>${confidence.sample}日</strong></p>
      </div>

      <div class="selected-stats">
        <div class="selected-stat">
          <span>現在スコア</span>
          <strong>${formatScoreValue(day.record.score)}</strong>
          <small>日基準 ${day.record.baseScore} / ${monthAdjustmentLabel} / ${specialDateAdjustmentLabel} / ${playStyleAdjustmentLabel}</small>
        </div>
        <div class="selected-stat">
          <span>通変星</span>
          <strong>${day.record.ts || "-"}</strong>
          <small>${liveDeltaLabel}</small>
        </div>
        <div class="selected-stat">
          <span>月干支</span>
          <strong>${day.monthContext.kanshi || "-"}</strong>
          <small>${day.monthContext.seasonal?.label || day.monthContext.statuses.join(" / ") || "補正なし"} ${getScoreText(day.monthContext.adjustment)}</small>
        </div>
        <div class="selected-stat">
          <span>質感ステータス</span>
          <strong>${day.playStyle.label}</strong>
          <small>${day.playStyle.note}</small>
        </div>
        <div class="selected-stat">
          <span>曜日補助</span>
          <strong>${weekday}曜 ${getScoreText(day.weekdayContext.adjustment)}</strong>
          <small>${day.weekdayContext.label}</small>
        </div>
        <div class="selected-stat">
          <span>実績平均</span>
          <strong>${formatYen(day.record.avg)}</strong>
          <small>${day.record.days}日平均 / 初期値 ${formatYen(day.record.seedAvg)}</small>
        </div>
        <div class="selected-stat">
          <span>占断予想</span>
          <strong>${formatYen(day.record.sendan)}</strong>
          <small>元シート由来の参考値</small>
        </div>
      </div>

      <div class="tag-row">${specialDateChip}${opportunityChip}${qualityChip}${weekdayChip}${monthTags}${recordTags}</div>
    `;
  } catch (error) {
    refs.selectedDayPanel.innerHTML = `
      <div class="selected-fallback">
        <strong>日付詳細を読み込めませんでした。</strong>
        <span>もう一度日付をタップするか、ページを再読み込みしてください。</span>
      </div>
    `;
  }
}

function renderRecentEntries() {
  if (!refs.recentEntries) return;
  const entries = getAllEntries();
  const records = getComputedRecords();

  if (!entries.length) {
    refs.recentEntries.innerHTML = `<p class="empty-text">まだ成績入力はありません。</p>`;
    return;
  }

  refs.recentEntries.innerHTML = entries
    .slice(0, 8)
    .map((entry) => {
      const info = buildDayInfo(entry.targetDate, records, getActiveConfig());
      const rating = info.rating;
      return `
        <article class="recent-entry">
          <div class="recent-entry-main">
            <div class="recent-entry-date">${entry.targetDate}</div>
            <strong>${entry.kanshi}</strong>
            <span class="recent-entry-profit ${Number(entry.profit) >= 0 ? "is-plus" : "is-minus"}">${formatYen(entry.profit)}</span>
          </div>
          <div class="recent-entry-sub">
            <span>1日の収支記録</span>
            <span class="recent-entry-rating tier-${rating.tier}">${rating.label} ${rating.text}</span>
          </div>
          <div class="mini-tag-row">
            ${info.specialDateContext.statuses.length ? buildSpecialDateChip(info.specialDateContext) : ""}
            ${info.opportunity.active ? buildOpportunityChip(info.opportunity) : ""}
            ${buildPlayStyleChip(info.playStyle)}
            ${buildWeekdayChip(info.weekday, info.weekdayContext)}
          </div>
          ${entry.memo ? `<p class="recent-entry-note">${escapeHtml(entry.memo)}</p>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderRankings(records) {
  if (!refs.rankingLists) return;
  const ranked = Object.values(records).sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    return (right.avg || -Infinity) - (left.avg || -Infinity);
  });

  const top = ranked.slice(0, 8);
  const bottom = [...ranked].reverse().slice(0, 8);

  refs.rankingLists.innerHTML = `
    <div class="ranking-block">
      <h3>上位 8干支</h3>
      ${top.map((item) => buildRankingItem(item)).join("")}
    </div>
    <div class="ranking-block">
      <h3>見送り寄り 8干支</h3>
      ${bottom.map((item) => buildRankingItem(item)).join("")}
    </div>
  `;
}

function buildRankingItem(item) {
  const rating = getRating(item.score, item);
  const playStyle = getPlayStyle(item);
  const opportunity = getOpportunityStatus(item);
  return `
    <article class="ranking-item tier-${rating.tier}">
      <div>
        <strong>${item.name}</strong>
        <span>${item.ts || "-"}</span>
      </div>
      <div class="ranking-metrics">
        <span>${rating.label} ${item.score}</span>
        <span>${formatYen(item.avg)}</span>
      </div>
      <div class="mini-tag-row">
        ${opportunity.active ? buildOpportunityChip(opportunity) : ""}
        ${buildPlayStyleChip(playStyle)}
      </div>
    </article>
  `;
}

function updateFormPreview() {
  const dateKey = refs.playDateInput.value || CONFIG.anchorDate;
  const records = getComputedRecords();
  const info = buildDayInfo(dateKey, records, getActiveConfig());

  refs.formPreview.innerHTML = `
    <span class="preview-pill tier-${info.rating.tier}">${dateKey}</span>
    <strong>${info.kanshi}</strong>
    <span>${info.rating.label} ${info.rating.text}</span>
    <span>現在スコア ${formatScoreValue(info.record.score)}</span>
    <span>${formatAdjustmentLabel(info.playStyle.label, info.playStyle.adjustment)}</span>
    <span>${info.weekdayContext.shortLabel} ${getScoreText(info.weekdayContext.adjustment)}</span>
    <span>${buildMonthMeta(info.monthContext)}</span>
  `;
}

function getTagClass(tag) {
  if (tag.includes("◎") || tag === "安定型") return "is-good";
  if (tag.includes("×") || tag.includes("※") || tag === "冲") return "is-alert";
  if (tag.includes("空亡")) return "is-void";
  return "";
}

const MONTH_STATUS_SCORE = Object.freeze({
  "半空": -0.5,
  "真空": -2,
  "冲": -1
});

function buildMonthMeta(monthContext) {
  if (!monthContext?.kanshi) return "月干支未設定";
  if (!monthContext.statuses.length) return `月干支 ${monthContext.kanshi} / 補正なし`;
  return `月干支 ${monthContext.kanshi} / ${monthContext.statuses.join("・")} ${getScoreText(monthContext.adjustment)}`;
}

function getMonthStatusClass(status) {
  if (status === "真空" || status === "半空") return "is-void";
  if (status === "冲") return "is-alert";
  return "";
}

function buildSpecialDateChip(specialDateContext) {
  return `<span class="tag ${getToneClass(specialDateContext.tone)}">${specialDateContext.label} ${getScoreText(specialDateContext.adjustment)}</span>`;
}

function formatAdjustmentLabel(label, adjustment) {
  return adjustment === 0 ? label : `${label} ${getScoreText(adjustment)}`;
}

function buildPlayStyleChip(playStyle, prefix = "") {
  return `<span class="tag ${getToneClass(playStyle.tone)}">${formatAdjustmentLabel(`${prefix}${playStyle.label}`, playStyle.adjustment)}</span>`;
}

function getToneClass(tone) {
  if (tone === "good") return "is-good";
  if (tone === "stable") return "is-stable";
  if (tone === "rough") return "is-rough";
  if (tone === "caution") return "is-caution";
  if (tone === "opportunity") return "is-opportunity";
  return "is-neutral";
}

function buildStatusChip(label, tone) {
  return `<span class="tag ${getToneClass(tone)}">${label}</span>`;
}

function buildOpportunityChip(opportunity) {
  return `<span class="tag ${getToneClass(opportunity.tone)}">${opportunity.label}</span>`;
}

function buildWeekdayChip(weekday, weekdayContext) {
  return `<span class="tag ${getToneClass(weekdayContext.tone)}">${weekdayContext.shortLabel} ${getScoreText(weekdayContext.adjustment)}</span>`;
}

function formatScoreValue(score) {
  if (!Number.isFinite(Number(score))) return "0";
  const numericScore = Number(score);
  return Number.isInteger(numericScore) ? String(numericScore) : numericScore.toFixed(1);
}

function formatCompactScore(score) {
  return `○${formatScoreValue(score)}`;
}

function getScoreText(score) {
  if (!Number.isFinite(Number(score))) return "0";
  const numericScore = Number(score);
  const text = Number.isInteger(numericScore) ? String(numericScore) : numericScore.toFixed(1);
  if (numericScore > 0) return `+${text}`;
  if (numericScore < 0) return text;
  return "0";
}

async function hydrateRemoteDashboard(forceMessage = false) {
  if (!CONFIG.syncEndpoint) {
    if (forceMessage) {
      setFormStatus("Google Sheets の Web アプリ URL が未設定です。保存は保留されます。", "info");
    }
    return;
  }

  state.sync = {
    mode: "loading",
    message: "Google Sheets に接続しています..."
  };
  refs.retrySyncButton.disabled = true;
  if (refs.syncNowButton) refs.syncNowButton.disabled = true;
  render();

  try {
    const url = new URL(CONFIG.syncEndpoint);
    url.searchParams.set("action", "dashboard");
    if (CONFIG.syncSecret) url.searchParams.set("secret", CONFIG.syncSecret);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "dashboard fetch failed");
    }

    state.remoteRecords = buildRecordsFromPayload(payload.records || {});
    state.remoteEntries = Array.isArray(payload.entries) ? payload.entries : [];
    state.sync = {
      mode: "online",
      message: "Google Sheets と同期しています。"
    };
    setFormStatus("Google Sheets と同期しました。シート側の更新は自動同期か再読み込みで反映されます。", "success");
  } catch (error) {
    state.sync = {
      mode: "error",
      message: "Google Sheets の同期に失敗しました。"
    };
    setFormStatus("Sheets 同期に失敗しました。接続を再試行してください。", "warn");
  } finally {
    refs.retrySyncButton.disabled = false;
    if (refs.syncNowButton) refs.syncNowButton.disabled = false;
    render();
  }
}

function startAutoSync() {
  if (!CONFIG.syncEndpoint) return;

  window.setInterval(() => {
    hydrateRemoteDashboard();
  }, CONFIG.syncIntervalMs);

  window.addEventListener("focus", () => {
    hydrateRemoteDashboard();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      hydrateRemoteDashboard();
    }
  });
}

async function saveResult() {
  const formData = new FormData(refs.resultForm);
  const targetDate = String(formData.get("playDate") || "").trim();
  const profit = Number(formData.get("profit"));

  if (!targetDate) {
    setFormStatus("日付を入力してください。", "warn");
    return;
  }
  if (!Number.isFinite(profit)) {
    setFormStatus("収支は数字で入力してください。", "warn");
    return;
  }

  const entry = {
    id: createEntryId(),
    createdAt: new Date().toISOString(),
    targetDate,
    kanshi: getKanshiForDateKey(targetDate, CONFIG),
    profit,
    memo: String(formData.get("memo") || "").trim()
  };

  refs.saveButton.disabled = true;
  state.selectedDateKey = targetDate;

  try {
    if (CONFIG.syncEndpoint) {
      const synced = await postEntryToSheets(entry);
      if (synced) {
        refs.resultForm.reset();
        refs.playDateInput.value = targetDate;
        updateFormPreview();
        setFormStatus("Google Sheets に保存し、カレンダーにも反映しました。", "success");
        render();
        return;
      }
    }

    addLocalEntry(entry);
    refs.resultForm.reset();
    refs.playDateInput.value = targetDate;
    updateFormPreview();
    setFormStatus("保存しました。同期 URL を設定するとシートにも反映されます。", "info");
    render();
  } catch (error) {
    addLocalEntry(entry);
    refs.resultForm.reset();
    refs.playDateInput.value = targetDate;
    updateFormPreview();
    setFormStatus("通信に失敗したため一時的に保存しました。後で同期を再試行できます。", "warn");
    render();
  } finally {
    refs.saveButton.disabled = false;
  }
}

function addLocalEntry(entry) {
  const recordsBefore = getComputedRecords();
  const nextRecords = applyEntriesToRecords(recordsBefore, [entry]);
  entry.liveScore = buildDayInfo(entry.targetDate, nextRecords, getActiveConfig()).record.score;
  state.localEntries.unshift(entry);
  persistLocalEntries();
}

async function postEntryToSheets(entry) {
  const response = await fetch(CONFIG.syncEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      action: "addResult",
      secret: CONFIG.syncSecret || "",
      entry
    })
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "save failed");
  }

  state.remoteRecords = buildRecordsFromPayload(payload.records || {});
  state.remoteEntries = Array.isArray(payload.entries) ? payload.entries : [];
  state.sync = {
    mode: "online",
    message: "Google Sheets と同期しています。"
  };
  return true;
}

function setFormStatus(message, tone = "info") {
  refs.formStatus.textContent = message;
  refs.formStatus.dataset.tone = tone;
}

function createEntryId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function buildScoreBreakdown(day) {
  return [
    `日基準 ${formatScoreValue(day.record.baseScore)}`,
    `月 ${getScoreText(day.monthContext.adjustment)}`,
    `日付 ${getScoreText(day.specialDateContext.adjustment)}`,
    `質感 ${getScoreText(day.playStyle.adjustment)}`
  ].join(" / ");
}

function buildHoverCardMarkup(day) {
  const weekday = WEEKDAYS[day.weekday];
  const chips = [
    day.specialDateContext.statuses.length ? buildSpecialDateChip(day.specialDateContext) : "",
    day.opportunity.active ? buildOpportunityChip(day.opportunity) : "",
    buildPlayStyleChip(day.playStyle),
    buildWeekdayChip(day.weekday, day.weekdayContext),
    ...day.monthContext.statuses.map((status) => `<span class="tag ${getMonthStatusClass(status)}">月${status} ${getScoreText(MONTH_STATUS_SCORE[status] ?? 0)}</span>`)
  ]
    .filter(Boolean)
    .join("");

  return `
    <div class="hover-card-top">
      <div>
        <p class="hover-card-date">${day.year}/${day.month}/${day.day} (${weekday})</p>
        <h3>${day.kanshi}</h3>
      </div>
      <div class="hover-card-badge tier-${day.rating.tier}">
        <span>${day.rating.label}</span>
        <strong>${day.rating.text}</strong>
      </div>
    </div>
    <div class="hover-card-score">
      <strong>${formatCompactScore(day.record.score)}</strong>
      <span>${day.record.ts || "通変星なし"}</span>
    </div>
    <p class="hover-card-copy">${day.playStyle.note}</p>
    <p class="hover-card-breakdown">${buildScoreBreakdown(day)}</p>
    <div class="hover-card-metrics">
      <div>
        <span>実績平均</span>
        <strong>${formatYen(day.record.avg)}</strong>
        <small>${day.record.days}日平均</small>
      </div>
      <div>
        <span>占断予想</span>
        <strong>${formatYen(day.record.sendan)}</strong>
        <small>元シート参考</small>
      </div>
      <div>
        <span>月干支</span>
        <strong>${day.monthContext.kanshi || "未設定"}</strong>
      </div>
      <div>
        <span>曜日補助</span>
        <strong>${day.weekdayContext.shortLabel} ${getScoreText(day.weekdayContext.adjustment)}</strong>
      </div>
    </div>
    <div class="hover-card-tags">${chips}</div>
  `;
}

function positionDayHoverCard(anchor) {
  const card = refs.dayHoverCard;
  if (!card || card.hidden) return;

  const anchorRect = anchor.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const gutter = 14;
  let left = anchorRect.right + gutter;
  let top = anchorRect.top;

  if (left + cardRect.width > window.innerWidth - 12) {
    left = anchorRect.left - cardRect.width - gutter;
  }
  if (left < 12) {
    left = Math.max(12, Math.min(anchorRect.left, window.innerWidth - cardRect.width - 12));
  }
  if (top + cardRect.height > window.innerHeight - 12) {
    top = window.innerHeight - cardRect.height - 12;
  }
  if (top < 12) top = 12;

  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
}

function showDayHoverCard(dateKey, anchor) {
  if (!refs.dayHoverCard || window.matchMedia("(hover: none)").matches) return;
  const records = getComputedRecords();
  const day = buildDayInfo(dateKey, records, getActiveConfig());
  refs.dayHoverCard.innerHTML = buildHoverCardMarkup(day);
  refs.dayHoverCard.hidden = false;
  refs.dayHoverCard.setAttribute("aria-hidden", "false");
  positionDayHoverCard(anchor);
}

function hideDayHoverCard() {
  if (!refs.dayHoverCard) return;
  refs.dayHoverCard.hidden = true;
  refs.dayHoverCard.setAttribute("aria-hidden", "true");
}
