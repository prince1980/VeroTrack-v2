/**
 * VeroTrack Engine v5 — Session Tracker Module
 * ─────────────────────────────────────────────────────────────────
 * RESPONSIBILITIES:
 *   • Active workout session timer (localStorage-persisted)
 *   • Show/hide session banner in Train tab
 *   • "Start Workout" hero CTA — starts session immediately
 *   • "End Session" → calls btn-workout-toggle to mark done
 *   • Exercise bottom sheet: open/close + form wiring
 *
 * SESSION PERSISTS across refresh via localStorage key: vt_session
 */

(function () {
  'use strict';

  const SESSION_KEY = 'vt_session_v1';
  const el = id => document.getElementById(id);

  /* ─── Session state ──────────────────────────────────────────── */
  let _timer = null;
  let _session = null;

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      _session = raw ? JSON.parse(raw) : null;
    } catch(e) { _session = null; }
  }

  function saveSession() {
    try {
      if (_session) localStorage.setItem(SESSION_KEY, JSON.stringify(_session));
      else localStorage.removeItem(SESSION_KEY);
    } catch(e) {}
  }

  function startSession() {
    if (_session && _session.active) return false;
    _session = { startedAt: Date.now(), active: true };
    saveSession();
    renderSessionUI();
    startTimer();
    return true;
  }

  function endSession() {
    if (!_session) return false;
    _session = null;
    saveSession();
    stopTimer();
    renderSessionUI();
    // Mark workout done via the existing toggle button
    const day = getTodayWorkout();
    if (!day) {
      const toggleBtn = el('btn-workout-toggle');
      if (toggleBtn && !isWorkoutDone()) toggleBtn.click();
    }
    return true;
  }

  function isWorkoutDone() {
    const S = window.VeroTrackStorage;
    if (!S || !S._cachedData) return false;
    const key = todayKey();
    const day = S._cachedData.days && S._cachedData.days[key];
    return day && day.workoutDone;
  }

  function getTodayWorkout() {
    return isWorkoutDone();
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function startFromAction() {
    if (isWorkoutDone()) return false;
    return startSession();
  }

  function isActive() {
    return !!(_session && _session.active);
  }

  /* ─── Timer ──────────────────────────────────────────────────── */
  function startTimer() {
    stopTimer();
    _timer = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
  }

  function stopTimer() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  function updateTimerDisplay() {
    const timeEl = el('eng-session-time');
    if (!timeEl || !_session) return;
    const elapsed = Math.floor((Date.now() - _session.startedAt) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    timeEl.textContent = h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  /* ─── Session UI ─────────────────────────────────────────────── */
  function renderSessionUI() {
    const banner     = el('eng-session-banner');
    const heroBtn    = el('btn-workout-toggle');
    const heroIcon   = el('eng-workout-hero-icon');
    const heroLabel  = el('eng-workout-hero-label');
    const heroSub    = el('workout-hint');
    const workoutDone = isWorkoutDone();

    if (banner) banner.hidden = !_session;

    if (heroIcon && heroLabel) {
      if (_session && _session.active) {
        heroIcon.textContent  = '⏸';
        heroLabel.textContent = 'Session Active';
        if (heroSub) heroSub.textContent = 'Tap to end session';
        if (heroBtn) heroBtn.classList.add('is-active-session');
      } else if (workoutDone) {
        heroIcon.textContent  = '✅';
        heroLabel.textContent = 'Workout Done';
        if (heroSub) heroSub.textContent = 'Tap to undo';
        if (heroBtn) heroBtn.classList.remove('is-active-session');
        if (heroBtn) heroBtn.classList.add('is-done');
      } else {
        heroIcon.textContent  = '🏋️';
        heroLabel.textContent = 'Start Workout';
        if (heroSub) heroSub.textContent = 'Tap to begin your session';
        if (heroBtn) heroBtn.classList.remove('is-active-session', 'is-done');
      }
    }

    // Also update the home workout button sub text
    const homeSub = el('eng-workout-sub');
    if (homeSub) {
      homeSub.textContent = workoutDone ? 'Done ✓' : (_session ? 'In progress' : 'Start');
    }
  }

  /* ─── Hero CTA intercept ─────────────────────────────────────── */
  function wireHeroButton() {
    const heroBtn = el('btn-workout-toggle');
    if (!heroBtn) return;

    // We add our listener FIRST (capture phase) so we can modify behavior
    // app.js adds its listener later in bubble phase — both will fire
    heroBtn.addEventListener('click', () => {
      if (_session && _session.active) {
        endSession();
      } else if (!_session) {
        startSession();
        // Let app.js also handle its toggle logic — mark done if they tap once
        // Actually we separate: start session ≠ mark done
        // Mark done happens when they tap "End session" in the banner
      }
      // If workout is already done, let app.js handle the undo
    }, true); // capture phase
  }

  /* ─── End session button in banner ───────────────────────────── */
  function wireEndButton() {
    const endBtn = el('eng-session-end');
    if (!endBtn) return;
    endBtn.addEventListener('click', () => {
      endSession();
      renderSessionUI();
    });
  }

  /* ─── Exercise bottom sheet ──────────────────────────────────── */
  function wireExerciseSheet() {
    const addBtn   = el('btn-add-exercise');
    const sheet    = el('eng-exercise-sheet');
    const closeBtn = el('eng-ex-sheet-close');
    const overlay  = sheet;

    if (!addBtn || !sheet) return;

    // Open sheet
    addBtn.addEventListener('click', () => {
      sheet.hidden = false;
      document.body.style.overflow = 'hidden';
      setTimeout(() => sheet.classList.add('is-open'), 10);
      const nameField = el('ex-name');
      if (nameField) setTimeout(() => nameField.focus(), 300);
    });

    // Close sheet
    function closeSheet() {
      sheet.classList.remove('is-open');
      document.body.style.overflow = '';
      setTimeout(() => { sheet.hidden = true; }, 300);
    }

    if (closeBtn) closeBtn.addEventListener('click', closeSheet);

    // Tap overlay background to close
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeSheet();
    });

    // Close when form submits (app.js handles the actual submit)
    const form = el('form-exercise');
    if (form) {
      form.addEventListener('submit', () => {
        setTimeout(closeSheet, 100);
      });
    }
  }

  /* ─── Hook data changes (workout status) ─────────────────────── */
  function hookDataChanges() {
    const proxy = el('meter-kcal');
    if (proxy) {
      new MutationObserver(() => {
        requestAnimationFrame(renderSessionUI);
      }).observe(proxy, { childList: true, characterData: true, subtree: true });
    }
  }

  /* ─── Train tab visibility ───────────────────────────────────── */
  function hookTabChange() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'workout') {
          setTimeout(renderSessionUI, 50);
        }
      });
    });
  }

  /* ─── Init ───────────────────────────────────────────────────── */
  function init() {
    loadSession();
    wireHeroButton();
    wireEndButton();
    wireExerciseSheet();
    hookDataChanges();
    hookTabChange();

    if (_session && _session.active) {
      startTimer();
    }
    renderSessionUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  window.VTSession = {
    startFromAction,
    isActive,
    endFromAction: endSession,
  };

})();
