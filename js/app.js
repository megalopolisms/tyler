/**
 * app.js — main entry. Bootstraps Firebase + service worker, exposes
 * Alpine controllers (lockController + appController).
 *
 * Flow:
 *   1. Initialize Firebase (auth, firestore, storage).
 *   2. Register service worker for offline + PWA install.
 *   3. Define lockController (handles unlock screen).
 *   4. Define appController (handles main app: timeline, tally, sheet).
 *   5. Auto-mounts when DOMContentLoaded fires.
 */
// Firebase singletons live in firebase.js (also handles persistence + offline)
import "./firebase.js";

import { ensureFirebaseAuth, isUnlocked } from "./auth.js";
import {
  loadCategories,
  loadTags,
  watchExpenses,
  saveExpense,
  deleteExpense,
  addCategory,
  addTag,
  uploadReceipt,
  CATEGORY_DEFAULTS,
  TAG_DEFAULTS,
} from "./expenses.js";
import { computeTally } from "./tally.js";
import { compressImage, makePreview } from "./camera.js";
import { categoryIcon, categoryName } from "./tags.js";
import { initSync, syncStatus } from "./sync.js";

// ============================================================
// Service worker registration
// ============================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch((e) => console.warn("[sw] register", e));
  });
}

// ============================================================
// Online/offline indicator (drives the dot in the header)
// ============================================================
initSync();

