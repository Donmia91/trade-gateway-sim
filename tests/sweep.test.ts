/**
 * Sweep logic: USD balance and SWEEP_TO_USD ledger entries.
 * Run: pnpm test:sweep
 * Uses :memory: DB when DB_PATH=:memory:
 */
import { strict as assert } from "node:assert";

process.env.DB_PATH = ":memory:";

async function main() {
  const ledger = await import("../src/lib/ledger");

  await ledger.ensureBalance("USD");
  let amount = await ledger.getBalance("USD");
  assert.strictEqual(amount, 0, "USD starts at 0");

  const runId1 = "sweep-test-run-1";
  const r1 = await ledger.applySweep(runId1, 10);
  assert.strictEqual(r1.before, 0, "before is 0");
  assert.strictEqual(r1.after, 10, "after is 10");
  assert.strictEqual(r1.swept, 10, "swept is 10");
  amount = await ledger.getBalance("USD");
  assert.strictEqual(amount, 10, "USD becomes 10");

  const entries = await ledger.getLedgerEntries(10);
  const sweepEntries = entries.filter(
    (e) => e.type === "SWEEP_TO_USD" && e.delta === 10 && e.run_id === runId1
  );
  assert(sweepEntries.length >= 1, "at least one SWEEP_TO_USD entry with delta 10");

  const runId2 = "sweep-test-run-2";
  const r2 = await ledger.applySweep(runId2, 0);
  assert.strictEqual(r2.swept, 0, "swept 0 when pnl 0");
  assert.strictEqual(r2.before, r2.after, "no change");
  amount = await ledger.getBalance("USD");
  assert.strictEqual(amount, 10, "USD unchanged at 10");

  const runId3 = "sweep-test-run-3";
  const r3 = await ledger.applySweep(runId3, -5);
  assert.strictEqual(r3.swept, 0, "swept 0 when pnl negative");
  assert.strictEqual(r3.before, r3.after, "no change");
  amount = await ledger.getBalance("USD");
  assert.strictEqual(amount, 10, "USD unchanged at 10");

  // FEE_USD ledger entries and cumulative 24h
  const runIdFee = "sweep-test-run-fee";
  await ledger.addFeeUsd(runIdFee, 2.5, "test fee", "taker");
  const entriesAfter = await ledger.getLedgerEntries(50);
  const feeEntries = entriesAfter.filter((e) => e.type === "FEE_USD" && e.run_id === runIdFee);
  assert(feeEntries.length >= 1, "at least one FEE_USD entry");
  assert.strictEqual(feeEntries[0].delta, -2.5, "FEE_USD delta is negative fee amount");
  const cumulative24h = await ledger.getCumulativeFeesUsdLast24h();
  assert(cumulative24h >= 2.5, "cumulative fees (24h) includes FEE_USD total");

  // Sweep uses net realized after fees (only positive net is swept)
  const runId4 = "sweep-test-run-4";
  const r4 = await ledger.applySweep(runId4, 8);
  assert.strictEqual(r4.swept, 8, "sweep uses net amount (8) not gross");
  amount = await ledger.getBalance("USD");
  assert.strictEqual(amount, 18, "USD is 10 + 8 after net sweep");

  console.log("sweep.test.ts: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
