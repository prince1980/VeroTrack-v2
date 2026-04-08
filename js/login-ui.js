(function () {
  const Auth = window.VeroTrackAuth;
  const LOGIN_STYLE_ID = 'vt-login-ui-style';
  let isShowingLoginUI = false;

  function ensureLoginStyles() {
    if (document.getElementById(LOGIN_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = LOGIN_STYLE_ID;
    style.textContent = `
      body.vt-login-active {
        margin: 0;
        min-height: 100vh;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: linear-gradient(135deg, #030304 0%, #0f1419 100%);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }

      .vt-login-wrap {
        width: 100%;
        max-width: 420px;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px;
        padding: 36px 28px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(52,211,153,0.1);
        border: 1px solid rgba(52, 211, 153, 0.2);
      }

      .vt-login-header {
        text-align: center;
        margin-bottom: 32px;
      }

      .vt-login-icon {
        font-size: 52px;
        margin-bottom: 14px;
      }

      .vt-login-title {
        margin: 0;
        font-size: 42px;
        font-weight: 800;
        background: linear-gradient(135deg, #34d399 0%, #22d3ee 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .vt-login-subtitle {
        margin: 6px 0 0;
        font-size: 14px;
        color: #9ca3af;
      }

      .vt-toast {
        margin-bottom: 18px;
        padding: 11px 14px;
        border-radius: 9px;
        border: 1px solid #ef4444;
        background: rgba(239, 68, 68, 0.1);
        color: #fca5a5;
        font-size: 13px;
        display: none;
      }

      .vt-toast.show {
        display: block;
      }

      .vt-toast.success {
        border-color: #34d399;
        background: rgba(52, 211, 153, 0.1);
        color: #86efac;
      }

      .vt-login-google {
        width: 100%;
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: 10px;
        background: rgba(255,255,255,0.06);
        color: #f8fafc;
        font-size: 14px;
        font-weight: 700;
        padding: 13px;
        cursor: pointer;
        transition: background 0.2s ease;
      }

      .vt-login-google:hover {
        background: rgba(255,255,255,0.12);
      }

      .vt-google-fallback {
        margin-top: 10px;
        padding: 12px;
        border-radius: 10px;
        border: 1px solid rgba(250, 204, 21, 0.35);
        background: rgba(250, 204, 21, 0.08);
      }

      .vt-google-fallback p {
        margin: 0 0 8px;
        color: #fde68a;
        font-size: 12px;
      }

      .vt-google-fallback input {
        width: 100%;
        margin-bottom: 8px;
        padding: 10px 11px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.16);
        background: rgba(15, 52, 96, 0.5);
        color: #fff;
      }

      .vt-google-fallback button {
        width: 100%;
        border: none;
        border-radius: 8px;
        background: rgba(250, 204, 21, 0.9);
        color: #111827;
        font-weight: 700;
        padding: 10px;
        cursor: pointer;
      }

      .vt-login-divider {
        display: flex;
        align-items: center;
        margin: 24px 0;
        color: #6b7280;
        font-size: 13px;
        gap: 12px;
      }

      .vt-login-divider::before,
      .vt-login-divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: rgba(255,255,255,0.12);
      }

      .vt-login-tabs {
        display: flex;
        margin-bottom: 18px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }

      .vt-login-tab {
        flex: 1;
        background: none;
        border: none;
        color: #9ca3af;
        font-size: 14px;
        font-weight: 700;
        padding: 12px;
        border-bottom: 2px solid transparent;
        cursor: pointer;
      }

      .vt-login-tab.active {
        color: #34d399;
        border-bottom-color: #34d399;
      }

      .vt-login-form {
        display: none;
      }

      .vt-login-form.active {
        display: block;
      }

      .vt-field {
        margin-bottom: 14px;
      }

      .vt-field label {
        display: block;
        margin-bottom: 6px;
        color: #cbd5e1;
        font-size: 13px;
        font-weight: 600;
      }

      .vt-field input {
        width: 100%;
        padding: 12px 13px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(15, 52, 96, 0.6);
        color: #fff;
        font-size: 14px;
      }

      .vt-field input:focus {
        outline: none;
        border-color: #34d399;
        box-shadow: 0 0 0 3px rgba(52,211,153,0.12);
      }

      .vt-btn-primary {
        width: 100%;
        border: none;
        border-radius: 10px;
        background: linear-gradient(135deg, #34d399 0%, #22d3ee 100%);
        color: #031116;
        font-size: 15px;
        font-weight: 800;
        padding: 12px;
        cursor: pointer;
        margin-top: 2px;
      }

      .vt-btn-primary[disabled],
      .vt-login-google[disabled] {
        opacity: 0.7;
        cursor: not-allowed;
      }

      .vt-login-hint {
        color: #94a3b8;
        font-size: 12px;
        margin-top: 0;
        margin-bottom: 12px;
      }

      .vt-login-footer {
        margin: 20px 0 0;
        text-align: center;
        color: #64748b;
        font-size: 12px;
      }

      .vt-login-warning {
        margin: 0 0 14px;
        padding: 10px 12px;
        border: 1px solid rgba(248, 113, 113, 0.45);
        border-radius: 9px;
        background: rgba(239, 68, 68, 0.12);
        color: #fecaca;
        font-size: 12px;
      }
    `;

    document.head.appendChild(style);
  }

  function showToast(message, isError) {
    const toast = document.getElementById('vt-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = 'vt-toast show' + (isError ? '' : ' success');
    setTimeout(() => {
      if (toast) toast.classList.remove('show');
    }, 3200);
  }

  function renderLoginUI() {
    ensureLoginStyles();
    document.body.className = 'vt-login-active';
    const isLocalFile = window.location && window.location.protocol === 'file:';
    const localModeWarning = isLocalFile
      ? '<p class="vt-login-warning">You are running local file mode. Use the live site URL for full auth and cloud sync.</p>'
      : '';

    document.body.innerHTML = `
      <div class="vt-login-wrap">
        <div class="vt-login-header">
          <div class="vt-login-icon">🏃</div>
          <h1 class="vt-login-title">VeroTrack</h1>
          <p class="vt-login-subtitle">Personal fitness tracker</p>
        </div>

        <div id="vt-toast" class="vt-toast"></div>
        ${localModeWarning}

        <button type="button" id="vt-btn-google" class="vt-login-google">Continue with Google</button>
        <div id="vt-google-fallback" class="vt-google-fallback" hidden>
          <p>Cloud Google is unreachable. Continue locally with your Gmail:</p>
          <input type="email" id="vt-google-fallback-email" placeholder="you@gmail.com" autocomplete="email" />
          <button type="button" id="vt-btn-google-local">Continue locally</button>
        </div>

        <div class="vt-login-divider"><span>or email</span></div>

        <div class="vt-login-tabs">
          <button type="button" class="vt-login-tab active" data-tab="signin">Sign in</button>
          <button type="button" class="vt-login-tab" data-tab="signup">Create account</button>
        </div>

        <form id="vt-form-signin" class="vt-login-form active" novalidate>
          <div class="vt-field">
            <label for="vt-signin-email">Email address</label>
            <input type="email" id="vt-signin-email" autocomplete="email" placeholder="you@example.com" required />
          </div>
          <div class="vt-field">
            <label for="vt-signin-password">Password</label>
            <input type="password" id="vt-signin-password" autocomplete="current-password" placeholder="••••••" required />
          </div>
          <button type="submit" class="vt-btn-primary">Sign in</button>
        </form>

        <form id="vt-form-signup" class="vt-login-form" novalidate>
          <div class="vt-field">
            <label for="vt-signup-email">Email address</label>
            <input type="email" id="vt-signup-email" autocomplete="email" placeholder="you@example.com" required />
          </div>
          <div class="vt-field">
            <label for="vt-signup-password">Password</label>
            <input type="password" id="vt-signup-password" autocomplete="new-password" placeholder="Min 6 characters" required />
          </div>
          <div class="vt-field">
            <label for="vt-signup-confirm">Confirm password</label>
            <input type="password" id="vt-signup-confirm" autocomplete="new-password" placeholder="••••••" required />
          </div>
          <p class="vt-login-hint">Your data is private and syncs securely to your account.</p>
          <button type="submit" class="vt-btn-primary">Create account</button>
        </form>

        <p class="vt-login-footer">Join thousands tracking their fitness 💪</p>
      </div>
    `;
  }

  function bindLoginHandlers() {
    const tabs = Array.from(document.querySelectorAll('.vt-login-tab'));
    const signInForm = document.getElementById('vt-form-signin');
    const signUpForm = document.getElementById('vt-form-signup');
    const googleBtn = document.getElementById('vt-btn-google');
    const googleFallback = document.getElementById('vt-google-fallback');
    const googleFallbackEmail = document.getElementById('vt-google-fallback-email');
    const googleFallbackBtn = document.getElementById('vt-btn-google-local');

    tabs.forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const selected = tabBtn.dataset.tab;
        tabs.forEach((t) => t.classList.toggle('active', t === tabBtn));
        signInForm.classList.toggle('active', selected === 'signin');
        signUpForm.classList.toggle('active', selected === 'signup');
      });
    });

    signInForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitBtn = signInForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;

      const email = document.getElementById('vt-signin-email').value;
      const password = document.getElementById('vt-signin-password').value;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';

      try {
        await Auth.login(email, password);
        showToast('Welcome back! Loading your data...');
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        showToast(err.message || 'Sign in failed', true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });

    signUpForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitBtn = signUpForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;

      const email = document.getElementById('vt-signup-email').value;
      const password = document.getElementById('vt-signup-password').value;
      const confirm = document.getElementById('vt-signup-confirm').value;

      if (password !== confirm) {
        showToast('Passwords do not match', true);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';

      try {
        await Auth.register(email, password);
        showToast('Account created! Loading your dashboard...');
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        showToast(err.message || 'Account creation failed', true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });

    googleBtn.addEventListener('click', async () => {
      const originalText = googleBtn.textContent;
      googleBtn.disabled = true;
      googleBtn.textContent = 'Opening Google...';

      try {
        await Auth.loginWithGoogle();
      } catch (err) {
        showToast(err.message || 'Google sign-in failed', true);
        if (googleFallback) {
          googleFallback.hidden = false;
        }
        googleBtn.disabled = false;
        googleBtn.textContent = originalText;
      }
    });

    googleFallbackBtn.addEventListener('click', async () => {
      const email = googleFallbackEmail.value;
      const originalText = googleFallbackBtn.textContent;
      googleFallbackBtn.disabled = true;
      googleFallbackBtn.textContent = 'Continuing...';

      try {
        await Auth.loginWithGoogleLocal(email);
        showToast('Signed in locally with Gmail. Loading...');
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        showToast(err.message || 'Local Google fallback failed', true);
        googleFallbackBtn.disabled = false;
        googleFallbackBtn.textContent = originalText;
      }
    });
  }

  async function showLoginScreen() {
    isShowingLoginUI = true;
    renderLoginUI();
    bindLoginHandlers();
  }

  async function initAuth() {
    try {
      await Auth.initDB();
      const isAuthenticated = await Auth.isAuthenticated();

      if (!isAuthenticated) {
        await showLoginScreen();
        return false;
      }

      return true;
    } catch (err) {
      console.error('Auth init error:', err);
      await showLoginScreen();
      return false;
    }
  }

  window.VeroTrackUI = {
    initAuth,
    showLoginScreen,
    isShowingLoginUI: function () {
      return isShowingLoginUI;
    },
    showToast,
  };
})();
