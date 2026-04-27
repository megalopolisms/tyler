/**
 * firebase.js — Firebase singletons.
 *
 * One-time SDK initialization. Other modules import the singletons from here
 * to avoid duplicating `initializeApp` calls and to break circular import
 * chains between auth.js / expenses.js / app.js.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

import { firebaseConfig } from "./firebase-config.js";

export const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export const db = getFirestore(fbApp);
export const storage = getStorage(fbApp);

// Persist signed-in user across reloads
setPersistence(auth, browserLocalPersistence).catch((e) =>
  console.warn("[auth] persistence", e),
);

// Firestore offline cache (best-effort; fails silently with multi-tab)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn(
      "[firestore] persistence: multiple tabs open; only one tab caches",
    );
  } else if (err.code === "unimplemented") {
    console.warn("[firestore] persistence: not supported in this browser");
  }
});

// Backward-compat accessors used by other modules
export const getAuthInstance = () => auth;
export const getDbInstance = () => db;
export const getStorageInstance = () => storage;
