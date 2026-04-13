/**
 * VeroTrack Engine v5 — Quick Log Module
 * ─────────────────────────────────────────────────────────────────
 * RESPONSIBILITIES:
 *   • Quick/Detailed mode toggle on Log tab
 *   • Build Quick Log Strip on Home (repeat patterns + water chips)
 *   • Render recent meals list in Log Quick mode
 *   • "Repeat last meal" — 1 tap clones last food entry
 *   • "Repeat last workout" — chips in strip
 *   • Home water quick-add (+250/500/750ml)
 *   • Home steps quick-add
 *   • Meal → Detailed mode navigation
 *
 * READS  FROM: window.VeroTrackStorage._cachedData
 * PERSISTS TO: same via storage.save()
 * RUNS AFTER:  app.js + premium-ui.js
 */

(function () {
  'use strict';

  /* ─── Utilities ─────────────────────────────────────────────── */
  const el = id => document.getElementById(id);
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function truncate(text, max) {
    const t = String(text || '');
    if (t.length <= max) return t;
    return t.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
  }

  function getTimeContext() {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return 'morning';
    if (h >= 11 && h < 17) return 'afternoon';
    if (h >= 17 && h < 21) return 'gym';
    return 'evening';
  }

  function getContextLabel(context) {
    if (context === 'morning') return 'Morning focus';
    if (context === 'afternoon') return 'Afternoon momentum';
    if (context === 'gym') return 'Gym window';
    return 'Evening closeout';
  }

  function showToast(msg, duration) {
    const t = el('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('show'), duration || 2000);
  }

  function switchTab(name) {
    const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
    if (btn) btn.click();
  }

  /* ─── Storage helpers ────────────────────────────────────────── */
  async function persist(data) {
    const S = window.VeroTrackStorage;
    const A = window.VeroTrackAuth;
    if (!S) return;
    try {
      const user = A ? await A.getCurrentUser() : null;
      await S.save(data, user);
    } catch(e) { console.warn('QL: persist error', e); }
  }

  function getData() {
    const S = window.VeroTrackStorage;
    if (S && S._cachedData) return S._cachedData;
    if (window.__VT_APP_DATA) return window.__VT_APP_DATA;
    return null;
  }

  function requireData() {
    const data = getData();
    if (!data) {
      showToast('Loading your data...', 1200);
      return null;
    }
    return data;
  }

  function getDay() {
    const data = getData();
    if (!data) return null;
    const key = todayKey();
    if (!data.days[key]) data.days[key] = window.VeroTrackStorage.emptyDay();
    return data.days[key];
  }

  /* ─── Recent meals from storage ───────────────────────────────── */
  function getRecentMeals(limit) {
    const data = getData();
    if (!data || !data.days) return [];
    const seen = new Map();
    const sorted = Object.keys(data.days).sort().reverse();
    for (const key of sorted) {
      const day = data.days[key];
      if (!day.food) continue;
      for (let i = day.food.length - 1; i >= 0; i--) {
        const f = day.food[i];
        if (!f.name) continue;
        const lcName = f.name.toLowerCase();
        if (!seen.has(lcName)) {
          seen.set(lcName, { ...f, _fromKey: key });
        }
        if (seen.size >= (limit || 5)) break;
      }
      if (seen.size >= (limit || 5)) break;
    }
    return Array.from(seen.values());
  }

  function getLastMeal() {
    const data = getData();
    if (!data || !data.days) return null;
    const sorted = Object.keys(data.days).sort().reverse();
    for (const key of sorted) {
      const day = data.days[key];
      if (day.food && day.food.length > 0) {
        return day.food[day.food.length - 1];
      }
    }
    return null;
  }

  function getLastWorkoutName() {
    const data = getData();
    if (!data || !data.days) return null;
    const sorted = Object.keys(data.days).sort().reverse();
    for (const key of sorted) {
      const day = data.days[key];
      if (day.exercises && day.exercises.length > 0) {
        return day.exercises[0].name;
      }
    }
    return null;
  }

  /* ─── Log mode toggle ─────────────────────────────────────────── */
  let _logMode = 'quick';

  function setLogMode(mode) {
    _logMode = mode;
    const quickPanel  = el('log-mode-quick');
    const detailPanel = el('log-mode-detailed');
    const qBtn = el('eng-mode-quick');
    const dBtn = el('eng-mode-detailed');

    if (!quickPanel || !detailPanel) return;

    if (mode === 'quick') {
      quickPanel.hidden  = false;
      detailPanel.hidden = true;
      if (qBtn) qBtn.classList.add('is-active');
      if (dBtn) dBtn.classList.remove('is-active');
      if (qBtn) qBtn.setAttribute('aria-selected', 'true');
      if (dBtn) dBtn.setAttribute('aria-selected', 'false');
    } else {
      quickPanel.hidden  = true;
      detailPanel.hidden = false;
      if (qBtn) qBtn.classList.remove('is-active');
      if (dBtn) dBtn.classList.add('is-active');
      if (qBtn) qBtn.setAttribute('aria-selected', 'false');
      if (dBtn) dBtn.setAttribute('aria-selected', 'true');
      // Focus name field
      setTimeout(() => {
        const nf = el('food-name');
        if (nf) { nf.scrollIntoView({ behavior: 'smooth', block: 'center' }); nf.focus(); }
      }, 150);
    }
    renderRecentMeals();
  }

  /* ─── Render recent meals list in Quick mode ──────────────────── */
  function renderRecentMeals() {
    const container = el('eng-recent-meals-list');
    if (!container) return;

    const meals = getRecentMeals(6);
    if (meals.length === 0) {
      container.innerHTML = '<p class="eng-empty-guide">Log a meal to see shortcuts here</p>';
      return;
    }

    const lastMeal = meals[0];
    let html = '';

    // Repeat last meal button (most prominent)
    html += `<button class="eng-repeat-btn" data-idx="0" id="eng-repeat-last-meal">
      <span class="eng-repeat-btn__icon">↩</span>
      <span class="eng-repeat-btn__body">
        <span class="eng-repeat-btn__name">Repeat: ${escHtml(lastMeal.name)}</span>
        <span class="eng-repeat-btn__meta">${lastMeal.calories || 0} kcal · ${lastMeal.protein || 0}g protein</span>
      </span>
    </button>`;

    // Other recent meals
    meals.slice(1).forEach((m, i) => {
      html += `<button class="eng-recent-meal-row" data-idx="${i+1}">
        <span class="eng-recent-meal-row__name">${escHtml(m.name)}</span>
        <span class="eng-recent-meal-row__cal">${m.calories || 0} kcal</span>
      </button>`;
    });

    container.innerHTML = html;

    // Wire click events
    container.querySelectorAll('[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        repeatMeal(meals[idx]);
      });
    });
  }

  /* ─── Repeat a meal ───────────────────────────────────────────── */
  async function repeatMeal(meal) {
    const data  = getData();
    const S = window.VeroTrackStorage;
    if (!data) return;
    const key   = todayKey();
    if (!data.days[key]) data.days[key] = window.VeroTrackStorage.emptyDay();

    const clone = {
      id:       S && S.uid ? S.uid() : `meal_${Date.now()}`,
      name:     meal.name,
      calories: meal.calories || 0,
      protein:  meal.protein  || 0,
      carbs:    meal.carbs    || 0,
      fats:     meal.fats     || 0,
      nutrients: {
        fiber: (meal.nutrients && meal.nutrients.fiber) || meal.fiber || 0,
        sugar: (meal.nutrients && meal.nutrients.sugar) || meal.sugar || 0,
        vitamins: (meal.nutrients && meal.nutrients.vitamins) || {},
        minerals: (meal.nutrients && meal.nutrients.minerals) || {},
      },
      source: 'Quick repeat',
      addedAt: Date.now(),
    };
    data.days[key].food.push(clone);
    await persist(data);

    showToast(`✓ Added: ${meal.name} — ${meal.calories || 0} kcal`, 2500);

    // Trigger app.js re-render
    triggerRerender();
    renderRecentMeals();
    updateMealList();
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ─── Today's meal list (quick mode view) ─────────────────────── */
  function updateMealList() {
    const data = getData();
    const wrap = el('eng-today-meals-wrap');
    const list = el('food-list');
    const empty = el('food-empty');
    if (!data || !list) return;
    const key  = todayKey();
    const day  = data.days && data.days[key];
    const food = day && day.food ? day.food : [];

    if (wrap) wrap.hidden = food.length === 0;
    if (empty) empty.hidden = food.length > 0;
  }

  /* ─── Steps display ───────────────────────────────────────────── */
  function updateStepsDisplay() {
    const data = getData();
    const d    = el('eng-steps-display');
    if (!d || !data) return;
    const key  = todayKey();
    const day  = data.days && data.days[key];
    d.textContent = (day && day.steps) ? day.steps.toLocaleString() : '0';
  }

  /* ─── Water display in quick mode ────────────────────────────── */
  function updateWaterDisplay() {
    const data  = getData();
    const disp  = el('water-total');
    const bar   = el('eng-water-bar');
    if (!data) return;
    const key   = todayKey();
    const day   = data.days && data.days[key];
    const ml    = (day && day.waterMl) || 0;
    const goal  = (data.goals && data.goals.waterGoalMl) || 2500;
    const pct   = Math.min(100, Math.round((ml / goal) * 100));
    if (disp) disp.textContent = ml;
    if (bar)  bar.style.width  = pct + '%';
  }

  function workoutStreakDays(data) {
    if (!data || !data.days) return 0;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    let streak = 0;
    for (let i = 0; i < 365; i += 1) {
      const k = dateKey(d);
      const day = data.days[k];
      if (day && day.workoutDone) {
        streak += 1;
        d.setDate(d.getDate() - 1);
        continue;
      }
      break;
    }
    return streak;
  }

  function fallbackHomeState() {
    return {
      key: todayKey(),
      day: null,
      waterMl: 0,
      totalCal: 0,
      proteinG: 0,
      steps: 0,
      workoutDone: false,
      sessionActive: !!(
        window.VTSession &&
        typeof window.VTSession.isActive === 'function' &&
        window.VTSession.isActive()
      ),
      goalWater: 2500,
      goalCal: 2200,
      goalProtein: 150,
      goalSteps: 10000,
      waterPct: 0,
      calPct: 0,
      proteinDeficit: 150,
      stepDeficit: 10000,
      streakDays: 0,
      timeContext: getTimeContext(),
      lastMeal: null,
      lastWorkoutName: null,
    };
  }

  function getHomeState() {
    const data = getData();
    if (!data) return fallbackHomeState();
    const key = todayKey();
    const day = data.days && data.days[key] ? data.days[key] : window.VeroTrackStorage.emptyDay();
    const goals = data.goals || {};
    const food = Array.isArray(day.food) ? day.food : [];

    const totalCal = food.reduce((sum, item) => sum + (item.calories || 0), 0);
    const proteinG = food.reduce((sum, item) => sum + (item.protein || 0), 0);
    const steps = day.steps || 0;
    const waterMl = day.waterMl || 0;
    const goalWater = goals.waterGoalMl || 2500;
    const goalCal = goals.calorieTarget || 2200;
    const goalProtein = goals.proteinTargetG || 150;
    const goalSteps = goals.stepGoal || 10000;
    const workoutDone = !!day.workoutDone;
    const sessionActive = !!(
      window.VTSession &&
      typeof window.VTSession.isActive === 'function' &&
      window.VTSession.isActive()
    );

    return {
      key,
      day,
      waterMl,
      totalCal,
      proteinG,
      steps,
      workoutDone,
      sessionActive,
      goalWater,
      goalCal,
      goalProtein,
      goalSteps,
      waterPct: Math.min(100, Math.round((waterMl / goalWater) * 100)),
      calPct: Math.min(100, Math.round((totalCal / goalCal) * 100)),
      proteinDeficit: Math.max(0, Math.round(goalProtein - proteinG)),
      stepDeficit: Math.max(0, goalSteps - steps),
      streakDays: workoutStreakDays(data),
      timeContext: getTimeContext(),
      lastMeal: getLastMeal(),
      lastWorkoutName: getLastWorkoutName(),
    };
  }

  function createActionCard(config) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = config.id;
    btn.className = [
      'eng-action-btn',
      `eng-action-btn--${config.tone || 'blue'}`,
      config.priority ? 'is-priority' : '',
      config.done ? 'is-done' : '',
    ].filter(Boolean).join(' ');
    btn.setAttribute('data-hub-action', config.action);
    btn.setAttribute('aria-label', config.ariaLabel || config.label);
    btn.innerHTML = `
      <span class="eng-action-btn__icon">${config.icon}</span>
      <span class="eng-action-btn__label">${escHtml(config.label)}</span>
      <span class="eng-action-btn__sub"${config.action === 'workout' ? ' id="eng-workout-sub"' : ''}>${escHtml(config.sub)}</span>
    `;
    return btn;
  }

  function renderActionHub(state, priorityAction) {
    const hub = el('eng-action-hub');
    if (!hub || !state) return;

    const mealSub = state.lastMeal
      ? `Repeat ${truncate(state.lastMeal.name, 18)}`
      : 'Quick add from recents';

    const workoutSub = state.workoutDone
      ? 'Completed today'
      : state.sessionActive
        ? 'Session active'
        : 'Start now';

    const cards = [
      {
        id: 'eng-water-btn',
        action: 'water',
        icon: '💧',
        label: '+ Drink Water',
        sub: `+250 ml · ${state.waterMl} ml today`,
        tone: 'blue',
      },
      {
        id: 'eng-meal-btn',
        action: 'meal',
        icon: '🍽️',
        label: '+ Log Meal',
        sub: mealSub,
        tone: 'blue',
      },
      {
        id: 'eng-workout-btn',
        action: 'workout',
        icon: state.workoutDone ? '✅' : (state.sessionActive ? '⏱' : '🏋️'),
        label: state.sessionActive ? '+ Continue Workout' : '+ Start Workout',
        sub: workoutSub,
        tone: 'green',
        done: state.workoutDone,
      },
    ].map(card => ({ ...card, priority: priorityAction === card.action }));

    hub.innerHTML = '';
    cards.forEach(card => hub.appendChild(createActionCard(card)));
  }

  /* ─── HOME — Quick Log Strip ─────────────────────────────────── */
  function buildHomeStrip() {
    const scroll = el('eng-quick-scroll');
    const state = getHomeState();
    if (!scroll || !state) return;

    const items = [];

    if (state.lastMeal) {
      items.push({
        label: `↩ ${truncate(state.lastMeal.name, 20)}`,
        sub: `${state.lastMeal.calories || 0} kcal`,
        cls: 'eng-quick-item--meal',
        action: () => repeatMeal(state.lastMeal),
      });
    }

    if (state.timeContext === 'afternoon' && state.stepDeficit > 0) {
      items.push({
        label: '+2,000 steps 🚶',
        sub: 'Quick catch-up',
        cls: 'eng-quick-item--workout',
        action: () => quickAddSteps(2000),
      });
      items.push({
        label: '+5,000 steps 🚶',
        sub: 'Momentum boost',
        cls: 'eng-quick-item--workout',
        action: () => quickAddSteps(5000),
      });
    }

    [250, 500, 750].forEach(ml => {
      items.push({
        label: `+${ml}ml 💧`,
        cls: 'eng-quick-item--water',
        action: () => quickAddWater(ml),
      });
    });

    if (state.timeContext === 'evening' && state.proteinDeficit > 0) {
      items.push({
        label: `+ Protein (${state.proteinDeficit}g left)`,
        sub: 'Tap meal shortcut',
        cls: 'eng-quick-item--meal',
        action: () => quickMealAction(),
      });
    }

    if (state.lastWorkoutName) {
      items.push({
        label: `↩ ${truncate(state.lastWorkoutName, 18)}`,
        sub: 'Last workout',
        cls: 'eng-quick-item--workout',
        action: () => switchTab('workout'),
      });
    }

    scroll.innerHTML = '';
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `eng-quick-item ${item.cls || ''}`;
      btn.innerHTML = `<span class="eng-quick-item__label">${escHtml(item.label)}</span>
        ${item.sub ? `<span class="eng-quick-item__sub">${escHtml(item.sub)}</span>` : ''}`;
      btn.addEventListener('click', item.action);
      scroll.appendChild(btn);
    });
  }

  /* ─── Home action handlers ────────────────────────────────────── */
  async function quickAddWater(ml) {
    const data = requireData();
    if (!data) return;
    const key  = todayKey();
    if (!data.days[key]) data.days[key] = window.VeroTrackStorage.emptyDay();
    data.days[key].waterMl = (data.days[key].waterMl || 0) + ml;
    await persist(data);
    showToast(`+${ml} ml logged 💧`, 1600);

    const waterBtn = el('eng-water-btn');
    if (waterBtn) {
      waterBtn.classList.add('is-tapped');
      setTimeout(() => waterBtn.classList.remove('is-tapped'), 280);
    }

    triggerRerender();
    updateWaterDisplay();
    updateHomeProgress();
  }

  async function quickAddSteps(add) {
    const data = requireData();
    if (!data) return;
    const key = todayKey();
    if (!data.days[key]) data.days[key] = window.VeroTrackStorage.emptyDay();
    data.days[key].steps = (data.days[key].steps || 0) + add;
    await persist(data);
    showToast(`+${add.toLocaleString()} steps`, 1600);
    triggerRerender();
    updateStepsDisplay();
    updateHomeProgress();
  }

  async function quickMealAction() {
    const state = getHomeState();
    if (!state) return;
    if (state.lastMeal) {
      await repeatMeal(state.lastMeal);
      return;
    }
    switchTab('log');
    setTimeout(() => setLogMode('quick'), 100);
    showToast('Add your first meal to unlock 1-tap repeats', 2100);
  }

  function quickWorkoutAction() {
    const state = getHomeState();
    if (!state) return;
    switchTab('workout');

    if (state.workoutDone) {
      showToast('Workout already logged today', 1500);
      return;
    }

    const sessionApi = window.VTSession;
    if (sessionApi && typeof sessionApi.startFromAction === 'function') {
      const started = sessionApi.startFromAction();
      if (started) showToast('Workout session started', 1500);
      return;
    }

    const heroBtn = el('btn-workout-toggle');
    if (heroBtn) heroBtn.click();
  }

  function wireHomeButtons() {
    const actionHub = el('eng-action-hub');
    if (actionHub && !actionHub._wired) {
      actionHub._wired = true;
      actionHub.addEventListener('click', async (e) => {
        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;
        const btn = target.closest('[data-hub-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-hub-action');
        if (action === 'water') {
          await quickAddWater(250);
          return;
        }
        if (action === 'meal') {
          await quickMealAction();
          return;
        }
        if (action === 'workout') {
          quickWorkoutAction();
        }
      });
    }

    const addNew = el('btn-add-new-meal');
    if (addNew) addNew.addEventListener('click', () => setLogMode('detailed'));

    const qBtn = el('eng-mode-quick');
    const dBtn = el('eng-mode-detailed');
    if (qBtn) qBtn.addEventListener('click', () => setLogMode('quick'));
    if (dBtn) dBtn.addEventListener('click', () => setLogMode('detailed'));

    const wChips = el('water-chips');
    if (wChips) {
      wChips.addEventListener('click', async e => {
        const chip = e.target.closest('[data-ml]');
        if (!chip) return;
        await quickAddWater(parseInt(chip.dataset.ml, 10));
      });
    }

    const wcToggle = el('wc-custom-toggle');
    const wcForm   = el('form-water-custom');
    if (wcToggle && wcForm) {
      wcToggle.addEventListener('click', () => {
        wcForm.hidden = !wcForm.hidden;
        if (!wcForm.hidden) el('water-custom') && el('water-custom').focus();
      });
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setTimeout(() => {
          buildHomeStrip();
          renderRecentMeals();
          updateWaterDisplay();
          updateStepsDisplay();
          updateHomeProgress();
          updateMealList();
        }, 50);
      });
    });
  }

  function setProgressStatus(elm, status) {
    if (!elm) return;
    elm.classList.remove('is-done', 'is-alert', 'is-neutral');
    if (status) elm.classList.add(status);
  }

  /* ─── Home compact progress ───────────────────────────────────── */
  function updateHomeProgress() {
    const state = getHomeState();
    if (!state) return;

    const waterLabel = state.waterMl === 0
      ? 'Start first drink'
      : state.waterPct >= 100
        ? 'Goal reached'
        : `${state.waterMl} ml logged`;

    const calLabel = state.totalCal === 0
      ? 'Log first meal'
      : state.calPct >= 100
        ? 'Target reached'
        : `${state.totalCal} kcal logged`;

    setBar('eng-prog-hydrate', 'eng-prog-hydrate-val', state.waterPct, waterLabel);
    setBar('eng-prog-cal', 'eng-prog-cal-val', state.calPct, calLabel);

    const waterVal = el('eng-prog-hydrate-val');
    const calVal = el('eng-prog-cal-val');
    const wkBar = el('eng-prog-workout');
    const wkVal = el('eng-prog-workout-val');

    setProgressStatus(waterVal, state.waterPct >= 100 ? 'is-done' : (state.waterMl === 0 ? 'is-alert' : 'is-neutral'));
    setProgressStatus(calVal, state.totalCal === 0 ? 'is-alert' : 'is-neutral');

    if (wkBar) wkBar.style.width = state.workoutDone ? '100%' : (state.sessionActive ? '70%' : '0%');
    if (wkVal) {
      wkVal.textContent = state.workoutDone ? 'Done ✓' : (state.sessionActive ? 'In session' : 'Start session');
      setProgressStatus(wkVal, state.workoutDone ? 'is-done' : 'is-alert');
    }

    const priorityAction = updateNextAction(state);
    renderActionHub(state, priorityAction);

    const streakEl = el('eng-home-streak');
    if (streakEl) {
      streakEl.textContent = state.streakDays > 0 ? `🔥 ${state.streakDays}d streak` : 'Start streak';
      streakEl.classList.toggle('is-empty', state.streakDays === 0);
    }
  }

  function setBar(fillId, valId, pct, label) {
    const fill = el(fillId);
    const val  = el(valId);
    if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (val)  val.textContent  = label;
  }

  function setNextActionTone(tone) {
    const box = el('eng-next-action');
    if (!box) return;
    box.classList.remove('is-blue', 'is-green', 'is-red');
    box.classList.add(`is-${tone || 'blue'}`);
  }

  /* ─── Smart next action ───────────────────────────────────────── */
  function updateNextAction(state) {
    const msgEl = el('eng-next-msg');
    const subEl = el('eng-next-sub');
    const ctxEl = el('eng-next-context');
    if (!msgEl || !subEl) return 'water';

    const context = state.timeContext;
    let title = 'Keep momentum going';
    let sub = 'Log your next habit now';
    let tone = 'blue';
    let action = 'water';

    if (context === 'morning') {
      if (state.waterMl < 500) {
        title = state.waterMl === 0 ? 'You have not hydrated yet' : 'Hydration first this morning';
        sub = 'Tap + Drink Water (+250 ml)';
        tone = 'blue';
        action = 'water';
      } else if (state.totalCal === 0) {
        title = 'Breakfast is your next win';
        sub = state.lastMeal ? `Tap + Log Meal to repeat ${truncate(state.lastMeal.name, 18)}` : 'Tap + Log Meal to add breakfast fast';
        tone = 'blue';
        action = 'meal';
      }
    }

    if (context === 'afternoon') {
      if (state.stepDeficit > 2500) {
        title = 'You are behind on steps';
        sub = `Need ${state.stepDeficit.toLocaleString()} more steps today`; 
        tone = 'red';
        action = 'meal';
      } else if (state.totalCal === 0) {
        title = 'No meals logged this afternoon';
        sub = 'Tap + Log Meal now';
        tone = 'red';
        action = 'meal';
      }
    }

    if (context === 'gym' && !state.workoutDone) {
      title = state.sessionActive ? 'Workout session is active' : 'Workout window is open';
      sub = state.sessionActive ? 'Continue your current session' : 'Tap + Start Workout now';
      tone = 'green';
      action = 'workout';
    }

    if (context === 'evening') {
      if (state.proteinDeficit > 0) {
        title = `You need ${state.proteinDeficit}g protein to hit goal`;
        sub = 'Tap + Log Meal and use a quick repeat';
        tone = 'blue';
        action = 'meal';
      } else if (!state.workoutDone) {
        title = 'Workout still pending tonight';
        sub = 'Tap + Start Workout to close the day strong';
        tone = 'blue';
        action = 'workout';
      } else if (state.waterPct < 100) {
        title = 'One final hydration push';
        sub = `${Math.max(0, state.goalWater - state.waterMl)} ml left for your target`;
        tone = 'blue';
        action = 'water';
      } else {
        title = 'Great closeout today';
        sub = 'All key habits are on track';
        tone = 'green';
        action = 'water';
      }
    }

    if (ctxEl) ctxEl.textContent = getContextLabel(context);
    msgEl.textContent = title;
    subEl.textContent = sub;
    setNextActionTone(tone);
    return action;
  }

  /* ─── Trigger app.js re-render ───────────────────────────────── */
  function triggerRerender() {
    // app.js observes meter-kcal changes
    const proxy = el('meter-kcal');
    if (proxy) {
      const txt = proxy.textContent;
      proxy.textContent = txt;
    }
    // Also emit custom event
    document.dispatchEvent(new CustomEvent('vt:datachanged'));
  }

  /* ─── Main render cycle ───────────────────────────────────────── */
  function render() {
    buildHomeStrip();
    renderRecentMeals();
    updateWaterDisplay();
    updateStepsDisplay();
    updateHomeProgress();
    updateMealList();
  }

  /* ─── Hook data changes ───────────────────────────────────────── */
  function hookDataChanges() {
    const proxy = el('meter-kcal');
    if (proxy) {
      new MutationObserver(() => requestAnimationFrame(render))
        .observe(proxy, { childList: true, characterData: true, subtree: true });
    }
  }

  /* ─── Init ───────────────────────────────────────────────────── */
  function init() {
    wireHomeButtons();
    hookDataChanges();
    render();

    let attempts = 80;
    const poll = setInterval(() => {
      attempts--;
      const S = window.VeroTrackStorage;
      if ((S && S._cachedData) || attempts <= 0) {
        clearInterval(poll);
        if (S && S._cachedData) render();
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  // Expose for session.js
  window.VTQuickLog = { render, updateHomeProgress, buildHomeStrip };

})();
