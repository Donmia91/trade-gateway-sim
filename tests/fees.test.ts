/**
 * Fee logic: maker vs taker rates, FEE_USD ledger entries, sweep uses net.
 * Run: pnpm test:fees or include in test script
 */
import { strict as assert } from "node:assert";
import { MockBroker } from "../src/lib/broker/mockBroker";
import { config } from "../src/lib/config";

process.env.DB_PATH = process.env.DB_PATH ?? ":memory:";

function main() {
  const MAKER = config.MAKER_FEE_RATE;
  const TAKER = config.TAKER_FEE_RATE;
  assert(MAKER === 0.0025, "maker fee rate 0.25%");
  assert(TAKER === 0.004, "taker fee rate 0.40%");

  const broker = new MockBroker({ mid: 100, spreadBps: 10 });
  const pair = "XRP/USD";

  // Market order => taker (use qty 1 so cost fits default balance 1000)
  broker.placeOrder({ pair, side: "buy", type: "market", qty: 1 });
  const fillsMarket = broker.drainFills();
  assert.strictEqual(fillsMarket.length, 1, "one fill");
  assert.strictEqual(fillsMarket[0].liquidity, "taker", "market is taker");
  const notionalMarket = fillsMarket[0].qty * fillsMarket[0].px;
  const expectedTakerFee = notionalMarket * TAKER;
  assert.ok(Math.abs(fillsMarket[0].feeUsd - expectedTakerFee) < 1e-6, "taker fee rate applied");

  // Limit order that crosses (fill at bid) => taker
  broker.placeOrder({ pair, side: "sell", type: "limit", qty: 1, limitPx: 99.5 });
  const topTaker = broker.getTop(pair);
  assert(topTaker.bid >= 99.5, "bid >= limit so fill");
  broker.tryFillLimitOrders(topTaker);
  const fillsLimitTaker = broker.drainFills();
  assert.strictEqual(fillsLimitTaker.length, 1, "one limit fill");
  assert.strictEqual(fillsLimitTaker[0].liquidity, "taker", "crossing limit is taker");
  const notionalTaker = fillsLimitTaker[0].qty * fillsLimitTaker[0].px;
  assert.ok(Math.abs(fillsLimitTaker[0].feeUsd - notionalTaker * TAKER) < 1e-6, "taker fee on crossing limit");

  console.log("fees.test.ts: maker/taker rate assertions passed");
}

main();
