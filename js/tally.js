/**
 * tally.js — live expense math.
 *
 * Mirrors the Python `balance.py` in the MCP, by design — keep these in sync.
 * See PLAN.md §8 for formulas + worked example.
 *
 * advance_balance = Σ(amount where flow=in)
 *                 - Σ(amount where flow=out AND paidWith=advance)
 *
 * owed_to_tyler   = Σ(amount where flow=out AND paidWith=personal)
 *
 * trip_total      = Σ(amount where flow=out)   // total spent regardless of payer
 */

/**
 * Compute the three running totals from an array of expense rows.
 *
 * @param {Array} expenses — rows from Firestore (or any matching shape)
 * @returns {{advance:number, owed:number, total:number}} — values in dollars
 */
export function computeTally(expenses) {
  let advance = 0;
  let owed = 0;
  let total = 0;

  for (const e of expenses || []) {
    const amt = Number(e?.amount) || 0;
    if (amt <= 0) continue;

    if (e.flow === "in") {
      advance += amt;
    } else if (e.flow === "out") {
      total += amt;
      if (e.paidWith === "advance") advance -= amt;
      else if (e.paidWith === "personal") owed += amt;
      // 'company' contributes only to the trip total — no float impact
    }
  }

  // Round to cents to avoid floating-point fuzz in the UI
  return {
    advance: round2(advance),
    owed: round2(owed),
    total: round2(total),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
