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
  RATING_THRESHOLDS,
  isPerfectRecord
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
    mode: CONFIG.syncEndpoint ? "loading" : "local",
    message: CONFIG.syncEndpoint ? "Google Sheets に接続しています..." : "ローカルモードで動作中です。"
  }
};

const refs = {
  summaryCards: document.getElementById("summaryCards"),
  upcomingList: document.getElementById("upcomingList"),
  calendarGrid: document.getElementById("calendarGrid"),
  dayHoverCard: document.getElementById("dayHoverCard"),
  selectedDayPanel: document.getElementById("selectedDayPanel"),
  recentEntries: document.getElementById("recentEntries"),
  rankingLists: document.getElementById("rankingLists"),
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
      : "Google Sheets の Web アプリ URL が未設定です。今はローカル保存のみです。",
    CONFIG.syncEndpoint ? "info" : "warn"
  );
  updateFormPreview();
  render();
  wireEvents();
  hydrateRemoteDashboard();
  startAutoSync();
});

function wireEvents() {
  refs.calendarGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-date-key]");
    if (!button) return;
    state.selectedDateKey = button.dataset.dateKey;
    refs.playDateInput.value = state.selectedDateKey;
    updateFormPreview();
    render();
  });

  refs.upcomingList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-date-key]");
    if (!button) return;
    state.selectedDateKey = button.dataset.dateKey;
    refs.playDateInput.value = state.selectedDateKey;
    updateFormPreview();
    render();
  });

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
    renderSelectedDay();
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
  return getMonthSequence(CONFIG.startMonth, CONFIG.monthCount).map(({ year, month }) =>
    buildCalendarMonth(year, month, records, CONFIG)
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

function getUpcomingDays(months) {
  const todayKey = getTodayDateKey();
  return months
    .flatMap((month) => month.dayRows)
    .filter((day) => day.dateKey >= todayKey && day.record.score >= RATING_THRESHOLDS.goMin)
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
  if (state.sync.mode === "error") return "同期失敗 / ローカル保存";
  return "ローカルモード";
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
  renderCalendar(months);
  renderSelectedDay();
  renderRecentEntries();
  renderRankings(records);
}

function renderSummary(summary) {
  refs.summaryCards.innerHTML = [
    buildSummaryCard("日数", summary.total, "静的に3か月固定", "is-neutral"),
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
    refs.upcomingList.innerHTML = `<p class="empty-text">これから先の○以上の日はありません。</p>`;
    return;
  }

  refs.upcomingList.innerHTML = upcomingDays
    .slice(0, 12)
    .map((day) => {
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
    })
    .join("");
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
        .map((day) => {
          if (!day) return `<div class="day-spacer"></div>`;
          const selectedClass = day.dateKey === state.selectedDateKey ? "is-selected" : "";
          const scoreSummary = escapeHtml(`スコア ${formatCompactScore(day.record.score)} / 実績平均 ${formatYen(day.record.avg)} / ${day.record.days}日平均 / ${day.playStyle.label}`);
          return `
            <button
              class="day-card tier-${day.rating.tier} ${selectedClass}"
              type="button"
              data-date-key="${day.dateKey}"
              aria-label="${scoreSummary}"
              title="${scoreSummary}"
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
        <article class="month-card">
          <header class="month-header">
            <div>
              <p class="month-kicker">${month.year}</p>
              <h3>${month.label}</h3>
              <p class="month-pillar">月干支: ${month.monthPillarSummary}</p>
              <p class="month-expectation">
                ★・◎・○だけ全部打つ想定: ${targetDays.length}日 / 期待収支 ${formatYen(expectedTotal)}
              </p>
            </div>
            <div class="month-stats">${statChips}</div>
          </header>
          <div class="weekday-row">
            ${WEEKDAYS.map((weekday, index) => `<span class="weekday weekday-${index}">${weekday}</span>`).join("")}
          </div>
          <div class="month-day-grid">
            ${dayCells}
          </div>
        </article>
      `;
    })
    .join("");
}

function buildMonthStat(label, value, tier) {
  return `<span class="month-stat tier-${tier}">${label} ${value}</span>`;
}

function renderSelectedDay() {
  const records = getComputedRecords();
  const day = buildDayInfo(state.selectedDateKey, records, CONFIG);
  const weekday = WEEKDAYS[day.weekday];
  const liveDelta = day.record.baseScore - day.record.seedScore;
  const liveDeltaLabel = liveDelta === 0 ? "入力反映なし" : liveDelta > 0 ? `入力反映で +${liveDelta}` : `入力反映で ${liveDelta}`;
  const monthAdjustmentLabel = day.monthContext.adjustment === 0
    ? "月補正なし"
    : `月補正 ${day.monthContext.adjustment}`;
  const specialDateAdjustmentLabel = day.specialDateContext.adjustment === 0
    ? "日付補正なし"
    : `日付補正 ${day.specialDateContext.adjustment}`;
  const playStyleAdjustmentLabel = day.playStyle.adjustment === 0
    ? "質感補正なし"
    : `質感補正 ${getScoreText(day.playStyle.adjustment)}`;
  const monthTags = day.monthContext.statuses.length
    ? day.monthContext.statuses.map((status) => `<span class="tag ${getMonthStatusClass(status)}">月${status} ${getScoreText(MONTH_STATUS_SCORE[status] ?? 0)}</span>`).join("")
    : `<span class="tag">月補正なし</span>`;
  const recordTags = day.record.tags.length
    ? day.record.tags.map((tag) => `<span class="tag ${getTagClass(tag)}">${tag}</span>`).join("")
    : "";
  const qualityChip = buildPlayStyleChip(day.playStyle, "質感 ");
  const weekdayChip = buildWeekdayChip(day.weekday, day.weekdayContext);
  const specialDateChip = day.specialDateContext.statuses.length ? buildSpecialDateChip(day.specialDateContext) : "";
  const opportunityChip = day.opportunity.active ? buildOpportunityChip(day.opportunity) : "";

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
        <small>${day.monthContext.statuses.join(" / ") || "補正なし"}</small>
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
    <p class="selected-note">
      4月7日を「辛亥」として日ごとに六十干支を回し、月干支は節入りで切り替えています。スコアは実績と占断の総合評価を土台にし、月の半空・真空・冲は月全体の補正として反映します。偶数月15日は年金支給日の注意日として `-1` を入れています。カレンダーではホバーで詳細、タップで下の詳細欄と入力欄に反映できます。
    </p>
  `;
}

function renderRecentEntries() {
  const entries = getAllEntries();
  const records = getComputedRecords();

  if (!entries.length) {
    refs.recentEntries.innerHTML = `<p class="empty-text">まだ成績入力はありません。</p>`;
    return;
  }

  refs.recentEntries.innerHTML = entries
    .slice(0, 8)
    .map((entry) => {
      const info = buildDayInfo(entry.targetDate, records, CONFIG);
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
  const info = buildDayInfo(dateKey, records, CONFIG);

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
      setFormStatus("Google Sheets の Web アプリ URL が未設定です。今はローカル保存のみです。", "info");
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
    setFormStatus("Sheets 同期に失敗したため、いったんローカル保存で継続します。", "warn");
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
    setFormStatus("ローカル保存しました。同期 URL を設定するとシートにも反映されます。", "info");
    render();
  } catch (error) {
    addLocalEntry(entry);
    refs.resultForm.reset();
    refs.playDateInput.value = targetDate;
    updateFormPreview();
    setFormStatus("通信に失敗したためローカル保存しました。後で同期を再試行できます。", "warn");
    render();
  } finally {
    refs.saveButton.disabled = false;
  }
}

function addLocalEntry(entry) {
  const recordsBefore = getComputedRecords();
  const nextRecords = applyEntriesToRecords(recordsBefore, [entry]);
  entry.liveScore = buildDayInfo(entry.targetDate, nextRecords, CONFIG).record.score;
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
  const day = buildDayInfo(dateKey, records, CONFIG);
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
