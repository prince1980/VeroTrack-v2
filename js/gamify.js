(function () {
  const XP_FOOD = 15;
  const XP_WATER_ADD = 4;
  const XP_WORKOUT_DONE = 45;
  const XP_EXERCISE = 22;
  const XP_STEPS_GOAL = 28;
  const XP_PROTEIN_GOAL = 32;
  const XP_WATER_GOAL = 18;
  const XP_CHALLENGE = 55;
  const LEVEL_STEP = 500;

  function defaultGame() {
    return {
      xp: 0,
      badges: [],
      daily: null,
      flags: {},
    };
  }

  function ensureGame(data) {
    if (!data.game || typeof data.game !== 'object') {
      data.game = defaultGame();
    }
    if (typeof data.game.xp !== 'number' || data.game.xp < 0) {
      data.game.xp = 0;
    }
    if (!Array.isArray(data.game.badges)) {
      data.game.badges = [];
    }
    if (!data.game.flags || typeof data.game.flags !== 'object') {
      data.game.flags = {};
    }
    return data.game;
  }

  function levelFromXp(xp) {
    return Math.floor(xp / LEVEL_STEP) + 1;
  }

  function xpProgress(xp) {
    const inLevel = xp % LEVEL_STEP;
    return { inLevel, nextAt: LEVEL_STEP, pct: inLevel / LEVEL_STEP };
  }

  function addBadge(game, id) {
    if (game.badges.includes(id)) return false;
    game.badges.push(id);
    return true;
  }

  function dayFlags(game, dateKey) {
    if (!game.flags[dateKey]) {
      game.flags[dateKey] = {};
    }
    return game.flags[dateKey];
  }

  const CHALLENGES = [
    { id: 'ch_workout', title: 'Daily quest', desc: 'Mark your workout done today.' },
    { id: 'ch_protein', title: 'Daily quest', desc: 'Hit your protein goal today.' },
    { id: 'ch_water', title: 'Daily quest', desc: 'Hit your water goal today.' },
    { id: 'ch_food', title: 'Daily quest', desc: 'Log at least one meal today.' },
    { id: 'ch_steps', title: 'Daily quest', desc: 'Reach your step goal today.' },
  ];

  function pickChallenge(dateKey) {
    const seed = dateKey.split('-').reduce((a, n) => a + parseInt(n, 10), 0);
    const idx = seed % CHALLENGES.length;
    return { ...CHALLENGES[idx], dateKey, claimed: false };
  }

  function ensureDailyChallenge(game, dateKey) {
    if (!game.daily || game.daily.dateKey !== dateKey) {
      game.daily = pickChallenge(dateKey);
    }
    return game.daily;
  }

  function isChallengeComplete(daily, ctx) {
    if (!daily || daily.claimed) return false;
    const { day, totals, goals } = ctx;
    switch (daily.id) {
      case 'ch_workout':
        return !!day.workoutDone;
      case 'ch_protein':
        return totals.protein >= goals.proteinTargetG;
      case 'ch_water':
        return (day.waterMl || 0) >= goals.waterGoalMl;
      case 'ch_food':
        return day.food.length > 0;
      case 'ch_steps':
        return (day.steps || 0) >= goals.stepGoal;
      default:
        return false;
    }
  }

  function awardXp(game, amount, onToast) {
    if (amount <= 0) return;
    game.xp += amount;
    if (typeof onToast === 'function') {
      onToast(`+${amount} XP`);
    }
  }

  window.VeroTrackGamify = {
    defaultGame,
    ensureGame,
    levelFromXp,
    xpProgress,
    addBadge,
    dayFlags,
    ensureDailyChallenge,
    isChallengeComplete,
    awardXp,
    XP_FOOD,
    XP_WATER_ADD,
    XP_WORKOUT_DONE,
    XP_EXERCISE,
    XP_STEPS_GOAL,
    XP_PROTEIN_GOAL,
    XP_WATER_GOAL,
    XP_CHALLENGE,
    CHALLENGES,
  };
})();
