# Bulk — Diet & Workout Tracker (Glass PWA)

A single installable app — works on **iPhone, Android, and desktop** from one codebase — with an Apple/WhatsApp-style frosted-glass UI and AI meal scanning powered by Claude Vision.

## What's in this build

- **Glass UI**: translucent cards, blurred tab bar, iOS-style bottom sheets, system blue (`#0a84ff`) accent — same visual language as iOS/WhatsApp.
- **4 tabs**: Diet · Scan · Workout · More (Water, Body weight, Supplements, Charts, Settings nested inside More).
- **Fully editable workouts**: add, rename or delete any day or exercise — nothing is hardcoded.
- **AI meal scanning**: photograph or upload a plate, Claude Vision identifies each food and estimates kcal/protein/carbs/fat, with a portion-size slider to correct for serving size.
- **Installable PWA**: manifest + service worker + icon set, so it installs to the home screen and works offline (except scanning, which needs the network).
- **Optional accounts & sync**: sign in with email, Google, Facebook or phone, data synced via Firebase — or skip it and stay fully local on one device. See "Accounts & cloud sync" below.

## 1. Deploy it (Vercel — free)

The AI scan needs a tiny server function to keep your Anthropic API key secret, so GitHub Pages alone won't run it — use **Vercel**, which is free and hosts both the static app and the function together.

1. This repo is already on GitHub — just import it (no re-push needed).
2. On [vercel.com](https://vercel.com) → **Add New Project** → import `bulking-tracker-pro`.
3. In **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your key from [console.anthropic.com](https://console.anthropic.com/settings/keys)
4. Deploy. You'll get a URL like `https://bulk-tracker.vercel.app`.

**Getting the API key for free:** sign up at [console.anthropic.com](https://console.anthropic.com) (no credit card needed) and new accounts get **$5 in free credit** automatically. Each meal scan costs roughly $0.01–0.02, so that's 250–500 free scans — plenty to run this personally without ever paying. Go to **Settings → API Keys → Create Key**, copy it, and paste it into the Vercel env var above.

That's it — `/api/scan` is live automatically because `api/scan.js` is a Vercel serverless function.

## 2. Install it like a real app

**iPhone (Safari):** open the URL → Share icon → **Add to Home Screen**. It opens full-screen with no browser bar, like a native app.

**Android (Chrome):** open the URL → menu (⋮) → **Install app** (or Chrome shows an "Install" banner automatically).

**Desktop (Chrome/Edge):** an install icon appears in the address bar → click it to install as a standalone window.

No App Store / Play Store submission needed — this is what makes a PWA the fastest way to get one codebase onto all three platforms.

## 3. How the Claude Vision scanning works

```
Phone camera → compress to ≤1024px JPEG (in-browser, instant)
            → POST base64 image to YOUR /api/scan endpoint
            → api/scan.js attaches your secret ANTHROPIC_API_KEY server-side
            → calls Claude (model: claude-sonnet-5-5) with the image + a
              system prompt that forces strict JSON output:
              {"foods":[{"name","serving","kcal","protein","carbs","fat","confidence"}]}
            → response is validated/sanitized and sent back to the app
            → you get an editable list with a portion-size slider
```

**Why it's a server function and not a direct browser call:** your Anthropic API key must never ship inside client-side JavaScript — anyone could open dev tools and steal it. `api/scan.js` runs on Vercel's servers, holds the key in an environment variable, and is the only thing that ever talks to `api.anthropic.com`. The browser only ever talks to your own `/api/scan` endpoint.

**Cost:** each scan is one Claude API call (~$0.01–0.02 at current Sonnet pricing for a compressed photo + short JSON reply). There's no built-in rate limiting — for personal use that's irrelevant, but if you ever share the link publicly, add a simple per-IP limit in `api/scan.js`.

**If you deploy the app and the function on different domains**, open **More → Settings → API address** in the app and paste your Vercel URL — otherwise leave it blank (same-origin is the default and what you get with this setup).

## 4. Accounts & cloud sync (now included)

Sign in with **email/password, Google, Facebook, or phone number (OTP)** and your data follows you across devices — it's stored in Firestore under your user ID, not just this browser's `localStorage`. If you skip sign-in, the app works exactly as before, fully local to the device.

**It ships unconfigured on purpose** — until you add your own Firebase keys, the login screen never appears and nothing changes from the local-only build. To turn it on:

1. **Create a project** at [console.firebase.google.com](https://console.firebase.google.com) → Add project (the free Spark plan covers Email, Google and Facebook sign-in; Phone/SMS may require upgrading to the pay-as-you-go Blaze plan — Email + Google alone is enough if you'd rather avoid that).
2. **Authentication → Get started → Sign-in method** → enable:
   - **Email/Password** — one click.
   - **Google** — one click.
   - **Facebook** — needs an App ID + App Secret from [developers.facebook.com](https://developers.facebook.com); Firebase shows you the OAuth redirect URI to paste into that Facebook app's settings.
   - **Phone** — one click to enable (billing note above).
3. **Authentication → Settings → Authorized domains** → add your Vercel domain (e.g. `bulk-tracker.vercel.app`), otherwise sign-in popups will be blocked.
4. **Firestore Database → Create database** → start in **production mode**, pick a region close to you.
5. **Firestore → Rules**, paste this so each user can only ever read/write their own data, then Publish:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
6. **Project settings (⚙️) → General → Your apps → Add app → Web (</>)** → copy the `firebaseConfig` object it gives you.
7. Open `index.html`, find `const FIREBASE_CONFIG={apiKey:'YOUR_API_KEY',...}` near the top of the `<script>` block, and paste your real values in. Redeploy (push to GitHub / re-upload to Vercel).

That's it — the login screen now appears, with "Continue without an account" always available for anyone who'd rather stay local. This `firebaseConfig` is a public client identifier, not a secret — it's fine inside `index.html`, unlike the Anthropic key in `api/scan.js` which must never appear in client code.

**How sync works:** on sign-in, the app checks Firestore for existing data under your account — if found, it replaces what's on this device; if not, this device's data is pushed up as the starting point. After that, every change (food logged, workout edited, weight entry) saves to `localStorage` instantly and to Firestore about a second later, so it's quick offline and catches up once you're back online.

## File structure

```
index.html              the entire app (UI + logic + Firebase config, one file)
api/scan.js             Vercel serverless function — secure Claude Vision proxy
manifest.webmanifest    PWA install metadata
sw.js                   service worker (offline caching, network-first)
icon-192.png / icon-512.png / icon-180.png   app icons
```

## Local testing without Vercel

The UI runs from any static server (`npx serve .`), but Scan will fail with "Cannot reach the scan server" since there's no function host — that's expected until it's deployed on Vercel.
