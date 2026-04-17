(function () {
  const S = window.VeroTrackStorage;
  const B = window.VeroTrackBurn;
  const G = window.VeroTrackGamify;
  const T = window.VeroTrackTips;
  const Auth = window.VeroTrackAuth;
  const AI = window.VeroTrackGemini;

  let data = null;
  let isInitialized = false;
  let statusTimer = null;
  let activeTab = 'home';
  let historyDirty = true;
  let tipLoaded = false;
  let aiFoodDraft = null;
  let aiExerciseDraft = null;
  let syncSessionCache = {
    checkedAt: 0,
    session: null,
    timedOut: false,
    failed: false,
  };
  let autoCloudResume = {
    inFlight: false,
    lastAttemptAt: 0,
  };
  const OVERLAY_IDS = ['modal-overlay', 'settings-overlay', 'eng-exercise-sheet'];
  let lastOverlayTrigger = null;

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function cacheSharedData(nextData) {
    if (!nextData || typeof nextData !== 'object') return;
    S._cachedData = nextData;
    window.__VT_APP_DATA = nextData;
  }

  function hasCloudIdentityMismatch(session, appUserEmail) {
    const appEmail = normalizeEmail(appUserEmail);
    const cloudEmail = normalizeEmail(session && session.user ? session.user.email : '');
    return !!(appEmail && cloudEmail && appEmail !== cloudEmail);
  }

  async function getCurrentUserEmailSafe() {
    if (!Auth || typeof Auth.getCurrentUser !== 'function') return null;
    try {
      return await Auth.getCurrentUser();
    } catch {
      return null;
    }
  }

  function markOverlayState(node, visible) {
    if (!node) return;
    node.hidden = !visible;
    node.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function hasVisibleOverlay() {
    return OVERLAY_IDS.some((id) => {
      const node = document.getElementById(id);
      return !!(node && !node.hidden);
    });
  }

  function syncBodyScrollLock() {
    document.body.style.overflow = hasVisibleOverlay() ? 'hidden' : '';
  }

  function rememberOverlayTrigger() {
    const active = document.activeElement;
    lastOverlayTrigger = active instanceof HTMLElement ? active : null;
  }

  function restoreOverlayTriggerFocus() {
    if (lastOverlayTrigger && document.contains(lastOverlayTrigger)) {
      try {
        lastOverlayTrigger.focus({ preventScroll: true });
      } catch {
        // no-op
      }
    }
    lastOverlayTrigger = null;
  }

  function closeExerciseSheetSafe() {
    const sheet = document.getElementById('eng-exercise-sheet');
    if (!sheet || sheet.hidden) return false;

    if (window.VTSession && typeof window.VTSession.closeExerciseSheet === 'function') {
      return window.VTSession.closeExerciseSheet();
    }

    sheet.classList.remove('is-open');
    markOverlayState(sheet, false);
    syncBodyScrollLock();
    return true;
  }

  function closeTopOverlay() {
    const sheet = document.getElementById('eng-exercise-sheet');
    if (sheet && !sheet.hidden) {
      return closeExerciseSheetSafe();
    }
    if (els.settingsOverlay && !els.settingsOverlay.hidden) {
      closeSettings();
      return true;
    }
    if (els.modalOverlay && !els.modalOverlay.hidden) {
      closeModal();
      return true;
    }
    return false;
  }

  function resetTransientOverlays() {
    OVERLAY_IDS.forEach((id) => {
      const node = document.getElementById(id);
      if (!node) return;
      markOverlayState(node, false);
      if (id === 'eng-exercise-sheet') {
        node.classList.remove('is-open');
      }
    });
    syncBodyScrollLock();
  }

  window.addEventListener('vt:sheet-visibility-change', syncBodyScrollLock);

  async function initializeApp() {
    if (!S || typeof S.load !== 'function') {
      console.error('Storage is unavailable.');
      return;
    }

    try {
      // Check authentication first
      const isAuthenticated = Auth && typeof Auth.isAuthenticated === 'function'
        ? await Auth.isAuthenticated()
        : true;
      if (!isAuthenticated) {
        // Auth UI will handle showing the login screen
        return;
      }

      // Get current user email
      const email = await getCurrentUserEmailSafe();

      // Load user data
      data = await S.load(email);
      cacheSharedData(data);
      if (email && S.syncWithCloud) {
        data = await S.syncWithCloud(data, email);
        cacheSharedData(data);
      }

      isInitialized = true;
      startApp();
    } catch (err) {
      console.error('Failed to load user data:', err);
      const email = await getCurrentUserEmailSafe();
      data = await S.load(email);
      cacheSharedData(data);
      if (email && S.syncWithCloud) {
        data = await S.syncWithCloud(data, email);
        cacheSharedData(data);
      }
      isInitialized = true;
      startApp();
    }
  }

  function startApp() {
    if (!isInitialized || startApp._started) return;
    startApp._started = true;
    resetTransientOverlays();

    cacheSharedData(data);

    fillMetSelect();
    updateStatusTime();
    if (!statusTimer) {
      statusTimer = setInterval(updateStatusTime, 60000);
    }
    today();
    ensureAISettingsShape();
    hydrateAIFromDataSettings();
    applyTheme();
    refreshAIStatusFromSettings();
    renderAll(true);
    renderRecentMeals();
    if (!tipLoaded) {
      loadTip();
      tipLoaded = true;
    }

    if (S.supabase) {
      S.supabase.auth.onAuthStateChange(async (_event, session) => {
        syncSessionCache = {
          checkedAt: Date.now(),
          session: session || null,
          timedOut: false,
          failed: false,
        };
        updateSyncUI();

        const email = await getCurrentUserEmailSafe();
        if (!email) return;

        if (hasCloudIdentityMismatch(session, email)) {
          showToast('Cloud account mismatch. Sign out cloud and reconnect with the same email.', true);
          try {
            await S.supabase.auth.signOut();
          } catch {
            // no-op
          }
          syncSessionCache = {
            checkedAt: Date.now(),
            session: null,
            timedOut: false,
            failed: false,
          };
          updateSyncUI();
          return;
        }

        data = await S.syncWithCloud(data, email);
        cacheSharedData(data);
        renderAll(true);
      });
      updateSyncUI();
    }
  }

  // Initialize app on page load
  document.addEventListener('DOMContentLoaded', initializeApp);

  const METER_R = 92;
  const METER_LEN = 2 * Math.PI * METER_R;

  const BADGE_ICONS = {
    first_meal: '🍽',
    streak_7: '🔥',
    xp_1k: '⚡',
    profile_pro: '📐',
  };

  const els = {
    toast: document.getElementById('toast'),
    statusTime: document.getElementById('status-time'),
    profileBanner: document.getElementById('profile-banner'),
    btnBannerSettings: document.getElementById('btn-banner-settings'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    homeGreeting: document.getElementById('home-greeting'),
    homeDate: document.getElementById('home-date'),
    homeProtein: document.getElementById('home-protein'),
    homeSteps: document.getElementById('home-steps'),
    homeWater: document.getElementById('home-water'),
    homeWorkout: document.getElementById('home-workout'),
    homeWorkoutCard: document.getElementById('home-workout-card'),
    homeSupplements: document.getElementById('home-supplements'),
    homeStreak: document.getElementById('home-streak'),
    homeStreakNum: document.getElementById('home-streak-num'),
    proteinFocusCurrent: document.getElementById('protein-focus-current'),
    proteinFocusGoal: document.getElementById('protein-focus-goal'),
    proteinFocusTrack: document.getElementById('protein-focus-track'),
    proteinFocusFill: document.getElementById('protein-focus-fill'),
    proteinFocusNote: document.getElementById('protein-focus-note'),
    homeCaloriesMain: document.getElementById('home-calories-main'),
    homeStepsMain: document.getElementById('home-steps-main'),
    homeBurnMain: document.getElementById('home-burn-main'),
    homeWorkoutMain: document.getElementById('home-workout-main'),
    xpLevel: document.getElementById('xp-level'),
    xpTotal: document.getElementById('xp-total'),
    xpBarWrap: document.getElementById('xp-bar-wrap'),
    xpBarFill: document.getElementById('xp-bar-fill'),
    xpNext: document.getElementById('xp-next'),
    badgesMini: document.getElementById('badges-mini'),
    meterArc: document.getElementById('meter-arc'),
    meterKcal: document.getElementById('meter-kcal'),
    meterTarget: document.getElementById('meter-target'),
    heroBurn: document.getElementById('hero-burn'),
    heroBudget: document.getElementById('hero-budget'),
    heroFootnote: document.getElementById('hero-footnote'),
    heroIn: document.getElementById('hero-in'),
    stripProtein: document.getElementById('strip-protein'),
    stripProteinPct: document.getElementById('strip-protein-pct'),
    stripSteps: document.getElementById('strip-steps'),
    stripStepsPct: document.getElementById('strip-steps-pct'),
    stripWater: document.getElementById('strip-water'),
    stripWaterPct: document.getElementById('strip-water-pct'),
    burnWalk: document.getElementById('burn-walk'),
    burnTrain: document.getElementById('burn-train'),
    burnRest: document.getElementById('burn-rest'),
    btnToggleBreakdown: document.getElementById('btn-toggle-breakdown'),
    panelBreakdown: document.getElementById('panel-breakdown'),
    challengeStatus: document.getElementById('challenge-status'),
    challengeTitle: document.getElementById('challenge-title'),
    challengeDesc: document.getElementById('challenge-desc'),
    btnChallengeClaim: document.getElementById('btn-challenge-claim'),
    tipText: document.getElementById('tip-text'),
    tipSource: document.getElementById('tip-source'),
    tipLoading: document.getElementById('tip-loading'),
    btnTipRefresh: document.getElementById('btn-tip-refresh'),
    formFood: document.getElementById('form-food'),
    foodName: document.getElementById('food-name'),
    btnFoodAnalyze: document.getElementById('btn-food-analyze'),
    foodPreview: document.getElementById('food-ai-preview'),
    foodPreviewSource: document.getElementById('food-ai-source'),
    foodCalories: document.getElementById('food-calories'),
    foodProtein: document.getElementById('food-protein'),
    foodCarbs: document.getElementById('food-carbs'),
    foodFats: document.getElementById('food-fats'),
    foodFiber: document.getElementById('food-fiber'),
    foodSugar: document.getElementById('food-sugar'),
    foodRecentWrap: document.getElementById('food-recent-wrap'),
    foodRecent: document.getElementById('food-recent'),
    foodList: document.getElementById('food-list'),
    foodEmpty: document.getElementById('food-empty'),
    formSteps: document.getElementById('form-steps'),
    stepsInput: document.getElementById('steps-input'),
    stepsQuick: document.getElementById('steps-quick'),
    waterTotal: document.getElementById('water-total'),
    waterChips: document.getElementById('water-chips'),
    formWaterCustom: document.getElementById('form-water-custom'),
    waterCustom: document.getElementById('water-custom'),
    supplementList: document.getElementById('supplement-list'),
    formSupplementCustom: document.getElementById('form-supplement-custom'),
    supplementNew: document.getElementById('supplement-new'),
    btnWorkoutToggle: document.getElementById('btn-workout-toggle'),
    workoutHint: document.getElementById('workout-hint'),
    workoutTabBurn: document.getElementById('workout-tab-burn'),
    btnExerciseInspire: document.getElementById('btn-exercise-inspire'),
    btnExerciseAnalyze: document.getElementById('btn-exercise-analyze'),
    exerciseAIPreview: document.getElementById('exercise-ai-preview'),
    exerciseAIMeta: document.getElementById('exercise-ai-meta'),
    formExercise: document.getElementById('form-exercise'),
    exName: document.getElementById('ex-name'),
    exMet: document.getElementById('ex-met'),
    exDuration: document.getElementById('ex-duration'),
    exSets: document.getElementById('ex-sets'),
    exReps: document.getElementById('ex-reps'),
    exWeight: document.getElementById('ex-weight'),
    exerciseList: document.getElementById('exercise-list'),
    exerciseEmpty: document.getElementById('exercise-empty'),
    weekChart: document.getElementById('week-chart'),
    weekSummary: document.getElementById('week-summary'),
    historyList: document.getElementById('history-list'),
    historyEmpty: document.getElementById('history-empty'),
    modalOverlay: document.getElementById('modal-overlay'),
    modalTitle: document.getElementById('modal-title'),
    modalBody: document.getElementById('modal-body'),
    modalClose: document.getElementById('modal-close'),
    settingsOverlay: document.getElementById('settings-overlay'),
    settingsClose: document.getElementById('settings-close'),
    setWeightKg: document.getElementById('set-weight-kg'),
    setHeight: document.getElementById('set-height'),
    setAge: document.getElementById('set-age'),
    setSex: document.getElementById('set-sex'),
    bmrReadout: document.getElementById('bmr-readout'),
    setCalGoal: document.getElementById('set-cal-goal'),
    setProtGoal: document.getElementById('set-prot-goal'),
    setStepGoal: document.getElementById('set-step-goal'),
    setWaterGoal: document.getElementById('set-water-goal'),
    setTheme: document.getElementById('set-theme'),
    setGeminiKey: document.getElementById('set-gemini-key'),
    setGeminiModel: document.getElementById('set-gemini-model'),
    aiStatus: document.getElementById('ai-status'),
    aiStatusIndicator: document.getElementById('ai-status-indicator'),
    aiStatusText: document.getElementById('ai-status-text'),
    btnAiSave: document.getElementById('btn-ai-save'),
    btnAiTest: document.getElementById('btn-ai-test'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    btnExport: document.getElementById('btn-export'),
    importFile: document.getElementById('import-file'),
    btnSyncLogin: document.getElementById('btn-sync-login'),
    btnSyncLogout: document.getElementById('btn-sync-logout'),
    syncStatus: document.getElementById('sync-status'),
  };

  let toastTimer = null;
  let tipLoading = false;

  function showToast(message, isError) {
    els.toast.textContent = message;
    els.toast.style.borderColor = isError ? 'var(--danger)' : 'var(--border)';
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove('show');
    }, 2600);
  }

  async function persist() {
    try {
      const email = await Auth.getCurrentUser();
      cacheSharedData(data);
      if (!await S.save(data, email)) {
        showToast('Could not save data', true);
      }
    } catch (e) {
      console.error('Persist error:', e);
      showToast('Could not save data', true);
    }
  }

  function getDay(key) {
    if (!data.days[key]) {
      data.days[key] = S.emptyDay();
      data.days[key].supplementState = S.ensureCatalogIds(data.catalog, {});
    } else {
      data.days[key] = S.migrateDay(data.days[key]);
      data.days[key].supplementState = S.ensureCatalogIds(
        data.catalog,
        data.days[key].supplementState || {}
      );
    }
    return data.days[key];
  }

  function today() {
    return getDay(S.todayKey());
  }

  function readDay(key) {
    if (!data.days[key]) {
      return S.emptyDay();
    }
    const cloned = JSON.parse(JSON.stringify(data.days[key]));
    const day = S.migrateDay(cloned);
    day.supplementState = S.ensureCatalogIds(data.catalog, day.supplementState || {});
    return day;
  }

  function parseNonNegativeInt(value, label) {
    const t = String(value).trim();
    if (t === '') {
      showToast(`Enter ${label}`, true);
      return null;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      showToast(`${label} must be a whole number ≥ 0`, true);
      return null;
    }
    return n;
  }

  function parsePositiveInt(value, label) {
    const t = String(value).trim();
    if (t === '') {
      showToast(`Enter ${label}`, true);
      return null;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      showToast(`${label} must be at least 1`, true);
      return null;
    }
    return n;
  }

  function parseNonNegativeNumber(value, label) {
    const t = String(value).trim();
    if (t === '') {
      showToast(`Enter ${label}`, true);
      return null;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) {
      showToast(`${label} must be ≥ 0`, true);
      return null;
    }
    return n;
  }

  function parseOptionalNonNegativeNumber(value, label) {
    const t = String(value).trim();
    if (t === '') return 0;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) {
      showToast(`${label} must be ≥ 0`, true);
      return null;
    }
    return n;
  }

  function parseRequiredNonEmpty(value, label) {
    const t = String(value).trim();
    if (!t) {
      showToast(`${label} cannot be empty`, true);
      return null;
    }
    return t;
  }

  function foodTotals(day) {
    let cals = 0;
    let prot = 0;
    let carbs = 0;
    let fats = 0;
    let fiber = 0;
    let sugar = 0;
    day.food.forEach((f) => {
      cals += f.calories;
      prot += f.protein;
      carbs += f.carbs || 0;
      fats += f.fats || 0;
      fiber += (f.nutrients && f.nutrients.fiber) || 0;
      sugar += (f.nutrients && f.nutrients.sugar) || 0;
    });
    return { calories: cals, protein: prot, carbs, fats, fiber, sugar };
  }

  function supplementsTakenCount(day) {
    let taken = 0;
    data.catalog.forEach((s) => {
      if (day.supplementState[s.id]) {
        taken += 1;
      }
    });
    return { taken, total: data.catalog.length };
  }

  function isWorkoutDoneForKey(dateKey) {
    const d = data.days[dateKey];
    return !!(d && d.workoutDone);
  }

  function workoutStreak() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    let d = new Date(start);

    if (!isWorkoutDoneForKey(formatDateKey(d))) {
      d.setDate(d.getDate() - 1);
    }

    let streak = 0;
    while (isWorkoutDoneForKey(formatDateKey(d))) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDisplayDate(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function roundProt(n) {
    return Math.round(n * 10) / 10;
  }

  function pctDisplay(n, d) {
    if (!d || d <= 0) return '—';
    const p = Math.round((n / d) * 100);
    return `${p}%`;
  }

  function updateStatusTime() {
    if (!els.statusTime) return;
    const now = new Date();
    els.statusTime.textContent = now.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function greetingLine() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function showProfileBanner() {
    const p = data.profile;
    const need = !p || p.weightKg <= 0 || p.heightCm <= 0;
    els.profileBanner.hidden = !need;
  }

  function processGamifyGoals() {
    const key = S.todayKey();
    const day = getDay(key);
    const game = G.ensureGame(data);
    const f = G.dayFlags(game, key);
    const totals = foodTotals(day);
    const goals = data.goals;
    let changed = false;

    if (!f.stepGoalXp && goals.stepGoal > 0 && day.steps >= goals.stepGoal) {
      f.stepGoalXp = true;
      G.awardXp(game, G.XP_STEPS_GOAL);
      changed = true;
    }
    if (!f.proteinGoalXp && goals.proteinTargetG > 0 && totals.protein >= goals.proteinTargetG) {
      f.proteinGoalXp = true;
      G.awardXp(game, G.XP_PROTEIN_GOAL);
      changed = true;
    }
    if (!f.waterGoalXp && goals.waterGoalMl > 0 && (day.waterMl || 0) >= goals.waterGoalMl) {
      f.waterGoalXp = true;
      G.awardXp(game, G.XP_WATER_GOAL);
      changed = true;
    }
    if (changed) {
      persist();
      showToast('Goal crushed · XP earned');
    }
  }

  function checkBadges() {
    const game = G.ensureGame(data);
    const day = today();
    let b = false;
    if (day.food.length > 0 && G.addBadge(game, 'first_meal')) {
      showToast('Badge unlocked · First meal');
      b = true;
    }
    if (workoutStreak() >= 7 && G.addBadge(game, 'streak_7')) {
      showToast('Badge unlocked · Week warrior');
      b = true;
    }
    if (game.xp >= 1000 && G.addBadge(game, 'xp_1k')) {
      showToast('Badge unlocked · Momentum');
      b = true;
    }
    const p = data.profile;
    if (p && p.weightKg > 0 && p.heightCm > 0 && G.addBadge(game, 'profile_pro')) {
      showToast('Badge unlocked · Metrics set');
      b = true;
    }
    if (b) persist();
  }

  function renderGamifyHeader() {
    const game = G.ensureGame(data);
    const lvl = G.levelFromXp(game.xp);
    const prog = G.xpProgress(game.xp);
    els.xpLevel.textContent = String(lvl);
    els.xpTotal.textContent = String(game.xp);
    const pct = Math.round(prog.pct * 100);
    els.xpBarFill.style.width = `${pct}%`;
    els.xpBarWrap.setAttribute('aria-valuenow', String(pct));
    const need = prog.nextAt - prog.inLevel;
    els.xpNext.textContent = need <= 0 ? 'Max segment — keep going' : `${need} XP to next tier`;

    els.badgesMini.innerHTML = '';
    game.badges.forEach((id) => {
      const span = document.createElement('span');
      span.className = 'badge-pill';
      span.textContent = BADGE_ICONS[id] || '★';
      span.title = id.replace(/_/g, ' ');
      els.badgesMini.appendChild(span);
    });
  }

  function renderChallenge(key, day, totals) {
    const game = G.ensureGame(data);
    const daily = G.ensureDailyChallenge(game, key);
    const goals = data.goals;
    const ctx = { day, totals, goals };
    const complete = G.isChallengeComplete(daily, ctx);

    els.challengeTitle.textContent = daily.title || 'Daily quest';
    els.challengeDesc.textContent = daily.desc || '';

    if (daily.claimed) {
      els.challengeStatus.textContent = 'Claimed';
      els.btnChallengeClaim.hidden = true;
    } else if (complete) {
      els.challengeStatus.textContent = 'Complete';
      els.btnChallengeClaim.hidden = false;
      els.btnChallengeClaim.textContent = `Claim +${G.XP_CHALLENGE} XP`;
    } else {
      els.challengeStatus.textContent = 'In progress';
      els.btnChallengeClaim.hidden = true;
    }
  }

  function renderHome() {
    const key = S.todayKey();
    const day = getDay(key);
    const totals = foodTotals(day);
    const sup = supplementsTakenCount(day);
    const streak = workoutStreak();
    const burn = B.totalActiveBurn(day, data.profile);
    const goals = data.goals;
    const budget = B.calorieBudgetRemaining(totals.calories, goals, burn.total);
    const resting = B.restingBurnSoFarKcal(data.profile);

    if (els.homeGreeting) {
      els.homeGreeting.textContent = greetingLine();
    }
    els.homeDate.textContent = formatDisplayDate(key);

    els.homeProtein.textContent = String(roundProt(totals.protein));
    els.homeSteps.textContent = String(day.steps || 0);
    els.homeWater.textContent = String(day.waterMl || 0);
    els.heroIn.textContent = String(totals.calories);

    const proteinPct = goals.proteinTargetG > 0 ? clampPct((totals.protein / goals.proteinTargetG) * 100) : 0;
    if (els.proteinFocusCurrent) els.proteinFocusCurrent.textContent = String(roundProt(totals.protein));
    if (els.proteinFocusGoal) els.proteinFocusGoal.textContent = String(goals.proteinTargetG || 0);
    if (els.proteinFocusFill) els.proteinFocusFill.style.width = `${proteinPct}%`;
    if (els.proteinFocusTrack) {
      els.proteinFocusTrack.setAttribute('aria-valuenow', String(Math.round(proteinPct)));
    }
    if (els.proteinFocusNote) {
      const remain = Math.max(0, roundProt((goals.proteinTargetG || 0) - totals.protein));
      els.proteinFocusNote.textContent = remain > 0 ? `${remain} g remaining` : 'Goal reached';
    }

    if (els.homeCaloriesMain) els.homeCaloriesMain.textContent = `${totals.calories} kcal`;
    if (els.homeStepsMain) els.homeStepsMain.textContent = String(day.steps || 0);
    if (els.homeBurnMain) els.homeBurnMain.textContent = `${burn.total} kcal`;

    els.meterKcal.textContent = String(totals.calories);
    els.meterTarget.textContent = `of ${goals.calorieTarget} kcal goal`;
    const calRatio = goals.calorieTarget > 0 ? Math.min(1, totals.calories / goals.calorieTarget) : 0;
    if (els.meterArc) {
      els.meterArc.style.strokeDasharray = String(METER_LEN);
      els.meterArc.style.strokeDashoffset = String(METER_LEN * (1 - calRatio));
    }

    els.heroBurn.textContent = String(burn.total);
    els.heroBudget.textContent = budget == null ? '—' : String(budget);
    els.heroFootnote.textContent =
      budget == null
        ? 'Set a calorie target in Settings for budget.'
        : 'Budget = target + active burn − food.';

    els.stripProtein.textContent = `${roundProt(totals.protein)}g`;
    els.stripProteinPct.textContent = pctDisplay(totals.protein, goals.proteinTargetG);
    els.stripSteps.textContent = String(day.steps || 0);
    els.stripStepsPct.textContent = pctDisplay(day.steps || 0, goals.stepGoal);
    els.stripWater.textContent = `${day.waterMl || 0} ml`;
    els.stripWaterPct.textContent = pctDisplay(day.waterMl || 0, goals.waterGoalMl);

    if (day.workoutDone) {
      els.homeWorkout.textContent = 'Done';
      els.homeWorkout.classList.remove('pending');
      els.homeWorkoutCard.classList.add('done');
      els.homeWorkoutCard.classList.remove('pending');
      els.homeWorkout.classList.remove('pending');
      if (els.homeWorkoutMain) {
        els.homeWorkoutMain.textContent = 'Done';
        els.homeWorkoutMain.classList.add('done');
      }
    } else {
      els.homeWorkout.textContent = 'Pending';
      els.homeWorkout.classList.add('pending');
      els.homeWorkoutCard.classList.remove('done');
      els.homeWorkoutCard.classList.add('pending');
      if (els.homeWorkoutMain) {
        els.homeWorkoutMain.textContent = 'Pending';
        els.homeWorkoutMain.classList.remove('done');
      }
    }

    els.homeSupplements.textContent = `${sup.taken} / ${sup.total}`;
    els.homeStreakNum.textContent = String(streak);
    els.homeStreak.textContent =
      streak === 1 ? 'Consecutive workout days' : 'Consecutive workout days';

    els.burnWalk.textContent = `${burn.walk} kcal`;
    els.burnTrain.textContent = `${burn.train} kcal`;
    els.burnRest.textContent = resting > 0 ? `${resting} kcal` : '—';

    showProfileBanner();
    processGamifyGoals();
    checkBadges();
    renderGamifyHeader();
    renderChallenge(key, day, totals);
  }

  async function loadTip() {
    if (tipLoading || !els.tipText) return;
    tipLoading = true;
    els.tipLoading.hidden = false;
    els.btnTipRefresh.disabled = true;
    try {
      const tip = await T.fetchFreshTip();
      els.tipText.textContent = tip.text;
      els.tipSource.textContent = tip.source || '';
    } catch {
      els.tipText.textContent =
        'Connection hiccup. Tap refresh — we rotate live quotes, advice, and facts from public APIs.';
      els.tipSource.textContent = 'Offline hint';
    }
    els.tipLoading.hidden = true;
    els.btnTipRefresh.disabled = false;
    tipLoading = false;
  }

  function renderFoodList() {
    const day = today();
    els.foodList.innerHTML = '';
    if (day.food.length === 0) {
      els.foodEmpty.hidden = false;
      return;
    }
    els.foodEmpty.hidden = true;
    day.food
      .slice()
      .reverse()
      .forEach((f) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <div class="entry-main">
            <div class="entry-title"></div>
            <div class="entry-meta"></div>
          </div>
          <button type="button" class="btn-remove" data-id="${f.id}">Remove</button>
        `;
        li.querySelector('.entry-title').textContent = f.name;
        const metaLine = [
          `${f.calories} kcal`,
          `${roundProt(f.protein)} g protein`,
          `${roundProt(f.carbs || 0)} g carbs`,
          `${roundProt(f.fats || 0)} g fats`,
        ].join(' · ');
        const sourceLine = f.source ? ` (${f.source})` : '';
        li.querySelector('.entry-meta').textContent = `${metaLine}${sourceLine}`;
        li.querySelector('.btn-remove').addEventListener('click', () => {
          day.food = day.food.filter((x) => x.id !== f.id);
          persist();
          renderAll();
          showToast('Entry removed');
        });
        els.foodList.appendChild(li);
      });
  }

  function renderStepsInput() {
    const day = today();
    els.stepsInput.value = day.steps ? String(day.steps) : '';
  }

  function renderWater() {
    const day = today();
    const g = data.goals.waterGoalMl || 2000;
    els.waterTotal.textContent = `${day.waterMl || 0} / ${g}`;
  }

  function renderSupplements() {
    const day = today();
    els.supplementList.innerHTML = '';
    data.catalog.forEach((s) => {
      const taken = !!day.supplementState[s.id];
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toggle-btn' + (taken ? ' on' : '');
      btn.textContent = taken ? 'Taken' : 'Not taken';
      btn.setAttribute('aria-pressed', taken ? 'true' : 'false');
      btn.addEventListener('click', () => {
        day.supplementState[s.id] = !day.supplementState[s.id];
        persist();
        renderAll();
        showToast(day.supplementState[s.id] ? 'Marked taken' : 'Marked not taken');
      });
      const name = document.createElement('span');
      name.className = 'toggle-name';
      name.textContent = s.name;
      li.appendChild(name);
      li.appendChild(btn);
      els.supplementList.appendChild(li);
    });
  }

  function metLabel(key) {
    return B.MET_LABELS[key] || key;
  }

  function renderWorkoutTab() {
    const day = today();
    const trainBurn = B.trainingBurnFromExercises(day.exercises, data.profile);
    els.workoutTabBurn.textContent = `${trainBurn} kcal`;

    if (day.workoutDone) {
      els.btnWorkoutToggle.textContent = 'Undo workout';
      els.btnWorkoutToggle.classList.remove('btn-primary');
      els.btnWorkoutToggle.classList.add('btn-secondary');
      els.workoutHint.textContent = 'Logged for today.';
    } else {
      els.btnWorkoutToggle.textContent = 'Mark workout done';
      els.btnWorkoutToggle.classList.add('btn-primary');
      els.btnWorkoutToggle.classList.remove('btn-secondary');
      els.workoutHint.textContent = '';
    }

    els.exerciseList.innerHTML = '';
    if (day.exercises.length === 0) {
      els.exerciseEmpty.hidden = false;
    } else {
      els.exerciseEmpty.hidden = true;
      day.exercises
        .slice()
        .reverse()
        .forEach((ex) => {
          const li = document.createElement('li');
          const kcal = B.exerciseLineBurnKcal(ex, data.profile);
          li.innerHTML = `
            <div class="entry-main">
              <div class="entry-title"></div>
              <div class="entry-meta"></div>
            </div>
            <button type="button" class="btn-remove" data-ex-id="${ex.id}">Remove</button>
          `;
          li.querySelector('.entry-title').textContent = ex.name;
          const aiTag = ex.muscleGroup ? ` · ${ex.muscleGroup}` : '';
          li.querySelector('.entry-meta').textContent = `${metLabel(ex.metCategory)}${aiTag} · ${ex.durationMin} min · ${ex.sets}×${ex.reps} @ ${ex.weight} · ~${kcal} kcal`;
          li.querySelector('.btn-remove').addEventListener('click', () => {
            day.exercises = day.exercises.filter((x) => x.id !== ex.id);
            persist();
            renderAll();
            showToast('Exercise removed');
          });
          els.exerciseList.appendChild(li);
        });
    }
  }

  function lastNDayKeys(daysBack) {
    const keys = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    for (let i = 0; i < daysBack; i += 1) {
      keys.push(formatDateKey(d));
      d.setDate(d.getDate() - 1);
    }
    return keys.reverse();
  }

  function renderWeekChart() {
    const keys = lastNDayKeys(30);
    let sumBurn = 0;
    let sumIn = 0;
    const maxBurn = Math.max(
      1,
      ...keys.map((k) => {
        const day = readDay(k);
        return B.totalActiveBurn(day, data.profile).total;
      })
    );

    const chartPx = 100;
    els.weekChart.innerHTML = '';
    keys.forEach((k) => {
      const day = readDay(k);
      const burn = B.totalActiveBurn(day, data.profile).total;
      const totals = foodTotals(day);
      sumBurn += burn;
      sumIn += totals.calories;

      const [y, m, d] = k.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const lbl = dt.toLocaleDateString(undefined, { weekday: 'narrow' });

      const wrap = document.createElement('div');
      wrap.className = 'week-bar';
      const fill = document.createElement('div');
      fill.className = 'week-bar__fill';
      const hPx = Math.max(4, Math.round((burn / maxBurn) * chartPx));
      fill.style.height = `${hPx}px`;
      const lab = document.createElement('span');
      lab.className = 'week-bar__lbl';
      lab.textContent = lbl;
      wrap.appendChild(fill);
      wrap.appendChild(lab);
      els.weekChart.appendChild(wrap);
    });

    const avgBurn = Math.round(sumBurn / Math.max(1, keys.length));
    const avgIn = Math.round(sumIn / Math.max(1, keys.length));
    els.weekSummary.textContent = `Rolling 30d · ${avgIn} kcal in · ${avgBurn} kcal burn (est.).`;
  }

  function renderHistory() {
    const todayK = S.todayKey();
    const keys = Object.keys(data.days)
      .filter((k) => k !== todayK)
      .sort()
      .reverse();

    els.historyList.innerHTML = '';
    if (keys.length === 0) {
      els.historyEmpty.hidden = false;
    } else {
      els.historyEmpty.hidden = true;
    }

    const grouped = {};
    keys.forEach((key) => {
      const [year, month] = key.split('-');
      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][month]) grouped[year][month] = [];
      grouped[year][month].push(key);
    });

    Object.keys(grouped)
      .sort((a, b) => Number(b) - Number(a))
      .forEach((year) => {
        const yearItem = document.createElement('li');
        yearItem.className = 'history-year-card';
        yearItem.innerHTML = `<h3 class="history-year-title">${year}</h3>`;

        Object.keys(grouped[year])
          .sort((a, b) => Number(b) - Number(a))
          .forEach((monthKey, idx) => {
            const monthKeys = grouped[year][monthKey];
            const monthDate = new Date(Number(year), Number(monthKey) - 1, 1);
            const monthLabel = monthDate.toLocaleDateString(undefined, { month: 'long' });

            const monthDetails = document.createElement('details');
            monthDetails.className = 'history-month';
            monthDetails.open = idx === 0;
            monthDetails.innerHTML = `
              <summary><span>${monthLabel}</span><span>${monthKeys.length} days</span></summary>
              <div class="history-days"></div>
            `;

            const daysWrap = monthDetails.querySelector('.history-days');
            monthKeys.forEach((key) => {
              const day = readDay(key);
              const totals = foodTotals(day);
              const burn = B.totalActiveBurn(day, data.profile);
              const sup = supplementsTakenCount(day);
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'history-item';
              button.innerHTML = `
                <div class="history-date"></div>
                <div class="history-summary"></div>
              `;
              button.querySelector('.history-date').textContent = formatDisplayDate(key);
              const w = day.workoutDone ? 'Done' : 'Pending';
              button.querySelector('.history-summary').textContent = `${totals.calories} in · ${burn.total} burn · ${roundProt(
                totals.protein
              )} g · ${day.steps || 0} steps · ${w} · ${sup.taken}/${sup.total} supplements · ${day.waterMl || 0} ml H2O`;
              button.addEventListener('click', () => openDayModal(key));
              daysWrap.appendChild(button);
            });

            yearItem.appendChild(monthDetails);
          });

        els.historyList.appendChild(yearItem);
      });

    renderWeekChart();
    historyDirty = false;
  }

  function openDayModal(dateKey) {
    const day = readDay(dateKey);
    const totals = foodTotals(day);
    const burn = B.totalActiveBurn(day, data.profile);
    els.modalTitle.textContent = formatDisplayDate(dateKey);

    const foodHtml =
      day.food.length === 0
        ? '<p>No food logged.</p>'
        : `<ul>${day.food
            .map(
              (f) =>
                `<li><strong>${escapeHtml(f.name)}</strong> — ${f.calories} kcal, ${roundProt(f.protein)} g protein, ${roundProt(
                  f.carbs || 0
                )} g carbs, ${roundProt(f.fats || 0)} g fats</li>`
            )
            .join('')}</ul>`;

    const exHtml =
      day.exercises.length === 0
        ? '<p>No exercises logged.</p>'
        : `<ul>${day.exercises
            .map((ex) => {
              const k = B.exerciseLineBurnKcal(ex, data.profile);
              return `<li><strong>${escapeHtml(ex.name)}</strong> — ${escapeHtml(metLabel(ex.metCategory))}, ${ex.durationMin} min, ${ex.sets}×${ex.reps} @ ${ex.weight} (~${k} kcal)</li>`;
            })
            .join('')}</ul>`;

    const supLines = data.catalog
      .map((s) => {
        const ok = day.supplementState[s.id];
        return `<li>${escapeHtml(s.name)}: ${ok ? 'Taken' : 'Not taken'}</li>`;
      })
      .join('');

    els.modalBody.innerHTML = `
      <div class="detail-block">
        <h3>Energy</h3>
        <p>${totals.calories} kcal in · ${burn.total} kcal burn (walk ${burn.walk} + train ${burn.train})</p>
        <p>${roundProt(totals.protein)} g protein · ${roundProt(totals.carbs)} g carbs · ${roundProt(totals.fats)} g fats</p>
        <p>${day.steps || 0} steps · Water ${day.waterMl || 0} ml · Fiber ${roundProt(totals.fiber)} g · Sugar ${roundProt(totals.sugar)} g</p>
        <p>Workout: <strong>${day.workoutDone ? 'Done' : 'Pending'}</strong></p>
      </div>
      <div class="detail-block">
        <h3>Supplements</h3>
        <ul>${supLines}</ul>
      </div>
      <div class="detail-block">
        <h3>Food</h3>
        ${foodHtml}
      </div>
      <div class="detail-block">
        <h3>Exercises</h3>
        ${exHtml}
      </div>
    `;

    rememberOverlayTrigger();
    markOverlayState(els.modalOverlay, true);
    syncBodyScrollLock();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function closeModal() {
    if (!els.modalOverlay || els.modalOverlay.hidden) return;
    markOverlayState(els.modalOverlay, false);
    syncBodyScrollLock();
    restoreOverlayTriggerFocus();
  }

  function openSettings() {
    const p = data.profile;
    const g = data.goals;
    ensureAISettingsShape();
    const defaultModel = AI ? AI.defaultModel : 'gemini-2.5-flash-lite';
    const aiSettings = AI ? AI.getSettings() : { apiKey: '', model: '' };
    const aiSaved = data.settings.ai || {};
    els.setWeightKg.value = p.weightKg > 0 ? String(p.weightKg) : '';
    els.setHeight.value = p.heightCm > 0 ? String(p.heightCm) : '';
    els.setAge.value = p.age > 0 ? String(p.age) : '';
    els.setSex.value = p.sex || 'x';
    els.setCalGoal.value = String(g.calorieTarget);
    els.setProtGoal.value = String(g.proteinTargetG);
    els.setStepGoal.value = String(g.stepGoal);
    els.setWaterGoal.value = String(g.waterGoalMl);
    if (els.setTheme) els.setTheme.value = data.settings.theme || 'auto';
    if (els.setGeminiKey) els.setGeminiKey.value = aiSaved.apiKey || aiSettings.apiKey || '';
    if (els.setGeminiModel) els.setGeminiModel.value = aiSaved.model || aiSettings.model || defaultModel;
    refreshAIStatusFromSettings();
    updateBmrReadout();
    rememberOverlayTrigger();
    markOverlayState(els.settingsOverlay, true);
    syncBodyScrollLock();
  }

  function closeSettings() {
    if (!els.settingsOverlay || els.settingsOverlay.hidden) return;
    markOverlayState(els.settingsOverlay, false);
    syncBodyScrollLock();
    restoreOverlayTriggerFocus();
  }

  function updateBmrReadout() {
    const p = {
      weightKg: parseFloat(els.setWeightKg.value) || 0,
      heightCm: parseFloat(els.setHeight.value) || 0,
      age: parseInt(els.setAge.value, 10) || 0,
      sex: els.setSex.value,
    };
    const b = B.bmrKcal(p);
    els.bmrReadout.textContent =
      b > 0 ? `Estimated BMR: ${b} kcal/day (reference only).` : 'Fill weight, height, and age for BMR.';
  }

  function clampPct(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }

  function applyTheme() {
    const theme = (data && data.settings && data.settings.theme) || 'auto';
    if (theme === 'dark' || theme === 'light') {
      document.body.setAttribute('data-theme', theme);
    } else {
      document.body.removeAttribute('data-theme');
    }
  }

  function ensureAISettingsShape() {
    if (!data.settings || typeof data.settings !== 'object') {
      data.settings = {};
    }
    if (!data.settings.ai || typeof data.settings.ai !== 'object') {
      data.settings.ai = {};
    }
    if (typeof data.settings.ai.apiKey !== 'string') {
      data.settings.ai.apiKey = '';
    }
    if (typeof data.settings.ai.model !== 'string' || !data.settings.ai.model.trim()) {
      data.settings.ai.model = (AI && AI.defaultModel) || 'gemini-2.5-flash-lite';
    }
  }

  function hydrateAIFromDataSettings() {
    if (!AI || !data) return;
    ensureAISettingsShape();
    const aiLocal = AI.getSettings();
    const savedApiKey = data.settings.ai.apiKey || '';
    const savedModel = data.settings.ai.model || aiLocal.model || AI.defaultModel;

    if (savedApiKey) {
      AI.setApiKey(savedApiKey);
    } else if (aiLocal.apiKey) {
      data.settings.ai.apiKey = aiLocal.apiKey;
    }

    AI.setModel(savedModel);
    data.settings.ai.model = savedModel;
  }

  function updateAIStatusUI(connected, label) {
    if (!els.aiStatus || !els.aiStatusIndicator || !els.aiStatusText) return;
    els.aiStatus.classList.toggle('connected', !!connected);
    els.aiStatus.classList.toggle('off', !connected);
    if (connected) {
      els.aiStatusIndicator.className = 'status-indicator connected';
      els.aiStatusText.textContent = label || 'AI on';
    } else {
      els.aiStatusIndicator.className = 'status-indicator error';
      els.aiStatusText.textContent = label || 'AI off';
    }
  }

  function refreshAIStatusFromSettings() {
    if (!AI) {
      updateAIStatusUI(false, 'AI unavailable');
      return;
    }
    const aiSettings = AI.getSettings();
    updateAIStatusUI(!!aiSettings.hasApiKey, aiSettings.hasApiKey ? `AI on (${aiSettings.model})` : 'AI off');
  }

  async function saveAISettingsFromInputs() {
    if (!AI) {
      updateAIStatusUI(false, 'AI unavailable');
      return false;
    }

    const key = (els.setGeminiKey && els.setGeminiKey.value) || '';
    const model = (els.setGeminiModel && els.setGeminiModel.value) || AI.defaultModel;

    AI.setApiKey(key);
    AI.setModel(model);
    ensureAISettingsShape();
    data.settings.ai.apiKey = key.trim();
    data.settings.ai.model = model.trim() || AI.defaultModel;

    await persist();
    refreshAIStatusFromSettings();
    return true;
  }

  function renderRecentMeals() {
    if (!els.foodRecentWrap || !els.foodRecent || !AI) return;
    const meals = AI.getRecentMeals();
    els.foodRecent.innerHTML = '';
    if (!Array.isArray(meals) || meals.length === 0) {
      els.foodRecentWrap.hidden = true;
      return;
    }

    meals.forEach((meal) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recent-meal-chip';
      button.textContent = meal;
      button.addEventListener('click', () => {
        els.foodName.value = meal;
        els.foodName.focus();
      });
      els.foodRecent.appendChild(button);
    });
    els.foodRecentWrap.hidden = false;
  }

  function fillFoodFieldsFromDraft(draft) {
    if (!draft) return;
    els.foodCalories.value = String(Math.round(draft.calories || 0));
    els.foodProtein.value = String(roundProt(draft.protein || 0));
    if (els.foodCarbs) els.foodCarbs.value = String(roundProt(draft.carbs || 0));
    if (els.foodFats) els.foodFats.value = String(roundProt(draft.fats || 0));
    if (els.foodFiber) els.foodFiber.value = String(roundProt((draft.nutrients && draft.nutrients.fiber) || 0));
    if (els.foodSugar) els.foodSugar.value = String(roundProt((draft.nutrients && draft.nutrients.sugar) || 0));
  }

  function fillMetSelect() {
    els.exMet.innerHTML = '';
    Object.keys(B.MET_BY_CATEGORY).forEach((key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = B.MET_LABELS[key] || key;
      els.exMet.appendChild(opt);
    });
  }

  function renderAll(forceHistory) {
    renderHome();
    renderFoodList();
    renderStepsInput();
    renderWater();
    renderSupplements();
    renderWorkoutTab();
    if (forceHistory || activeTab === 'history') {
      renderHistory();
    } else {
      historyDirty = true;
    }
  }

  function isDuplicateFood(day, name, calories, protein) {
    const n = name.trim().toLowerCase();
    return day.food.some(
      (f) =>
        f.name.trim().toLowerCase() === n &&
        f.calories === calories &&
        f.protein === protein
    );
  }

  function isDuplicateExercise(day, name, sets, reps, weight, metCategory, durationMin) {
    const n = name.trim().toLowerCase();
    return day.exercises.some(
      (ex) =>
        ex.name.trim().toLowerCase() === n &&
        ex.sets === sets &&
        ex.reps === reps &&
        ex.weight === weight &&
        ex.metCategory === metCategory &&
        ex.durationMin === durationMin
    );
  }

  async function fetchRandomExerciseName() {
    const offset = Math.floor(Math.random() * 400);
    const url = `https://wger.de/api/v2/exercise/?language=2&limit=20&offset=${offset}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('wger');
    const d = await r.json();
    if (!d.results || !d.results.length) throw new Error('empty');
    const pick = d.results[Math.floor(Math.random() * d.results.length)];
    return pick.name || pick.name_original || 'Custom move';
  }

  els.formFood.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = parseRequiredNonEmpty(els.foodName.value, 'Food name');
    if (!name) return;

    const calories = parseNonNegativeInt(els.foodCalories.value, 'Calories');
    if (calories === null) return;

    const proteinRaw = parseNonNegativeNumber(els.foodProtein.value, 'Protein');
    if (proteinRaw === null) return;

    const protein = Math.round(proteinRaw * 10) / 10;
    const carbsRaw = parseOptionalNonNegativeNumber(els.foodCarbs ? els.foodCarbs.value : 0, 'Carbs');
    if (carbsRaw === null) return;
    const fatsRaw = parseOptionalNonNegativeNumber(els.foodFats ? els.foodFats.value : 0, 'Fats');
    if (fatsRaw === null) return;
    const fiberRaw = parseOptionalNonNegativeNumber(els.foodFiber ? els.foodFiber.value : 0, 'Fiber');
    if (fiberRaw === null) return;
    const sugarRaw = parseOptionalNonNegativeNumber(els.foodSugar ? els.foodSugar.value : 0, 'Sugar');
    if (sugarRaw === null) return;

    const carbs = Math.round(carbsRaw * 10) / 10;
    const fats = Math.round(fatsRaw * 10) / 10;
    const fiber = Math.round(fiberRaw * 10) / 10;
    const sugar = Math.round(sugarRaw * 10) / 10;
    const day = today();

    if (isDuplicateFood(day, name, calories, protein)) {
      showToast('That entry is already logged', true);
      return;
    }

    day.food.push({
      id: S.uid(),
      name,
      calories,
      protein,
      carbs,
      fats,
      nutrients: {
        fiber,
        sugar,
        vitamins: (aiFoodDraft && aiFoodDraft.nutrients && aiFoodDraft.nutrients.vitamins) || {},
        minerals: (aiFoodDraft && aiFoodDraft.nutrients && aiFoodDraft.nutrients.minerals) || {},
      },
      source: aiFoodDraft ? 'Gemini estimate (edited)' : 'Manual',
      addedAt: Date.now(),
    });
    const game = G.ensureGame(data);
    G.awardXp(game, G.XP_FOOD);
    persist();
    els.formFood.reset();
    aiFoodDraft = null;
    if (els.foodPreview) els.foodPreview.hidden = true;
    renderRecentMeals();
    renderAll();
    showToast('Logged · +15 XP');
  });

  if (els.btnFoodAnalyze) {
    els.btnFoodAnalyze.addEventListener('click', async () => {
      const mealText = parseRequiredNonEmpty(els.foodName.value, 'Meal description');
      if (!mealText) return;
      if (!AI) {
        showToast('Gemini module is unavailable', true);
        return;
      }

      const original = els.btnFoodAnalyze.textContent;
      els.btnFoodAnalyze.disabled = true;
      els.btnFoodAnalyze.textContent = 'Analyzing...';
      
      const skeletonNode = document.getElementById('ai-skeleton-loader');
      if (skeletonNode) skeletonNode.style.display = 'block';
      if (els.foodPreview) els.foodPreview.hidden = true;

      try {
        const result = await AI.analyzeMeal(mealText);
        aiFoodDraft = result;
        fillFoodFieldsFromDraft(result);
        if (els.foodPreview) els.foodPreview.hidden = false;
        if (els.foodPreviewSource) {
          els.foodPreviewSource.textContent = result._fromFallback
            ? `${result._fallbackMessage || 'Gemini unavailable. Quick local estimate loaded.'} Review before saving.`
            : result._fromCache
              ? 'Loaded from local AI cache. You can edit values before saving.'
              : 'Generated by Gemini. Review and edit before saving.';
        }
        if (result._fromFallback && result._fallbackReason === 'QUOTA_EXCEEDED') {
          updateAIStatusUI(false, 'AI quota reached');
        } else if (result._fromFallback && result._fallbackReason === 'KEY_INVALID') {
          updateAIStatusUI(false, 'AI key invalid');
        } else {
          refreshAIStatusFromSettings();
        }
        AI.rememberMeal(mealText);
        renderRecentMeals();
        showToast(
          result._fromFallback
            ? 'AI fallback estimate ready'
            : result._fromCache
              ? 'Used cached estimate'
              : 'AI estimate ready'
        );
      } catch (err) {
        updateAIStatusUI(false, 'AI error');
        showToast((err && err.message) || 'Gemini meal analysis failed', true);
      } finally {
        if (skeletonNode) skeletonNode.style.display = 'none';
        if (els.foodPreview && !els.foodPreview.hidden) {
            els.foodPreview.classList.add('animate-fade-in');
            // Remove the class after animation completes to allow re-triggering
            setTimeout(() => { els.foodPreview.classList.remove('animate-fade-in'); }, 400);
        }
        els.btnFoodAnalyze.disabled = false;
        els.btnFoodAnalyze.textContent = original;
      }
    });
  }

  if (els.foodName) {
    els.foodName.addEventListener('input', () => {
      aiFoodDraft = null;
      if (els.foodPreview) els.foodPreview.hidden = true;
    });
  }

  els.formSteps.addEventListener('submit', (e) => {
    e.preventDefault();
    const steps = parseNonNegativeInt(els.stepsInput.value, 'Steps');
    if (steps === null) return;
    const day = today();
    day.steps = steps;
    persist();
    renderAll();
    showToast('Steps saved');
  });

  if (els.stepsQuick) {
    els.stepsQuick.querySelectorAll('button[data-add]').forEach((button) => {
      button.addEventListener('click', () => {
        const add = Number(button.getAttribute('data-add'));
        if (!Number.isFinite(add) || add <= 0) return;
        const day = today();
        day.steps = (day.steps || 0) + add;
        els.stepsInput.value = String(day.steps);
        persist();
        renderAll();
        showToast(`Added ${add} steps`);
      });
    });
  }

  els.waterChips.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const ml = parseInt(chip.getAttribute('data-ml'), 10);
      if (!Number.isFinite(ml) || ml <= 0) return;
      const day = today();
      day.waterMl = (day.waterMl || 0) + ml;
      const game = G.ensureGame(data);
      const f = G.dayFlags(game, S.todayKey());
      const n = (f.waterAdds || 0) + 1;
      f.waterAdds = n;
      if (n <= 5) {
        G.awardXp(game, G.XP_WATER_ADD);
      }
      persist();
      renderAll();
      showToast(n <= 5 ? `+${ml} ml · hydration XP` : `+${ml} ml`);
    });
  });

  els.formWaterCustom.addEventListener('submit', (e) => {
    e.preventDefault();
    const ml = parseNonNegativeInt(els.waterCustom.value, 'Water (ml)');
    if (ml === null) return;
    if (ml === 0) {
      showToast('Enter an amount greater than 0', true);
      return;
    }
    const day = today();
    day.waterMl = (day.waterMl || 0) + ml;
    const game = G.ensureGame(data);
    const f = G.dayFlags(game, S.todayKey());
    const n = (f.waterAdds || 0) + 1;
    f.waterAdds = n;
    if (n <= 5) {
      G.awardXp(game, G.XP_WATER_ADD);
    }
    persist();
    els.waterCustom.value = '';
    renderAll();
    showToast(n <= 5 ? `Added · hydration XP` : 'Added');
  });

  els.formSupplementCustom.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = parseRequiredNonEmpty(els.supplementNew.value, 'Supplement name');
    if (!name) return;

    const exists = data.catalog.some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (exists) {
      showToast('Already in your list', true);
      return;
    }

    const id = `custom_${S.uid()}`;
    data.catalog.push({ id, name: name.trim(), builtIn: false });
    const day = today();
    day.supplementState[id] = false;
    persist();
    els.supplementNew.value = '';
    renderAll();
    showToast('Supplement added');
  });

  els.btnWorkoutToggle.addEventListener('click', () => {
    const day = today();
    const game = G.ensureGame(data);
    const f = G.dayFlags(game, S.todayKey());
    const was = day.workoutDone;
    day.workoutDone = !day.workoutDone;
    if (day.workoutDone && !was && !f.workoutDoneXp) {
      f.workoutDoneXp = true;
      G.awardXp(game, G.XP_WORKOUT_DONE);
    }
    persist();
    renderAll();
    showToast(day.workoutDone ? 'Workout logged · +45 XP' : 'Workout undone');
  });

  els.formExercise.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = parseRequiredNonEmpty(els.exName.value, 'Exercise name');
    if (!name) return;

    const metCategory = els.exMet.value || 'other';
    const durationMin = parsePositiveInt(els.exDuration.value, 'Active minutes');
    if (durationMin === null) return;

    const sets = parseNonNegativeInt(els.exSets.value, 'Sets');
    if (sets === null) return;

    const reps = parseNonNegativeInt(els.exReps.value, 'Reps');
    if (reps === null) return;

    const weight = parseNonNegativeNumber(els.exWeight.value, 'Weight');
    if (weight === null) return;

    const day = today();
    const w = Math.round(weight * 10) / 10;

    if (isDuplicateExercise(day, name, sets, reps, w, metCategory, durationMin)) {
      showToast('That exercise line is already logged', true);
      return;
    }

    day.exercises.push({
      id: S.uid(),
      name,
      metCategory,
      durationMin,
      sets,
      reps,
      weight: w,
      caloriesBurned: aiExerciseDraft ? aiExerciseDraft.caloriesBurned : 0,
      muscleGroup: aiExerciseDraft ? aiExerciseDraft.muscleGroup : '',
      exerciseType: aiExerciseDraft ? aiExerciseDraft.exerciseType : metCategory,
      addedAt: Date.now(),
    });
    const game = G.ensureGame(data);
    G.awardXp(game, G.XP_EXERCISE);
    persist();
    els.formExercise.reset();
    aiExerciseDraft = null;
    if (els.exerciseAIPreview) els.exerciseAIPreview.hidden = true;
    renderAll();
    const k = B.exerciseLineBurnKcal(day.exercises[day.exercises.length - 1], data.profile);
    showToast(data.profile.weightKg > 0 ? `Set logged · ~${k} kcal · +22 XP` : `Set logged · +22 XP`);
  });

  if (els.btnExerciseInspire) {
    els.btnExerciseInspire.addEventListener('click', async () => {
      els.btnExerciseInspire.disabled = true;
      try {
        const n = await fetchRandomExerciseName();
        els.exName.value = n;
        showToast('Pulled from wger');
      } catch {
        showToast('Exercise API unavailable — type your own', true);
      }
      els.btnExerciseInspire.disabled = false;
    });
  }

  if (els.btnExerciseAnalyze) {
    els.btnExerciseAnalyze.addEventListener('click', async () => {
      const name = parseRequiredNonEmpty(els.exName.value, 'Exercise name');
      if (!name) return;
      if (!AI) {
        showToast('Gemini module is unavailable', true);
        return;
      }

      const original = els.btnExerciseAnalyze.textContent;
      els.btnExerciseAnalyze.disabled = true;
      els.btnExerciseAnalyze.textContent = 'Analyzing...';
      try {
        const result = await AI.analyzeExercise(name, {
          durationMin: Number(els.exDuration.value) || 0,
          sets: Number(els.exSets.value) || 0,
          reps: Number(els.exReps.value) || 0,
          weight: Number(els.exWeight.value) || 0,
          bodyWeightKg: data.profile.weightKg || 0,
        });

        aiExerciseDraft = result;
        if (result.exerciseType && B.MET_BY_CATEGORY[result.exerciseType] != null) {
          els.exMet.value = result.exerciseType;
        }
        if (result.caloriesBurned > 0 && (!els.exDuration.value || Number(els.exDuration.value) === 0)) {
          els.exDuration.value = String(Math.max(10, Math.round(result.caloriesBurned / 8)));
        }

        if (els.exerciseAIMeta) {
          const mode = result._fromFallback ? 'local fallback' : result._fromCache ? 'cache' : 'gemini';
          els.exerciseAIMeta.textContent = `~${Math.round(result.caloriesBurned)} kcal · ${result.muscleGroup} · ${result.exerciseType} · ${mode}`;
        }
        if (result._fromFallback && result._fallbackReason === 'QUOTA_EXCEEDED') {
          updateAIStatusUI(false, 'AI quota reached');
        } else if (result._fromFallback && result._fallbackReason === 'KEY_INVALID') {
          updateAIStatusUI(false, 'AI key invalid');
        } else {
          refreshAIStatusFromSettings();
        }
        if (els.exerciseAIPreview) els.exerciseAIPreview.hidden = false;
        showToast(
          result._fromFallback
            ? 'AI fallback exercise estimate ready'
            : result._fromCache
              ? 'Used cached exercise estimate'
              : 'Exercise estimate ready'
        );
      } catch (err) {
        updateAIStatusUI(false, 'AI error');
        showToast((err && err.message) || 'Gemini exercise analysis failed', true);
      } finally {
        els.btnExerciseAnalyze.disabled = false;
        els.btnExerciseAnalyze.textContent = original;
      }
    });
  }

  if (els.exName) {
    els.exName.addEventListener('input', () => {
      aiExerciseDraft = null;
      if (els.exerciseAIPreview) els.exerciseAIPreview.hidden = true;
    });
  }

  els.btnChallengeClaim.addEventListener('click', () => {
    const key = S.todayKey();
    const day = today();
    const totals = foodTotals(day);
    const game = G.ensureGame(data);
    const daily = G.ensureDailyChallenge(game, key);
    const ctx = { day, totals, goals: data.goals };
    if (daily.claimed || !G.isChallengeComplete(daily, ctx)) return;
    daily.claimed = true;
    G.awardXp(game, G.XP_CHALLENGE);
    persist();
    renderAll();
    showToast(`Quest complete · +${G.XP_CHALLENGE} XP`);
  });

  els.modalClose.addEventListener('click', closeModal);
  els.modalOverlay.addEventListener('click', (e) => {
    if (e.target === els.modalOverlay) {
      closeModal();
    }
  });

  els.btnOpenSettings.addEventListener('click', openSettings);
  els.btnBannerSettings.addEventListener('click', openSettings);
  els.settingsClose.addEventListener('click', closeSettings);
  els.settingsOverlay.addEventListener('click', (e) => {
    if (e.target === els.settingsOverlay) {
      closeSettings();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (closeTopOverlay()) {
      e.preventDefault();
    }
  });

  ['set-weight-kg', 'set-height', 'set-age', 'set-sex'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateBmrReadout);
    document.getElementById(id).addEventListener('change', updateBmrReadout);
  });

  if (els.setTheme) {
    els.setTheme.addEventListener('change', () => {
      const next = els.setTheme.value || 'auto';
      if (next === 'dark' || next === 'light') {
        document.body.setAttribute('data-theme', next);
      } else {
        document.body.removeAttribute('data-theme');
      }
    });
  }

  if (els.btnAiSave) {
    els.btnAiSave.addEventListener('click', async () => {
      const originalText = els.btnAiSave.textContent;
      els.btnAiSave.disabled = true;
      els.btnAiSave.textContent = 'Saving...';
      try {
        const ok = await saveAISettingsFromInputs();
        if (ok) {
          showToast('AI settings saved');
        }
      } catch (err) {
        showToast((err && err.message) || 'Could not save AI settings', true);
      } finally {
        els.btnAiSave.disabled = false;
        els.btnAiSave.textContent = originalText;
      }
    });
  }

  if (els.btnAiTest) {
    els.btnAiTest.addEventListener('click', async () => {
      if (!AI) {
        updateAIStatusUI(false, 'AI unavailable');
        return;
      }
      const originalText = els.btnAiTest.textContent;
      els.btnAiTest.disabled = true;
      els.btnAiTest.textContent = 'Testing...';
      try {
        await saveAISettingsFromInputs();
        const ping = await AI.testConnection();
        updateAIStatusUI(true, `AI on (${ping.model})`);
        showToast('AI key is working');
      } catch (err) {
        updateAIStatusUI(false, 'AI off');
        showToast((err && err.message) || 'AI key test failed', true);
      } finally {
        els.btnAiTest.disabled = false;
        els.btnAiTest.textContent = originalText;
      }
    });
  }

  els.btnSaveSettings.addEventListener('click', () => {
    const w = parseFloat(els.setWeightKg.value);
    const h = parseFloat(els.setHeight.value);
    const a = parseInt(els.setAge.value, 10);
    data.profile.weightKg = Number.isFinite(w) && w >= 0 ? Math.round(w * 10) / 10 : 0;
    data.profile.heightCm = Number.isFinite(h) && h >= 0 ? Math.round(h) : 0;
    data.profile.age = Number.isFinite(a) && a >= 0 ? a : 0;
    data.profile.sex = els.setSex.value;

    const cg = parseInt(els.setCalGoal.value, 10);
    const pg = parseInt(els.setProtGoal.value, 10);
    const sg = parseInt(els.setStepGoal.value, 10);
    const wg = parseInt(els.setWaterGoal.value, 10);

    if (!Number.isFinite(cg) || cg < 500) {
      showToast('Calorie target should be at least 500', true);
      return;
    }
    if (!Number.isFinite(pg) || pg < 0) {
      showToast('Invalid protein target', true);
      return;
    }
    if (!Number.isFinite(sg) || sg < 0) {
      showToast('Invalid step goal', true);
      return;
    }
    if (!Number.isFinite(wg) || wg < 0) {
      showToast('Invalid water goal', true);
      return;
    }

    data.goals.calorieTarget = cg;
    data.goals.proteinTargetG = pg;
    data.goals.stepGoal = sg;
    data.goals.waterGoalMl = wg;
    if (els.setTheme) {
      data.settings.theme = els.setTheme.value || 'auto';
      applyTheme();
    }
    if (AI && els.setGeminiKey && els.setGeminiModel) {
      ensureAISettingsShape();
      data.settings.ai.apiKey = (els.setGeminiKey.value || '').trim();
      data.settings.ai.model = (els.setGeminiModel.value || AI.defaultModel).trim() || AI.defaultModel;
      AI.setApiKey(data.settings.ai.apiKey);
      AI.setModel(data.settings.ai.model);
      refreshAIStatusFromSettings();
    }

    persist();
    closeSettings();
    renderAll();
    showToast('Settings saved');
  });

  // Logout button handler
  els.btnLogout = els.btnLogout || document.getElementById('btn-logout');
  if (els.btnLogout) {
    els.btnLogout.addEventListener('click', async () => {
      const confirmed = confirm('Sign out and clear device memory? You will need to sign in again.');
      if (!confirmed) return;
      
      await Auth.logout();
      closeSettings();
      showToast('Signed out. Redirecting...');
      
      setTimeout(() => {
        window.location.reload();
      }, 500);
    });
  }

  // Display current user email
  async function updateAuthUI() {
    const email = await Auth.getCurrentUser();
    const emailEl = document.getElementById('auth-email');
    if (emailEl) {
      emailEl.textContent = email || 'Unknown';
    }
  }

  // Call on startup
  updateAuthUI();

  async function getCloudSessionSafe(sb, force) {
    const now = Date.now();
    if (!force && now - syncSessionCache.checkedAt < 12000) {
      return {
        session: syncSessionCache.session,
        timedOut: syncSessionCache.timedOut,
        failed: syncSessionCache.failed,
      };
    }

    const timeoutResult = new Promise((resolve) => {
      setTimeout(() => resolve({ session: null, timedOut: true }), 7000);
    });

    try {
      const result = await Promise.race([
        sb.auth.getSession().then(({ data }) => ({
          session: (data && data.session) || null,
          timedOut: false,
        })),
        timeoutResult,
      ]);
      syncSessionCache = {
        checkedAt: Date.now(),
        session: result.session || null,
        timedOut: !!result.timedOut,
        failed: false,
      };
      return result;
    } catch {
      const failedResult = { session: null, timedOut: false, failed: true };
      syncSessionCache = {
        checkedAt: Date.now(),
        session: null,
        timedOut: false,
        failed: true,
      };
      return failedResult;
    }
  }

  async function updateSyncUI() {
    const sb = S.supabase;
    const indicator = els.syncStatus.querySelector('.status-indicator');
    const text = els.syncStatus.querySelector('.status-text');
    const pendingResume = !!(Auth && typeof Auth.hasPendingCloudAuth === 'function' && Auth.hasPendingCloudAuth());
    const appUserEmail = await getCurrentUserEmailSafe();

    if (!sb) {
      indicator.className = 'status-indicator error';
      text.className = 'status-text';
      text.textContent = 'Sync unavailable';
      els.btnSyncLogin.hidden = true;
      els.btnSyncLogout.hidden = true;
      els.syncStatus.classList.add('off');
      els.syncStatus.classList.remove('connected');
      return;
    }

    const { session, timedOut, failed } = await getCloudSessionSafe(sb, false);
    if (timedOut) {
      indicator.className = 'status-indicator error';
      text.className = 'status-text';
      text.textContent = pendingResume
        ? 'Cloud unreachable · auto-sync will resume when online'
        : 'Cloud unreachable · local mode active';
      els.btnSyncLogin.hidden = true;
      els.btnSyncLogout.hidden = true;
      els.syncStatus.classList.add('off');
      els.syncStatus.classList.remove('connected');
      return;
    }

    if (failed) {
      indicator.className = 'status-indicator error';
      text.className = 'status-text';
      text.textContent = pendingResume
        ? 'Cloud sync paused · auto resume queued'
        : 'Cloud sync paused · local mode active';
      els.btnSyncLogin.hidden = true;
      els.btnSyncLogout.hidden = true;
      els.syncStatus.classList.add('off');
      els.syncStatus.classList.remove('connected');
      return;
    }

    const user = session && session.user ? session.user : null;
    if (user && user.email) {
      if (hasCloudIdentityMismatch(session, appUserEmail)) {
        indicator.className = 'status-indicator error';
        text.className = 'status-text';
        text.textContent = `Cloud mismatch: signed in as ${user.email}. Logout cloud and reconnect as ${appUserEmail}.`;
        els.btnSyncLogin.hidden = true;
        els.btnSyncLogout.hidden = false;
        els.syncStatus.classList.add('off');
        els.syncStatus.classList.remove('connected');
        return;
      }

      indicator.className = 'status-indicator connected';
      text.className = 'status-text';
      text.textContent = `Synced as ${user.email}`;
      els.btnSyncLogin.hidden = true;
      els.btnSyncLogout.hidden = false;
      els.syncStatus.classList.remove('off');
      els.syncStatus.classList.add('connected');
    } else {
      const canAutoResume =
        Auth &&
        typeof Auth.tryResumeCloudSession === 'function' &&
        pendingResume &&
        !autoCloudResume.inFlight &&
        Date.now() - autoCloudResume.lastAttemptAt > 15000;

      if (canAutoResume) {
        autoCloudResume.inFlight = true;
        autoCloudResume.lastAttemptAt = Date.now();
        try {
          const resumed = await Auth.tryResumeCloudSession();
          if (resumed && resumed.ok) {
            const fresh = await getCloudSessionSafe(sb, true);
            const cloudUser = fresh && fresh.session ? fresh.session.user : null;
            if (cloudUser && cloudUser.email) {
              indicator.className = 'status-indicator connected';
              text.className = 'status-text';
              text.textContent = `Synced as ${cloudUser.email}`;
              els.btnSyncLogin.hidden = true;
              els.btnSyncLogout.hidden = false;
              els.syncStatus.classList.remove('off');
              els.syncStatus.classList.add('connected');
              return;
            }
          }
        } catch {
          // keep regular sync-off rendering below
        } finally {
          autoCloudResume.inFlight = false;
        }
      }

      indicator.className = 'status-indicator error';
      text.className = 'status-text';
      text.textContent = pendingResume ? 'Cloud login queued automatically' : 'Cloud sync off';
      els.btnSyncLogin.hidden = pendingResume;
      els.btnSyncLogout.hidden = true;
      els.syncStatus.classList.add('off');
      els.syncStatus.classList.remove('connected');
    }
  }

  els.btnSyncLogin.addEventListener('click', async () => {
    const sb = S.supabase;
    const originalText = els.btnSyncLogin.textContent;
    els.btnSyncLogin.disabled = true;
    els.btnSyncLogin.textContent = 'Opening...';

    try {
      if (!sb) {
        throw new Error('Sync unavailable (keys missing)');
      }

      const pendingResume = !!(
        Auth &&
        typeof Auth.hasPendingCloudAuth === 'function' &&
        Auth.hasPendingCloudAuth()
      );
      const appUserEmail = Auth && typeof Auth.getCurrentUser === 'function'
        ? await Auth.getCurrentUser().catch(function () { return null; })
        : null;

      // Try password-based auto resume first if pending credentials exist.
      if (Auth && typeof Auth.tryResumeCloudSession === 'function' && pendingResume) {
        const resumed = await Auth.tryResumeCloudSession();
        if (resumed && resumed.ok) {
          syncSessionCache = {
            checkedAt: Date.now(),
            session: null,
            timedOut: false,
            failed: false,
          };
          await updateSyncUI();
          showToast('Cloud sync connected');
          return;
        }

        // Keep it automatic if pending credentials exist; do not force Google fallback.
        showToast('Cloud sync is queued. It will auto-connect when reachable.', true);
        await updateSyncUI();
        return;
      }

      // Reuse hardened Google flow with reachability checks and stable redirect URL.
      if (Auth && typeof Auth.loginWithGoogle === 'function') {
        await Auth.loginWithGoogle(appUserEmail);
        return;
      }

      const redirectTo = window.location.origin + window.location.pathname;
      const normalizedAppEmail = normalizeEmail(appUserEmail);
      const { data: oauthData, error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: normalizedAppEmail
            ? { prompt: 'select_account', login_hint: normalizedAppEmail }
            : { prompt: 'select_account' },
        },
      });

      if (error) {
        throw new Error(error.message || 'Could not start sync login');
      }

      if (!oauthData || !oauthData.url) {
        throw new Error('Cloud auth URL was not generated');
      }

      window.location.assign(oauthData.url);
    } catch (err) {
      showToast((err && err.message) || 'Could not start sync login', true);
      await updateSyncUI();
    } finally {
      els.btnSyncLogin.disabled = false;
      els.btnSyncLogin.textContent = originalText;
    }
  });

  els.btnSyncLogout.addEventListener('click', async () => {
    const sb = S.supabase;
    if (!sb) return;
    const originalText = els.btnSyncLogout.textContent;
    els.btnSyncLogout.disabled = true;
    els.btnSyncLogout.textContent = 'Logging out...';

    try {
      await sb.auth.signOut();
      syncSessionCache = {
        checkedAt: Date.now(),
        session: null,
        timedOut: false,
        failed: false,
      };
      showToast('Logged out');
      await updateSyncUI();
    } catch (err) {
      showToast((err && err.message) || 'Could not log out from cloud', true);
    } finally {
      els.btnSyncLogout.disabled = false;
      els.btnSyncLogout.textContent = originalText;
    }
  });

  els.btnExport.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verotrack-backup-${S.todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup downloaded');
  });

  els.importFile.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object' || !parsed.days) {
          showToast('Invalid backup file', true);
          return;
        }
        if (!window.confirm('Replace all data with this backup?')) return;

        const email = await Auth.getCurrentUser();
        if (!email) {
          showToast('No active account found', true);
          return;
        }

        await S.save(parsed, email);
        data = await S.load(email);
        cacheSharedData(data);
        fillMetSelect();
        renderAll();
        showToast('Backup restored');
        closeSettings();
      } catch {
        showToast('Could not read backup', true);
      }
    };
    reader.readAsText(file);
  });

  if (els.btnToggleBreakdown && els.panelBreakdown) {
    els.btnToggleBreakdown.addEventListener('click', () => {
      const open = els.panelBreakdown.hidden;
      els.panelBreakdown.hidden = !open;
      els.btnToggleBreakdown.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  if (els.btnTipRefresh) {
    els.btnTipRefresh.addEventListener('click', () => {
      loadTip();
    });
  }

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal();
      closeSettings();
      closeExerciseSheetSafe();

      const tab = btn.getAttribute('data-tab');
      activeTab = tab;
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.removeAttribute('aria-current');
      });
      btn.setAttribute('aria-current', 'page');

      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `tab-${tab}`);
      });

      if (tab === 'history' && historyDirty) {
        renderHistory();
      }
    });
  });

  window.addEventListener('storage', async (e) => {
    if (S.isDataStorageKey && S.isDataStorageKey(e.key)) {
      const email = await Auth.getCurrentUser();
      data = await S.load(email);
      cacheSharedData(data);
      renderAll(true);
    }
  });

  /* Fix workout undone: allow XP again if they undo? User might exploit. Keep simple: flag prevents re-award same day */
})();
