/**
 * auth.js — password gate + Firebase anonymous auth.
 *
 * Two layers:
 *  1. Client-side SHA-256 hash check against PASSWORD_HASH (gates the UI).
 *  2. Firebase signInAnonymously() (gates Firestore/Storage access).
 *
 * Once unlocked, a flag is set in localStorage so we don't show the lock
 * screen on every visit.
 */
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { PASSWORD_SALT, PASSWORD_HASH } from "./firebase-config.js";
import { getAuthInstance } from "./firebase.js";

const UNLOCK_KEY = "tyler.unlocked";

/** SHA-256 hex of input (Web Crypto API). */
async function sha256Hex(input) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Whether the user has previously unlocked this device. */
export function isUnlocked() {
  return localStorage.getItem(UNLOCK_KEY) === "1";
}

/** Compare entered password against hash; return true if match. */
export async function checkPassword(password) {
  if (!password) return false;
  const hash = await sha256Hex(PASSWORD_SALT + password);
  return hash === PASSWORD_HASH;
}

/** Mark device as unlocked (persists across reloads). */
export function markUnlocked() {
  localStorage.setItem(UNLOCK_KEY, "1");
}

/** Forget unlock state (for explicit logout). */
export function clearUnlocked() {
  localStorage.removeItem(UNLOCK_KEY);
}

/**
 * Sign into Firebase anonymously. Once a user is created, the same UID
 * persists across reloads (Firebase caches in IndexedDB).
 */
export async function ensureFirebaseAuth() {
  const auth = getAuthInstance();
  if (auth.currentUser) return auth.currentUser;

  // Wait for any in-flight cached auth to settle before signing in fresh.
  await new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((user) => {
      unsub();
      resolve(user);
    });
  });

  if (auth.currentUser) return auth.currentUser;

  const result = await signInAnonymously(auth);
  return result.user;
}

/**
 * Alpine controller for the lock screen.
 *
 * State:
 *  - password: current input
 *  - checking: true while hash compute / auth in flight
 *  - unlocked: true after successful gate (flips view to main app)
 *  - error: error message to show
 */
window.lockController = function lockController() {
  return {
    password: "",
    checking: false,
    unlocked: isUnlocked(),
    error: "",

    init() {
      // Auto-focus the input on first render
      this.$nextTick(() => this.$refs?.pwInput?.focus?.());
    },

    async tryUnlock() {
      this.error = "";
      this.checking = true;
      try {
        const ok = await checkPassword(this.password);
        if (!ok) {
          this.error = "Wrong password.";
          this.password = "";
          return;
        }
        markUnlocked();
        // Pre-warm Firebase auth so the main app can start immediately
        await ensureFirebaseAuth();
        this.unlocked = true;
      } catch (e) {
        console.error("[auth]", e);
        this.error = e?.message || "Unlock failed.";
      } finally {
        this.checking = false;
      }
    },
  };
};
