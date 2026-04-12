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
    return S && S._cachedData ? S._cachedData : null;
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
    } else {
      quickPanel.hidden  = true;
      detailPanel.hidden = false;
      if (qBtn) qBtn.classList.remove('is-active');
      if (dBtn) dBtn.classList.add('is-active');
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
    if (!data) return;
    const key   = todayKey();
    if (!data.days[key]) data.days[key] = window.VeroTrackStorage.emptyDay();

    const clone = {
      name:     meal.name,
      calories: meal.calories || 0,
      protein:  meal.protein  || 0,
      carbs:    meal.carbs    || 0,
      fats:     meal.fats     || 0,
      fiber:    meal.fiber    || 0,
      sugar:    meal.sugar    || 0,
      ts:       Date.now(),
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

  /* ─── HOME — Quick Log Strip ─────────────────────────────────── */
  function buildHomeStrip() {
    const scroll = el('eng-quick-scroll');
    if (!scroll) return;

    const lastMeal    = getLastMeal();
    const lastWorkout = getLastWorkoutName();
    const items = [];

    // Repeat last meal
    if (lastMeal) {
      items.push({
        label: `↩ ${lastMeal.name.length > 18 ? lastMeal.name.slice(0,18)+'…' : lastMeal.name}`,
        sub:   `${lastMeal.calories||0} kcal`,
        cls:   'eng-quick-item--meal',
        action: () => repeatMeal(lastMeal),
      });
    }

    // Water quick-add
    [250, 500, 750].forEach(ml => {
      items.push({
        label: `+${ml}ml 💧`,
        cls:   'eng-quick-item--water',
        action: () => quickAddWater(ml),
      });
    });

    // Last workout
    if (lastWorkout) {
      items.push({
        label: `↩ ${lastWorkout.length > 16 ? lastWorkout.slice(0,16)+'…' : lastWorkout}`,
        sub:   'Last workout',
        cls:   'eng-quick-item--workout',
        action: () => switchTab('workout'),
      });
    }

    scroll.innerHTML = '';
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `eng-quick-item ${item.cls || ''}`;
      btn.innerHTML = `<span class="eng-quick-item__label">${item.label}</span>
        ${item.sub ? `<span class="eng-quick-item__sub">${item.sub}</span>` : ''}`;
      btn.addEventListener('click', item.action);
      scroll.appendChild(btn);
    });
  }

  /* ─── Home action buttons ─────────────────────────────────────── */
  async function quickAddWater(ml) {
    const data = getData();
    if (!data) return;
    const key  = todayKey();
    if (!data.days[key]) data.days[key] = window.VeroTrackStorage.emptyDay();
    data.days[key].waterMl = (data.days[key].waterMl || 0) + ml;
    await persist(data);
    showToast(`+${ml} ml logged 💧`, 1800);

    // Flash button
    const waterBtn = el('eng-water-btn') || el('hub-water-btn');
    if (waterBtn) {
      waterBtn.classList.add('is-tapped');
      setTimeout(() => waterBtn.classList.remove('is-tapped'), 400);
    }

    triggerRerender();
    updateWaterDisplay();
    updateHomeProgress();
  }

  function wireHomeButtons() {
    // Home Water button → +250ml instant
    const wBtn = el('eng-water-btn');
    if (wBtn) wBtn.addEventListener('click', () => quickAddWater(250));

    // Home Meal button → Log tab, quick mode
    const mBtn = el('eng-meal-btn');
    if (mBtn) mBtn.addEventListener('click', () => {
      switchTab('log');
      setTimeout(() => setLogMode('quick'), 100);
    });

    // Home Workout button → Train tab
    const wkBtn = el('eng-workout-btn');
    if (wkBtn) wkBtn.addEventListener('click', () => switchTab('workout'));

    // Log tab: + Add new meal opens detailed mode
    const addNew = el('btn-add-new-meal');
    if (addNew) addNew.addEventListener('click', () => setLogMode('detailed'));

    // Mode toggle buttons
    const qBtn = el('eng-mode-quick');
    const dBtn = el('eng-mode-detailed');
    if (qBtn) qBtn.addEventListener('click', () => setLogMode('quick'));
    if (dBtn) dBtn.addEventListener('click', () => setLogMode('detailed'));

    // Log water chips (quick mode)
    const wChips = el('water-chips');
    if (wChips) {
      wChips.addEventListener('click', async e => {
        const chip = e.target.closest('[data-ml]');
        if (!chip) return;
        await quickAddWater(parseInt(chip.dataset.ml, 10));
      });
    }

    // Custom water toggle in log tab
    const wcToggle = el('wc-custom-toggle');
    const wcForm   = el('form-water-custom');
    if (wcToggle && wcForm) {
      wcToggle.addEventListener('click', () => {
        wcForm.hidden = !wcForm.hidden;
        if (!wcForm.hidden) el('water-custom') && el('water-custom').focus();
      });
    }

    // Tab switches → refresh data
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

  /* ─── Home compact progress ───────────────────────────────────── */
  function updateHomeProgress() {
    const data = getData();
    if (!data) return;
    const key  = todayKey();
    const day  = data.days && data.days[key];
    const goal = data.goals || {};

    const waterMl  = (day && day.waterMl)  || 0;
    const totalCal = ((day && day.food) || []).reduce((s,f) => s+(f.calories||0), 0);
    const steps    = (day && day.steps)    || 0;
    const workout  = day && day.workoutDone;

    const goalWater = goal.waterGoalMl   || 2500;
    const goalCal   = goal.calorieTarget || 2200;

    const pWater = Math.min(100, Math.round((waterMl / goalWater) * 100));
    const pCal   = Math.min(100, Math.round((totalCal / goalCal)  * 100));

    setBar('eng-prog-hydrate',  'eng-prog-hydrate-val',  pWater, `${pWater}%`);
    setBar('eng-prog-cal',      'eng-prog-cal-val',       pCal,   `${pCal}%`);

    const wkBar = el('eng-prog-workout');
    const wkVal = el('eng-prog-workout-val');
    if (wkBar) wkBar.style.width = workout ? '100%' : '0%';
    if (wkVal) {
      wkVal.textContent = workout ? 'Done ✓' : 'Not started';
      wkVal.classList.toggle('is-done', !!workout);
    }

    // Smart next action
    updateNextAction(waterMl, totalCal, goalCal, goalWater, steps, goal.stepGoal || 10000, workout);

    // Update workout button state on home
    const wkBtn = el('eng-workout-btn');
    const wkSub = el('eng-workout-sub');
    if (wkBtn && wkSub) {
      wkSub.textContent = workout ? 'Done ✓' : 'Start';
      wkBtn.classList.toggle('is-done', !!workout);
    }
  }

  function setBar(fillId, valId, pct, label) {
    const fill = el(fillId);
    const val  = el(valId);
    if (fill) fill.style.width = pct + '%';
    if (val)  val.textContent  = label;
  }

  /* ─── Smart next action ───────────────────────────────────────── */
  function updateNextAction(waterMl, totalCal, goalCal, goalWater, steps, goalSteps, workout) {
    const msgEl = el('eng-next-msg');
    if (!msgEl) return;

    const h = new Date().getHours();
    let msg = '';

    if (waterMl < 500) {
      msg = 'Drink 250ml water — you haven\'t hydrated yet today';
    } else if (totalCal === 0) {
      msg = h < 11 ? 'Log your breakfast to start tracking' : 'No meals yet — log your first meal';
    } else if (h >= 17 && h < 21 && !workout) {
      msg = 'It\'s workout time — start your session now 🏋️';
    } else if (!workout && h >= 12) {
      msg = 'Workout still pending — log your session today 💪';
    } else if (waterMl < goalWater * 0.5) {
      const cups = Math.ceil((goalWater - waterMl) / 250);
      msg = `${cups} more cups of water to hit your goal`;
    } else if (totalCal < goalCal * 0.6 && h >= 14) {
      msg = `Need ${goalCal - totalCal} more kcal today`;
    } else if (workout && waterMl >= goalWater * 0.8) {
      msg = 'Great work today — all key habits done! 🎉';
    } else {
      msg = 'Keep logging — small habits compound';
    }

    msgEl.textContent = msg;
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
