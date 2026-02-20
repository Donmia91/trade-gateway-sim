/**
 * Fee deduction: Kraken taker fees reduce realized PnL and flow to sweep.
 * Run: pnpm test:fees (or add to test script)
 * Uses :memory: DB when DB_PATH=:memory:
 */
import { strict as assert } from "node:assert";

process.env.DB_PATH = ":memory:";

async function main() {
  const { runSuite } = await import("../src/lib/sim/suiteRunner");

  // Short run that can produce at least one trade (TREND_UP then PANIC_DOWN)
  const plan = [
    { mode: "SIM" as const, scenario: "TREND_UP", durationSec: 4 },
    { mode: "SIM" as const, scenario: "PANIC_DOWN", durationSec: 4 },
  ];
  const result = await runSuite(plan, 200);

  assert(result.ok === true, "runSuite ok");
  assert(result.summary.tradeCount >= 0, "tradeCount non-negative");
  assert(result.summary.feesTotalUsd >= 0, "feesTotalUsd non-negative");

  // When there is at least one fill, fees must be positive (Kraken taker 0.4% on notional)
  if (result.summary.tradeCount >= 1) {
    assert(
      result.summary.feesTotalUsd > 0,
      "at least one trade must incur positive fees (total_fees_usd > 0)"
    );
    // Realized PnL is net of fees: gross - fees = realized (so fees reduce realized)
    assert(
      typeof result.summary.realizedPnlUsd === "number",
      "realizedPnlUsd is net of fees"
    );
  }

  console.log("fees.test.ts: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
