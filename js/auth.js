(function () {
  // Auth configuration
  const GOOGLE_CLIENT_ID = '701285139211-1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p.apps.googleusercontent.com'; // Replace with your Google OAuth ID
  const AUTH_COOKIE_NAME = 'vt_auth_device';
  const USER_EMAIL_COOKIE_NAME = 'vt_user_email';
  const USERS_DB_NAME = 'VeroTrackUsers';
  const USERS_STORE_NAME = 'users';

  let currentUser = null;
  let authDB = null;

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function getSupabaseClient() {
    const cfg = window.VEROTRACK_SUPABASE || {};
    if (
      typeof window.supabase === 'undefined' ||
      !cfg.url ||
      !cfg.anonKey
    ) {
      return null;
    }

    try {
      return window.supabase.createClient(cfg.url, cfg.anonKey);
    } catch {
      return null;
    }
  }

  async function getSupabaseUser() {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const {
        data: { user },
      } = await client.auth.getUser();
      return user || null;
    } catch {
      return null;
    }
  }

  // Initialize IndexedDB for multi-user support
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

  // Cookie helpers
  function setCookie(name, value, days = 365) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = 'expires=' + date.toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + ';' + expires + ';path=/;SameSite=Lax';
  }

  function getCookie(name) {
    const nameEQ = name + '=';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.indexOf(nameEQ) === 0) {
        return decodeURIComponent(cookie.substring(nameEQ.length));
      }
    }
    return null;
  }

  function deleteCookie(name) {
    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;';
  }

  // Password hashing (simple client-side hashing - for personal use only)
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Store user in IndexedDB
  async function storeUser(email, passwordHash, profile = {}) {
    if (!authDB) authDB = await initDB();
    return new Promise((resolve, reject) => {
      const tx = authDB.transaction([USERS_STORE_NAME], 'readwrite');
      const store = tx.objectStore(USERS_STORE_NAME);
      const user = {
        email,
        passwordHash,
        createdAt: new Date().toISOString(),
        profile,
        deviceToken: crypto.randomUUID(),
      };
      const req = store.put(user);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(user);
    });
  }

  // Get user from IndexedDB
  async function getUser(email) {
    if (!authDB) authDB = await initDB();
    return new Promise((resolve, reject) => {
      const tx = authDB.transaction([USERS_STORE_NAME], 'readonly');
      const store = tx.objectStore(USERS_STORE_NAME);
      const req = store.get(email);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  // Register new user
  async function register(email, password) {
    email = normalizeEmail(email);
    if (!email || !password) throw new Error('Email and password required');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');

    const existing = await getUser(email);
    if (existing) throw new Error('User already exists');

    const passwordHash = await hashPassword(password);
    const user = await storeUser(email, passwordHash);
    
    setCurrentUser(email);
    return { success: true, email };
  }

  // Login with email/password
  async function login(email, password) {
    email = normalizeEmail(email);
    if (!email || !password) throw new Error('Email and password required');

    const user = await getUser(email);
    if (!user) throw new Error('User not found');

    const passwordHash = await hashPassword(password);
    if (passwordHash !== user.passwordHash) throw new Error('Invalid password');

    setCurrentUser(email);
    return { success: true, email };
  }

  // Handle Google OAuth callback
  async function handleGoogleSignIn(response) {
    try {
      const token = response.credential;
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid token format');
      
      const payload = JSON.parse(atob(parts[1]));
      const email = normalizeEmail(payload.email);
      
      if (!email) throw new Error('No email in token');

      let user = await getUser(email);
      if (!user) {
        user = await storeUser(email, 'google_oauth', { 
          name: payload.name,
          picture: payload.picture 
        });
      }

      setCurrentUser(email);
      return { success: true, email, isNewUser: !user };
    } catch (e) {
      console.error('Google sign-in error:', e);
      throw e;
    }
  }

  // Sign in with Google using Supabase OAuth
  async function loginWithGoogle() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Google sign-in is not configured yet');
    }

    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
      },
    });

    if (error) {
      throw new Error(error.message || 'Could not start Google sign-in');
    }

    return { success: true };
  }

  // Set current user and save device cookie
  function setCurrentUser(email) {
    email = normalizeEmail(email);
    currentUser = email;
    setCookie(USER_EMAIL_COOKIE_NAME, email, 365);
    setCookie(AUTH_COOKIE_NAME, crypto.randomUUID(), 365); // Device token
    window.dispatchEvent(new CustomEvent('auth-changed', { detail: { email, isLoggedIn: true } }));
  }

  // Get current user
  async function getCurrentUser() {
    if (currentUser) return currentUser;

    // Check cookie for remembered device
    const rememberedEmail = getCookie(USER_EMAIL_COOKIE_NAME);
    if (rememberedEmail) {
      const normalizedRememberedEmail = normalizeEmail(rememberedEmail);
      const user = await getUser(normalizedRememberedEmail);
      if (user) {
        currentUser = normalizedRememberedEmail;
        return currentUser;
      }
    }

    // If user returned from Supabase Google OAuth, bind that session to local auth
    const supabaseUser = await getSupabaseUser();
    if (supabaseUser && supabaseUser.email) {
      const email = normalizeEmail(supabaseUser.email);
      let localUser = await getUser(email);
      if (!localUser) {
        localUser = await storeUser(email, 'supabase_oauth', {
          name: supabaseUser.user_metadata && supabaseUser.user_metadata.full_name,
          picture: supabaseUser.user_metadata && supabaseUser.user_metadata.avatar_url,
        });
      }
      setCurrentUser(email);
      return email;
    }

    return null;
  }

  // Logout
  function logout() {
    currentUser = null;
    deleteCookie(USER_EMAIL_COOKIE_NAME);
    deleteCookie(AUTH_COOKIE_NAME);
    window.dispatchEvent(new CustomEvent('auth-changed', { detail: { email: null, isLoggedIn: false } }));
  }

  // Check if user is authenticated
  async function isAuthenticated() {
    const user = await getCurrentUser();
    return !!user;
  }

  // Export auth interface
  window.VeroTrackAuth = {
    register,
    login,
    loginWithGoogle,
    handleGoogleSignIn,
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
    GOOGLE_CLIENT_ID
  };
})();
