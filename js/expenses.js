/**
 * expenses.js — Firestore + Storage CRUD for expenses, categories, tags.
 *
 * Collections:
 *   /expenses/{id}     — one document per expense (see PLAN.md §7 for schema)
 *   /categories/{slug} — pre-seeded list, user can add new
 *   /tags/{slug}       — optional trip tags, user can add new
 *
 * Receipts:
 *   storage path `receipts/{expenseId}.jpg`, public download URL stored on
 *   the expense doc as `receiptUrl`.
 */
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

import { db, storage } from "./firebase.js";

// ============================================================
// DEFAULTS — used when /categories or /tags collections are empty
// ============================================================
export const CATEGORY_DEFAULTS = [
  { slug: "fuel", name: "Fuel & Gas", icon: "⛽", order: 1 },
  { slug: "food", name: "Food & Meals", icon: "🍔", order: 2 },
  { slug: "hotel", name: "Hotel", icon: "🏨", order: 3 },
  { slug: "tolls", name: "Tolls", icon: "🛣️", order: 4 },
  { slug: "parking", name: "Parking", icon: "🅿️", order: 5 },
  { slug: "truck_rental", name: "Truck rental", icon: "🚚", order: 6 },
  { slug: "rigging", name: "Rigging", icon: "🏗️", order: 7 },
  { slug: "permits", name: "Permits", icon: "📋", order: 8 },
  { slug: "supplies", name: "Supplies", icon: "🧰", order: 9 },
  { slug: "repairs", name: "Repairs", icon: "🔧", order: 10 },
  { slug: "auction_fees", name: "Auction fees", icon: "🔨", order: 11 },
  { slug: "shipping", name: "Shipping", icon: "📦", order: 12 },
  { slug: "phone_data", name: "Phone / data", icon: "📱", order: 13 },
  { slug: "other", name: "Other", icon: "➕", order: 99 },
];

export const TAG_DEFAULTS = [
  { slug: "tx", name: "TX run" },
  { slug: "ny", name: "NY run" },
  { slug: "wi", name: "WI run" },
  { slug: "general", name: "General" },
];

// ============================================================
// Categories
// ============================================================
export async function loadCategories() {
  const snap = await getDocs(collection(db, "categories"));
  if (snap.empty) {
    // Seed defaults the first time the app runs
    await Promise.all(
      CATEGORY_DEFAULTS.map((c) => setDoc(doc(db, "categories", c.slug), c)),
    );
    return [...CATEGORY_DEFAULTS];
  }
  return snap.docs
    .map((d) => ({ slug: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export async function addCategory(cat) {
  return setDoc(doc(db, "categories", cat.slug), cat, { merge: true });
}

// ============================================================
// Tags
// ============================================================
export async function loadTags() {
  const snap = await getDocs(collection(db, "tags"));
  if (snap.empty) {
    await Promise.all(
      TAG_DEFAULTS.map((t) =>
        setDoc(doc(db, "tags", t.slug), { ...t, createdAt: serverTimestamp() }),
      ),
    );
    return [...TAG_DEFAULTS];
  }
  return snap.docs.map((d) => ({ slug: d.id, ...d.data() }));
}

export async function addTag(tag) {
  return setDoc(
    doc(db, "tags", tag.slug),
    { ...tag, createdAt: serverTimestamp() },
    { merge: true },
  );
}

// ============================================================
// Expenses — live timeline
// ============================================================
/**
 * Subscribe to all expenses, newest first.
 * Calls `onChange(items)` whenever the snapshot updates (incl. offline cache).
 * Returns an unsubscribe function.
 */
export function watchExpenses(onChange) {
  const q = query(collection(db, "expenses"), orderBy("date", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          // Mark unsynced (only-in-cache) writes for the pending badge
          pending:
            snap.metadata?.fromCache === true ||
            snap.metadata?.hasPendingWrites === true,
        };
      });
      onChange(items);
    },
    (err) => console.error("[expenses] snapshot", err),
  );
}

/**
 * Insert or update an expense doc.
 *
 * @param {string} id — doc id (caller-generated UUID)
 * @param {object} payload — schema in PLAN.md §7
 * @param {boolean} isNew — true for first save, false for edit
 */
export async function saveExpense(id, payload, isNew) {
  // Convert JS Date → Firestore Timestamp on input dates
  if (payload.date instanceof Date) {
    payload.date = Timestamp.fromDate(payload.date);
  }
  const body = {
    ...payload,
    id,
    deviceId: getDeviceId(),
    ...(isNew
      ? { createdAt: serverTimestamp() }
      : { updatedAt: serverTimestamp() }),
  };
  await setDoc(doc(db, "expenses", id), body, { merge: true });
}

export async function deleteExpense(id, receiptPath) {
  await deleteDoc(doc(db, "expenses", id));
  if (receiptPath) {
    try {
      await deleteObject(storageRef(storage, receiptPath));
    } catch (e) {
      // Receipt may have been deleted already; ignore not-found
      if (e?.code !== "storage/object-not-found") {
        console.warn("[expenses] receipt delete", e);
      }
    }
  }
}

// ============================================================
// Receipts (Firebase Storage)
// ============================================================
/**
 * Upload a compressed receipt blob and return its download URL + path.
 *
 * @param {string} expenseId
 * @param {Blob} blob — already compressed (see camera.js)
 */
export async function uploadReceipt(expenseId, blob) {
  const path = `receipts/${expenseId}.jpg`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, blob, { contentType: "image/jpeg" });
  const url = await getDownloadURL(ref);
  return { path, url };
}

// ============================================================
// Device ID — for offline conflict tracking. Persists across reloads.
// ============================================================
function getDeviceId() {
  let id = localStorage.getItem("tyler.deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("tyler.deviceId", id);
  }
  return id;
}
