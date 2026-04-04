(function () {
  const STORAGE_KEY = 'verotrack_v1';
  const VERSION = 4; // Incremented for cloud sync meta

  const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
  const SUPABASE_KEY = 'YOUR_ANON_KEY';

  let supabaseClient = null;
  if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  const DEFAULT_SUPPLEMENT_NAMES = ['Creatine', 'Protein', 'Fish Oil', 'Multivitamin'];

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function defaultCatalog() {
    return DEFAULT_SUPPLEMENT_NAMES.map((name) => ({
      id: `def_${name.toLowerCase().replace(/\s+/g, '_')}`,
      name,
      builtIn: true,
    }));
  }

  function defaultProfile() {
    return { weightKg: 0, heightCm: 0, age: 0, sex: 'x' };
  }

  function defaultGoals() {
    return { calorieTarget: 2200, proteinTargetG: 150, stepGoal: 10000, waterGoalMl: 2000 };
  }

  function defaultSettings() {
    return { weightUnit: 'kg' };
  }

  function defaultGame() {
    return { xp: 0, badges: [], daily: null, flags: {} };
  }

  function emptyDay() {
    return { food: [], steps: 0, workoutDone: false, exercises: [], supplementState: {}, waterMl: 0 };
  }

  function migrateExercise(ex) {
    if (!ex || typeof ex !== 'object') return ex;
    if (ex.metCategory == null) ex.metCategory = 'strength';
    if (ex.durationMin == null || typeof ex.durationMin !== 'number') {
      const sets = typeof ex.sets === 'number' ? ex.sets : 0;
      const reps = typeof ex.reps === 'number' ? ex.reps : 0;
      ex.durationMin = Math.max(5, Math.min(180, Math.round(sets * reps * 0.04 + sets * 2)));
    }
    return ex;
  }

  function migrateDay(day) {
    if (!day || typeof day !== 'object') return emptyDay();
    if (!Array.isArray(day.food)) day.food = [];
    if (typeof day.steps !== 'number' || day.steps < 0) day.steps = 0;
    day.workoutDone = !!day.workoutDone;
    if (!Array.isArray(day.exercises)) day.exercises = [];
    day.exercises = day.exercises.map(migrateExercise);
    if (!day.supplementState || typeof day.supplementState !== 'object') day.supplementState = {};
    if (typeof day.waterMl !== 'number' || day.waterMl < 0) day.waterMl = 0;
    return day;
  }

  function loadRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function migrate(data) {
    if (!data || typeof data !== 'object') {
      return {
        version: VERSION,
        catalog: defaultCatalog(),
        days: {},
        profile: defaultProfile(),
        goals: defaultGoals(),
        settings: defaultSettings(),
        game: defaultGame(),
      };
    }
    // ... migration logic (same as before)
    if (!data.catalog || !Array.isArray(data.catalog)) data.catalog = defaultCatalog();
    if (!data.days || typeof data.days !== 'object') data.days = {};
    Object.keys(data.days).forEach((k) => { data.days[k] = migrateDay(data.days[k]); });
    if (!data.profile || typeof data.profile !== 'object') data.profile = defaultProfile();
    if (!data.goals || typeof data.goals !== 'object') data.goals = defaultGoals();
    if (!data.settings || typeof data.settings !== 'object') data.settings = defaultSettings();
    if (!data.game || typeof data.game !== 'object') data.game = defaultGame();
    data.version = VERSION;
    return data;
  }

  function load() {
    return migrate(loadRaw());
  }

  function saveLocal(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  // --- Supabase Sync Logic ---

  async function pushToCloud(data) {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    try {
      // We store the entire payload as a single row for simplicity in this V2 migration
      // In a real production app, we'd split tables, but for "keeps data for 10 years" 
      // a JSONB blob in Postgres is very robust.
      const { error } = await supabaseClient
        .from('user_data')
        .upsert({ 
          id: user.id, 
          payload: data,
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Push failed:', e);
      return false;
    }
  }

  async function pullFromCloud() {
    if (!supabaseClient) return null;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;

    try {
      const { data, error } = await supabaseClient
        .from('user_data')
        .select('payload')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows found"
      return data ? data.payload : null;
    } catch (e) {
      console.error('Pull failed:', e);
      return null;
    }
  }

  async function save(data) {
    const ok = saveLocal(data);
    if (ok) {
      // Async push - triggers in background
      pushToCloud(data);
    }
    return ok;
  }

  function ensureCatalogIds(catalog, supplementState) {
    const next = { ...supplementState };
    catalog.forEach((s) => {
      if (next[s.id] === undefined) next[s.id] = false;
    });
    return next;
  }

  window.VeroTrackStorage = {
    STORAGE_KEY,
    VERSION,
    todayKey,
    uid,
    defaultCatalog,
    defaultProfile,
    defaultGoals,
    defaultGame,
    emptyDay,
    migrateDay,
    load,
    save,
    saveLocal,
    ensureCatalogIds,
    supabase: supabaseClient,
    pushToCloud,
    pullFromCloud
  };
})();
