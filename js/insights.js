/**
 * VeroTrack Engine v5 — Insights Module
 * ─────────────────────────────────────────────────────────────────
 * RESPONSIBILITIES:
 *   • Scan last 30 days of storage data for patterns
 *   • Generate human-readable insight strings
 *   • Render insight cards in History tab (#eng-insights-section)
 *   • Compute consistency score (0-100)
 *   • Identify best week, missed workouts, protein adherence
 */

(function () {
  'use strict';

  const el = id => document.getElementById(id);

  /* ─── Date utils ─────────────────────────────────────────────── */
  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function lastNKeys(n) {
    const keys = [];
    for (let i = 0; i < n; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      keys.push(dateKey(d));
    }
    return keys;
  }

  function formatDateRange(key1, key2) {
    const opts = { month: 'short', day: 'numeric' };
    const d1 = new Date(key1 + 'T00:00:00');
    const d2 = new Date(key2 + 'T00:00:00');
    return `${d1.toLocaleDateString('en', opts)} – ${d2.toLocaleDateString('en', opts)}`;
  }

  /* ─── Analysis engine ────────────────────────────────────────── */
  function analyzeData(data) {
    if (!data || !data.days) return null;
    const goals = data.goals || {};
    const keys30 = lastNKeys(30);
    const keys7  = lastNKeys(7);

    // Aggregate per day
    const days30 = keys30.map(k => ({ key: k, ...(data.days[k] || {}) }));
    const days7  = keys7.map(k => ({ key: k, ...(data.days[k] || {}) }));

    const proteinGoal = goals.proteinTargetG || 0;
    const waterGoal   = goals.waterGoalMl    || 2500;
    const calGoal     = goals.calorieTarget  || 2200;

    // ── 7-day stats ───────────────────────────────────────────
    const workouts7 = days7.filter(d => d.workoutDone).length;
    const missed7   = 7 - workouts7;

    const proteinDays7 = proteinGoal > 0
      ? days7.filter(d => {
          const g = (d.food || []).reduce((s,f) => s+(f.protein||0), 0);
          return g >= proteinGoal * 0.85;
        }).length
      : null;

    const waterDays7 = days7.filter(d => (d.waterMl || 0) >= waterGoal * 0.9).length;

    // ── Best week in last 30 days ─────────────────────────────
    let bestWeekScore = -1, bestWeekStart = null, bestWeekEnd = null;
    for (let w = 0; w < 4; w++) {
      const weekKeys = keys30.slice(w * 7, w * 7 + 7);
      if (weekKeys.length < 7) continue;
      const weekDays = weekKeys.map(k => data.days[k] || {});
      let score = 0;
      weekDays.forEach(d => {
        if (d.workoutDone) score += 3;
        if ((d.waterMl || 0) >= waterGoal * 0.9) score += 2;
        if (proteinGoal > 0) {
          const g = (d.food || []).reduce((s,f) => s+(f.protein||0), 0);
          if (g >= proteinGoal * 0.85) score += 2;
        }
      });
      if (score > bestWeekScore) {
        bestWeekScore = score;
        bestWeekStart = weekKeys[weekKeys.length - 1];
        bestWeekEnd   = weekKeys[0];
      }
    }

    // ── Current streak ────────────────────────────────────────
    let streak = 0;
    for (const k of keys30) {
      if (data.days[k] && data.days[k].workoutDone) streak++;
      else break;
    }

    // ── Logged days ───────────────────────────────────────────
    const loggedDays30 = days30.filter(d => (d.food && d.food.length > 0) || d.workoutDone || d.waterMl > 0).length;

    return {
      workouts7, missed7, proteinDays7, waterDays7,
      bestWeekStart, bestWeekEnd, bestWeekScore,
      streak, loggedDays30, proteinGoal, waterGoal, calGoal,
    };
  }

  /* ─── Generate insight cards ─────────────────────────────────── */
  function generateInsights(stats) {
    if (!stats) return [];
    const cards = [];

    // Streak
    if (stats.streak >= 3) {
      cards.push({
        icon:  '🔥',
        title: `${stats.streak}-day streak!`,
        body:  'You\'ve logged workouts ${stats.streak} days in a row. Keep it going.',
        type:  'positive',
      });
    } else if (stats.streak === 0 && stats.loggedDays30 > 0) {
      cards.push({
        icon:  '⚡',
        title: 'Start a new streak',
        body:  'Log a workout today to start your streak.',
        type:  'alert',
      });
    }

    // Missed workouts this week
    if (stats.missed7 >= 4) {
      cards.push({
        icon:  '📉',
        title: `Missed ${stats.missed7} workouts this week`,
        body:  'Get back on track — even a 20-min session counts.',
        type:  'alert',
      });
    } else if (stats.missed7 > 0 && stats.missed7 < 4) {
      cards.push({
        icon:  '💪',
        title: `${stats.workouts7}/7 workouts this week`,
        body:  stats.missed7 === 1 ? 'Almost perfect — one session missed.' : `${stats.missed7} sessions missed this week.`,
        type:  'neutral',
      });
    } else if (stats.workouts7 === 7) {
      cards.push({
        icon:  '🏆',
        title: 'Perfect workout week!',
        body:  '7/7 workouts logged. Outstanding consistency.',
        type:  'positive',
      });
    }

    // Protein adherence
    if (stats.proteinGoal > 0 && stats.proteinDays7 !== null) {
      if (stats.proteinDays7 <= 2) {
        cards.push({
          icon:  '🥩',
          title: `Protein goal hit ${stats.proteinDays7}/7 days`,
          body:  `You\'re missing your ${stats.proteinGoal}g target most days. Prioritize high-protein meals.`,
          type:  'alert',
        });
      } else if (stats.proteinDays7 >= 5) {
        cards.push({
          icon:  '🥩',
          title: `Protein consistent: ${stats.proteinDays7}/7 days`,
          body:  'Hitting your protein target almost every day. 💪',
          type:  'positive',
        });
      }
    }

    // Hydration
    if (stats.waterDays7 >= 5) {
      cards.push({
        icon:  '💧',
        title: `Hydration: ${stats.waterDays7}/7 days on target`,
        body:  'Strong hydration consistency this week.',
        type:  'positive',
      });
    } else if (stats.waterDays7 <= 2) {
      cards.push({
        icon:  '💧',
        title: 'Hydration needs attention',
        body:  `Only ${stats.waterDays7} days hit your water goal this week. Aim for ${Math.round(stats.waterGoal / 250)} cups a day.`,
        type:  'alert',
      });
    }

    // Best week callout
    if (stats.bestWeekStart && stats.bestWeekScore > 10) {
      cards.push({
        icon:  '📅',
        title: 'Best week: ' + formatDateRange(stats.bestWeekStart, stats.bestWeekEnd),
        body:  'This was your most consistent week in the last 30 days.',
        type:  'neutral',
      });
    }

    // Consistency score
    const consistency = Math.min(100, Math.round((stats.loggedDays30 / 30) * 100));
    if (consistency >= 70) {
      cards.push({
        icon:  '📊',
        title: `${consistency}% consistency — ${consistency >= 90 ? 'Elite' : 'Strong'}`,
        body:  `You've logged data on ${stats.loggedDays30} of the last 30 days.`,
        type:  'positive',
      });
    } else if (consistency > 0) {
      cards.push({
        icon:  '📊',
        title: `${consistency}% consistency`,
        body:  `${stats.loggedDays30}/30 days logged. More frequent logging = better insights.`,
        type:  'neutral',
      });
    }

    return cards;
  }

  /* ─── Render cards into DOM ──────────────────────────────────── */
  function renderInsights() {
    const container = el('eng-insights-section');
    const empty     = el('eng-insights-empty');
    if (!container) return;

    const data = window.VeroTrackStorage && window.VeroTrackStorage._cachedData;
    if (!data) return;

    const loggedKeys = Object.keys(data.days || {}).filter(k => {
      const d = data.days[k];
      return d && (d.food?.length || d.workoutDone || d.waterMl);
    });

    if (loggedKeys.length < 3) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    const stats   = analyzeData(data);
    const cards   = generateInsights(stats);

    if (cards.length === 0) {
      container.innerHTML = '';
      if (empty) { empty.textContent = 'Keep logging — insights appear after 7 days'; empty.hidden = false; }
      return;
    }

    const typeClass = { positive: 'eng-insight-card--green', alert: 'eng-insight-card--red', neutral: '' };

    container.innerHTML = cards.map(c => `
      <div class="eng-insight-card ${typeClass[c.type] || ''}">
        <span class="eng-insight-card__icon">${c.icon}</span>
        <div class="eng-insight-card__body">
          <p class="eng-insight-card__title">${escHtml(c.title)}</p>
          <p class="eng-insight-card__body-text">${escHtml(c.body)}</p>
        </div>
      </div>`).join('');
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ─── Hook updates ───────────────────────────────────────────── */
  function hookHistoryTab() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'history') {
          setTimeout(renderInsights, 100);
        }
      });
    });
  }

  /* ─── Init ───────────────────────────────────────────────────── */
  function init() {
    hookHistoryTab();
    let attempts = 80;
    const poll = setInterval(() => {
      attempts--;
      const S = window.VeroTrackStorage;
      if ((S && S._cachedData) || attempts <= 0) {
        clearInterval(poll);
        if (S && S._cachedData) renderInsights();
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

})();
