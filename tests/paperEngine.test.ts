/**
 * Paper engine: ensureAccount, placeMarketOrder, closeout, sweep only when net realized > 0.
 * Run: pnpm test:paper
 * Uses :memory: DB and mocked getBestBidAsk.
 */
import { strict as assert } from "node:assert";

process.env.DB_PATH = ":memory:";

const MOCK_BID = 50_000;
const MOCK_ASK = 50_010;
const MOCK_LAST = 50_005;
const mockBidAsk = () =>
  Promise.resolve({
    bid: MOCK_BID,
    ask: MOCK_ASK,
    last: MOCK_LAST,
    ts: new Date().toISOString(),
  });

async function main() {
  const { ensurePaperAccount, placeMarketOrder, getPaperSnapshot, closeoutPaperToUsd } = await import(
    "../src/lib/paper/paperEngine"
  );
  const ledger = await import("../src/lib/ledger");

  const accountId = ensurePaperAccount(undefined, 10_000);
  assert(accountId.length > 0, "accountId returned");

  let snap = getPaperSnapshot(accountId, null);
  const usdBal = snap.balances.find((b) => b.currency === "USD")?.amount ?? 0;
  const btcBal = snap.balances.find((b) => b.currency === "BTC")?.amount ?? 0;
  assert.strictEqual(usdBal, 10_000, "initial USD 10000");
  assert.strictEqual(btcBal, 0, "initial BTC 0");
  assert.strictEqual(snap.position?.qty ?? 0, 0, "position qty 0");

  const buyQty = 0.01;
  const buyResult = await placeMarketOrder({
    accountId,
    side: "buy",
    qtyBtc: buyQty,
    getBidAsk: mockBidAsk,
  });
  assert.strictEqual(buyResult.side, "buy");
  assert.strictEqual(buyResult.price, MOCK_ASK);
  assert(buyResult.feeUsd > 0, "buy has fee");
  assert.strictEqual(buyResult.realizedPnlUsd, 0, "buy has no realized pnl");

  snap = getPaperSnapshot(accountId, null);
  const usdAfterBuy = snap.balances.find((b) => b.currency === "USD")?.amount ?? 0;
  const btcAfterBuy = snap.balances.find((b) => b.currency === "BTC")?.amount ?? 0;
  assert(usdAfterBuy < 10_000, "USD reduced after buy");
  assert.strictEqual(btcAfterBuy, buyQty, "BTC increased by buy qty");
  assert(snap.position && snap.position.qty === buyQty, "position qty equals buy");

  const sellQty = 0.005;
  const sellResult = await placeMarketOrder({
    accountId,
    side: "sell",
    qtyBtc: sellQty,
    getBidAsk: mockBidAsk,
  });
  assert.strictEqual(sellResult.side, "sell");
  assert.strictEqual(sellResult.price, MOCK_BID);
  assert(sellResult.feeUsd > 0, "sell has fee");
  const realizedFromSell = sellResult.realizedPnlUsd;
  assert(Number.isFinite(realizedFromSell), "sell has realized pnl (may be negative due to spread/fees)");

  snap = getPaperSnapshot(accountId, null);
  const feesPaid = snap.stats.fees_paid_usd ?? 0;
  assert(feesPaid > 0, "fees_paid_usd > 0");
  const volume30d = snap.stats.volume_30d_usd ?? 0;
  assert(volume30d > 0, "volume_30d_usd incremented");

  const beforeSweep = await ledger.getBalance("USD");

  const closeoutResult = await closeoutPaperToUsd(accountId, mockBidAsk);
  assert(closeoutResult.closedQty >= 0, "closedQty");
  assert(Number.isFinite(closeoutResult.netRealizedPnlUsd), "netRealizedPnlUsd");
  snap = closeoutResult.snapshot;
  assert.strictEqual(snap.position?.qty ?? 0, 0, "position flat after closeout");

  if (closeoutResult.netRealizedPnlUsd > 0) {
    assert(closeoutResult.swept > 0, "swept when net realized > 0");
    assert(closeoutResult.sweepRunId != null, "sweepRunId set");
    const afterSweep = await ledger.getBalance("USD");
    assert(afterSweep === beforeSweep + closeoutResult.swept, "USD balance increased by swept");
  } else {
    assert.strictEqual(closeoutResult.swept, 0, "no sweep when net realized <= 0");
    assert.strictEqual(closeoutResult.sweepRunId, null, "no sweepRunId");
  }

  const account2 = ensurePaperAccount(undefined, 5_000);
  await placeMarketOrder({
    accountId: account2,
    side: "buy",
    qtyBtc: 0.001,
    getBidAsk: mockBidAsk,
  });
  await placeMarketOrder({
    accountId: account2,
    side: "sell",
    qtyBtc: 0.001,
    getBidAsk: mockBidAsk,
  });
  const closeout2 = await closeoutPaperToUsd(account2, mockBidAsk);
  assert.strictEqual(closeout2.closedQty, 0, "no position left to close");
  if (closeout2.netRealizedPnlUsd <= 0) {
    assert.strictEqual(closeout2.swept, 0, "negative realized does not sweep");
  }

  console.log("paperEngine.test.ts: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
