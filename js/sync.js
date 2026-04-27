/**
 * sync.js — online/offline indicator + Firestore network status.
 *
 * Drives the colored dot in the header:
 *   green  = online + nothing pending
 *   yellow = online + Firestore has buffered writes
 *   red    = navigator.onLine === false
 *
 * Firestore handles its own offline queue; this module only surfaces state.
 */
import {
  disableNetwork,
  enableNetwork,
  waitForPendingWrites,
  onSnapshotsInSync,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";

let pendingWrites = false;

export function initSync() {
  // When everything has flushed to the server, clear the pending flag.
  onSnapshotsInSync(db, () => {
    pendingWrites = false;
  });

  window.addEventListener("online", async () => {
    try {
      await enableNetwork(db);
    } catch (e) {
      console.warn("[sync] enableNetwork", e);
    }
  });

  window.addEventListener("offline", async () => {
    try {
      await disableNetwork(db);
    } catch (e) {
      console.warn("[sync] disableNetwork", e);
    }
  });

  // Track pending writes (Firestore-buffered)
  // Best-effort: poll waitForPendingWrites in the background.
  const watch = async () => {
    while (true) {
      try {
        await waitForPendingWrites(db);
        pendingWrites = false;
      } catch {
        // Network may be flaky; retry in a moment
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  };
  watch();
}

/**
 * @returns {'online'|'pending'|'offline'}
 */
export function syncStatus() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }
  return pendingWrites ? "pending" : "online";
}

export function markPending() {
  pendingWrites = true;
}
