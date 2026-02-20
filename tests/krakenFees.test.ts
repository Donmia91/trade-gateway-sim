/**
 * Kraken tier selection and fee calculation.
 * Run: pnpm test:fees | DB_PATH=:memory: tsx tests/krakenFees.test.ts
 */
import { strict as assert } from "node:assert";
import { pickKrakenTier, calcFeeUsd, KRAKEN_SPOT_TIERS } from "../src/lib/fees/krakenFees";

function main() {
  assert.strictEqual(KRAKEN_SPOT_TIERS[0].makerBps, 25, "Tier 0 maker 0.25%");
  assert.strictEqual(KRAKEN_SPOT_TIERS[0].takerBps, 40, "Tier 0 taker 0.40%");

  assert.strictEqual(pickKrakenTier(0).label, "Tier 0 ($0+)", "volume 0 => Tier 0");
  assert.strictEqual(pickKrakenTier(9999).label, "Tier 0 ($0+)", "volume 9999 => Tier 0");
  assert.strictEqual(pickKrakenTier(10_000).label, "Tier 1 ($10k+)", "volume 10k => Tier 1");
  assert.strictEqual(pickKrakenTier(50_000).label, "Tier 2 ($50k+)", "volume 50k => Tier 2");
  assert.strictEqual(pickKrakenTier(10_000_000).label, "Tier 9 ($10M+)", "volume 10M => Tier 9");
  assert.strictEqual(pickKrakenTier(NaN).label, "Tier 0 ($0+)", "NaN => Tier 0");
  assert.strictEqual(pickKrakenTier(-1).label, "Tier 0 ($0+)", "negative => Tier 0");

  const t0 = calcFeeUsd(1000, true, 0);
  assert.ok(Math.abs(t0.feeUsd - 2.5) < 1e-6, "maker 0.25% on 1000 = 2.5");
  assert.strictEqual(t0.rateBps, 25);
  const t1 = calcFeeUsd(1000, false, 0);
  assert.ok(Math.abs(t1.feeUsd - 4) < 1e-6, "taker 0.40% on 1000 = 4");
  assert.strictEqual(t1.rateBps, 40);

  const t2 = calcFeeUsd(100_000, false, 100_000);
  assert.strictEqual(t2.tier.label, "Tier 3 ($100k+)");
  assert.strictEqual(t2.rateBps, 22);
  assert.ok(Math.abs(t2.feeUsd - 220) < 1e-2, "taker 0.22% on 100k = 220");

  console.log("krakenFees.test.ts: all assertions passed");
}

main();
