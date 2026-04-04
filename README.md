# VeroTrack

Think of this as an **app that lives in Safari**. Your logs and goals are saved **on your iPhone** for this website address. When you “update the app” from Cursor, only the code on the server changes — **your numbers stay on your phone** (unless you delete Safari data for this site).

## Free hosting that stays online (GitHub Pages)

GitHub serves the files from a **global CDN**. There is no “server sleep” — the site is always reachable.

**Free plan:** use a **public** repository (private + Pages needs a paid GitHub plan).

1. Create a repo on GitHub (example name: `verotrack`).
2. Push this project to the **`main`** branch (from Cursor terminal or GitHub Desktop).
3. In the repo on GitHub: **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”).
5. Go to the **Actions** tab and wait until **Deploy GitHub Pages** succeeds.
6. Open the URL GitHub shows (usually `https://YOUR_USERNAME.github.io/YOUR_REPO/`).

## iPhone: install like an app

1. Open your VeroTrack link in **Safari** (not Chrome for the first install if you want the smoothest “Add to Home Screen” flow).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch it from the icon; it opens full screen.

**Optional nicer home screen icon (PNG):** on a computer, open `icons/build.html` in Chrome, download the two PNGs into `icons/`, then you can point `apple-touch-icon` in `index.html` at `icons/apple-touch-icon.png` (copy one of the PNGs to that name). The app already ships with `icons/icon.svg` which works for many browsers.

## Will my data still be there in 10 years?

- It stays as long as **Safari keeps website data** for **this exact URL** and you don’t wipe it in Settings.
- That’s normal for PWAs: **no login**, data on device.
- For peace of mind, use **Settings → Export backup** in the app once in a while and save the file to **iCloud Drive** or email.

## Updating from Cursor (how you ship changes)

1. Edit the project in Cursor.
2. **Commit** and **push** to `main`.
3. GitHub Actions publishes the new version in about a minute.
4. On the phone, **close the app fully** or pull to refresh if you’re in Safari — you may need to open it twice after an update so the new service worker applies.

If something looks stuck on an old version, change the `CACHE` line at the top of `sw.js`, push again.

## PWA pieces included

- `manifest.json` — name, colors, standalone display.
- `sw.js` — caches the app shell for faster loads and offline-ish behavior.
- `icons/icon.svg` — app icon.

## Keepalive workflow

The separate `keepalive` workflow is only for **Render-style web servers** that spin down. **You don’t need it for GitHub Pages.**