// ============================================================
// Main app Alpine controller
// ============================================================
window.appController = function appController() {
  const todayIso = () => new Date().toISOString().slice(0, 10);

  return {
    ready: false,
    expenses: [],
    allCategories: [...CATEGORY_DEFAULTS],
    allTags: [...TAG_DEFAULTS],
    tagFilter: "",
    sheetOpen: false,
    editing: null, // null = adding; otherwise the expense being edited
    saving: false,
    toast: "",
    syncState: "online",

    form: {
      flow: "out",
      amount: "",
      category: "",
      paidWith: "advance",
      date: todayIso(),
      tag: "",
      note: "",
      receiptBlob: null,
      receiptPreview: "",
    },

    // ----- lifecycle -----

    async init() {
      if (!isUnlocked()) {
        // Lock screen will swap us in; meanwhile keep ready=false
        this.watchUnlock();
        return;
      }
      await this.boot();
    },

    /** Wait for the lock screen to flip the unlock flag, then boot. */
    watchUnlock() {
      const interval = setInterval(async () => {
        if (isUnlocked()) {
          clearInterval(interval);
          await this.boot();
        }
      }, 200);
    },

    async boot() {
      try {
        await ensureFirebaseAuth();
        const [cats, tags] = await Promise.all([loadCategories(), loadTags()]);
        if (cats.length) this.allCategories = cats;
        if (tags.length) this.allTags = tags;

        watchExpenses((items) => {
          this.expenses = items;
        });

        this.ready = true;
        this.watchSyncState();
      } catch (e) {
        console.error("[boot]", e);
        this.showToast("Failed to start: " + (e?.message || e));
      }
    },

    watchSyncState() {
      setInterval(() => {
        this.syncState = syncStatus();
      }, 1500);
    },

    // ----- computed -----

    get filteredExpenses() {
      if (!this.tagFilter) return this.expenses;
      return this.expenses.filter((e) => e.tag === this.tagFilter);
    },

    get groupedExpenses() {
      const groups = new Map();
      for (const exp of this.filteredExpenses) {
        const label = this.dayLabel(exp.date);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(exp);
      }
      return [...groups.entries()].map(([label, items]) => ({ label, items }));
    },

    get tally() {
      return computeTally(this.filteredExpenses);
    },

    get canSave() {
      const amt = parseFloat(this.form.amount);
      if (!Number.isFinite(amt) || amt <= 0) return false;
      if (this.form.flow === "out" && !this.form.category) return false;
      if (this.form.flow === "out" && !this.form.paidWith) return false;
      return true;
    },

    get syncClass() {
      return (
        { online: "", pending: "warn", offline: "bad" }[this.syncState] || ""
      );
    },
    get syncLabel() {
      return (
        { online: "Synced", pending: "Saving…", offline: "Offline" }[
          this.syncState
        ] || ""
      );
    },

    // ----- formatting helpers -----

    fmt(n) {
      if (!Number.isFinite(n)) n = 0;
      const negative = n < 0;
      const abs = Math.abs(n);
      const s = abs.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return (negative ? "-$" : "$") + s;
    },

    formatDate(d) {
      if (!d) return "";
      const dt = d.toDate ? d.toDate() : new Date(d);
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    },

    dayLabel(d) {
      const dt = d?.toDate ? d.toDate() : new Date(d);
      const today = new Date();
      const ms = 1000 * 60 * 60 * 24;
      const sameDay = (a, b) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
      if (sameDay(dt, today)) return "Today";
      const yesterday = new Date(today.getTime() - ms);
      if (sameDay(dt, yesterday)) return "Yesterday";
      return dt.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    },

    categoryIcon(slug) {
      return categoryIcon(this.allCategories, slug);
    },
    categoryName(slug) {
      return categoryName(this.allCategories, slug);
    },

    paidWithLabel(p) {
      return (
        { advance: "Advance", personal: "My pocket", company: "Company" }[p] ||
        p
      );
    },

    sanitizeAmount() {
      // keep digits and at most one dot, max 2 decimals
      let v = (this.form.amount + "").replace(/[^\d.]/g, "");
      const parts = v.split(".");
      if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
      const m = v.match(/^(\d*)(?:\.(\d{0,2}))?/);
      this.form.amount = m
        ? m[2] !== undefined
          ? m[1] + "." + m[2]
          : m[1]
        : "";
    },

    // ----- sheet open/close -----

    openAdd() {
      this.editing = null;
      this.form = {
        flow: "out",
        amount: "",
        category: "",
        paidWith: "advance",
        date: todayIso(),
        tag: this.tagFilter || "",
        note: "",
        receiptBlob: null,
        receiptPreview: "",
      };
      this.sheetOpen = true;
    },

    openEdit(exp) {
      this.editing = exp;
      this.form = {
        flow: exp.flow,
        amount: String(exp.amount ?? ""),
        category: exp.category || "",
        paidWith: exp.paidWith || "advance",
        date: this.toDateInputValue(exp.date),
        tag: exp.tag || "",
        note: exp.note || "",
        receiptBlob: null,
        receiptPreview: exp.receiptUrl || "",
      };
      this.sheetOpen = true;
    },

    closeSheet() {
      this.sheetOpen = false;
      this.editing = null;
    },

    toDateInputValue(d) {
      const dt = d?.toDate ? d.toDate() : new Date(d);
      const yr = dt.getFullYear();
      const mo = String(dt.getMonth() + 1).padStart(2, "0");
      const dy = String(dt.getDate()).padStart(2, "0");
      return `${yr}-${mo}-${dy}`;
    },

    toggleTag(slug) {
      this.form.tag = this.form.tag === slug ? "" : slug;
    },

    // ----- photo / receipt -----

    async onPhotoSelected(ev) {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const compressed = await compressImage(file);
        this.form.receiptBlob = compressed;
        this.form.receiptPreview = await makePreview(compressed);
      } catch (e) {
        console.warn("[camera]", e);
        this.showToast("Photo failed: " + (e?.message || e));
      }
    },

    // ----- add new category / tag prompts -----

    async addCategoryPrompt() {
      const name = prompt("New category name?");
      if (!name) return;
      const slug = name.trim().toLowerCase().replace(/\s+/g, "_");
      if (this.allCategories.find((c) => c.slug === slug)) {
        this.form.category = slug;
        return;
      }
      const cat = { slug, name: name.trim(), icon: "➕", order: 999 };
      this.allCategories.push(cat);
      this.form.category = slug;
      try {
        await addCategory(cat);
      } catch (e) {
        console.warn("[addCategory]", e);
      }
    },

    async addTagPrompt() {
      const name = prompt("New tag name? (e.g. TX run April)");
      if (!name) return;
      const slug = name.trim().toLowerCase().replace(/\s+/g, "_");
      if (this.allTags.find((t) => t.slug === slug)) {
        this.form.tag = slug;
        return;
      }
      const tag = { slug, name: name.trim() };
      this.allTags.push(tag);
      this.form.tag = slug;
      try {
        await addTag(tag);
      } catch (e) {
        console.warn("[addTag]", e);
      }
    },

    // ----- save -----

    async save() {
      if (!this.canSave || this.saving) return;
      this.saving = true;
      try {
        const id = this.editing?.id || crypto.randomUUID();
        let receiptUrl = this.editing?.receiptUrl || "";
        let receiptPath = this.editing?.receiptPath || "";
        let receiptSizeKB = this.editing?.receiptSizeKB || 0;

        if (this.form.receiptBlob) {
          const upload = await uploadReceipt(id, this.form.receiptBlob);
          receiptUrl = upload.url;
          receiptPath = upload.path;
          receiptSizeKB = Math.round(this.form.receiptBlob.size / 1024);
        }

        const payload = {
          id,
          flow: this.form.flow,
          amount: parseFloat(this.form.amount),
          category: this.form.flow === "out" ? this.form.category : "",
          paidWith: this.form.flow === "out" ? this.form.paidWith : "",
          date: new Date(this.form.date + "T12:00:00"),
          tag: this.form.tag || "",
          note: (this.form.note || "").slice(0, 280),
          receiptUrl,
          receiptPath,
          receiptSizeKB,
        };
        await saveExpense(id, payload, !this.editing);
        this.showToast(this.editing ? "Updated." : "Saved.");
        this.closeSheet();
      } catch (e) {
        console.error("[save]", e);
        this.showToast("Save failed: " + (e?.message || e));
      } finally {
        this.saving = false;
      }
    },

    async confirmDelete() {
      if (!this.editing) return;
      if (!confirm("Delete this expense? This cannot be undone.")) return;
      try {
        await deleteExpense(this.editing.id, this.editing.receiptPath);
        this.showToast("Deleted.");
        this.closeSheet();
      } catch (e) {
        console.error("[delete]", e);
        this.showToast("Delete failed: " + (e?.message || e));
      }
    },

    // ----- toast -----

    showToast(msg) {
      this.toast = msg;
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => (this.toast = ""), 2500);
    },

    onFilterChange() {
      // No-op for now; reactivity is automatic. Hook for future analytics.
    },
  };
};
