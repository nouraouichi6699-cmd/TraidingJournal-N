// Tests for maybeResetAccountsCursor / PULL_SCHEMA (the incremental-pull schema-version bump).
// Run: npx tsx src/lib/rowSync.test.ts

// --- minimal localStorage shim (not present in Node) ---
const store = new Map<string, string>();
(globalThis as unknown as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};
// supabase and syncSchedule are only used in async network functions that this test never calls; stub them.
(globalThis as unknown as Record<string, unknown>).import = undefined;

// rowSync imports supabase and syncSchedule at module level; we need them not to throw.
// Provide minimal stubs via the module resolution cache trick — set env vars the supabase client reads.
(globalThis as unknown as Record<string, unknown>).import_meta_env = {};
// The supabase client uses fetch; stub it so createClient doesn't blow up at import time.
(globalThis as unknown as Record<string, unknown>).fetch = () => Promise.resolve(new Response("{}"));

import { maybeResetAccountsCursor, PULL_SCHEMA } from "./rowSync";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, exp: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`}`);
};

const CUR = "mizan-sync-cursor", META = "mizan-sync-meta", SCHEMA_KEY = "mizan-sync-schema";
const get = <T>(k: string, f: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? f; } catch { return f; } };
const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

// ---- helper: build a cursor with all four tables populated ----
const cursorFull = () => ({ accounts: "2026-11-13T10:00:00Z", trades: "2026-11-13T11:00:00Z", balance_points: "2026-11-13T12:00:00Z", cash_flows: "2026-11-13T13:00:00Z" });

// ---- 1. First run: schema not stored yet → resets accounts cursor only ----
store.clear();
set(CUR, cursorFull());
set(META, { accounts: { "id-a1": { u: 1000, d: 0, h: "hash1", p: 0 }, "id-a2": { u: 2000, d: 0, h: "hash2", p: 0 } }, trades: { "k:1": { u: 3000, d: 0, h: "hash3", p: 0 } }, balance_points: {}, cash_flows: {} });

const r1 = maybeResetAccountsCursor();
eq("first run: returns true", r1, true);

const cur1 = get(CUR, {} as Record<string, string | undefined>);
eq("accounts cursor cleared", cur1.accounts, undefined);
eq("trades cursor untouched", cur1.trades, "2026-11-13T11:00:00Z");
eq("balance_points cursor untouched", cur1.balance_points, "2026-11-13T12:00:00Z");
eq("cash_flows cursor untouched", cur1.cash_flows, "2026-11-13T13:00:00Z");

const meta1 = get(META, { accounts: {}, trades: {}, balance_points: {}, cash_flows: {} });
eq("non-pending account META cleared", Object.keys(meta1.accounts), []);
eq("trades META untouched", Object.keys(meta1.trades), ["k:1"]);

eq("schema version stored", get<number>(SCHEMA_KEY, 0), PULL_SCHEMA);

// ---- 2. Pending-push accounts are preserved ----
store.clear();
set(CUR, cursorFull());
set(META, {
  accounts: {
    "id-clean": { u: 1000, d: 0, h: "hash1", p: 0 },   // no pending push → should be cleared
    "id-edit":  { u: 9999, d: 0, h: "hash2", p: 1 },   // pending push → must be kept
    "id-tomb":  { u: 9998, d: 9998, h: "",   p: 1 },   // pending tombstone → must be kept
  },
  trades: {}, balance_points: {}, cash_flows: {},
});
// no schema key stored yet

maybeResetAccountsCursor();
const meta2 = get(META, { accounts: {} as Record<string, unknown>, trades: {}, balance_points: {}, cash_flows: {} });
eq("clean account META cleared", "id-clean" in meta2.accounts, false);
eq("pending-edit META preserved", (meta2.accounts["id-edit"] as Record<string,unknown>)?.p, 1);
eq("pending-tombstone META preserved", (meta2.accounts["id-tomb"] as Record<string,unknown>)?.p, 1);

// ---- 3. Second run in the same session: no-op ----
// schema version is now stored; cursor was already cleared but let's populate it again to confirm it stays
set(CUR, cursorFull());
const r3 = maybeResetAccountsCursor();
eq("second run: returns false (already up to date)", r3, false);
const cur3 = get(CUR, {} as Record<string, string | undefined>);
eq("second run: accounts cursor not cleared again", cur3.accounts, "2026-11-13T10:00:00Z");

// ---- 4. Schema already ahead of PULL_SCHEMA: no-op ----
store.clear();
set(SCHEMA_KEY, PULL_SCHEMA + 10);
set(CUR, cursorFull());
const r4 = maybeResetAccountsCursor();
eq("future schema: returns false", r4, false);
const cur4 = get(CUR, {} as Record<string, string | undefined>);
eq("future schema: accounts cursor untouched", cur4.accounts, "2026-11-13T10:00:00Z");

// ---- 5. No CUR stored yet (fresh install): safe, nothing to clear ----
store.clear();
// no CUR, no SCHEMA_KEY
const r5 = maybeResetAccountsCursor();
eq("fresh install: returns true (schema written)", r5, true);
eq("fresh install: schema stored", get<number>(SCHEMA_KEY, 0), PULL_SCHEMA);
// CUR was absent; after clearing accounts it should still be absent (or an empty object)
const cur5 = get(CUR, null as null | Record<string, unknown>);
eq("fresh install: CUR after reset has no accounts entry", cur5?.accounts, undefined);

// ---- 6. No META stored yet: safe ----
store.clear();
set(CUR, cursorFull());
// no META
const r6 = maybeResetAccountsCursor();
eq("no META: returns true", r6, true);
// no crash, accounts cursor cleared
const cur6 = get(CUR, {} as Record<string, string | undefined>);
eq("no META: accounts cursor cleared", cur6.accounts, undefined);
eq("no META: trades cursor untouched", cur6.trades, "2026-11-13T11:00:00Z");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
