// Supabase public client config for VeroTrack Cloud Sync.
// Safe to expose in frontend: URL + anon key are public credentials.
// Replace with your real project values.
window.VEROTRACK_SUPABASE = {
  url: 'https://nhxkuppugjxtbmeimqyq.supabase.co',
  anonKey: 'sb_publishable_7ihTP84sdeKancFDaCep5w_ysBVwOMy'
};

// Optional global Gemini defaults.
// Warning: any key hardcoded in frontend code is publicly visible in the deployed app.
window.VEROTRACK_GEMINI_DEFAULT = {
  defaultApiKey: 'AIzaSyAysziBCVQZx7BnsXd5QH543uSsLmHQILc',
  defaultModel: 'gemini-2.5-flash-lite',
};
