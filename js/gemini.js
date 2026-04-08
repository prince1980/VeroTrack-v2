(function () {
  const SETTINGS_KEY = 'vt_gemini_settings_v1';
  const CACHE_KEY = 'vt_gemini_cache_v1';
  const RECENT_MEALS_KEY = 'vt_recent_meals_v1';
  const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
  const SECONDARY_MODEL = 'gemini-2.5-flash-lite';
  const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
  const MAX_CACHE_ENTRIES = 80;
  const MAX_RECENT_MEALS = 12;
  const GLOBAL_DEFAULT = window.VEROTRACK_GEMINI_DEFAULT || {};
  const LOCAL_FOOD_BASE = [
    { keys: ['egg', 'eggs'], calories: 78, protein: 6.3, carbs: 0.6, fats: 5.3, fiber: 0, sugar: 0.6 },
    { keys: ['roti', 'chapati'], calories: 110, protein: 3.2, carbs: 22, fats: 1.8, fiber: 3, sugar: 0.8 },
    { keys: ['rice'], calories: 205, protein: 4.3, carbs: 45, fats: 0.4, fiber: 0.6, sugar: 0.1 },
    { keys: ['dal', 'lentil', 'lentils'], calories: 165, protein: 9, carbs: 29, fats: 0.8, fiber: 8, sugar: 2 },
    { keys: ['whey', 'whey protein'], calories: 120, protein: 24, carbs: 3, fats: 2, fiber: 0, sugar: 2 },
    { keys: ['milk'], calories: 122, protein: 8, carbs: 12, fats: 5, fiber: 0, sugar: 12 },
    { keys: ['banana'], calories: 105, protein: 1.3, carbs: 27, fats: 0.3, fiber: 3.1, sugar: 14 },
    { keys: ['chicken breast', 'chicken'], calories: 165, protein: 31, carbs: 0, fats: 3.6, fiber: 0, sugar: 0 },
    { keys: ['oats'], calories: 150, protein: 5, carbs: 27, fats: 3, fiber: 4, sugar: 1 },
  ];

  function safeParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function safeGetStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return safeParse(raw, fallback);
    } catch {
      return fallback;
    }
  }

  function safeSetStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function loadSettings() {
    const settings = safeGetStorage(SETTINGS_KEY, {});
    const defaultApiKey = typeof GLOBAL_DEFAULT.defaultApiKey === 'string' ? GLOBAL_DEFAULT.defaultApiKey.trim() : '';
    const defaultModel =
      typeof GLOBAL_DEFAULT.defaultModel === 'string' && GLOBAL_DEFAULT.defaultModel.trim()
        ? GLOBAL_DEFAULT.defaultModel.trim()
        : DEFAULT_MODEL;
    if (!settings || typeof settings !== 'object') {
      return { apiKey: defaultApiKey, model: defaultModel };
    }
    return {
      apiKey:
        typeof settings.apiKey === 'string' && settings.apiKey.trim()
          ? settings.apiKey.trim()
          : defaultApiKey,
      model:
        typeof settings.model === 'string' && settings.model.trim()
          ? settings.model.trim()
          : defaultModel,
    };
  }

  let settings = loadSettings();

  function persistSettings() {
    safeSetStorage(SETTINGS_KEY, settings);
  }

  function normalizePrompt(text) {
    return String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function getCacheBag() {
    const cache = safeGetStorage(CACHE_KEY, {});
    if (!cache || typeof cache !== 'object') return {};
    return cache;
  }

  function setCacheBag(cache) {
    safeSetStorage(CACHE_KEY, cache);
  }

  function readCache(kind, prompt) {
    const key = `${kind}:${normalizePrompt(prompt)}`;
    const cache = getCacheBag();
    const item = cache[key];
    if (!item || typeof item !== 'object') return null;
    if (!item.ts || Date.now() - item.ts > CACHE_TTL_MS) return null;
    return item.payload || null;
  }

  function writeCache(kind, prompt, payload) {
    const key = `${kind}:${normalizePrompt(prompt)}`;
    const cache = getCacheBag();
    cache[key] = { ts: Date.now(), payload };

    const entries = Object.entries(cache).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
    const limited = entries.slice(0, MAX_CACHE_ENTRIES);
    const next = {};
    limited.forEach(([k, v]) => {
      next[k] = v;
    });
    setCacheBag(next);
  }

  function getRecentMeals() {
    const meals = safeGetStorage(RECENT_MEALS_KEY, []);
    if (!Array.isArray(meals)) return [];
    return meals
      .map((m) => String(m || '').trim())
      .filter(Boolean)
      .slice(0, MAX_RECENT_MEALS);
  }

  function rememberMeal(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    const meals = getRecentMeals();
    const filtered = meals.filter((m) => m.toLowerCase() !== clean.toLowerCase());
    filtered.unshift(clean);
    safeSetStorage(RECENT_MEALS_KEY, filtered.slice(0, MAX_RECENT_MEALS));
  }

  function toNonNegativeNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 10) / 10;
  }

  function toPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
  }

  function extractFirstJsonBlock(text) {
    const input = String(text || '').trim();
    if (!input) return null;

    const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : input;

    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

    const maybe = candidate.slice(firstBrace, lastBrace + 1);
    return safeParse(maybe, null);
  }

  function extractModelText(payload) {
    const candidates = payload && payload.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) return '';

    const parts = candidates[0] && candidates[0].content && candidates[0].content.parts;
    if (!Array.isArray(parts)) return '';

    return parts
      .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
      .filter(Boolean)
      .join('\n');
  }

  function buildAIError(code, message, details) {
    const err = new Error(message);
    err.code = code || 'AI_ERROR';
    if (details) err.details = details;
    return err;
  }

  function parseRetrySeconds(details) {
    const text = String(details || '');
    const match = text.match(/retry in\s+([\d.]+)s/i);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.ceil(value);
  }

  function toOneLine(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
  }

  async function generateContentOnce(model, prompt, apiKey) {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
      `:generateContent?key=${encodeURIComponent(apiKey)}`;

    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.15,
          responseMimeType: 'application/json',
        },
      }),
    });
  }

  async function callGemini(prompt) {
    const apiKey = (settings.apiKey || '').trim();
    const model = (settings.model || DEFAULT_MODEL).trim();

    if (!apiKey) {
      throw new Error('Gemini API key is missing. Add it in Settings > AI Automation.');
    }

    let response = await generateContentOnce(model, prompt, apiKey);

    // Auto-retry on model-specific quota/outage with a more available fallback model.
    if (!response.ok && model !== SECONDARY_MODEL && (response.status === 429 || response.status === 503)) {
      const fallbackRes = await generateContentOnce(SECONDARY_MODEL, prompt, apiKey);
      if (fallbackRes.ok) {
        response = fallbackRes;
        settings.model = SECONDARY_MODEL;
        persistSettings();
      } else {
        response = fallbackRes.status === 404 ? response : fallbackRes;
      }
    }

    if (!response.ok) {
      let details = '';
      try {
        const err = await response.json();
        details = err && err.error && err.error.message ? toOneLine(err.error.message) : '';
      } catch {
        // ignore parse failure
      }

      if (response.status === 429) {
        const retrySec = parseRetrySeconds(details);
        const retryMsg = retrySec ? ` Retry in ${retrySec}s.` : '';
        throw buildAIError(
          'QUOTA_EXCEEDED',
          `Gemini quota reached.${retryMsg} Using quick local estimate instead.`,
          details
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw buildAIError(
          'KEY_INVALID',
          'Gemini key is invalid or unauthorized. Check AI settings.',
          details
        );
      }
      if (response.status >= 500) {
        throw buildAIError('SERVER_DOWN', 'Gemini service is temporarily unavailable.', details);
      }
      throw buildAIError('REQUEST_FAILED', `Gemini request failed (${response.status}).`, details);
    }

    const payload = await response.json();
    const text = extractModelText(payload);
    const parsed = extractFirstJsonBlock(text);
    if (!parsed) {
      throw buildAIError('BAD_JSON', 'Gemini returned an invalid response.');
    }
    return parsed;
  }

  function splitMealParts(text) {
    return String(text || '')
      .split(/[,;+]/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  }

  function parseQuantityAndName(part) {
    const match = part.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    if (!match) return { qty: 1, name: part };
    const qty = Number(match[1]);
    return { qty: Number.isFinite(qty) && qty > 0 ? qty : 1, name: match[2].trim() };
  }

  function matchFoodBase(name) {
    const lower = String(name || '').toLowerCase();
    for (let i = 0; i < LOCAL_FOOD_BASE.length; i += 1) {
      const base = LOCAL_FOOD_BASE[i];
      if (base.keys.some((k) => lower.includes(k))) return base;
    }
    return null;
  }

  function estimateMealLocally(foodText) {
    const parts = splitMealParts(foodText);
    if (!parts.length) return null;

    const totals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      nutrients: { fiber: 0, sugar: 0, vitamins: {}, minerals: {} },
    };

    let matched = 0;
    parts.forEach((part) => {
      const parsed = parseQuantityAndName(part);
      const base = matchFoodBase(parsed.name);
      if (!base) return;
      matched += 1;
      totals.calories += base.calories * parsed.qty;
      totals.protein += base.protein * parsed.qty;
      totals.carbs += base.carbs * parsed.qty;
      totals.fats += base.fats * parsed.qty;
      totals.nutrients.fiber += base.fiber * parsed.qty;
      totals.nutrients.sugar += base.sugar * parsed.qty;
    });

    if (!matched) return null;
    return normalizeMealPayload(totals);
  }

  function estimateExerciseLocally(exerciseText, context) {
    const name = String(exerciseText || '').toLowerCase();
    const duration = Math.max(10, Number((context && context.durationMin) || 0) || 30);

    let exerciseType = 'strength';
    let caloriesPerMin = 6.5;
    let muscleGroup = 'full body';

    if (/push.?up|bench|squat|deadlift|press|curl|row/.test(name)) {
      exerciseType = 'strength';
      caloriesPerMin = 7;
      muscleGroup = 'upper/lower body';
    } else if (/walk|jog|run|treadmill/.test(name)) {
      exerciseType = 'walk_run';
      caloriesPerMin = 8;
      muscleGroup = 'lower body';
    } else if (/hiit|burpee|jump/.test(name)) {
      exerciseType = 'hiit';
      caloriesPerMin = 10;
      muscleGroup = 'full body';
    } else if (/yoga|stretch/.test(name)) {
      exerciseType = 'yoga';
      caloriesPerMin = 4;
      muscleGroup = 'core/mobility';
    }

    const caloriesBurned = Math.round(caloriesPerMin * duration);
    return normalizeExercisePayload({
      caloriesBurned,
      muscleGroup,
      exerciseType,
      intensity: 'moderate',
      notes: 'Local fallback estimate',
    });
  }

  function normalizeMealPayload(payload) {
    const nutrients = toPlainObject(payload && payload.nutrients);
    return {
      calories: toNonNegativeNumber(payload && payload.calories),
      protein: toNonNegativeNumber(payload && payload.protein),
      carbs: toNonNegativeNumber(payload && payload.carbs),
      fats: toNonNegativeNumber(payload && payload.fats),
      nutrients: {
        fiber: toNonNegativeNumber(nutrients.fiber),
        sugar: toNonNegativeNumber(nutrients.sugar),
        vitamins: toPlainObject(nutrients.vitamins),
        minerals: toPlainObject(nutrients.minerals),
      },
    };
  }

  function normalizeExercisePayload(payload) {
    return {
      caloriesBurned: toNonNegativeNumber(payload && payload.caloriesBurned),
      muscleGroup: String((payload && payload.muscleGroup) || 'general').trim() || 'general',
      exerciseType: String((payload && payload.exerciseType) || 'strength').trim() || 'strength',
      intensity: String((payload && payload.intensity) || 'moderate').trim() || 'moderate',
      notes: String((payload && payload.notes) || '').trim(),
    };
  }

  async function analyzeMeal(foodText) {
    const meal = String(foodText || '').trim();
    if (!meal) throw new Error('Enter a meal description first.');

    const cached = readCache('meal', meal);
    if (cached) {
      return { ...cached, _fromCache: true };
    }

    const prompt = [
      'You estimate nutrition for a meal description.',
      'Return ONLY valid JSON with this exact shape:',
      '{',
      '  "calories": number,',
      '  "protein": number,',
      '  "carbs": number,',
      '  "fats": number,',
      '  "nutrients": {',
      '    "fiber": number,',
      '    "sugar": number,',
      '    "vitamins": {},',
      '    "minerals": {}',
      '  }',
      '}',
      'Rules:',
      '- Numbers only, no units.',
      '- Use realistic estimates for cooked portions in Indian and global foods.',
      '- Never return null.',
      `Meal: "${meal}"`,
    ].join('\n');

    try {
      const raw = await callGemini(prompt);
      const normalized = normalizeMealPayload(raw);
      writeCache('meal', meal, normalized);
      rememberMeal(meal);
      return { ...normalized, _fromCache: false };
    } catch (err) {
      const fallback = estimateMealLocally(meal);
      if (fallback) {
        return {
          ...fallback,
          _fromFallback: true,
          _fallbackReason: (err && err.code) || 'AI_ERROR',
          _fallbackMessage: (err && err.message) || 'Using quick local estimate.',
        };
      }
      throw err;
    }
  }

  async function analyzeExercise(exerciseText, context) {
    const name = String(exerciseText || '').trim();
    if (!name) throw new Error('Enter an exercise name first.');

    const ctx = context || {};
    const promptKey = `${name}|${ctx.durationMin || ''}|${ctx.sets || ''}|${ctx.reps || ''}|${ctx.weight || ''}|${ctx.bodyWeightKg || ''}`;
    const cached = readCache('exercise', promptKey);
    if (cached) return { ...cached, _fromCache: true };

    const prompt = [
      'You estimate workout metadata for a fitness tracker.',
      'Return ONLY valid JSON with this exact shape:',
      '{',
      '  "caloriesBurned": number,',
      '  "muscleGroup": string,',
      '  "exerciseType": string,',
      '  "intensity": string,',
      '  "notes": string',
      '}',
      'Rules:',
      '- Estimate calories for one logged session.',
      '- exerciseType should be one of: strength, hiit, cardio_light, cardio_mod, cardio_hard, walk_run, yoga, sports, other.',
      '- Keep notes short.',
      `Exercise: "${name}"`,
      `Duration (min): ${Number(ctx.durationMin) || 0}`,
      `Sets: ${Number(ctx.sets) || 0}`,
      `Reps: ${Number(ctx.reps) || 0}`,
      `Lifted weight (kg): ${Number(ctx.weight) || 0}`,
      `Body weight (kg): ${Number(ctx.bodyWeightKg) || 0}`,
    ].join('\n');

    try {
      const raw = await callGemini(prompt);
      const normalized = normalizeExercisePayload(raw);
      writeCache('exercise', promptKey, normalized);
      return { ...normalized, _fromCache: false };
    } catch (err) {
      const fallback = estimateExerciseLocally(name, ctx);
      return {
        ...fallback,
        _fromFallback: true,
        _fallbackReason: (err && err.code) || 'AI_ERROR',
        _fallbackMessage: (err && err.message) || 'Using quick local estimate.',
      };
    }
  }

  async function testConnection() {
    const prompt = [
      'Return ONLY valid JSON:',
      '{ "ok": true }',
      'No markdown, no explanation.',
    ].join('\n');
    const raw = await callGemini(prompt);
    if (!raw || raw.ok !== true) {
      throw new Error('Gemini returned an unexpected response.');
    }
    return { ok: true, model: settings.model || DEFAULT_MODEL };
  }

  function setApiKey(apiKey) {
    settings.apiKey = String(apiKey || '').trim();
    persistSettings();
  }

  function setModel(model) {
    settings.model = String(model || '').trim() || DEFAULT_MODEL;
    persistSettings();
  }

  function getSettings() {
    return {
      apiKey: settings.apiKey || '',
      model: settings.model || DEFAULT_MODEL,
      hasApiKey: !!(settings.apiKey || '').trim(),
    };
  }

  window.VeroTrackGemini = {
    analyzeMeal,
    analyzeExercise,
    testConnection,
    getRecentMeals,
    rememberMeal,
    setApiKey,
    setModel,
    getSettings,
    defaultModel: DEFAULT_MODEL,
  };
})();
