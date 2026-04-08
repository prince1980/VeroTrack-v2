(function () {
  const STORAGE_KEY = 'verotrack_v1';
  const VERSION = 5;
  const DATA_DB_NAME = 'VeroTrackData';
  const DATA_STORE_NAME = 'userdata';
  const CLOUD_TABLE = 'user_data';
  const MAX_HISTORY_DAYS = 3653; // ~10 years

  const SUPABASE_CONFIG = window.VEROTRACK_SUPABASE || {};
  const SUPABASE_URL = SUPABASE_CONFIG.url || '';
  const SUPABASE_KEY = SUPABASE_CONFIG.anonKey || '';

  function hasSupabaseConfig() {
    return (
      typeof SUPABASE_URL === 'string' &&
      SUPABASE_URL.startsWith('https://') &&
      SUPABASE_URL.includes('.supabase.co') &&
      typeof SUPABASE_KEY === 'string' &&
      SUPABASE_KEY.length > 20
    );
  }

  function getSupabaseClientShared() {
    if (window.__VT_SUPABASE_CLIENT) {
      return window.__VT_SUPABASE_CLIENT;
    }
    if (typeof supabase !== 'undefined' && hasSupabaseConfig()) {
      window.__VT_SUPABASE_CLIENT = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      return window.__VT_SUPABASE_CLIENT;
    }
    return null;
  }

  let supabaseClient = getSupabaseClientShared();

  let dataDB = null;
  let queuedPushTimer = null;
  let queuedPushPromise = null;

  async function initDataDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DATA_DB_NAME, 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
          const store = db.createObjectStore(DATA_STORE_NAME, { keyPath: 'email' });
          store.createIndex('email', 'email', { unique: true });
        }
      };
    });
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
    return {
      weightUnit: 'kg',
      theme: 'auto',
      ai: {
        apiKey: '',
        model: 'gemini-2.5-flash-lite',
      },
    };
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
    if (typeof ex.caloriesBurned !== 'number' || ex.caloriesBurned < 0) {
      ex.caloriesBurned = 0;
    }
    if (typeof ex.muscleGroup !== 'string') ex.muscleGroup = '';
    if (typeof ex.exerciseType !== 'string') ex.exerciseType = ex.metCategory || 'strength';
    return ex;
  }

  function migrateFoodEntry(food) {
    if (!food || typeof food !== 'object') return food;
    if (typeof food.carbs !== 'number' || food.carbs < 0) food.carbs = 0;
    if (typeof food.fats !== 'number' || food.fats < 0) food.fats = 0;
    if (!food.nutrients || typeof food.nutrients !== 'object') food.nutrients = {};
    if (typeof food.nutrients.fiber !== 'number' || food.nutrients.fiber < 0) food.nutrients.fiber = 0;
    if (typeof food.nutrients.sugar !== 'number' || food.nutrients.sugar < 0) food.nutrients.sugar = 0;
    if (!food.nutrients.vitamins || typeof food.nutrients.vitamins !== 'object') food.nutrients.vitamins = {};
    if (!food.nutrients.minerals || typeof food.nutrients.minerals !== 'object') food.nutrients.minerals = {};
    return food;
  }

  function migrateDay(day) {
    if (!day || typeof day !== 'object') return emptyDay();
    if (!Array.isArray(day.food)) day.food = [];
    day.food = day.food.map(migrateFoodEntry);
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

  function emailStorageKey(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return `${STORAGE_KEY}__${encodeURIComponent(normalized)}`;
  }

  function isDataStorageKey(key) {
    return typeof key === 'string' && key.startsWith(STORAGE_KEY);
  }

  function loadLocalByEmail(email) {
    try {
      const raw = localStorage.getItem(emailStorageKey(email));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveLocalByEmail(data, email) {
    try {
      localStorage.setItem(emailStorageKey(email), JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  async function loadFromDB(email) {
    if (!dataDB) dataDB = await initDataDB();
    return new Promise((resolve, reject) => {
      const tx = dataDB.transaction([DATA_STORE_NAME], 'readonly');
      const store = tx.objectStore(DATA_STORE_NAME);
      const req = store.get(email);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const result = req.result;
        resolve(result && result.payload ? result.payload : null);
      };
    });
  }

  async function saveToDB(email, data) {
    if (!dataDB) dataDB = await initDataDB();
    return new Promise((resolve, reject) => {
      const tx = dataDB.transaction([DATA_STORE_NAME], 'readwrite');
      const store = tx.objectStore(DATA_STORE_NAME);
      const req = store.put({
        email,
        payload: data,
        updatedAt: new Date().toISOString(),
      });
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(true);
    });
  }

  function toDateKeyTs(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
    const [year, month, day] = dateKey.split('-').map(Number);
    const ts = Date.UTC(year, month - 1, day);
    return Number.isFinite(ts) ? ts : null;
  }

  function pruneDays(days) {
    const keys = Object.keys(days || {}).sort((a, b) => {
      const aTs = toDateKeyTs(a) || 0;
      const bTs = toDateKeyTs(b) || 0;
      return aTs - bTs;
    });
    if (keys.length <= MAX_HISTORY_DAYS) return days;
    const toDrop = keys.length - MAX_HISTORY_DAYS;
    for (let i = 0; i < toDrop; i += 1) {
      delete days[keys[i]];
    }
    return days;
  }

  function ensureMeta(data) {
    if (!data.meta || typeof data.meta !== 'object') data.meta = {};
    if (!data.meta.updatedAt) data.meta.updatedAt = new Date().toISOString();
    return data;
  }

  function stampUpdatedAt(data) {
    ensureMeta(data);
    data.meta.updatedAt = new Date().toISOString();
    return data;
  }

  function dataUpdatedAtMs(data) {
    const raw = data && data.meta && data.meta.updatedAt;
    const ts = Date.parse(raw || '');
    return Number.isFinite(ts) ? ts : 0;
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
        meta: { updatedAt: new Date().toISOString() },
      };
    }

    if (!data.catalog || !Array.isArray(data.catalog)) data.catalog = defaultCatalog();
    if (!data.days || typeof data.days !== 'object') data.days = {};
    Object.keys(data.days).forEach((k) => {
      data.days[k] = migrateDay(data.days[k]);
    });
    data.days = pruneDays(data.days);
    if (!data.profile || typeof data.profile !== 'object') data.profile = defaultProfile();
    if (!data.goals || typeof data.goals !== 'object') data.goals = defaultGoals();
    if (!data.settings || typeof data.settings !== 'object') data.settings = defaultSettings();
    if (!data.settings.ai || typeof data.settings.ai !== 'object') {
      data.settings.ai = { apiKey: '', model: 'gemini-2.5-flash-lite' };
    }
    if (typeof data.settings.ai.apiKey !== 'string') data.settings.ai.apiKey = '';
    if (typeof data.settings.ai.model !== 'string' || !data.settings.ai.model.trim()) {
      data.settings.ai.model = 'gemini-2.5-flash-lite';
    }
    if (!data.game || typeof data.game !== 'object') data.game = defaultGame();
    if (!data.settings.theme) data.settings.theme = 'auto';
    data.version = VERSION;
    ensureMeta(data);
    return data;
  }

  async function load(email) {
    if (!email && typeof window.VeroTrackAuth !== 'undefined') {
      email = await window.VeroTrackAuth.getCurrentUser();
    }

    if (!email) {
      return migrate(loadRaw());
    }

    try {
      const dbData = await loadFromDB(email);
      if (dbData) return migrate(dbData);

      const localData = loadLocalByEmail(email);
      if (localData) return migrate(localData);

      return migrate(null);
    } catch {
      const localData = loadLocalByEmail(email);
      return migrate(localData || null);
    }
  }

  function saveLocal(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  function queuePushToCloud(data, email) {
    if (!email || !supabaseClient) return Promise.resolve(false);

    if (queuedPushTimer) {
      clearTimeout(queuedPushTimer);
      queuedPushTimer = null;
    }

    queuedPushPromise =
      queuedPushPromise ||
      new Promise((resolve) => {
        queuedPushTimer = setTimeout(async () => {
          queuedPushTimer = null;
          const ok = await pushToCloud(data, email);
          queuedPushPromise = null;
          resolve(ok);
        }, 450);
      });

    return queuedPushPromise;
  }

  async function save(data, email) {
    if (!email && typeof window.VeroTrackAuth !== 'undefined') {
      email = await window.VeroTrackAuth.getCurrentUser();
    }

    const normalized = migrate(stampUpdatedAt(data));

    if (!email) {
      return saveLocal(normalized);
    }

    try {
      await saveToDB(email, normalized);
      saveLocalByEmail(normalized, email);
      queuePushToCloud(normalized, email);
      return true;
    } catch {
      return saveLocalByEmail(normalized, email);
    }
  }

  async function getCloudIdentity(expectedEmail) {
    if (!supabaseClient) return null;

    try {
      const {
        data: { user },
        error,
      } = await supabaseClient.auth.getUser();

      if (error || !user || !user.id) return null;

      const cloudEmail = (user.email || '').toLowerCase();
      const localEmail = String(expectedEmail || '').toLowerCase();

      if (localEmail && cloudEmail && localEmail !== cloudEmail) {
        return null;
      }

      return {
        userId: user.id,
        email: user.email || expectedEmail || '',
      };
    } catch {
      return null;
    }
  }

  async function pushToCloud(data, email) {
    const identity = await getCloudIdentity(email);
    if (!identity) return false;

    try {
      const payload = migrate(stampUpdatedAt(data));
      const { error } = await supabaseClient.from(CLOUD_TABLE).upsert(
        {
          user_id: identity.userId,
          email: identity.email,
          payload,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Push failed:', e);
      return false;
    }
  }

  async function pullFromCloud(email) {
    const identity = await getCloudIdentity(email);
    if (!identity) return null;

    try {
      const { data, error } = await supabaseClient
        .from(CLOUD_TABLE)
        .select('payload')
        .eq('user_id', identity.userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data ? migrate(data.payload) : null;
    } catch (e) {
      console.error('Pull failed:', e);
      return null;
    }
  }

  async function syncWithCloud(localData, email) {
    if (!email || !supabaseClient) return localData;

    const local = migrate(localData);
    const cloud = await pullFromCloud(email);
    if (!cloud) {
      queuePushToCloud(local, email);
      return local;
    }

    const localTs = dataUpdatedAtMs(local);
    const cloudTs = dataUpdatedAtMs(cloud);

    if (cloudTs > localTs) {
      await saveToDB(email, cloud);
      saveLocalByEmail(cloud, email);
      return cloud;
    }

    if (localTs > cloudTs) {
      queuePushToCloud(local, email);
      return local;
    }

    return local;
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
    supabaseConfigured: hasSupabaseConfig(),
    pushToCloud,
    pullFromCloud,
    syncWithCloud,
    emailStorageKey,
    isDataStorageKey,
  };
})();
