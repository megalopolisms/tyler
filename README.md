# Tyler Trips

Mobile expense tracker for road-trip auction pickups. Tyler logs fuel, food,
hotel, tolls, rigging, etc. with a phone camera receipt; the app keeps a live
running tally of advance balance, money owed back to Tyler, and total trip cost.

**Live URL:** https://megalopolisms.github.io/tyler/
**MCP side:** `~/Dropbox/mcp-servers/MCP-38-tyler/`

## Stack

- GitHub Pages (static)
- Firebase Auth (anonymous), Firestore, Storage — project `tyler-trips`
- Vanilla HTML + Alpine.js (no build step)
- PWA: installable on iOS + Android home screen

## First-time setup (one-time, ~3 min in console)

After cloning + before deploying, two clicks in Firebase Console:

1. **Enable Anonymous Auth**
   https://console.firebase.google.com/project/tyler-trips/authentication/providers
   → Add new provider → Anonymous → Enable → Save

2. **Initialize Storage**
   https://console.firebase.google.com/project/tyler-trips/storage
   → Get Started → "Start in production mode" → choose `us-central` → Done

Then deploy security rules:

```bash
firebase deploy --only firestore:rules,storage:rules --project tyler-trips
```

## Local dev

Open `index.html` directly in a browser, or:

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

## Password rotation

Edit `js/firebase-config.js`, replace `PASSWORD_HASH` with:

```bash
echo -n "tyler-salt-v1::NEWPASSWORD" | shasum -a 256
```

Push and Tyler refreshes his app.

## Project structure

- `index.html` — single-page app shell
- `manifest.json` + `service-worker.js` — PWA + offline
- `js/firebase.js` — SDK singletons
- `js/auth.js` — password gate + anonymous auth
- `js/expenses.js` — Firestore CRUD
- `js/tally.js` — live balance math (mirrors MCP `balance.py`)
- `js/camera.js` — receipt capture + compression
- `js/sync.js` — online/offline indicator
- `js/app.js` — Alpine controllers + bootstrap
- `firestore.rules` / `storage.rules` — security rules
