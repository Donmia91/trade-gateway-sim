/**
 * Maker/taker detection for limit orders.
 * Run: pnpm test:maker
 */
import { strict as assert } from "node:assert";
import { isMakerLimit } from "../src/lib/fees/makerDetection";

function main() {
  const bid = 100;
  const ask = 101;

  assert.strictEqual(isMakerLimit("buy", 99, bid, ask), true, "buy 99 < ask => maker");
  assert.strictEqual(isMakerLimit("buy", 100, bid, ask), true, "buy 100 < ask => maker");
  assert.strictEqual(isMakerLimit("buy", 101, bid, ask), false, "buy 101 >= ask => taker");
  assert.strictEqual(isMakerLimit("buy", 102, bid, ask), false, "buy 102 >= ask => taker");

  assert.strictEqual(isMakerLimit("sell", 102, bid, ask), true, "sell 102 > bid => maker");
  assert.strictEqual(isMakerLimit("sell", 101, bid, ask), true, "sell 101 > bid => maker");
  assert.strictEqual(isMakerLimit("sell", 100, bid, ask), false, "sell 100 <= bid => taker");
  assert.strictEqual(isMakerLimit("sell", 99, bid, ask), false, "sell 99 <= bid => taker");

  console.log("makerDetection.test.ts: all assertions passed");
}

main();
