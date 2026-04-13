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
} from "./kanshi-data.js?v=20260415a";

const CONFIG = resolveConfig(window.SLOT_APP_CONFIG || {});
const STORAGE_KEY = "slot-kanshi-local-results-v1";
const FILTER_STORAGE_KEY = "slot-kanshi-calendar-filter-v1";
const GOAL_STORAGE_KEY = "slot-kanshi-goal-v1";
const THEME_STORAGE_KEY = "slot-kanshi-theme-v1";
const THEMES = ["dark", "sepia", "light"];
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
  upcomingExpanded: false,
  calendarFilter: loadCalendarFilter(),
  goal: loadGoal(),
  editingEntryId: null
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
  saveButton: document.getElementById("saveButton"),
  jumpTodayButton: document.getElementById("jumpTodayButton"),
  calendarFilterButtons: Array.from(document.querySelectorAll(".calendar-filter [data-filter]")),
  performancePanel: document.getElementById("performancePanel"),
  profitTrendChart: document.getElementById("profitTrendChart"),
  kanshiHeatmap: document.getElementById("kanshiHeatmap"),
  themeToggleButton: document.getElementById("themeToggleButton"),
  exportJsonButton: document.getElementById("exportJsonButton"),
  importJsonInput: document.getElementById("importJsonInput"),
  logToolStatus: document.getElementById("logToolStatus"),
  calendarJumpInput: document.getElementById("calendarJumpInput"),
  formFab: document.getElementById("formFab"),
  quickInputPopover: document.getElementById("quickInputPopover"),
  exportReportButton: document.getElementById("exportReportButton"),
  exportScopeSelect: document.getElementById("exportScopeSelect"),
  exportCsvButton: document.getElementById("exportCsvButton")
};

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(loadTheme());
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
  registerServiceWorker();
});

function loadTheme() {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw && THEMES.includes(raw)) return raw;
  } catch (error) { /* ignore */ }
  return "dark";
}

function applyTheme(theme) {
  const next = THEMES.includes(theme) ? theme : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch (error) { /* ignore */ }
  if (refs.themeToggleButton) {
    const icons = { dark: "🌙", sepia: "📜", light: "☀" };
    refs.themeToggleButton.textContent = icons[next] || "🌓";
    refs.themeToggleButton.dataset.theme = next;
  }
}

function cycleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const idx = THEMES.indexOf(current);
  const next = THEMES[(idx + 1) % THEMES.length];
  applyTheme(next);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Only register when served over http(s); skip file://.
  if (!/^https?:$/.test(window.location.protocol)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      /* ignore registration errors; app still works without SW */
    });
  });
}

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

  refs.calendarFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;
      if (!filter || state.calendarFilter === filter) return;
      state.calendarFilter = filter;
      persistCalendarFilter();
      syncCalendarFilterButtons();
      render();
    });
  });
  syncCalendarFilterButtons();

  refs.jumpTodayButton?.addEventListener("click", () => {
    jumpToToday();
  });

  refs.performancePanel?.addEventListener("submit", (event) => {
    const form = event.target.closest("form[data-action='set-goal']");
    if (!form) return;
    event.preventDefault();
    const value = Number(new FormData(form).get("goal"));
    state.goal.monthly = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
    persistGoal();
    renderPerformance();
  });

  refs.recentEntries?.addEventListener("click", handleRecentEntryClick);

  refs.themeToggleButton?.addEventListener("click", () => {
    cycleTheme();
  });

  refs.exportJsonButton?.addEventListener("click", () => {
    exportEntriesToJson();
  });

  refs.exportCsvButton?.addEventListener("click", () => {
    exportEntriesToCsv();
  });

  refs.importJsonInput?.addEventListener("change", (event) => {
    const input = event.target;
    const file = input && input.files ? input.files[0] : null;
    if (file) importEntriesFromJson(file);
    if (input) input.value = "";
  });

  // Compress the hero once the user scrolls past a small threshold so more
  // calendar is visible. Uses rAF throttling to keep scroll cheap.
  const hero = document.querySelector(".hero");
  if (hero) {
    let raf = 0;
    const update = () => {
      raf = 0;
      const scrolled = window.scrollY > 120;
      hero.classList.toggle("is-compact", scrolled);
    };
    window.addEventListener(
      "scroll",
      () => {
        if (raf) return;
        raf = window.requestAnimationFrame(update);
      },
      { passive: true }
    );
    update();
  }

  refs.calendarJumpInput?.addEventListener("change", (event) => {
    const value = event.target.value;
    if (!value) return;
    const months = getMonthSequence(CONFIG.startMonth, CONFIG.monthCount);
    if (months.length) {
      const first = months[0];
      const last = months[months.length - 1];
      const firstKey = `${first.year}-${String(first.month).padStart(2, "0")}-01`;
      const lastKey = `${last.year}-${String(last.month).padStart(2, "0")}-${String(getDaysInMonth(last.year, last.month)).padStart(2, "0")}`;
      if (value < firstKey || value > lastKey) {
        setFormStatus(`${value} は表示期間外です (${firstKey}〜${lastKey})。`, "warn");
        return;
      }
    }
    selectDate(value);
    window.requestAnimationFrame(() => {
      const target = refs.calendarGrid.querySelector(`[data-date-key="${value}"]`);
      if (!target) return;
      const monthAcc = target.closest("details.month-accordion");
      if (monthAcc && !monthAcc.open) monthAcc.open = true;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  refs.exportReportButton?.addEventListener("click", () => {
    exportMonthlyReportImage();
  });

  refs.formFab?.addEventListener("click", () => {
    if (refs.resultForm && refs.resultForm.scrollIntoView) {
      refs.resultForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.requestAnimationFrame(() => {
      refs.profitInput?.focus({ preventScroll: true });
    });
  });

  wireQuickInputPopover();

  // Keyboard navigation on the calendar: arrow keys move day selection by 1/7,
  // Home/End jump to start/end of the current visible month.
  refs.calendarGrid.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const focused = event.target.closest("[data-date-key]");
    if (!focused) return;
    event.preventDefault();
    const currentKey = focused.dataset.dateKey;
    const delta = event.key === "ArrowLeft" ? -1
      : event.key === "ArrowRight" ? 1
      : event.key === "ArrowUp" ? -7
      : event.key === "ArrowDown" ? 7
      : 0;
    let nextKey = currentKey;
    if (delta !== 0) {
      const base = new Date(`${currentKey}T12:00:00Z`);
      base.setUTCDate(base.getUTCDate() + delta);
      const y = base.getUTCFullYear();
      const m = String(base.getUTCMonth() + 1).padStart(2, "0");
      const d = String(base.getUTCDate()).padStart(2, "0");
      nextKey = `${y}-${m}-${d}`;
    } else if (event.key === "Home" || event.key === "End") {
      const [y, m] = currentKey.split("-").map(Number);
      const day = event.key === "Home" ? 1 : getDaysInMonth(y, m);
      nextKey = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    const target = refs.calendarGrid.querySelector(`[data-date-key="${nextKey}"]`);
    if (!target) return;
    const monthAcc = target.closest("details.month-accordion");
    if (monthAcc && !monthAcc.open) monthAcc.open = true;
    selectDate(nextKey);
    // Focus after render to keep arrow-chain navigation responsive.
    window.requestAnimationFrame(() => {
      const refreshed = refs.calendarGrid.querySelector(`[data-date-key="${nextKey}"]`);
      if (refreshed) refreshed.focus();
    });
  });
}

function wireQuickInputPopover() {
  const popover = refs.quickInputPopover;
  if (!popover) return;
  const form = popover.querySelector(".quick-input-form");
  const profitInput = form?.querySelector("[name='profit']");
  const memoInput = form?.querySelector("[name='memo']");
  const closeBtn = popover.querySelector(".quick-input-close");
  const dateLabel = popover.querySelector(".quick-input-date");
  const kanshiLabel = popover.querySelector(".quick-input-kanshi");

  let pressTimer = 0;
  let pressedKey = null;
  let lastTouchPos = { x: 0, y: 0 };

  const openPopover = (dateKey, anchor) => {
    if (!dateKey) return;
    try {
      const records = getComputedRecords();
      const day = buildDayInfo(dateKey, records, getActiveConfig());
      if (dateLabel) dateLabel.textContent = `${day.year}/${day.month}/${day.day}(${WEEKDAYS[day.weekday]})`;
      if (kanshiLabel) kanshiLabel.textContent = day.kanshi;
    } catch (error) {
      if (dateLabel) dateLabel.textContent = dateKey;
      if (kanshiLabel) kanshiLabel.textContent = "";
    }
    // Prefill with existing local entry for that date if any.
    const existing = state.localEntries.find((e) => normalizeTargetDate(e.targetDate) === dateKey);
    if (profitInput) profitInput.value = existing ? existing.profit : "";
    if (memoInput) memoInput.value = existing ? (existing.memo || "") : "";
    popover.dataset.dateKey = dateKey;
    popover.dataset.editId = existing?.id || "";
    popover.hidden = false;
    positionQuickPopover(popover, anchor);
    window.requestAnimationFrame(() => profitInput?.focus({ preventScroll: true }));
  };

  const closePopover = () => {
    popover.hidden = true;
    popover.dataset.dateKey = "";
    popover.dataset.editId = "";
  };

  const clearPressTimer = () => {
    if (pressTimer) {
      window.clearTimeout(pressTimer);
      pressTimer = 0;
    }
    pressedKey = null;
  };

  refs.calendarGrid.addEventListener("touchstart", (event) => {
    const button = event.target.closest("[data-date-key]");
    if (!button) return;
    const touch = event.touches?.[0];
    if (touch) lastTouchPos = { x: touch.clientX, y: touch.clientY };
    pressedKey = button.dataset.dateKey;
    clearPressTimer();
    pressTimer = window.setTimeout(() => {
      openPopover(pressedKey, button);
      pressTimer = 0;
    }, 520);
  }, { passive: true });

  refs.calendarGrid.addEventListener("touchmove", (event) => {
    const touch = event.touches?.[0];
    if (!touch || !pressTimer) return;
    const dx = Math.abs(touch.clientX - lastTouchPos.x);
    const dy = Math.abs(touch.clientY - lastTouchPos.y);
    if (dx > 8 || dy > 8) clearPressTimer();
  }, { passive: true });

  refs.calendarGrid.addEventListener("touchend", clearPressTimer, { passive: true });
  refs.calendarGrid.addEventListener("touchcancel", clearPressTimer, { passive: true });

  refs.calendarGrid.addEventListener("contextmenu", (event) => {
    const button = event.target.closest("[data-date-key]");
    if (!button) return;
    event.preventDefault();
    openPopover(button.dataset.dateKey, button);
  });

  closeBtn?.addEventListener("click", () => closePopover());
  popover.addEventListener("click", (event) => {
    if (event.target === popover) closePopover();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popover.hidden) closePopover();
  });

  window.addEventListener("resize", () => {
    if (!popover.hidden) closePopover();
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const dateKey = popover.dataset.dateKey;
    if (!dateKey) return;
    const profit = Number(profitInput?.value);
    if (!Number.isFinite(profit)) {
      profitInput?.focus();
      return;
    }
    const existingId = popover.dataset.editId || "";
    const existing = existingId ? state.localEntries.find((e) => e.id === existingId) : null;
    const entry = {
      id: existing ? existing.id : createEntryId(),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetDate: dateKey,
      kanshi: getKanshiForDateKey(dateKey, CONFIG),
      profit,
      memo: String(memoInput?.value || "").trim()
    };
    addLocalEntry(entry);
    state.selectedDateKey = dateKey;
    setFormStatus(`${dateKey} の収支を保存しました (クイック入力)。`, "success");
    closePopover();
    render();
  });
}

function positionQuickPopover(popover, anchor) {
  if (!anchor) return;
  const inner = popover.querySelector(".quick-input-inner");
  if (!inner) return;
  // Let it render first so we can measure.
  inner.style.left = "0px";
  inner.style.top = "0px";
  const anchorRect = anchor.getBoundingClientRect();
  const rect = inner.getBoundingClientRect();
  const gutter = 10;
  let left = anchorRect.left + anchorRect.width / 2 - rect.width / 2;
  let top = anchorRect.bottom + gutter;
  if (left + rect.width > window.innerWidth - 12) left = window.innerWidth - rect.width - 12;
  if (left < 12) left = 12;
  if (top + rect.height > window.innerHeight - 12) {
    top = Math.max(12, anchorRect.top - rect.height - gutter);
  }
  inner.style.left = `${Math.round(left)}px`;
  inner.style.top = `${Math.round(top)}px`;
}

function setLogToolStatus(message, tone = "info") {
  if (!refs.logToolStatus) return;
  refs.logToolStatus.textContent = message;
  refs.logToolStatus.dataset.tone = tone;
}

function exportMonthlyReportImage() {
  try {
    const progress = computeMonthlyProgress();
    const streak = computeStreak();
    const records = getComputedRecords();
    const months = getMonthModels(records);
    const summary = getSummary(months);

    const width = 960;
    const height = 540;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");

    // Background
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#1d1a14");
    bg.addColorStop(1, "#0f1014");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Accent stripe
    ctx.fillStyle = "rgba(221, 187, 114, 0.14)";
    ctx.fillRect(0, 0, width, 6);

    // Title
    ctx.fillStyle = "#f3d9a7";
    ctx.font = "bold 36px 'Zen Old Mincho', serif";
    ctx.fillText("打つべきか 月次レポート", 48, 64);

    // Subtitle (month prefix + date)
    ctx.fillStyle = "#b7a98b";
    ctx.font = "500 18px 'Zen Kaku Gothic New', sans-serif";
    const stamp = new Date().toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
    ctx.fillText(`${progress.monthPrefix.replace("-", "/")} 時点 / 生成 ${stamp}`, 48, 96);

    // Monthly profit (big)
    const profitColor = progress.total > 0 ? "#8fd26d" : progress.total < 0 ? "#de6a63" : "#f5efe2";
    ctx.fillStyle = profitColor;
    ctx.font = "900 68px 'Zen Old Mincho', serif";
    ctx.fillText(formatYen(progress.total), 48, 180);

    // Monthly stats row
    ctx.fillStyle = "#b7a98b";
    ctx.font = "500 18px 'Zen Kaku Gothic New', sans-serif";
    const winRate = progress.days > 0 ? Math.round((progress.wins / progress.days) * 100) : null;
    const monthlyStatsLine = `今月 ${progress.days}日 / 勝率 ${winRate === null ? "—" : `${winRate}%`} / ${streak.kind === "win" ? `連勝 ${streak.count}日` : streak.kind === "lose" ? `連敗 ${streak.count}日` : "実績なし"}`;
    ctx.fillText(monthlyStatsLine, 48, 220);

    // Goal progress bar
    const goal = Number(state.goal.monthly) || 0;
    const ratio = goal > 0 ? Math.max(0, Math.min(1.2, progress.total / goal)) : 0;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(48, 250, 640, 14);
    const barGrad = ctx.createLinearGradient(48, 0, 688, 0);
    barGrad.addColorStop(0, "rgba(221, 187, 114, 0.9)");
    barGrad.addColorStop(1, "rgba(143, 210, 109, 0.9)");
    ctx.fillStyle = barGrad;
    ctx.fillRect(48, 250, Math.min(640 * ratio, 640), 14);
    ctx.fillStyle = "#b7a98b";
    ctx.font = "500 16px 'Zen Kaku Gothic New', sans-serif";
    ctx.fillText(goal > 0 ? `目標 ${formatYen(goal)} / 進捗 ${Math.round(ratio * 100)}%` : "目標未設定", 48, 286);

    // 3-month counts panel on the right
    const rightX = 720;
    const countsY = 150;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundedRect(ctx, rightX - 12, countsY - 30, 200, 170, 18);
    ctx.fill();
    ctx.fillStyle = "#b7a98b";
    ctx.font = "600 14px 'Zen Kaku Gothic New', sans-serif";
    ctx.fillText("3か月 内訳", rightX, countsY - 10);
    const rows = [
      { label: "★ 完璧", value: summary.perfect, color: "#f3d9a7" },
      { label: "◎ 絶好", value: summary.special, color: "#41c983" },
      { label: "○ 行く", value: summary.go, color: "#8fd26d" },
      { label: "△ 保留", value: summary.hold, color: "#e7b94c" },
      { label: "× 見送", value: summary.avoid, color: "#de6a63" }
    ];
    rows.forEach((row, i) => {
      const y = countsY + 20 + i * 24;
      ctx.fillStyle = row.color;
      ctx.font = "700 16px 'Zen Kaku Gothic New', sans-serif";
      ctx.fillText(row.label, rightX, y);
      ctx.fillStyle = "#f5efe2";
      ctx.font = "800 16px 'Zen Kaku Gothic New', sans-serif";
      const text = `${row.value}`;
      const w = ctx.measureText(text).width;
      ctx.fillText(text, rightX + 176 - w, y);
    });

    // Mini trend line (last 30 days cumulative) along the bottom
    const { entries } = getDedupedAggregateEntries();
    const byDate = new Map();
    for (const entry of entries) {
      const key = normalizeTargetDate(entry.targetDate);
      const profit = Number(entry.profit);
      if (key && Number.isFinite(profit)) byDate.set(key, (byDate.get(key) || 0) + profit);
    }
    const todayKey = getTodayDateKey();
    const anchor = new Date(`${todayKey}T12:00:00Z`);
    const points = [];
    let cum = 0;
    for (let i = 29; i >= 0; i -= 1) {
      const date = new Date(anchor.getTime() - i * 86400000);
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, "0");
      const d = String(date.getUTCDate()).padStart(2, "0");
      cum += byDate.get(`${y}-${m}-${d}`) || 0;
      points.push(cum);
    }
    const chartX = 48;
    const chartY = 340;
    const chartW = 864;
    const chartH = 140;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundedRect(ctx, chartX, chartY, chartW, chartH, 16);
    ctx.fill();
    ctx.fillStyle = "#b7a98b";
    ctx.font = "600 14px 'Zen Kaku Gothic New', sans-serif";
    ctx.fillText("収支推移 (直近30日 累計)", chartX + 16, chartY + 24);
    const cmin = Math.min(0, ...points);
    const cmax = Math.max(0, ...points);
    const cSpan = (cmax - cmin) || 1;
    const plotX = chartX + 20;
    const plotY = chartY + 36;
    const plotW = chartW - 40;
    const plotH = chartH - 56;
    // zero axis
    const zeroY = plotY + plotH * (1 - (0 - cmin) / cSpan);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(plotX, zeroY);
    ctx.lineTo(plotX + plotW, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
    // line
    ctx.strokeStyle = "#ddbb72";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    points.forEach((v, i) => {
      const px = plotX + (plotW * i) / Math.max(1, points.length - 1);
      const py = plotY + plotH * (1 - (v - cmin) / cSpan);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Footer
    ctx.fillStyle = "rgba(245, 239, 226, 0.45)";
    ctx.font = "500 14px 'Zen Kaku Gothic New', sans-serif";
    ctx.fillText("打つべきか、打たないべきか — Sexagenary Slot Calendar", 48, height - 24);

    canvas.toBlob((blob) => {
      if (!blob) {
        setFormStatus("画像生成に失敗しました。", "warn");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `slot-kanshi-monthly-${progress.monthPrefix}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, "image/png");
  } catch (error) {
    setFormStatus("月次レポートの書き出しに失敗しました。", "warn");
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Returns the subset of entries matched by the current export scope selector.
 * Draws from both local and remote (deduped) entries so exports are the
 * canonical view even when Sheets is the source of truth.
 * @returns {{scope: string, entries: Array<object>}}
 */
function getScopedExportEntries() {
  const scope = refs.exportScopeSelect?.value || "all";
  const { entries } = getDedupedAggregateEntries();
  const today = new Date();
  const todayKey = getTodayDateKey();
  const monthPrefix = todayKey.slice(0, 7);
  const yearPrefix = todayKey.slice(0, 4);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
  const thirtyAgoKey = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(thirtyDaysAgo.getDate()).padStart(2, "0")}`;

  const filtered = entries.filter((entry) => {
    const date = normalizeTargetDate(entry.targetDate);
    if (!date) return false;
    const profit = Number(entry.profit);
    if (!Number.isFinite(profit)) return false;
    if (scope === "month") return date.startsWith(monthPrefix);
    if (scope === "year") return date.startsWith(yearPrefix);
    if (scope === "last30") return date >= thirtyAgoKey && date <= todayKey;
    if (scope === "wins") return profit > 0;
    if (scope === "losses") return profit < 0;
    return true;
  });
  return { scope, entries: filtered };
}

/** @returns {string} human label for the active export scope */
function getScopeLabel(scope) {
  return {
    all: "全件",
    month: "今月",
    year: "今年",
    last30: "直近30日",
    wins: "勝ち",
    losses: "負け"
  }[scope] || "全件";
}

function exportEntriesToJson() {
  try {
    const { scope, entries } = getScopedExportEntries();
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      scope,
      entries
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    link.href = url;
    link.download = `slot-kanshi-${scope}-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setLogToolStatus(`${getScopeLabel(scope)}でエクスポート (${entries.length}件)。`, "success");
  } catch (error) {
    setLogToolStatus("エクスポートに失敗しました。", "warn");
  }
}

function exportEntriesToCsv() {
  try {
    const { scope, entries } = getScopedExportEntries();
    const header = ["date", "kanshi", "profit", "memo"];
    const rows = entries
      .sort((a, b) => (a.targetDate < b.targetDate ? -1 : 1))
      .map((entry) => [
        normalizeTargetDate(entry.targetDate),
        entry.kanshi || "",
        String(Number(entry.profit) || 0),
        String(entry.memo || "").replace(/[\r\n]+/g, " ")
      ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => {
        const text = String(cell);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      }).join(","))
      .join("\n");
    // Prepend BOM so Excel correctly recognizes UTF-8 (Japanese memos otherwise break).
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    link.href = url;
    link.download = `slot-kanshi-${scope}-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setLogToolStatus(`${getScopeLabel(scope)}でCSV出力 (${entries.length}件)。`, "success");
  } catch (error) {
    setLogToolStatus("CSV出力に失敗しました。", "warn");
  }
}

async function importEntriesFromJson(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.entries)
        ? parsed.entries
        : null;
    if (!incoming) {
      setLogToolStatus("JSON 形式が不正です。", "warn");
      return;
    }
    const normalized = incoming
      .filter((entry) => entry && entry.targetDate)
      .map((entry) => {
        const normalizedDate = normalizeTargetDate(entry.targetDate);
        return {
          id: entry.id || createEntryId(),
          createdAt: entry.createdAt || new Date().toISOString(),
          updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
          targetDate: normalizedDate,
          kanshi: entry.kanshi || getKanshiForDateKey(normalizedDate, CONFIG),
          profit: Number(entry.profit) || 0,
          memo: String(entry.memo || "")
        };
      })
      .filter((entry) => entry.targetDate);

    if (!normalized.length) {
      setLogToolStatus("取り込めるエントリがありませんでした。", "warn");
      return;
    }

    // Merge: existing by id wins, incoming adds new rows; same-date duplicates are not aggressively deduped here.
    const existingIds = new Set(state.localEntries.map((e) => e.id));
    let added = 0;
    for (const entry of normalized) {
      if (existingIds.has(entry.id)) continue;
      state.localEntries.unshift(entry);
      existingIds.add(entry.id);
      added += 1;
    }
    persistLocalEntries();
    setLogToolStatus(`インポート完了: ${added}件追加 / スキップ ${normalized.length - added}件。`, "success");
    render();
  } catch (error) {
    setLogToolStatus("インポートに失敗しました。JSONを確認してください。", "warn");
  }
}

function syncCalendarFilterButtons() {
  refs.calendarFilterButtons.forEach((button) => {
    const active = button.dataset.filter === state.calendarFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function jumpToToday() {
  const todayKey = getTodayDateKey();
  const months = getMonthSequence(CONFIG.startMonth, CONFIG.monthCount);
  if (!months.length) return;
  const first = months[0];
  const last = months[months.length - 1];
  const firstKey = `${first.year}-${String(first.month).padStart(2, "0")}-01`;
  const lastKey = `${last.year}-${String(last.month).padStart(2, "0")}-${String(getDaysInMonth(last.year, last.month)).padStart(2, "0")}`;
  if (todayKey < firstKey || todayKey > lastKey) {
    setFormStatus("今日の日付は表示期間の外です。", "warn");
    return;
  }
  selectDate(todayKey);
  // Open the target month's accordion if closed, then scroll the day card into view.
  window.requestAnimationFrame(() => {
    const target = refs.calendarGrid.querySelector(`[data-date-key="${todayKey}"]`);
    if (!target) return;
    const monthAcc = target.closest("details.month-accordion");
    if (monthAcc && !monthAcc.open) monthAcc.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function loadGoal() {
  try {
    const raw = window.localStorage.getItem(GOAL_STORAGE_KEY);
    if (!raw) return { monthly: 0 };
    const parsed = JSON.parse(raw);
    const monthly = Number(parsed?.monthly);
    return { monthly: Number.isFinite(monthly) ? monthly : 0 };
  } catch (error) {
    return { monthly: 0 };
  }
}

function persistGoal() {
  try {
    window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(state.goal));
  } catch (error) {
    /* ignore */
  }
}

function computeMonthlyProgress() {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { entries } = getDedupedAggregateEntries();
  let total = 0;
  let days = 0;
  let wins = 0;
  for (const entry of entries) {
    const date = normalizeTargetDate(entry.targetDate);
    if (!date.startsWith(prefix)) continue;
    const profit = Number(entry.profit);
    if (!Number.isFinite(profit)) continue;
    total += profit;
    days += 1;
    if (profit > 0) wins += 1;
  }
  return { total, days, wins, monthPrefix: prefix };
}

/**
 * Computes the current win/lose/even streak from recorded entries (most recent first).
 * @returns {{kind: ("none"|"even"|"win"|"lose"), count: number}}
 */
function computeStreak() {
  const { entries } = getDedupedAggregateEntries();
  const sorted = entries
    .map((entry) => ({
      date: normalizeTargetDate(entry.targetDate),
      profit: Number(entry.profit)
    }))
    .filter((entry) => entry.date && Number.isFinite(entry.profit))
    .sort((left, right) => (left.date < right.date ? 1 : -1));
  if (!sorted.length) return { kind: "none", count: 0 };
  const latestSign = Math.sign(sorted[0].profit);
  if (latestSign === 0) return { kind: "even", count: 1 };
  let count = 0;
  for (const entry of sorted) {
    if (Math.sign(entry.profit) === latestSign) count += 1;
    else break;
  }
  return { kind: latestSign > 0 ? "win" : "lose", count };
}

function loadCalendarFilter() {
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (raw && ["all", "go", "top", "recorded"].includes(raw)) return raw;
  } catch (error) {
    /* ignore */
  }
  return "all";
}

function persistCalendarFilter() {
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, state.calendarFilter);
  } catch (error) {
    /* ignore */
  }
}

/**
 * Tests a calendar day against the active filter chip.
 * @param {{dateKey: string, record: {score: number}}} day
 * @param {Set<string>} [recordedDates] - dates that have any recorded profit entry
 * @returns {boolean}
 */
function matchesCalendarFilter(day, recordedDates) {
  if (state.calendarFilter === "all") return true;
  if (state.calendarFilter === "go") return day.record.score >= RATING_THRESHOLDS.goMin;
  if (state.calendarFilter === "top") return day.record.score >= RATING_THRESHOLDS.specialMin;
  if (state.calendarFilter === "recorded") return recordedDates?.has(day.dateKey);
  return true;
}

function getRecordedDateSet() {
  const set = new Set();
  for (const entry of state.remoteEntries) {
    const key = normalizeTargetDate(entry?.targetDate);
    if (key) set.add(key);
  }
  for (const entry of state.localEntries) {
    const key = normalizeTargetDate(entry?.targetDate);
    if (key) set.add(key);
  }
  return set;
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

/** @returns {string} Today's date as `YYYY-MM-DD`. */
function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns a date `daysAhead` days after today as `YYYY-MM-DD`.
 * Sets local noon to avoid DST/edge-case rollovers.
 * @param {number} daysAhead
 * @returns {string}
 */
function getFutureDateKey(daysAhead) {
  const next = new Date();
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + daysAhead);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Picks days in [today, today+14] whose score reaches the "go" threshold.
 * Used by the 直近の狙い目 panel.
 * @param {Array<{dayRows: Array<{dateKey: string, record: {score: number}}>}>} months
 */
function getUpcomingDays(months) {
  const todayKey = getTodayDateKey();
  const endKey = getFutureDateKey(14);
  return months
    .flatMap((month) => month.dayRows)
    .filter((day) => day.dateKey >= todayKey && day.dateKey <= endKey && day.record.score >= RATING_THRESHOLDS.goMin)
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

/**
 * Bucket counts for the 90-day summary cards.
 * @param {Array<{dayRows: Array<{record: object}>}>} months
 * @returns {{total:number, perfect:number, special:number, go:number, hold:number, avoid:number}}
 */
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
  const pendingCount = state.localEntries.filter((e) => e.pendingSync).length;
  const pendingSuffix = pendingCount > 0 ? ` / 保留${pendingCount}件` : "";
  if (state.sync.mode === "online") return `Google Sheets 同期中${pendingSuffix}`;
  if (state.sync.mode === "loading") return `Sheets 接続中${pendingSuffix}`;
  if (state.sync.mode === "error") return `同期失敗${pendingSuffix}`;
  return `同期未設定${pendingSuffix}`;
}

function render() {
  hideDayHoverCard();
  const records = getComputedRecords();
  const months = getMonthModels(records);
  const summary = getSummary(months);
  const upcomingDays = getUpcomingDays(months);

  refs.syncBadgeText.textContent = getSyncLabel();
  renderSummary(summary);
  renderPerformance();
  renderUpcoming(upcomingDays);
  renderAggregates(records);
  renderCalendar(months);
  renderSelectedDay();
  renderMobileStickyDetail(records);
  renderRecentEntries();
  renderRankings(records);
  renderCharts();
}

function renderPerformance() {
  if (!refs.performancePanel) return;
  const progress = computeMonthlyProgress();
  const streak = computeStreak();
  const goal = Number(state.goal.monthly) || 0;
  const ratio = goal > 0 ? Math.max(0, Math.min(1.2, progress.total / goal)) : 0;
  const progressPct = Math.min(100, Math.round(ratio * 100));
  const goalRemaining = goal > 0 ? goal - progress.total : 0;
  const totalClass = progress.total > 0 ? "is-plus" : progress.total < 0 ? "is-minus" : "";

  const streakLabel =
    streak.kind === "win"
      ? `連勝 ${streak.count}日`
      : streak.kind === "lose"
        ? `連敗 ${streak.count}日`
        : streak.kind === "even"
          ? "収支±0日"
          : "実績なし";
  const streakTone =
    streak.kind === "win" ? "is-plus" : streak.kind === "lose" ? "is-minus" : "is-neutral";

  const goalTone = goal <= 0 ? "is-neutral" : progress.total >= goal ? "is-plus" : "is-neutral";
  const goalNote = goal <= 0
    ? "月間目標を設定すると進捗が表示されます。"
    : goalRemaining > 0
      ? `目標まであと ${formatYen(goalRemaining)}`
      : `目標超過 ${formatYen(progress.total - goal)}`;

  const winRate = progress.days > 0 ? Math.round((progress.wins / progress.days) * 100) : null;

  refs.performancePanel.innerHTML = `
    <div class="performance-card performance-streak ${streakTone}">
      <span class="performance-label">現在のストリーク</span>
      <strong class="performance-value">${streakLabel}</strong>
      <span class="performance-note">直近の記録順で計算</span>
    </div>
    <div class="performance-card performance-month">
      <span class="performance-label">今月 (${progress.monthPrefix.replace("-", "/")})</span>
      <strong class="performance-value ${totalClass}">${formatYen(progress.total)}</strong>
      <span class="performance-note">${progress.days}日 / 勝率 ${winRate === null ? "—" : `${winRate}%`}</span>
    </div>
    <div class="performance-card performance-goal ${goalTone}">
      <div class="performance-goal-head">
        <span class="performance-label">月間目標</span>
        <strong class="performance-value">${goal > 0 ? formatYen(goal) : "未設定"}</strong>
      </div>
      <div class="performance-goal-bar">
        <div class="performance-goal-fill" style="width: ${progressPct}%"></div>
      </div>
      <div class="performance-goal-row">
        <span class="performance-note">${goalNote}</span>
        <form class="performance-goal-form" data-action="set-goal">
          <input type="number" step="1000" name="goal" placeholder="目標額" value="${goal > 0 ? goal : ""}" aria-label="月間目標額" />
          <button type="submit" class="performance-goal-submit">保存</button>
        </form>
      </div>
    </div>
  `;
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

/**
 * Normalises any sane date input (Date, ISO `YYYY-MM-DD`, slashed `YYYY/MM/DD`)
 * to canonical `YYYY-MM-DD`. Returns "" for falsy / unrecognised input so
 * callers can short-circuit without a try/catch.
 * @param {string | Date | null | undefined} value
 * @returns {string}
 */
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
  // 現在の Apps Script は「実績入力」の追加分だけを返していて、
  // 元シート由来の履歴までは remoteEntries に含めていない。
  // そのため、集計は常にベース履歴 + 追加入力の合算で扱う。
  const { entries } = getDedupedAggregateEntries();
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
  const todayKey = getTodayDateKey();
  const todayMonth = todayKey.slice(0, 7);
  const recordedDates = getRecordedDateSet();
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
            return "";
          }
          const selectedClass = day.dateKey === state.selectedDateKey ? "is-selected" : "";
          const todayClass = day.dateKey === todayKey ? "is-today" : "";
          const hasEntry = recordedDates.has(day.dateKey);
          const entryClass = hasEntry ? "has-entry" : "";
          const dimClass = matchesCalendarFilter(day, recordedDates) ? "" : "is-dimmed";
          const scoreSummary = escapeHtml(`スコア ${formatCompactScore(day.record.score)} / 実績平均 ${formatYen(day.record.avg)} / ${day.record.days}日平均 / ${day.playStyle.label}`);
          const columnStart = day.day === 1 ? ` style="grid-column-start: ${index + 1};"` : "";
          const markerHtml = day.specialDateContext.statuses.length
            ? `<span class="day-marker-corner is-caution" aria-hidden="true">!</span>`
            : "";
          const todayBadge = day.dateKey === todayKey ? `<span class="day-today-badge" aria-hidden="true">Today</span>` : "";
          const entryBadge = hasEntry ? `<span class="day-entry-badge" aria-hidden="true" title="実績入力あり">●</span>` : "";
          return `
            <button
              class="day-card tier-${day.rating.tier} ${selectedClass} ${todayClass} ${entryClass} ${dimClass}"
              type="button"
              data-date-key="${day.dateKey}"
              aria-label="${scoreSummary}"
              title="${scoreSummary}"${columnStart}
            >
              ${markerHtml}
              ${todayBadge}
              ${entryBadge}
              <span class="day-number">${day.day}</span>
              <strong class="day-rating">${day.rating.label}</strong>
              <span class="day-kanshi">${day.kanshi}</span>
              <span class="day-ts">${day.record.ts || "通変星なし"}</span>
              <span class="day-score-pill">${formatCompactScore(day.record.score)}</span>
              <span class="day-style ${getToneClass(day.playStyle.tone)}">${day.playStyle.shortLabel}</span>
              ${day.opportunity.active ? `<span class="day-opportunity ${getToneClass(day.opportunity.tone)}">${day.opportunity.label}</span>` : ""}
            </button>
          `;
        })
        .join("");
      // Auto-open only the month containing today (fall back to first month if today is out-of-range).
      const monthKey = `${month.year}-${String(month.month).padStart(2, "0")}`;
      const isTodayMonth = monthKey === todayMonth;
      const openAttr = isTodayMonth || (todayMonth < `${months[0].year}-${String(months[0].month).padStart(2, "0")}` && month === months[0]) ? " open" : "";
      return `
        <details class="month-accordion"${openAttr}>
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

      <div class="selected-summary-row">
        <span class="selected-summary-score">スコア <strong>${formatScoreValue(day.record.score)}</strong></span>
        <span class="selected-summary-avg">実績 <strong>${formatYen(day.record.avg)}</strong></span>
        <span class="selected-summary-confidence ${confidenceToneClass}">${confidence.stars} ${confidence.shortLabel}</span>
      </div>

      <details class="selected-details" open>
        <summary class="selected-details-summary">
          <span class="selected-details-open">詳細を隠す</span>
          <span class="selected-details-close">詳細を表示</span>
          <span class="selected-details-arrow" aria-hidden="true"></span>
        </summary>

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

      ${buildScoreBreakdownBar(day)}
      ${buildSameKanshiComparison(day.kanshi, day.dateKey)}
      </details>
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

  const localIdSet = new Set(state.localEntries.map((entry) => entry.id).filter(Boolean));

  refs.recentEntries.innerHTML = entries
    .slice(0, 12)
    .map((entry) => {
      const info = buildDayInfo(entry.targetDate, records, getActiveConfig());
      const rating = info.rating;
      const isLocal = localIdSet.has(entry.id);
      const idAttr = entry.id ? entry.id : "";
      const pending = isLocal && entry.pendingSync === true;
      const originBadge = pending
        ? `<span class="recent-entry-origin is-pending" title="Sheetsへ未送信">Pending</span>`
        : isLocal
          ? `<span class="recent-entry-origin is-local" title="端末内のみ">Local</span>`
          : `<span class="recent-entry-origin is-sheets" title="Sheets由来">Sheets</span>`;
      const actions = isLocal
        ? `
          <div class="recent-entry-actions">
            ${originBadge}
            <button type="button" class="recent-entry-edit" data-action="edit-entry" data-entry-id="${idAttr}">編集</button>
            <button type="button" class="recent-entry-delete" data-action="delete-entry" data-entry-id="${idAttr}">削除</button>
          </div>
        `
        : `<div class="recent-entry-actions">${originBadge}</div>`;
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
          ${actions}
        </article>
      `;
    })
    .join("");
}

function handleRecentEntryClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const id = target.dataset.entryId;
  const action = target.dataset.action;
  if (!id || !action) return;
  const entry = state.localEntries.find((e) => e.id === id);
  if (!entry) return;

  if (action === "edit-entry") {
    refs.playDateInput.value = entry.targetDate;
    refs.profitInput.value = entry.profit;
    refs.memoInput.value = entry.memo || "";
    state.editingEntryId = id;
    state.selectedDateKey = entry.targetDate;
    updateFormPreview();
    setFormStatus(`${entry.targetDate} の記録を編集中です。保存で上書きされます。`, "info");
    if (refs.resultForm && refs.resultForm.scrollIntoView) {
      refs.resultForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    render();
    return;
  }

  if (action === "delete-entry") {
    const ok = window.confirm(`${entry.targetDate} の記録を削除しますか？`);
    if (!ok) return;
    state.localEntries = state.localEntries.filter((e) => e.id !== id);
    persistLocalEntries();
    if (state.editingEntryId === id) {
      state.editingEntryId = null;
      refs.resultForm?.reset();
      refs.playDateInput.value = state.selectedDateKey;
    }
    setFormStatus(`${entry.targetDate} の記録を削除しました。`, "info");
    render();
  }
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

function renderCharts() {
  renderProfitTrend();
  renderKanshiHeatmap();
}

function renderProfitTrend() {
  if (!refs.profitTrendChart) return;
  const { entries } = getDedupedAggregateEntries();
  const todayKey = getTodayDateKey();
  const rangeDays = 30;
  const dayMs = 86400000;

  // Build an index of normalized entries by date key.
  const byDate = new Map();
  for (const entry of entries) {
    const key = normalizeTargetDate(entry.targetDate);
    const profit = Number(entry.profit);
    if (!key || !Number.isFinite(profit)) continue;
    byDate.set(key, (byDate.get(key) || 0) + profit);
  }

  // Build the last N days in order ending at today.
  const anchor = new Date(`${todayKey}T12:00:00Z`);
  const points = [];
  let cum = 0;
  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const date = new Date(anchor.getTime() - i * dayMs);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    const key = `${y}-${m}-${d}`;
    const daily = byDate.get(key) || 0;
    cum += daily;
    points.push({ key, daily, cum });
  }

  const daily = points.map((p) => p.daily);
  const cumVals = points.map((p) => p.cum);
  const recorded = points.filter((p) => byDate.has(p.key)).length;
  if (recorded === 0) {
    refs.profitTrendChart.innerHTML = `<p class="empty-text">直近30日に記録がありません。</p>`;
    return;
  }

  const width = 560;
  const height = 180;
  const padX = 10;
  const padY = 14;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const cmin = Math.min(0, ...cumVals);
  const cmax = Math.max(0, ...cumVals);
  const cSpan = cmax - cmin || 1;
  const scaleY = (v) => padY + innerH * (1 - (v - cmin) / cSpan);
  const stepX = innerW / Math.max(1, points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(padX + stepX * i).toFixed(1)},${scaleY(p.cum).toFixed(1)}`)
    .join(" ");
  const zeroY = scaleY(0).toFixed(1);
  const dBars = Math.max(...daily.map((v) => Math.abs(v)), 1);
  const barScale = innerH / 2 / dBars * 0.55;
  const barsSvg = points
    .map((p, i) => {
      if (!p.daily) return "";
      const x = padX + stepX * i - 1.5;
      const h = Math.abs(p.daily) * barScale;
      const y = p.daily > 0 ? scaleY(0) - h : scaleY(0);
      const cls = p.daily > 0 ? "trend-bar-plus" : "trend-bar-minus";
      return `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="3" height="${Math.max(1, h).toFixed(1)}"></rect>`;
    })
    .join("");
  const latestCum = points[points.length - 1].cum;
  const tone = latestCum > 0 ? "is-plus" : latestCum < 0 ? "is-minus" : "";

  refs.profitTrendChart.innerHTML = `
    <div class="trend-head">
      <span>累計 <strong class="${tone}">${formatYen(latestCum)}</strong></span>
      <span>記録日数 ${recorded}</span>
    </div>
    <svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="直近30日の累計収支と日次収支">
      <line x1="${padX}" y1="${zeroY}" x2="${width - padX}" y2="${zeroY}" class="trend-axis"></line>
      ${barsSvg}
      <path class="trend-line" d="${path}" fill="none"></path>
    </svg>
  `;
}

function renderKanshiHeatmap() {
  if (!refs.kanshiHeatmap) return;
  const { entries } = getDedupedAggregateEntries();
  if (!entries.length) {
    refs.kanshiHeatmap.innerHTML = `<p class="empty-text">過去記録がまだありません。</p>`;
    return;
  }

  // Aggregate avg profit by kanshi×weekday; group by kanshi when total >= 1 record.
  const cellsMap = new Map();
  const kanshiSet = new Map(); // kanshi -> total count (for ranking)
  for (const entry of entries) {
    const date = normalizeTargetDate(entry.targetDate);
    if (!date) continue;
    const profit = Number(entry.profit);
    if (!Number.isFinite(profit)) continue;
    const parts = date.split("-").map((n) => parseInt(n, 10));
    if (parts.length !== 3) continue;
    const weekday = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12)).getUTCDay();
    const key = `${entry.kanshi}__${weekday}`;
    const current = cellsMap.get(key) || { sum: 0, count: 0 };
    current.sum += profit;
    current.count += 1;
    cellsMap.set(key, current);
    kanshiSet.set(entry.kanshi, (kanshiSet.get(entry.kanshi) || 0) + 1);
  }

  // Pick up to 12 most-recorded kanshi so the grid stays readable.
  const kanshiColumns = [...kanshiSet.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k]) => k);

  if (!kanshiColumns.length) {
    refs.kanshiHeatmap.innerHTML = `<p class="empty-text">過去記録がまだありません。</p>`;
    return;
  }

  // Determine color range based on max abs avg across displayed cells.
  let maxAbs = 1;
  for (const kanshi of kanshiColumns) {
    for (let w = 0; w < 7; w += 1) {
      const data = cellsMap.get(`${kanshi}__${w}`);
      if (!data) continue;
      const avg = data.sum / data.count;
      maxAbs = Math.max(maxAbs, Math.abs(avg));
    }
  }

  const headerCols = kanshiColumns
    .map((k) => `<div class="heatmap-col-head">${k}</div>`)
    .join("");

  const rows = WEEKDAYS.map((weekdayLabel, weekdayIndex) => {
    const cells = kanshiColumns
      .map((kanshi) => {
        const data = cellsMap.get(`${kanshi}__${weekdayIndex}`);
        if (!data) {
          return `<div class="heatmap-cell is-empty" title="${kanshi}×${weekdayLabel}曜: 記録なし"></div>`;
        }
        const avg = Math.round(data.sum / data.count);
        const ratio = Math.max(-1, Math.min(1, avg / maxAbs));
        let bg;
        if (ratio > 0) {
          const alpha = 0.2 + ratio * 0.7;
          bg = `rgba(143, 210, 109, ${alpha.toFixed(2)})`;
        } else if (ratio < 0) {
          const alpha = 0.2 + Math.abs(ratio) * 0.7;
          bg = `rgba(222, 106, 99, ${alpha.toFixed(2)})`;
        } else {
          bg = "rgba(255,255,255,0.08)";
        }
        return `
          <div class="heatmap-cell" style="background:${bg}" title="${kanshi}×${weekdayLabel}曜 平均${formatYen(avg)} (${data.count}件)">
            <span class="heatmap-cell-value">${avg > 0 ? "+" : ""}${Math.round(avg / 1000)}k</span>
          </div>
        `;
      })
      .join("");
    return `
      <div class="heatmap-row-head weekday-${weekdayIndex}">${weekdayLabel}</div>
      ${cells}
    `;
  }).join("");

  const columnsStyle = `grid-template-columns: 36px repeat(${kanshiColumns.length}, minmax(36px, 1fr));`;
  refs.kanshiHeatmap.innerHTML = `
    <div class="heatmap" style="${columnsStyle}">
      <div></div>
      ${headerCols}
      ${rows}
    </div>
  `;
}

function buildScoreBreakdownBar(day) {
  // Stacked bar showing relative contribution (absolute values) of each adjustment.
  const segments = [
    { label: "日基準", value: Number(day.record.baseScore) || 0, cls: "seg-base" },
    { label: "月", value: Number(day.monthContext.adjustment) || 0, cls: "seg-month" },
    { label: "日付", value: Number(day.specialDateContext.adjustment) || 0, cls: "seg-special" },
    { label: "質感", value: Number(day.playStyle.adjustment) || 0, cls: "seg-play" },
    { label: "曜日", value: Number(day.weekdayContext.adjustment) || 0, cls: "seg-weekday" }
  ];
  const totalAbs = segments.reduce((acc, seg) => acc + Math.abs(seg.value), 0);
  if (totalAbs <= 0) return "";
  const bars = segments
    .filter((seg) => Math.abs(seg.value) > 0)
    .map((seg) => {
      const pct = (Math.abs(seg.value) / totalAbs) * 100;
      const sign = seg.value > 0 ? "+" : "";
      return `
        <div class="breakdown-seg ${seg.cls} ${seg.value < 0 ? "is-minus" : ""}" style="flex: ${pct.toFixed(2)};" title="${seg.label} ${sign}${seg.value}">
          <span class="breakdown-label">${seg.label}</span>
          <span class="breakdown-value">${sign}${seg.value}</span>
        </div>
      `;
    })
    .join("");
  return `
    <section class="score-breakdown">
      <h4>スコア内訳</h4>
      <div class="breakdown-bar">${bars}</div>
    </section>
  `;
}

function buildSameKanshiComparison(kanshi, currentDateKey) {
  if (!kanshi) return "";
  const { entries } = getDedupedAggregateEntries();
  const matches = entries
    .filter((entry) => entry.kanshi === kanshi && normalizeTargetDate(entry.targetDate) !== currentDateKey)
    .map((entry) => ({
      date: normalizeTargetDate(entry.targetDate),
      profit: Number(entry.profit),
      memo: entry.memo || ""
    }))
    .filter((entry) => Number.isFinite(entry.profit))
    .sort((left, right) => (left.date < right.date ? 1 : -1))
    .slice(0, 5);

  if (!matches.length) {
    return `
      <section class="same-kanshi">
        <h4>同じ ${escapeHtml(kanshi)} の過去</h4>
        <p class="empty-text">過去の記録はまだありません。</p>
      </section>
    `;
  }

  const totals = matches.reduce(
    (acc, m) => {
      acc.sum += m.profit;
      if (m.profit > 0) acc.wins += 1;
      if (m.profit < 0) acc.losses += 1;
      return acc;
    },
    { sum: 0, wins: 0, losses: 0 }
  );
  const avg = Math.round(totals.sum / matches.length);
  const avgClass = avg > 0 ? "is-plus" : avg < 0 ? "is-minus" : "";

  const rows = matches
    .map(
      (m) => `
        <li class="same-kanshi-item">
          <span class="same-kanshi-date">${m.date}</span>
          <span class="same-kanshi-profit ${m.profit >= 0 ? "is-plus" : "is-minus"}">${formatYen(m.profit)}</span>
          ${m.memo ? `<span class="same-kanshi-memo">${escapeHtml(m.memo)}</span>` : ""}
        </li>
      `
    )
    .join("");

  return `
    <section class="same-kanshi">
      <h4>同じ ${escapeHtml(kanshi)} の過去 <small>${matches.length}件</small></h4>
      <div class="same-kanshi-summary">
        <span>平均 <strong class="${avgClass}">${formatYen(avg)}</strong></span>
        <span>勝 ${totals.wins} / 負 ${totals.losses}</span>
      </div>
      <ul class="same-kanshi-list">${rows}</ul>
    </section>
  `;
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
    hydrateRemoteDashboard().then(() => drainPendingSyncQueue());
  }, CONFIG.syncIntervalMs);

  window.addEventListener("focus", () => {
    hydrateRemoteDashboard().then(() => drainPendingSyncQueue());
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      hydrateRemoteDashboard().then(() => drainPendingSyncQueue());
    }
  });

  window.addEventListener("online", () => {
    setFormStatus("オンラインに復帰しました。保留中の記録を送信しています。", "info");
    drainPendingSyncQueue();
  });
  window.addEventListener("offline", () => {
    setFormStatus("オフラインです。保存は端末内に保留されます。", "warn");
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

  const existingEntry = state.editingEntryId
    ? state.localEntries.find((e) => e.id === state.editingEntryId)
    : null;

  const entry = {
    id: existingEntry ? existingEntry.id : createEntryId(),
    createdAt: existingEntry ? existingEntry.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetDate,
    kanshi: getKanshiForDateKey(targetDate, CONFIG),
    profit,
    memo: String(formData.get("memo") || "").trim(),
    // Starts pending. postEntryToSheets marks it synced, or it stays pending
    // so the offline queue can retry it later when connectivity returns.
    pendingSync: CONFIG.syncEndpoint ? true : false
  };

  refs.saveButton.disabled = true;
  state.selectedDateKey = targetDate;
  const wasEditing = state.editingEntryId === entry.id;

  try {
    if (CONFIG.syncEndpoint && !wasEditing) {
      const synced = await postEntryToSheets(entry);
      if (synced) {
        refs.resultForm.reset();
        refs.playDateInput.value = targetDate;
        updateFormPreview();
        setFormStatus("Google Sheets に保存し、カレンダーにも反映しました。", "success");
        state.editingEntryId = null;
        // Any previously-queued entries can now be drained.
        drainPendingSyncQueue();
        render();
        return;
      }
    }

    addLocalEntry(entry);
    refs.resultForm.reset();
    refs.playDateInput.value = targetDate;
    updateFormPreview();
    setFormStatus(
      wasEditing
        ? "ローカル記録を更新しました。Sheets 側には反映されないため、必要なら再入力してください。"
        : "保存しました。同期 URL を設定するとシートにも反映されます。",
      "info"
    );
    state.editingEntryId = null;
    render();
  } catch (error) {
    addLocalEntry(entry);
    refs.resultForm.reset();
    refs.playDateInput.value = targetDate;
    updateFormPreview();
    setFormStatus("通信に失敗したため一時的に保存しました。後で同期を再試行できます。", "warn");
    state.editingEntryId = null;
    render();
  } finally {
    refs.saveButton.disabled = false;
  }
}

function addLocalEntry(entry) {
  const recordsBefore = getComputedRecords();
  const nextRecords = applyEntriesToRecords(recordsBefore, [entry]);
  entry.liveScore = buildDayInfo(entry.targetDate, nextRecords, getActiveConfig()).record.score;
  const existingIndex = state.localEntries.findIndex((e) => e.id === entry.id);
  if (existingIndex >= 0) {
    state.localEntries[existingIndex] = entry;
  } else {
    state.localEntries.unshift(entry);
  }
  persistLocalEntries();
}

async function postEntryToSheets(entry) {
  const response = await fetch(CONFIG.syncEndpoint, {
    method: "POST",
    headers: {
      // Apps Script は application/json だと preflight で落ちやすいので、
      // simple request 扱いになる text/plain で JSON を送る。
      "Content-Type": "text/plain;charset=utf-8",
      Accept: "application/json"
    },
    body: JSON.stringify({
      action: "addResult",
      secret: CONFIG.syncSecret || "",
      entry
    })
  });

  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (error) {
    throw new Error("invalid sync response");
  }
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

// Retries any localEntries marked pendingSync. Entries that successfully
// appear in remoteEntries (by id or by date+profit) are removed from the
// local list to avoid duplicates. Safe to call repeatedly.
async function drainPendingSyncQueue() {
  if (!CONFIG.syncEndpoint) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const pending = state.localEntries.filter((e) => e.pendingSync);
  if (!pending.length) return;
  let changed = false;
  for (const entry of pending) {
    try {
      await postEntryToSheets(entry);
      entry.pendingSync = false;
      changed = true;
      // If the server echoed the same entry (by id or matching date), drop
      // the local copy so we don't double-count.
      const matched = state.remoteEntries.some((r) => {
        if (r?.id && entry.id && r.id === entry.id) return true;
        const sameDate = normalizeTargetDate(r?.targetDate) === normalizeTargetDate(entry.targetDate);
        const sameProfit = Number(r?.profit) === Number(entry.profit);
        return sameDate && sameProfit;
      });
      if (matched) {
        state.localEntries = state.localEntries.filter((e) => e.id !== entry.id);
      }
    } catch (error) {
      // Leave it pending for the next retry; stop so we don't hammer the endpoint.
      break;
    }
  }
  if (changed) {
    persistLocalEntries();
    render();
  }
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
