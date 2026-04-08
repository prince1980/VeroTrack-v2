(function () {
  const AUTH_COOKIE_NAME = 'vt_auth_device';
  const USER_EMAIL_COOKIE_NAME = 'vt_user_email';
  const SESSION_STORAGE_KEY = 'vt_session_email';
  const LOCAL_USERS_KEY = 'vt_local_users';
  const USERS_DB_NAME = 'VeroTrackUsers';
  const USERS_STORE_NAME = 'users';

  let currentUser = null;
  let authDB = null;

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function safeStorageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // no-op
    }
  }

  function loadLocalUsers() {
    try {
      const raw = safeStorageGet(LOCAL_USERS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveLocalUsers(users) {
    return safeStorageSet(LOCAL_USERS_KEY, JSON.stringify(users));
  }

  function getAppRedirectUrl() {
    if (window.location && /^https?:$/i.test(window.location.protocol)) {
      return window.location.origin + window.location.pathname;
    }
    return 'https://prince1980.github.io/VeroTrack-v2/';
  }

  function getSupabaseClient() {
    if (window.__VT_SUPABASE_CLIENT) {
      return window.__VT_SUPABASE_CLIENT;
    }
    const cfg = window.VEROTRACK_SUPABASE || {};
    if (typeof window.supabase === 'undefined' || !cfg.url || !cfg.anonKey) {
      return null;
    }
    try {
      window.__VT_SUPABASE_CLIENT = window.supabase.createClient(cfg.url, cfg.anonKey);
      return window.__VT_SUPABASE_CLIENT;
    } catch {
      return null;
    }
  }

  async function getSupabaseUser() {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const timeoutUser = new Promise((resolve) => {
        setTimeout(() => resolve({ data: { user: null } }), 4000);
      });
      const result = await Promise.race([client.auth.getUser(), timeoutUser]);
      return result && result.data ? result.data.user || null : null;
    } catch {
      return null;
    }
  }

  async function initDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(USERS_DB_NAME, 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(USERS_STORE_NAME)) {
          db.createObjectStore(USERS_STORE_NAME, { keyPath: 'email' });
        }
      };
    });
  }

  function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days || 365) * 24 * 60 * 60 * 1000);
    const expires = 'expires=' + date.toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)};${expires};path=/;SameSite=Lax`;
  }

  function getCookie(name) {
    const nameEq = `${name}=`;
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i += 1) {
      const cookie = cookies[i].trim();
      if (cookie.indexOf(nameEq) === 0) {
        return decodeURIComponent(cookie.substring(nameEq.length));
      }
    }
    return null;
  }

  function deleteCookie(name) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
  }

  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function storeUser(email, passwordHash, profile) {
    const normalized = normalizeEmail(email);
    const user = {
      email: normalized,
      passwordHash,
      createdAt: new Date().toISOString(),
      profile: profile || {},
      deviceToken: crypto.randomUUID(),
    };

    try {
      if (!authDB) authDB = await initDB();
      return await new Promise((resolve, reject) => {
        const tx = authDB.transaction([USERS_STORE_NAME], 'readwrite');
        const store = tx.objectStore(USERS_STORE_NAME);
        const req = store.put(user);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(user);
      });
    } catch {
      const users = loadLocalUsers();
      users[normalized] = user;
      saveLocalUsers(users);
      return user;
    }
  }

  async function getUser(email) {
    const normalized = normalizeEmail(email);
    try {
      if (!authDB) authDB = await initDB();
      return await new Promise((resolve, reject) => {
        const tx = authDB.transaction([USERS_STORE_NAME], 'readonly');
        const store = tx.objectStore(USERS_STORE_NAME);
        const req = store.get(normalized);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result || null);
      });
    } catch {
      const users = loadLocalUsers();
      return users[normalized] || null;
    }
  }

  async function ensureLocalShadowUser(email, provider) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const existing = await getUser(normalized);
    if (existing) return existing;
    return storeUser(normalized, provider || 'cloud_auth', { provider: provider || 'cloud_auth' });
  }

  function setCurrentUser(email) {
    const normalized = normalizeEmail(email);
    currentUser = normalized;
    safeStorageSet(SESSION_STORAGE_KEY, normalized);
    setCookie(USER_EMAIL_COOKIE_NAME, normalized, 365);
    setCookie(AUTH_COOKIE_NAME, crypto.randomUUID(), 365);
    window.dispatchEvent(new CustomEvent('auth-changed', { detail: { email: normalized, isLoggedIn: true } }));
  }

  async function register(email, password) {
    const normalized = normalizeEmail(email);
    if (!normalized || !password) throw new Error('Email and password required');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');

    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb.auth.signUp({
        email: normalized,
        password,
        options: {
          emailRedirectTo: getAppRedirectUrl(),
        },
      });
      if (error) {
        throw new Error(error.message || 'Could not create account');
      }

      // Try to establish a real session immediately after signup.
      // If email confirmation is enabled in Supabase, this may fail until user confirms email.
      const signInTry = await sb.auth.signInWithPassword({
        email: normalized,
        password,
      });

      await ensureLocalShadowUser(normalized, 'supabase_email');
      if (signInTry && !signInTry.error && signInTry.data && signInTry.data.user && signInTry.data.user.email) {
        setCurrentUser(signInTry.data.user.email);
        return { success: true, email: signInTry.data.user.email, cloud: true };
      }

      if (signInTry && signInTry.error) {
        throw new Error(
          signInTry.error.message ||
            'Account created. Verify your email to enable cloud session and sync.'
        );
      }

      throw new Error('Account created but cloud session is not active yet. Verify email if required.');
    }

    const existing = await getUser(normalized);
    if (existing) throw new Error('User already exists');
    const passwordHash = await hashPassword(password);
    await storeUser(normalized, passwordHash);
    setCurrentUser(normalized);
    return { success: true, email: normalized, cloud: false };
  }

  async function login(email, password) {
    const normalized = normalizeEmail(email);
    if (!normalized || !password) throw new Error('Email and password required');

    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb.auth.signInWithPassword({
        email: normalized,
        password,
      });
      if (!error && data && data.user && data.user.email) {
        await ensureLocalShadowUser(data.user.email, 'supabase_email');
        setCurrentUser(data.user.email);
        return { success: true, email: data.user.email, cloud: true };
      }

      throw new Error((error && error.message) || 'Cloud login failed');
    }

    const user = await getUser(normalized);
    if (!user) throw new Error('No account found for this email');

    if (user.passwordHash === 'supabase_email' || user.passwordHash === 'cloud_auth') {
      throw new Error('Use your cloud password on a connected network.');
    }

    const passwordHash = await hashPassword(password);
    if (passwordHash !== user.passwordHash) throw new Error('Invalid password');
    setCurrentUser(normalized);
    return { success: true, email: normalized, cloud: false };
  }

  async function loginWithGoogle() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Google sign-in is not configured yet');
    }

    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAppRedirectUrl(),
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      throw new Error(error.message || 'Could not start Google sign-in');
    }

    const authUrl = data && data.url;
    if (!authUrl) throw new Error('Cloud auth URL was not generated');

    window.location.assign(authUrl);
    return { success: true };
  }

  async function loginWithGoogleLocal(email) {
    const normalized = normalizeEmail(email);
    if (!normalized || !normalized.endsWith('@gmail.com')) {
      throw new Error('Enter a valid Gmail address');
    }
    await ensureLocalShadowUser(normalized, 'google_local_fallback');
    setCurrentUser(normalized);
    return { success: true, email: normalized, localFallback: true };
  }

  async function getCurrentUser() {
    if (currentUser) return currentUser;

    const sb = getSupabaseClient();
    const supabaseUser = await getSupabaseUser();
    if (supabaseUser && supabaseUser.email) {
      await ensureLocalShadowUser(supabaseUser.email, 'supabase_oauth');
      setCurrentUser(supabaseUser.email);
      return normalizeEmail(supabaseUser.email);
    }

    // If cloud auth is configured, require an active cloud session.
    // This avoids "logged in but sync off" local-only states.
    if (sb) {
      const sessionEmail = normalizeEmail(safeStorageGet(SESSION_STORAGE_KEY));
      if (sessionEmail) {
        const user = await getUser(sessionEmail);
        if (user && user.passwordHash === 'google_local_fallback') {
          currentUser = sessionEmail;
          return currentUser;
        }
      }

      const remembered = normalizeEmail(getCookie(USER_EMAIL_COOKIE_NAME));
      if (remembered) {
        const user = await getUser(remembered);
        if (user && user.passwordHash === 'google_local_fallback') {
          currentUser = remembered;
          return currentUser;
        }
      }

      return null;
    }

    const sessionEmail = normalizeEmail(safeStorageGet(SESSION_STORAGE_KEY));
    if (sessionEmail) {
      const user = await getUser(sessionEmail);
      if (user) {
        currentUser = sessionEmail;
        return currentUser;
      }
    }

    const remembered = normalizeEmail(getCookie(USER_EMAIL_COOKIE_NAME));
    if (remembered) {
      const user = await getUser(remembered);
      if (user) {
        currentUser = remembered;
        return currentUser;
      }
    }

    return null;
  }

  async function logout() {
    currentUser = null;
    safeStorageRemove(SESSION_STORAGE_KEY);
    deleteCookie(USER_EMAIL_COOKIE_NAME);
    deleteCookie(AUTH_COOKIE_NAME);

    const sb = getSupabaseClient();
    if (sb) {
      try {
        await sb.auth.signOut();
      } catch {
        // swallow sign-out errors
      }
    }

    window.dispatchEvent(new CustomEvent('auth-changed', { detail: { email: null, isLoggedIn: false } }));
  }

  async function isAuthenticated() {
    const user = await getCurrentUser();
    return !!user;
  }

  window.VeroTrackAuth = {
    register,
    login,
    loginWithGoogle,
    loginWithGoogleLocal,
    logout,
    getCurrentUser,
    isAuthenticated,
    initDB,
    getUser,
    storeUser,
    hashPassword,
    setCookie,
    getCookie,
    deleteCookie,
  };
})();
