/**
 * VeroTrack — Premium UI Layer v3.0
 * ──────────────────────────────────
 * Drives ALL new premium components ADDED in v3:
 *   • Habit rings (Hydrate / Move / Eat / Train) — animated SVG
 *   • Daily Progress card — % + bar
 *   • Stat cards — Steps + Calories values
 *   • Water grid — 5×6 cell tracker
 *   • 7×7 Workout habit grid
 *   • Heatmap calendar
 *   • Streak circles
 *   • Segmented control (History tab)
 *   • Train stats pull
 *
 * This file reads from the same `window.VeroTrackStorage` and
 * `window.VeroTrackBurn` modules used by app.js — no duplication.
 *
 * Runs AFTER app.js so all storage is already initialised.
 */

(function () {
  'use strict';

  /* ─── Ring circumference for r=26 → 2π×26 ≈ 163.36 ──────── */
  const RING_C = 2 * Math.PI * 26; // 163.36

  /* ─── Utility ────────────────────────────────────────────── */
  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function pct(current, goal) {
    if (!goal || goal <= 0) return 0;
    return clamp((current / goal) * 100, 0, 100);
  }

  function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function todayKey() {
    return formatDateKey(new Date());
  }

  /* ─── Set SVG ring progress ──────────────────────────────── */
  function setRing(id, pctVal) {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = RING_C - (pctVal / 100) * RING_C;
    el.style.strokeDashoffset = String(offset);
  }

  /* ─── Number counter animation ───────────────────────────── */
  function animateNumber(el, target, duration = 600, suffix = '') {
    if (!el) return;
    const start = performance.now();
    const from = parseFloat(el.textContent) || 0;
    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      const val = Math.round(from + (target - from) * ease);
      el.textContent = val + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ─── Wait for app.js to initialise data ─────────────────── */
  function waitForData(cb, attempts = 40) {
    const S = window.VeroTrackStorage;
    if (!S) {
      if (attempts > 0) setTimeout(() => waitForData(cb, attempts - 1), 200);
      return;
    }
    // Check if storage has data available
    cb(S);
  }

  /* ──────────────────────────────────────────────────────────
     MAIN RENDER — called whenever the premium UI needs refresh
     ────────────────────────────────────────────────────────── */
  function renderPremiumUI() {
    const S = window.VeroTrackStorage;
    const B = window.VeroTrackBurn;
    if (!S || !B) return;

    const key  = todayKey();
    const data = S._cachedData || null;
    if (!data) return;

    const rawDay = data.days && data.days[key];
    const day    = rawDay ? S.migrateDay(JSON.parse(JSON.stringify(rawDay))) : S.emptyDay();
    const goals  = data.goals || {};

    // ── Calorie totals ─────────────────────────────────────
    let cals = 0, prot = 0;
    if (day.food) {
      day.food.forEach(f => { cals += f.calories || 0; prot += f.protein || 0; });
    }

    const waterMl = day.waterMl || 0;
    const steps   = day.steps   || 0;

    // ── Goals ──────────────────────────────────────────────
    const goalCal   = goals.calorieTarget   || 2200;
    const goalProt  = goals.proteinTargetG  || 150;
    const goalSteps = goals.stepGoal        || 10000;
    const goalWater = goals.waterGoalMl     || 2500;

    // ── Habit Ring percentages ─────────────────────────────
    const pHydrate = pct(waterMl, goalWater);
    const pMove    = pct(steps, goalSteps);
    const pEat     = pct(cals, goalCal);
    const pTrain   = day.workoutDone ? 100 : 0;

    setRing('vt-ring-hydrate', pHydrate);
    setRing('vt-ring-move',    pMove);
    setRing('vt-ring-eat',     pEat);
    setRing('vt-ring-train',   pTrain);

    const fmt = v => `${Math.round(v)}%`;
    setText('vt-ring-hydrate-pct', fmt(pHydrate));
    setText('vt-ring-move-pct',    fmt(pMove));
    setText('vt-ring-eat-pct',     fmt(pEat));
    setText('vt-ring-train-pct',   day.workoutDone ? 'Done' : 'Pending');

    // ── Daily Progress Card ────────────────────────────────
    const overallPct = Math.round((pHydrate + pMove + pEat + pTrain) / 4);
    const pctEl  = document.getElementById('vt-daily-pct');
    const barEl  = document.getElementById('vt-daily-bar');
    const lblEl  = document.getElementById('vt-daily-label');

    if (pctEl) animateNumber(pctEl, overallPct, 700, '%');
    if (barEl) barEl.style.width = overallPct + '%';
    if (lblEl) {
      if (overallPct >= 100) lblEl.textContent = 'All goals crushed! 🎉';
      else if (overallPct >= 75) lblEl.textContent = 'Almost there — keep pushing!';
      else if (overallPct >= 40) lblEl.textContent = 'Good progress — keep going';
      else lblEl.textContent = 'Start strong — every step counts';
    }

    // ── Stat Cards ────────────────────────────────────────
    const stepsEl    = document.getElementById('vt-stat-steps');
    const stepsSubEl = document.getElementById('vt-stat-steps-sub');
    const calsEl     = document.getElementById('vt-stat-cals');
    const calsSubEl  = document.getElementById('vt-stat-cals-sub');

    if (stepsEl) animateNumber(stepsEl, steps, 800);
    if (stepsSubEl) stepsSubEl.textContent = goalSteps > 0 ? `${Math.round(pMove)}% of ${goalSteps.toLocaleString()}` : '—';
    if (calsEl) animateNumber(calsEl, cals, 800);
    if (calsSubEl) calsSubEl.textContent = goalCal > 0 ? `${Math.round(pEat)}% of ${goalCal} kcal` : 'kcal in';

    // ── Water Grid ────────────────────────────────────────
    renderWaterGrid(waterMl, goalWater);

    // ── 7×7 Workout Grid ──────────────────────────────────
    renderWorkoutGrid(data);

    // ── Train Stats ───────────────────────────────────────
    renderTrainStats(day, data.profile);
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ──────────────────────────────────────────────────────────
     WATER GRID — 5 rows × 6 cols = 30 cups
     Each cell ≈ (goalWater / 30) ml
     ────────────────────────────────────────────────────────── */
  function renderWaterGrid(waterMl, goalWater) {
    const grid = document.getElementById('vt-water-grid');
    if (!grid) return;

    const CELLS = 30;
    const mlPerCell = Math.round(goalWater / CELLS) || 100;
    const filled = Math.min(CELLS, Math.floor(waterMl / mlPerCell));

    // Build once or rebuild
    if (grid.children.length !== CELLS) {
      grid.innerHTML = '';
      for (let i = 0; i < CELLS; i++) {
        const cell = document.createElement('div');
        cell.className = 'vt-water-cell';
        cell.setAttribute('aria-label', `${mlPerCell * (i + 1)} ml`);
        cell.style.animationDelay = `${i * 0.02}s`;
        grid.appendChild(cell);
      }
    }

    Array.from(grid.children).forEach((cell, i) => {
      cell.classList.toggle('filled', i < filled);
    });
  }

  /* ──────────────────────────────────────────────────────────
     7×7 WORKOUT HABIT GRID — last 49 days
     ────────────────────────────────────────────────────────── */
  function renderWorkoutGrid(data) {
    const grid = document.getElementById('vt-workout-grid');
    if (!grid) return;

    const CELLS = 49;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDateKey(today);

    if (grid.children.length !== CELLS) {
      grid.innerHTML = '';
      for (let i = 0; i < CELLS; i++) {
        const cell = document.createElement('div');
        cell.className = 'vt-workout-cell';
        grid.appendChild(cell);
      }
    }

    const cells = Array.from(grid.children);
    for (let i = 0; i < CELLS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - (CELLS - 1 - i));
      const key = formatDateKey(d);
      const dayData = data.days && data.days[key];
      const done = !!(dayData && dayData.workoutDone);
      const isToday = key === todayStr;

      cells[i].classList.toggle('done', done);
      cells[i].classList.toggle('today', isToday);
      cells[i].title = `${key}${done ? ' ✓' : ''}`;
    }
  }

  /* ──────────────────────────────────────────────────────────
     HEATMAP CALENDAR — last 91 days (13 × 7)
     ────────────────────────────────────────────────────────── */
  function renderHeatmap(data) {
    const grid = document.getElementById('vt-heatmap');
    if (!grid) return;

    const CELLS = 91; // 13 cols × 7 rows
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calc max calories for normalisation
    let maxCal = 1;
    for (let i = 0; i < CELLS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - (CELLS - 1 - i));
      const key = formatDateKey(d);
      const dayData = data.days && data.days[key];
      if (dayData && dayData.food) {
        const sum = dayData.food.reduce((acc, f) => acc + (f.calories || 0), 0);
        if (sum > maxCal) maxCal = sum;
      }
    }

    grid.innerHTML = '';
    for (let i = 0; i < CELLS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - (CELLS - 1 - i));
      const key = formatDateKey(d);
      const dayData = data.days && data.days[key];
      let level = 0;

      if (dayData) {
        const calSum = dayData.food ? dayData.food.reduce((acc, f) => acc + (f.calories || 0), 0) : 0;
        const hasWorkout = dayData.workoutDone;
        const ratio = calSum / maxCal;
        if (hasWorkout || ratio > 0.7) level = 4;
        else if (ratio > 0.4) level = 3;
        else if (ratio > 0.15) level = 2;
        else if (calSum > 0) level = 1;
      }

      const cell = document.createElement('div');
      cell.className = 'vt-heatmap-cell';
      cell.setAttribute('data-level', level);
      cell.setAttribute('title', `${key}${level > 0 ? ' — activity logged' : ''}`);
      cell.style.animationDelay = `${i * 0.004}s`;
      grid.appendChild(cell);
    }
  }

  /* ──────────────────────────────────────────────────────────
     STREAK CIRCLES — last 7 days
     ────────────────────────────────────────────────────────── */
  function renderStreakCircles(data) {
    const row = document.getElementById('vt-streak-row');
    if (!row) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    row.innerHTML = '';
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key  = formatDateKey(d);
      const dd   = data.days && data.days[key];
      const done = !!(dd && dd.workoutDone);
      const isToday = i === 0;

      const wrap = document.createElement('div');
      wrap.className = 'vt-streak-circle' + (done ? ' active' : '');
      wrap.setAttribute('aria-label', `${days[d.getDay()]} — ${done ? 'done' : 'missed'}`);

      const dayLbl = document.createElement('span');
      dayLbl.className = 'vt-streak-circle__day';
      dayLbl.textContent = isToday ? 'Today' : days[d.getDay()];

      const icon = document.createElement('span');
      icon.className = 'vt-streak-circle__icon';
      icon.textContent = done ? '✓' : (isToday ? '○' : '·');

      wrap.appendChild(dayLbl);
      wrap.appendChild(icon);
      row.appendChild(wrap);
    }
  }

  /* ──────────────────────────────────────────────────────────
     TRAIN PAGE STATS
     ────────────────────────────────────────────────────────── */
  function renderTrainStats(day, profile) {
    const B = window.VeroTrackBurn;
    if (!B || !day) return;

    const exercises = day.exercises || [];
    let totalSets = 0, totalReps = 0, totalWeight = 0, totalMins = 0, count = 0;

    exercises.forEach(ex => {
      totalSets   += ex.sets   || 0;
      totalReps   += ex.reps   || 0;
      totalWeight += (ex.weight || 0) * (ex.sets || 1);
      totalMins   += ex.durationMin || 0;
      count++;
    });

    const avgStr = count > 0 ? Math.round(totalWeight / count) : 0;
    const volKg  = Math.round(totalSets * totalReps * (totalWeight / Math.max(1, count)));

    setText('vt-train-volume',   volKg > 0 ? `${volKg} kg` : '—');
    setText('vt-train-time',     totalMins > 0 ? `${totalMins} min` : '—');
    setText('vt-train-strength', avgStr > 0 ? `${avgStr} kg` : '—');
    setText('vt-train-records',  count > 0 ? String(count) : '—');
  }

  /* ──────────────────────────────────────────────────────────
     SEGMENTED CONTROL (History tab)
     ────────────────────────────────────────────────────────── */
  function initSegmentedControl() {
    const buttons = document.querySelectorAll('.vt-segment-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Could filter history table here in future; for now it's decorative
      });
    });
  }

  /* ──────────────────────────────────────────────────────────
     HISTORY TAB OBSERVER
     Renders heatmap + streaks when History tab first opens
     ────────────────────────────────────────────────────────── */
  function initHistoryTabObserver() {
    const historyTab = document.getElementById('tab-history');
    if (!historyTab) return;

    let rendered = false;
    const observer = new MutationObserver(() => {
      if (historyTab.classList.contains('active') && !rendered) {
        rendered = true;
        const S = window.VeroTrackStorage;
        if (S && S._cachedData) {
          renderHeatmap(S._cachedData);
          renderStreakCircles(S._cachedData);
        }
        observer.disconnect();
      }
    });

    observer.observe(historyTab, { attributes: true, attributeFilter: ['class'] });

    // Also check if already active
    if (historyTab.classList.contains('active')) {
      const S = window.VeroTrackStorage;
      if (S && S._cachedData) {
        renderHeatmap(S._cachedData);
        renderStreakCircles(S._cachedData);
        rendered = true;
      }
    }
  }

  /* ──────────────────────────────────────────────────────────
     PATCH VeroTrackStorage to cache data for our use
     ────────────────────────────────────────────────────────── */
  function patchStorage() {
    const S = window.VeroTrackStorage;
    if (!S) return false;

    if (S._premiumPatched) return true;
    S._premiumPatched = true;

    const origLoad = S.load.bind(S);
    S.load = async function (email) {
      const result = await origLoad(email);
      S._cachedData = result;
      return result;
    };

    const origSave = S.save.bind(S);
    S.save = async function (data, email) {
      S._cachedData = data;
      return origSave(data, email);
    };

    // Also patch syncWithCloud if present
    if (S.syncWithCloud) {
      const origSync = S.syncWithCloud.bind(S);
      S.syncWithCloud = async function (data, email) {
        const result = await origSync(data, email);
        S._cachedData = result;
        return result;
      };
    }

    return true;
  }

  /* ──────────────────────────────────────────────────────────
     TAB CHANGE HOOK — refresh premium UI on tab switch
     ────────────────────────────────────────────────────────── */
  function hookTabChanges() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        requestAnimationFrame(() => {
          const tab = btn.getAttribute('data-tab');
          if (tab === 'home' || tab === 'workout' || tab === 'log') {
            setTimeout(renderPremiumUI, 80);
          }
          if (tab === 'history') {
            const S = window.VeroTrackStorage;
            if (S && S._cachedData) {
              setTimeout(() => {
                renderHeatmap(S._cachedData);
                renderStreakCircles(S._cachedData);
              }, 80);
            }
          }
        });
      });
    });
  }

  /* ──────────────────────────────────────────────────────────
     INIT — wait for DOM + app.js data
     ────────────────────────────────────────────────────────── */
  function init() {
    // Patch storage ASAP
    if (!patchStorage()) {
      setTimeout(init, 150);
      return;
    }

    initSegmentedControl();
    hookTabChanges();
    initHistoryTabObserver();

    // First render — poll until data is loaded
    let attempts = 60;
    const pollRender = setInterval(() => {
      attempts--;
      const S = window.VeroTrackStorage;
      if ((S && S._cachedData) || attempts <= 0) {
        clearInterval(pollRender);
        renderPremiumUI();
      }
    }, 250);

    // Also listen for app re-renders triggered by data changes
    // We hook into a global event that app.js doesn't fire, so we
    // use a MutationObserver on key stat elements as a proxy
    const proxyEl = document.getElementById('meter-kcal');
    if (proxyEl) {
      const mo = new MutationObserver(() => {
        requestAnimationFrame(renderPremiumUI);
      });
      mo.observe(proxyEl, { childList: true, characterData: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
