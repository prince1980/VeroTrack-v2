(function () {
  const Auth = window.VeroTrackAuth;

  let isShowingLoginUI = false;

  async function showLoginScreen() {
    isShowingLoginUI = true;
    document.body.innerHTML = `
      <div class="device-root">
        <div class="device-shell" id="device-shell">
          <header class="status-rail" aria-hidden="true">
            <span class="status-rail__time" id="status-time">9:41</span>
            <span class="status-rail__brand">VeroTrack</span>
            <span class="status-rail__icons">
              <span class="status-dot"></span>
              <span class="status-wifi"></span>
              <span class="status-bat"></span>
            </span>
          </header>

          <main class="app">
            <section class="login-screen" id="login-screen">
              <div class="login-container">
                <div class="login-header">
                  <div class="login-icon">🏃</div>
                  <h1>VeroTrack</h1>
                  <p class="login-subtitle">Personal fitness tracker</p>
                </div>

                <div id="toast" class="toast" role="status" aria-live="polite"></div>

                <!-- Google Sign-In Button -->
                <div class="login-section">
                  <div id="google-signin-btn" class="google-btn-container"></div>
                </div>

                <!-- Divider -->
                <div class="login-divider">
                  <span>or</span>
                </div>

                <!-- Email/Password Forms -->
                <div class="login-section">
                  <div class="login-tabs">
                    <button type="button" class="login-tab-btn active" data-tab="signin">Sign in</button>
                    <button type="button" class="login-tab-btn" data-tab="signup">Sign up</button>
                  </div>

                  <!-- Sign In Form -->
                  <form id="signin-form" class="login-form active">
                    <label class="field">
                      <span>Email</span>
                      <input type="email" id="signin-email" autocomplete="email" placeholder="you@example.com" required />
                    </label>
                    <label class="field">
                      <span>Password</span>
                      <input type="password" id="signin-password" autocomplete="current-password" placeholder="••••••" required />
                    </label>
                    <button type="submit" class="btn btn-primary btn-block">Sign in</button>
                  </form>

                  <!-- Sign Up Form -->
                  <form id="signup-form" class="login-form">
                    <label class="field">
                      <span>Email</span>
                      <input type="email" id="signup-email" autocomplete="email" placeholder="you@example.com" required />
                    </label>
                    <label class="field">
                      <span>Password</span>
                      <input type="password" id="signup-password" autocomplete="new-password" placeholder="At least 6 characters" required />
                    </label>
                    <label class="field">
                      <span>Confirm Password</span>
                      <input type="password" id="signup-password-confirm" autocomplete="new-password" placeholder="••••••" required />
                    </label>
                    <p class="login-hint">Password must be at least 6 characters. Your data is stored locally on your device.</p>
                    <button type="submit" class="btn btn-primary btn-block">Create account</button>
                  </form>
                </div>

                <p class="login-footer">🔐 Your data stays private. No tracking, no ads.</p>
              </div>
            </section>
          </main>
        </div>
      </div>

      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: #030304;
          color: #fff;
        }

        .login-screen {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
        }

        .login-container {
          width: 100%;
          max-width: 400px;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border-radius: 16px;
          padding: 32px 24px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }

        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .login-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .login-header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
          background: linear-gradient(135deg, #34d399 0%, #22d3ee 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .login-subtitle {
          margin: 8px 0 0 0;
          font-size: 14px;
          color: #999;
        }

        .login-section {
          margin-bottom: 24px;
        }

        .google-btn-container {
          display: flex;
          justify-content: center;
        }

        .login-divider {
          display: flex;
          align-items: center;
          margin: 24px 0;
          color: #666;
          font-size: 14px;
        }

        .login-divider::before,
        .login-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #444;
        }

        .login-divider span {
          padding: 0 12px;
        }

        .login-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          border-bottom: 1px solid #444;
        }

        .login-tab-btn {
          flex: 1;
          padding: 12px;
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
        }

        .login-form.active {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 14px;
        }

        .field span {
          color: #aaa;
          font-weight: 500;
        }

        .field input {
          padding: 12px;
          background: #0f3460;
          border: 1px solid #444;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          transition: border-color 0.2s ease;
        }

        .field input:focus {
          outline: none;
          border-color: #34d399;
        }

        .field input::placeholder {
          color: #666;
        }

        .btn {
          padding: 12px 16px;
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
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(52, 211, 153, 0.3);
        }

        .btn-block {
          width: 100%;
        }

        .login-hint {
          font-size: 12px;
          color: #999;
          margin-top: 8px;
        }

        .login-footer {
          text-align: center;
          font-size: 12px;
          color: #666;
          margin-top: 24px;
        }

        .toast {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #1a1a2e;
          border: 1px solid #666;
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 14px;
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
          z-index: 1000;
        }

        .toast.show {
          opacity: 1;
          pointer-events: auto;
        }

        .toast[style*="--danger"] {
          border-color: #ef4444;
        }
      </style>
    `;

    // Set up event listeners
    setupLoginListeners();
    
    // Load Google API if using Google sign-in
    loadGoogleAPI();
  }

  function loadGoogleAPI() {
    if (document.querySelector('script[src*="google"]')) return;
    
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  function setupLoginListeners() {
    const toast = document.getElementById('toast');
    
    function showToast(message, isError) {
      toast.textContent = message;
      toast.style.setProperty('--danger', isError ? '#ef4444' : 'var(--border)');
      if (isError) toast.style.borderColor = '#ef4444';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // Tab switching
    document.querySelectorAll('.login-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.login-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab + '-form').classList.add('active');
      });
    });

    // Sign In Form
    document.getElementById('signin-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signin-email').value;
      const password = document.getElementById('signin-password').value;

      try {
        await Auth.login(email, password);
        showToast('Signed in successfully!');
        hideLoginScreen();
      } catch (err) {
        showToast(err.message, true);
      }
    });

    // Sign Up Form
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      const confirmPassword = document.getElementById('signup-password-confirm').value;

      if (password !== confirmPassword) {
        showToast('Passwords do not match', true);
        return;
      }

      try {
        await Auth.register(email, password);
        showToast('Account created! Welcome to VeroTrack!');
        hideLoginScreen();
      } catch (err) {
        showToast(err.message, true);
      }
    });

    // Google Sign-In
    window.addEventListener('load', () => {
      setTimeout(() => {
        if (window.google) {
          try {
            Auth.loginWithGoogle().then(() => {
              showToast('Signed in with Google!');
              hideLoginScreen();
            }).catch(err => {
              showToast(err.message || 'Google sign-in failed', true);
            });
          } catch (e) {
            showToast(e.message, true);
          }
        }
      }, 500);
    });
  }

  function hideLoginScreen() {
    isShowingLoginUI = false;
    window.location.reload(); // Reload to show main app
  }

  async function initAuth() {
    await Auth.initDB();
    const isAuthenticated = await Auth.isAuthenticated();
    
    if (!isAuthenticated) {
      showLoginScreen();
    }

    return isAuthenticated;
  }

  window.VeroTrackUI = {
    initAuth,
    showLoginScreen,
    hideLoginScreen,
    isShowingLoginUI: () => isShowingLoginUI
  };
})();
