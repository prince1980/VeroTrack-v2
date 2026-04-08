# VeroTrack v2

VeroTrack is a mobile-first fitness tracker PWA focused on low-friction logging, long-term history, and cloud sync.

## What is upgraded

- AI-assisted food logging via Gemini with editable preview before save
- AI-assisted exercise metadata (burn estimate, muscle group, exercise type)
- Cloud-first auth and sync (Supabase email/password + Google OAuth)
- Persistent history grouping by year/month/day (up to 10 years retained)
- Dashboard emphasis on protein progress + key daily metrics
- Quick-add step buttons (`+2000`, `+5000`, `+10000`)
- Theme support (`auto`, `dark`, `light`)
- Better resilience for API and sync failures

## Setup

## 1) Supabase (required for cloud auth/sync)

1. Create a Supabase project.
2. In **Authentication -> Providers**, enable Google OAuth.
3. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
4. Set your public config in [`js/supabase-config.js`](js/supabase-config.js):
   - `url`
   - `anonKey`
5. In **Authentication -> URL Configuration**, add your app URL to allowed redirects.

## 2) Gemini API (required for AI meal/exercise automation)

1. Create a Google AI Studio API key.
2. Open app **Settings -> AI Automation**.
3. Paste your Gemini API key.
4. Optionally change model (default: `gemini-2.5-flash-lite`).

The key is stored in your synced user settings and loaded after sign-in.

Optional global default (all users/devices):
- Configure `window.VEROTRACK_GEMINI_DEFAULT` in [`js/supabase-config.js`](js/supabase-config.js).
- Important: a frontend hardcoded key is publicly visible in deployed code.

## Run / Deploy

- Static hosting works (GitHub Pages, Netlify, Vercel static, etc.)
- PWA shell is cached by `sw.js`
- After deploy, bump cache/version if clients appear stale:
  - `sw.js` `CACHE` constant
  - `index.html` `swVersion` value

## Data model notes

- User data is stored locally in IndexedDB + localStorage for fast load.
- Each authenticated user has isolated cloud data in `public.user_data` via RLS.
- Merge strategy prefers the newest `meta.updatedAt`.
- History retention is capped to ~10 years.
