/**
 * tags.js — small helpers for category lookup.
 *
 * Kept separate from expenses.js so the controller can import lightweight
 * formatting helpers without pulling in Firestore.
 */

/**
 * Look up the icon for a category slug. Falls back to a generic emoji.
 */
export function categoryIcon(categories, slug) {
  if (!slug) return "💵";
  const found = (categories || []).find((c) => c.slug === slug);
  return found?.icon || "🧾";
}

/**
 * Display name for a category slug. Falls back to a Title Case'd slug.
 */
export function categoryName(categories, slug) {
  if (!slug) return "—";
  const found = (categories || []).find((c) => c.slug === slug);
  if (found?.name) return found.name;
  return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
