(function () {
  const Auth = window.VeroTrackAuth;
  let isShowingLoginUI = false;

  async function showLoginScreen() {
    isShowingLoginUI = true;
    
    // Replace entire page with login UI
    document.documentElement.innerHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
  <meta name="theme-color" content="#030304" />
  <title>VeroTrack - Sign In</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #030304 0%, #0f1419 100%);
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .login-container {
      width: 100%;
      max-width: 420px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 20px;
      padding: 40px 32px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(52,211,153,0.1);
      border: 1px solid rgba(52, 211, 153, 0.2);
    }

    .login-header {
      text-align: center;
      margin-bottom: 40px;
    }

    .login-icon {
      font-size: 56px;
      margin-bottom: 16px;
      display: inline-block;
    }

    .login-header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #34d399 0%, #22d3ee 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .login-header p {
      font-size: 14px;
      color: #999;
      margin: 0;
    }

    .toast {
      margin-bottom: 24px;
      padding: 12px 16px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid #ef4444;
      border-radius: 8px;
      color: #fca5a5;
      font-size: 13px;
      display: none;
    }

    .toast.show {
      display: block;
    }

    .toast.success {
      background: rgba(52, 211, 153, 0.1);
      border-color: #34d399;
      color: #86efac;
    }

    .login-section {
      margin-bottom: 28px;
    }

    .google-btn-container {
      display: flex;
      justify-content: center;
      margin-bottom: 24px;
    }

    .btn-google {
      width: 100%;
      padding: 13px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255, 255, 255, 0.06);
      color: #f3f4f6;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-google:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    .login-divider {
      display: flex;
      align-items: center;
      margin: 28px 0;
      color: #666;
      font-size: 13px;
      gap: 12px;
    }

    .login-divider::before,
    .login-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: rgba(255,255,255,0.1);
    }

    .login-tabs {
      display: flex;
      gap: 0;
      margin-bottom: 24px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .login-tab-btn {
      flex: 1;
      padding: 14px 12px;
      background: none;
      border: none;
      color: #999;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s ease;
    }

    .login-tab-btn.active {
      color: #34d399;
      border-bottom-color: #34d399;
    }

    .login-form {
      display: none;
      flex-direction: column;
      gap: 16px;
    }

    .login-form.active {
      display: flex;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .field label {
      color: #aaa;
      font-weight: 500;
      font-size: 13px;
    }

    .field input {
      padding: 12px 14px;
      background: rgba(15, 52, 96, 0.6);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      transition: all 0.2s ease;
      font-family: inherit;
    }

    .field input:focus {
      outline: none;
      border-color: #34d399;
      background: rgba(15, 52, 96, 1);
      box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.1);
    }

    .field input::placeholder {
      color: #666;
    }

    .btn {
      padding: 13px 16px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-primary {
      background: linear-gradient(135deg, #34d399 0%, #22d3ee 100%);
      color: #030304;
      width: 100%;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(52, 211, 153, 0.3);
    }

    .btn-primary:active {
      transform: translateY(0);
    }

    .login-hint {
      font-size: 12px;
      color: #999;
      margin-top: 8px;
      line-height: 1.4;
    }

    .login-footer {
      text-align: center;
      font-size: 12px;
      color: #666;
      margin-top: 32px;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-header">
      <div class="login-icon">🏃</div>
      <h1>VeroTrack</h1>
      <p>Personal fitness tracker</p>
    </div>

    <div id="toast" class="toast"></div>

    <!-- Google Sign-In -->
    <div class="login-section">
      <div class="google-btn-container">
        <button type="button" id="btn-google-signin" class="btn-google">Continue with Google</button>
      </div>
    </div>

    <!-- Divider -->
    <div class="login-divider">
      <span>or email</span>
    </div>

    <!-- Email/Password Tabs -->
    <div class="login-section">
      <div class="login-tabs">
        <button type="button" class="login-tab-btn active" data-tab="signin">Sign in</button>
        <button type="button" class="login-tab-btn" data-tab="signup">Create account</button>
      </div>

      <!-- Sign In Form -->
      <form id="signin-form" class="login-form active">
        <div class="field">
          <label>Email address</label>
          <input type="email" id="signin-email" placeholder="you@example.com" required />
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" id="signin-password" placeholder="••••••" required />
        </div>
        <button type="submit" class="btn btn-primary">Sign in</button>
      </form>

      <!-- Sign Up Form -->
      <form id="signup-form" class="login-form">
        <div class="field">
          <label>Email address</label>
          <input type="email" id="signup-email" placeholder="you@example.com" required />
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" id="signup-password" placeholder="Min 6 characters" required />
        </div>
        <div class="field">
          <label>Confirm password</label>
          <input type="password" id="signup-password-confirm" placeholder="••••••" required />
        </div>
        <p class="login-hint">💾 Your data stays on your device. No servers, no tracking, no ads.</p>
        <button type="submit" class="btn btn-primary">Create account</button>
      </form>
    </div>

    <p class="login-footer">Join thousands tracking their fitness 💪</p>
  </div>

  <script>
    // Tab switching
    document.querySelectorAll('.login-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.login-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab + '-form').classList.add('active');
      });
    });

    const toast = document.getElementById('toast');
    
    function showToast(msg, isError = false) {
      toast.textContent = msg;
      toast.className = 'toast show' + (isError ? '' : ' success');
      setTimeout(() => toast.classList.remove('show'), 3500);
    }

    // Sign In
    document.getElementById('signin-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signin-email').value;
      const password = document.getElementById('signin-password').value;
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
      
      try {
        await window.VeroTrackAuth.login(email, password);
        showToast('Welcome back! Loading your data...');
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        showToast(err.message, true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });

    // Sign Up
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      const confirm = document.getElementById('signup-password-confirm').value;
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalLabel = submitBtn.textContent;
      
      if (password !== confirm) {
        showToast('Passwords do not match', true);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
      
      try {
        await window.VeroTrackAuth.register(email, password);
        showToast('Account created! Launching app...');
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        showToast(err.message, true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });

    // Google Sign-In (Supabase OAuth)
    document.getElementById('btn-google-signin').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Opening Google...';

      try {
        await window.VeroTrackAuth.loginWithGoogle();
      } catch (err) {
        showToast(err.message || 'Google sign-in failed', true);
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  </script>
</body>
</html>`;

    isShowingLoginUI = true;
  }

  async function initAuth() {
    try {
      await Auth.initDB();
      const isAuthenticated = await Auth.isAuthenticated();

      if (!isAuthenticated) {
        showLoginScreen();
        return false;
      }

      return true;
    } catch (err) {
      console.error('Auth init error:', err);
      showLoginScreen();
      return false;
    }
  }

  window.VeroTrackUI = {
    initAuth,
    showLoginScreen,
    isShowingLoginUI: () => isShowingLoginUI
  };
})();
