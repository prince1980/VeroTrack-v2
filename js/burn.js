(function () {
  const MET_BY_CATEGORY = {
    strength: 5,
    hiit: 9,
    cardio_light: 4,
    cardio_mod: 7,
    cardio_hard: 10,
    walk_run: 6,
    yoga: 3,
    sports: 6,
    other: 5,
  };

  const MET_LABELS = {
    strength: 'Strength / lifting',
    hiit: 'HIIT / circuits',
    cardio_light: 'Cardio — light',
    cardio_mod: 'Cardio — moderate',
    cardio_hard: 'Cardio — hard',
    walk_run: 'Walk / jog',
    yoga: 'Yoga / stretch',
    sports: 'Sports',
    other: 'Other',
  };

  function profileWeightKg(profile) {
    const w = profile && profile.weightKg;
    return typeof w === 'number' && w > 0 ? w : 0;
  }

  function profileHeightCm(profile) {
    const h = profile && profile.heightCm;
    return typeof h === 'number' && h > 0 ? h : 0;
  }

  function bmrKcal(profile) {
    const kg = profileWeightKg(profile);
    const cm = profileHeightCm(profile);
    const age = profile && typeof profile.age === 'number' && profile.age > 0 ? profile.age : 0;
    if (!kg || !cm || !age) return 0;
    const sex = profile.sex || 'x';
    const base = 10 * kg + 6.25 * cm - 5 * age;
    if (sex === 'f') return Math.round(base - 161);
    if (sex === 'm') return Math.round(base + 5);
    return Math.round(base - 78);
  }

  function restingBurnSoFarKcal(profile) {
    const bmr = bmrKcal(profile);
    if (!bmr) return 0;
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const frac = (now - start) / (24 * 60 * 60 * 1000);
    return Math.round(bmr * Math.min(1, Math.max(0, frac)));
  }

  function stepWalkingBurnKcal(steps, profile) {
    const s = Math.max(0, Math.floor(steps || 0));
    const kg = profileWeightKg(profile);
    if (!kg || s === 0) return 0;
    const h = profileHeightCm(profile);
    if (h > 0) {
      const strideM = 0.414 * (h / 100);
      const distKm = (s * strideM) / 1000;
      return Math.round(0.65 * kg * distKm);
    }
    return Math.round(s * 0.038 * (kg / 70));
  }

  function exerciseLineBurnKcal(ex, profile) {
    const kg = profileWeightKg(profile);
    if (!kg) return 0;
    const met = MET_BY_CATEGORY[ex.metCategory] != null ? MET_BY_CATEGORY[ex.metCategory] : MET_BY_CATEGORY.other;
    const mins = typeof ex.durationMin === 'number' && ex.durationMin >= 0 ? ex.durationMin : 0;
    if (mins <= 0) return 0;
    return Math.round(met * kg * (mins / 60));
  }

  function trainingBurnFromExercises(exercises, profile) {
    if (!exercises || !exercises.length) return 0;
    let sum = 0;
    exercises.forEach((ex) => {
      sum += exerciseLineBurnKcal(ex, profile);
    });
    return sum;
  }

  function totalActiveBurn(day, profile) {
    const walk = stepWalkingBurnKcal(day.steps, profile);
    const train = trainingBurnFromExercises(day.exercises, profile);
    return {
      walk,
      train,
      total: walk + train,
    };
  }

  function calorieBudgetRemaining(consumed, goals, activeBurnTotal) {
    const target = goals && typeof goals.calorieTarget === 'number' ? goals.calorieTarget : 0;
    if (!target) return null;
    const adjusted = target + activeBurnTotal;
    return Math.round(adjusted - consumed);
  }

  window.VeroTrackBurn = {
    MET_BY_CATEGORY,
    MET_LABELS,
    bmrKcal,
    restingBurnSoFarKcal,
    stepWalkingBurnKcal,
    exerciseLineBurnKcal,
    trainingBurnFromExercises,
    totalActiveBurn,
    calorieBudgetRemaining,
  };
})();
