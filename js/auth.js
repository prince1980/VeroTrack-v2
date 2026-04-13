(function () {
  const AUTH_COOKIE_NAME = 'vt_auth_device';
  const USER_EMAIL_COOKIE_NAME = 'vt_user_email';
  const SESSION_STORAGE_KEY = 'vt_session_email';
  const LOCAL_USERS_KEY = 'vt_local_users';
  const PENDING_CLOUD_AUTH_MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8h
  const USERS_DB_NAME = 'VeroTrackUsers';
  const USERS_STORE_NAME = 'users';
  const CLOUD_CALL_TIMEOUT_MS = 9000;

  let currentUser = null;
  let authDB = null;
  let currentUserPromise = null;
  let pendingCloudAuth = null;

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

  function savePendingCloudAuth(email, password, intent) {
    const normalized = normalizeEmail(email);
    const secret = typeof password === 'string' ? password : '';
    if (!normalized || !secret) return;

    // Keep pending cloud credentials only in memory so passwords are never persisted at rest.
    pendingCloudAuth = {
      email: normalized,
      password: secret,
      intent: intent === 'signup' ? 'signup' : 'signin',
      ts: Date.now(),
    };
  }

  function clearPendingCloudAuth() {
    pendingCloudAuth = null;
  }

  function loadPendingCloudAuth() {
    const pending = pendingCloudAuth;
    if (!pending || typeof pending !== 'object') return null;

    const email = normalizeEmail(pending.email);
    const password = typeof pending.password === 'string' ? pending.password : '';
    const intent = pending.intent === 'signup' ? 'signup' : 'signin';
    const ts = Number(pending.ts);

    if (!email || !password || !Number.isFinite(ts)) {
      clearPendingCloudAuth();
      return null;
    }
    if (Date.now() - ts > PENDING_CLOUD_AUTH_MAX_AGE_MS) {
      clearPendingCloudAuth();
      return null;
    }

    return { email, password, intent, ts };
  }

  function hasPendingCloudAuth() {
    return !!loadPendingCloudAuth();
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

  function withTimeout(promise, timeoutMs, timeoutMessage) {
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(timeoutMessage || 'Request timed out'));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  function isNetworkLikeError(err) {
    const msg = String((err && err.message) || '').toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed') ||
      msg.includes('timed out') ||
      msg.includes('timeout') ||
      msg.includes('load failed')
    );
  }

  function isRateLimitError(err) {
    const msg = String((err && err.message) || '').toLowerCase();
    return msg.includes('rate limit') || msg.includes('too many requests');
  }

  function isUserNotFoundLikeError(err) {
    const msg = String((err && err.message) || '').toLowerCase();
    return (
      msg.includes('invalid login credentials') ||
      msg.includes('user not found') ||
      msg.includes('email not confirmed')
    );
  }

  function isUserExistsLikeError(err) {
    const msg = String((err && err.message) || '').toLowerCase();
    return msg.includes('already registered') || msg.includes('already been registered');
  }

  function isCloudMarkerHash(passwordHash) {
    return (
      passwordHash === 'supabase_email' ||
      passwordHash === 'cloud_auth' ||
      passwordHash === 'supabase_oauth' ||
      passwordHash === 'google_local_fallback'
    );
  }

  async function saveCloudBackedLocalCredentials(email, password, provider) {
    const normalized = normalizeEmail(email);
    if (!normalized || !password) return null;
    const passwordHash = await hashPassword(password);
    return storeUser(normalized, passwordHash, {
      provider: provider || 'supabase_email',
      cloudLinked: true,
      lastCloudAuthAt: new Date().toISOString(),
    });
  }

  async function loginUsingLocalFallback(email, password) {
    const normalized = normalizeEmail(email);
    savePendingCloudAuth(normalized, password, 'signin');
    const user = await getUser(normalized);
    if (!user) {
      const passwordHash = await hashPassword(password);
      await storeUser(normalized, passwordHash, {
        provider: 'local_offline',
        cloudPending: true,
        autoCreatedFromOfflineSignIn: true,
      });
      setCurrentUser(normalized);
      return { success: true, email: normalized, cloud: false, offline: true, mode: 'auto_local_create' };
    }

    // If this device already trusted this cloud account before, allow offline entry.
    if (isCloudMarkerHash(user.passwordHash)) {
      setCurrentUser(normalized);
      return { success: true, email: normalized, cloud: false, offline: true, mode: 'device_trust' };
    }

    const passwordHash = await hashPassword(password);
    if (passwordHash !== user.passwordHash) {
      throw new Error('Cloud auth is unavailable and local password does not match.');
    }

    setCurrentUser(normalized);
    return { success: true, email: normalized, cloud: false, offline: true, mode: 'local_password' };
  }

  async function getSupabaseUser() {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const result = await withTimeout(
        client.auth.getUser(),
        CLOUD_CALL_TIMEOUT_MS,
        'Cloud auth lookup timed out'
      );
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
      savePendingCloudAuth(normalized, password, 'signup');
      try {
        const { error } = await withTimeout(
          sb.auth.signUp({
            email: normalized,
            password,
            options: {
              emailRedirectTo: getAppRedirectUrl(),
            },
          }),
          CLOUD_CALL_TIMEOUT_MS,
          'Cloud signup timed out'
        );

        if (error) {
          throw new Error(error.message || 'Could not create account');
        }

        // Try to establish a real session immediately after signup.
        // If email confirmation is enabled in Supabase, this may fail until user confirms email.
        const signInTry = await withTimeout(
          sb.auth.signInWithPassword({
            email: normalized,
            password,
          }),
          CLOUD_CALL_TIMEOUT_MS,
          'Cloud sign-in timed out after signup'
        );

        await saveCloudBackedLocalCredentials(normalized, password, 'supabase_email');
        if (signInTry && !signInTry.error && signInTry.data && signInTry.data.user && signInTry.data.user.email) {
          clearPendingCloudAuth();
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
      } catch (err) {
        const existing = await getUser(normalized);
        if (existing) {
          const passwordHash = await hashPassword(password);
          if (!isCloudMarkerHash(existing.passwordHash) && existing.passwordHash !== passwordHash) {
            throw new Error('Account already exists on this device. Use Sign in.');
          }
          setCurrentUser(normalized);
          return {
            success: true,
            email: normalized,
            cloud: false,
            offline: true,
            mode: 'local_existing_register',
          };
        }

        if (isNetworkLikeError(err) || isRateLimitError(err)) {
          const passwordHash = await hashPassword(password);
          await storeUser(normalized, passwordHash, {
            provider: isRateLimitError(err) ? 'local_rate_limited' : 'local_offline',
            cloudPending: true,
          });
          setCurrentUser(normalized);
          savePendingCloudAuth(normalized, password, 'signup');
          return {
            success: true,
            email: normalized,
            cloud: false,
            offline: true,
            mode: isRateLimitError(err) ? 'local_register_rate_limited' : 'local_register',
          };
        }

        throw err;
      }
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
      try {
        const { data, error } = await withTimeout(
          sb.auth.signInWithPassword({
            email: normalized,
            password,
          }),
          CLOUD_CALL_TIMEOUT_MS,
          'Cloud sign-in timed out'
        );
        if (!error && data && data.user && data.user.email) {
          await saveCloudBackedLocalCredentials(data.user.email, password, 'supabase_email');
          clearPendingCloudAuth();
          setCurrentUser(data.user.email);
          return { success: true, email: data.user.email, cloud: true };
        }

        throw new Error((error && error.message) || 'Cloud login failed');
      } catch (err) {
        if (isNetworkLikeError(err) || isRateLimitError(err)) {
          return loginUsingLocalFallback(normalized, password);
        }
        throw err;
      }
    }

    const user = await getUser(normalized);
    if (!user) throw new Error('No account found for this email');

    if (isCloudMarkerHash(user.passwordHash)) {
      throw new Error('Use email/password after cloud connection is restored.');
    }

    const passwordHash = await hashPassword(password);
    if (passwordHash !== user.passwordHash) throw new Error('Invalid password');
    setCurrentUser(normalized);
    return { success: true, email: normalized, cloud: false };
  }

  async function loginWithGoogle(expectedEmail) {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Google sign-in is not configured yet');
    }

    const loginHint = normalizeEmail(expectedEmail);
    const queryParams = {
      prompt: 'select_account',
    };
    if (loginHint) {
      queryParams.login_hint = loginHint;
    }

    try {
      const { data, error } = await withTimeout(
        client.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: getAppRedirectUrl(),
            queryParams,
          },
        }),
        CLOUD_CALL_TIMEOUT_MS,
        'Cloud Google sign-in timed out'
      );
      if (error) {
        throw new Error(error.message || 'Could not start Google sign-in');
      }

      return { success: true };
    } catch (err) {
      if (isNetworkLikeError(err)) {
        throw new Error('Google cloud auth is temporarily unreachable. Use email sign-in on this device.');
      }
      throw err;
    }
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

  async function tryResumeCloudSession() {
    const client = getSupabaseClient();
    if (!client) return { ok: false, reason: 'no_client' };

    const pending = loadPendingCloudAuth();
    if (!pending) return { ok: false, reason: 'no_pending' };

    const activeEmail = normalizeEmail(currentUser || safeStorageGet(SESSION_STORAGE_KEY) || '');
    if (activeEmail && pending.email !== activeEmail) {
      return { ok: false, reason: 'email_mismatch' };
    }

    try {
      const { data, error } = await withTimeout(
        client.auth.signInWithPassword({
          email: pending.email,
          password: pending.password,
        }),
        CLOUD_CALL_TIMEOUT_MS,
        'Cloud sign-in timed out'
      );

      if (error || !data || !data.user || !data.user.email) {
        if (error && isRateLimitError(error)) {
          return { ok: false, reason: 'rate_limited', message: error.message || '' };
        }

        if (error && pending.intent === 'signup' && isUserNotFoundLikeError(error)) {
          try {
            const signupTry = await withTimeout(
              client.auth.signUp({
                email: pending.email,
                password: pending.password,
                options: {
                  emailRedirectTo: getAppRedirectUrl(),
                },
              }),
              CLOUD_CALL_TIMEOUT_MS,
              'Cloud signup timed out'
            );

            if (signupTry && signupTry.error) {
              if (isRateLimitError(signupTry.error)) {
                return { ok: false, reason: 'rate_limited', message: signupTry.error.message || '' };
              }
              if (!isUserExistsLikeError(signupTry.error) && !isNetworkLikeError(signupTry.error)) {
                clearPendingCloudAuth();
              }
            }

            const signInAfterSignup = await withTimeout(
              client.auth.signInWithPassword({
                email: pending.email,
                password: pending.password,
              }),
              CLOUD_CALL_TIMEOUT_MS,
              'Cloud sign-in timed out'
            );

            if (
              signInAfterSignup &&
              !signInAfterSignup.error &&
              signInAfterSignup.data &&
              signInAfterSignup.data.user &&
              signInAfterSignup.data.user.email
            ) {
              await saveCloudBackedLocalCredentials(
                signInAfterSignup.data.user.email,
                pending.password,
                'supabase_email'
              );
              clearPendingCloudAuth();
              setCurrentUser(signInAfterSignup.data.user.email);
              return { ok: true, email: signInAfterSignup.data.user.email };
            }
          } catch (innerErr) {
            if (isRateLimitError(innerErr)) {
              return { ok: false, reason: 'rate_limited', message: innerErr.message || '' };
            }
            if (!isNetworkLikeError(innerErr)) {
              clearPendingCloudAuth();
            }
            return { ok: false, reason: 'request_failed', message: (innerErr && innerErr.message) || '' };
          }
        }

        if (error && !isNetworkLikeError(error) && !isRateLimitError(error)) {
          if (pending.intent === 'signup' && isUserNotFoundLikeError(error)) {
            // keep pending so next resume can retry signup.
          } else {
            clearPendingCloudAuth();
          }
        }
        return { ok: false, reason: 'auth_failed', message: (error && error.message) || '' };
      }

      await saveCloudBackedLocalCredentials(data.user.email, pending.password, 'supabase_email');
      clearPendingCloudAuth();
      setCurrentUser(data.user.email);
      return { ok: true, email: data.user.email };
    } catch (err) {
      if (!isNetworkLikeError(err)) {
        clearPendingCloudAuth();
      }
      return { ok: false, reason: 'request_failed', message: (err && err.message) || '' };
    }
  }

  async function resolveCurrentUser() {
    if (currentUser) return currentUser;

    const sb = getSupabaseClient();
    const supabaseUser = await getSupabaseUser();
    if (supabaseUser && supabaseUser.email) {
      await ensureLocalShadowUser(supabaseUser.email, 'supabase_oauth');
      setCurrentUser(supabaseUser.email);
      return normalizeEmail(supabaseUser.email);
    }

    if (sb) {
      const sessionEmail = normalizeEmail(safeStorageGet(SESSION_STORAGE_KEY));
      if (sessionEmail) {
        // Trust session unconditionally if they previously verified authentication locally.
        currentUser = sessionEmail;
        return currentUser;
      }

      const remembered = normalizeEmail(getCookie(USER_EMAIL_COOKIE_NAME));
      if (remembered) {
        currentUser = remembered;
        return currentUser;
      }

      return null;
    }

    const sessionEmail = normalizeEmail(safeStorageGet(SESSION_STORAGE_KEY));
    if (sessionEmail) {
      currentUser = sessionEmail;
      return currentUser;
    }

    const remembered = normalizeEmail(getCookie(USER_EMAIL_COOKIE_NAME));
    if (remembered) {
      currentUser = remembered;
      return currentUser;
    }

    return null;
  }

  async function getCurrentUser() {
    if (currentUser) return currentUser;
    if (currentUserPromise) return currentUserPromise;

    currentUserPromise = resolveCurrentUser();
    try {
      return await currentUserPromise;
    } finally {
      currentUserPromise = null;
    }
  }

  async function logout() {
    currentUser = null;
    safeStorageRemove(SESSION_STORAGE_KEY);
    deleteCookie(USER_EMAIL_COOKIE_NAME);
    deleteCookie(AUTH_COOKIE_NAME);
    clearPendingCloudAuth();

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
    tryResumeCloudSession,
    hasPendingCloudAuth,
    queueCloudCredentials: savePendingCloudAuth,
    initDB,
    getUser,
    storeUser,
    hashPassword,
    setCookie,
    getCookie,
    deleteCookie,
  };
})();
