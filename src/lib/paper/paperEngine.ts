/**
 * Paper trading engine: real Kraken market data, fake funds, realized-only USD sweep.
 * No live trading; uses getBestBidAsk for prices and calcFeeUsdPaper for fees.
 */
import { randomUUID } from "crypto";
import { getDb } from "../db";
import { getBestBidAsk } from "../krakenPublic";
import { calcFeeUsdPaper } from "../fees/krakenFees";
import { applySweep } from "../ledger";

const DEFAULT_QUOTE = "USD";
const DEFAULT_BASE = "BTC";
const DEFAULT_INITIAL_USD = 10_000;
const SNAPSHOT_FILLS_LIMIT = 20;

export interface PaperAccount {
  id: string;
  created_at: string;
  quote_ccy: string;
  base_ccy: string;
}

export interface PaperBalanceRow {
  currency: string;
  amount: number;
}

export interface PaperPositionRow {
  base_ccy: string;
  qty: number;
  avg_entry: number;
}

export interface PaperFillRow {
  id: string;
  account_id: string;
  ts: string;
  side: string;
  qty: number;
  price: number;
  notional: number;
  fee_usd: number;
  liquidity: string;
  realized_pnl_usd: number;
}

export interface PaperSnapshot {
  accountId: string;
  balances: PaperBalanceRow[];
  position: PaperPositionRow | null;
  stats: Record<string, number>;
  lastFills: PaperFillRow[];
  market: { bid: number; ask: number; last: number; ts: string } | null;
  unrealizedPnlUsd: number;
}

export interface PlaceOrderResult {
  fillId: string;
  side: string;
  qty: number;
  price: number;
  notionalUsd: number;
  feeUsd: number;
  liquidity: string;
  realizedPnlUsd: number;
  snapshot: PaperSnapshot;
}

export interface CloseoutResult {
  closedQty: number;
  netRealizedPnlUsd: number;
  swept: number;
  sweepRunId: string | null;
  snapshot: PaperSnapshot;
}

function resolveAccountId(db: ReturnType<typeof getDb>, accountId: string | undefined): string {
  if (accountId?.trim()) return accountId.trim();
  return randomUUID();
}

/** Ensure paper account exists with USD and BTC balances; create if not. Returns account id. */
export function ensurePaperAccount(
  accountId?: string,
  initialUsd: number = DEFAULT_INITIAL_USD
): string {
  const db = getDb();
  const id = resolveAccountId(db, accountId);
  const now = new Date().toISOString();

  const existing = db.prepare("SELECT id FROM paper_accounts WHERE id = ?").get(id) as { id: string } | undefined;
  if (existing) return id;

  const safeUsd = Number.isFinite(initialUsd) && initialUsd >= 0 ? initialUsd : DEFAULT_INITIAL_USD;
  db.prepare(
    "INSERT INTO paper_accounts (id, created_at, quote_ccy, base_ccy) VALUES (?, ?, ?, ?)"
  ).run(id, now, DEFAULT_QUOTE, DEFAULT_BASE);
  db.prepare(
    "INSERT OR REPLACE INTO paper_balances (account_id, currency, amount) VALUES (?, ?, ?)"
  ).run(id, DEFAULT_QUOTE, safeUsd);
  db.prepare(
    "INSERT OR REPLACE INTO paper_balances (account_id, currency, amount) VALUES (?, ?, ?)"
  ).run(id, DEFAULT_BASE, 0);
  db.prepare(
    "INSERT OR REPLACE INTO paper_positions (account_id, base_ccy, qty, avg_entry) VALUES (?, ?, 0, 0)"
  ).run(id, DEFAULT_BASE);
  const statKeys = ["fees_paid_usd", "realized_pnl_usd", "volume_30d_usd"];
  for (const key of statKeys) {
    db.prepare("INSERT OR REPLACE INTO paper_stats (account_id, key, value) VALUES (?, ?, 0)").run(id, key);
  }
  return id;
}

function getStat(db: ReturnType<typeof getDb>, accountId: string, key: string): number {
  const row = db.prepare("SELECT value FROM paper_stats WHERE account_id = ? AND key = ?").get(accountId, key) as { value: number } | undefined;
  return row != null && Number.isFinite(row.value) ? row.value : 0;
}

function setStat(db: ReturnType<typeof getDb>, accountId: string, key: string, value: number): void {
  const v = Number.isFinite(value) ? value : 0;
  db.prepare("INSERT OR REPLACE INTO paper_stats (account_id, key, value) VALUES (?, ?, ?)").run(accountId, key, v);
}

/** Place a market order; fills at ask (buy) or bid (sell). Single DB transaction after fetching bid/ask. */
export async function placeMarketOrder(params: {
  accountId: string;
  side: "buy" | "sell";
  qtyBtc: number;
  getBidAsk?: () => Promise<{ bid: number; ask: number; last: number; ts: string }>;
}): Promise<PlaceOrderResult> {
  const { accountId, side, qtyBtc } = params;
  const qty = Number.isFinite(qtyBtc) && qtyBtc > 0 ? qtyBtc : 0;
  if (qty <= 0) {
    throw new Error("placeMarketOrder: qtyBtc must be positive");
  }

  const getBidAskFn = params.getBidAsk ?? (() => getBestBidAsk("XBTUSD"));
  const market = await getBidAskFn();
  const price = side === "buy" ? market.ask : market.bid;
  const notionalUsd = qty * price;
  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
    throw new Error("placeMarketOrder: invalid notional");
  }

  const db = getDb();
  const tx = db.transaction(() => {
    const acc = db.prepare("SELECT id FROM paper_accounts WHERE id = ?").get(accountId) as { id: string } | undefined;
    if (!acc) throw new Error("Paper account not found");

    const volume30dUsd = getStat(db, accountId, "volume_30d_usd");
    const { feeUsd } = calcFeeUsdPaper({
      notionalUsd,
      liquidity: "taker",
      volume30dUsd,
    });
    const fee = Number.isFinite(feeUsd) && feeUsd >= 0 ? feeUsd : 0;

    const usdRow = db.prepare("SELECT amount FROM paper_balances WHERE account_id = ? AND currency = ?").get(accountId, DEFAULT_QUOTE) as { amount: number } | undefined;
    const btcRow = db.prepare("SELECT amount FROM paper_balances WHERE account_id = ? AND currency = ?").get(accountId, DEFAULT_BASE) as { amount: number } | undefined;
    const posRow = db.prepare("SELECT base_ccy, qty, avg_entry FROM paper_positions WHERE account_id = ?").get(accountId) as { base_ccy: string; qty: number; avg_entry: number } | undefined;

    const usdBal = usdRow != null && Number.isFinite(usdRow.amount) ? usdRow.amount : 0;
    const btcBal = btcRow != null && Number.isFinite(btcRow.amount) ? btcRow.amount : 0;
    const posQty = posRow != null && Number.isFinite(posRow.qty) ? posRow.qty : 0;
    const posAvg = posRow != null && Number.isFinite(posRow.avg_entry) ? posRow.avg_entry : 0;

    let realizedPnlUsd = 0;

    if (side === "buy") {
      const costAndFee = notionalUsd + fee;
      if (usdBal < costAndFee) throw new Error("Insufficient USD for buy");
      db.prepare("UPDATE paper_balances SET amount = amount - ? WHERE account_id = ? AND currency = ?").run(costAndFee, accountId, DEFAULT_QUOTE);
      db.prepare("UPDATE paper_balances SET amount = amount + ? WHERE account_id = ? AND currency = ?").run(qty, accountId, DEFAULT_BASE);
      const newQty = posQty + qty;
      const newAvg = newQty > 0 ? (posQty * posAvg + qty * price) / newQty : 0;
      db.prepare("UPDATE paper_positions SET qty = ?, avg_entry = ? WHERE account_id = ?").run(newQty, newAvg, accountId);
    } else {
      if (btcBal < qty) throw new Error("Insufficient BTC for sell");
      const sellQty = Math.min(qty, posQty);
      if (sellQty > 0) {
        realizedPnlUsd = sellQty * (price - posAvg) - fee;
      }
      db.prepare("UPDATE paper_balances SET amount = amount + ? WHERE account_id = ? AND currency = ?").run(notionalUsd - fee, accountId, DEFAULT_QUOTE);
      db.prepare("UPDATE paper_balances SET amount = amount - ? WHERE account_id = ? AND currency = ?").run(qty, accountId, DEFAULT_BASE);
      const newQty = posQty - sellQty;
      const newAvg = newQty > 0 ? posAvg : 0;
      db.prepare("UPDATE paper_positions SET qty = ?, avg_entry = ? WHERE account_id = ?").run(Math.max(0, newQty), newAvg, accountId);
    }

    const feesPaid = getStat(db, accountId, "fees_paid_usd") + fee;
    const realizedPnl = getStat(db, accountId, "realized_pnl_usd") + realizedPnlUsd;
    const volume30d = getStat(db, accountId, "volume_30d_usd") + notionalUsd;
    setStat(db, accountId, "fees_paid_usd", feesPaid);
    setStat(db, accountId, "realized_pnl_usd", realizedPnl);
    setStat(db, accountId, "volume_30d_usd", volume30d);

    const fillId = randomUUID();
    const ts = new Date().toISOString();
    db.prepare(
      `INSERT INTO paper_fills (id, account_id, ts, side, qty, price, notional, fee_usd, liquidity, realized_pnl_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(fillId, accountId, ts, side, qty, price, notionalUsd, fee, "taker", realizedPnlUsd);

    return { fillId, price, fee, realizedPnlUsd };
  });

  const result = tx();
  const snapshot = getPaperSnapshot(accountId, market);
  return {
    fillId: result.fillId,
    side,
    qty,
    price: result.price,
    notionalUsd,
    feeUsd: result.fee,
    liquidity: "taker",
    realizedPnlUsd: result.realizedPnlUsd,
    snapshot,
  };
}

/** Get snapshot: balances, position, stats, last N fills, and optional market bid/ask. */
export function getPaperSnapshot(
  accountId: string,
  market?: { bid: number; ask: number; last: number; ts: string } | null
): PaperSnapshot {
  const db = getDb();
  const balances = db
    .prepare("SELECT currency, amount FROM paper_balances WHERE account_id = ?")
    .all(accountId) as PaperBalanceRow[];
  const pos = db
    .prepare("SELECT base_ccy, qty, avg_entry FROM paper_positions WHERE account_id = ?")
    .get(accountId) as PaperPositionRow | undefined;
  const statsRows = db
    .prepare("SELECT key, value FROM paper_stats WHERE account_id = ?")
    .all(accountId) as Array<{ key: string; value: number }>;
  const stats: Record<string, number> = {};
  for (const r of statsRows) stats[r.key] = r.value;

  const fills = db
    .prepare(
      "SELECT id, account_id, ts, side, qty, price, notional, fee_usd, liquidity, realized_pnl_usd FROM paper_fills WHERE account_id = ? ORDER BY ts DESC LIMIT ?"
    )
    .all(accountId, SNAPSHOT_FILLS_LIMIT) as PaperFillRow[];

  const position = pos != null && (pos.qty !== 0 || pos.avg_entry !== 0) ? pos : null;
  const mark = market?.last ?? (market ? (market.bid + market.ask) / 2 : 0);
  const unrealizedPnlUsd =
    position && position.qty > 0 && Number.isFinite(mark) && mark > 0
      ? position.qty * (mark - position.avg_entry)
      : 0;

  return {
    accountId,
    balances,
    position,
    stats,
    lastFills: fills,
    market: market ?? null,
    unrealizedPnlUsd: Number.isFinite(unrealizedPnlUsd) ? unrealizedPnlUsd : 0,
  };
}

/** Close out position (sell all BTC) and sweep to USD ledger only if net realized PnL > 0. */
export async function closeoutPaperToUsd(
  accountId: string,
  getBidAsk?: () => Promise<{ bid: number; ask: number; last: number; ts: string }>
): Promise<CloseoutResult> {
  const db = getDb();
  const pos = db
    .prepare("SELECT qty FROM paper_positions WHERE account_id = ?")
    .get(accountId) as { qty: number } | undefined;
  const positionQty = pos != null && Number.isFinite(pos.qty) && pos.qty > 0 ? pos.qty : 0;

  const bidAskFn = getBidAsk ?? (() => getBestBidAsk("XBTUSD"));

  let closedQty = 0;
  if (positionQty > 0) {
    const orderResult = await placeMarketOrder({
      accountId,
      side: "sell",
      qtyBtc: positionQty,
      getBidAsk: bidAskFn,
    });
    closedQty = orderResult.qty;
  }

  const netRealized = getStat(db, accountId, "realized_pnl_usd");
  const runId = `paper-${Date.now()}`;
  let swept = 0;
  if (Number.isFinite(netRealized) && netRealized > 0) {
    const sweepResult = await applySweep(runId, netRealized);
    swept = sweepResult.swept;
    if (swept > 0) {
      setStat(db, accountId, "realized_pnl_usd", 0);
    }
  }

  const market = await bidAskFn().catch(() => null);
  const snapshot = getPaperSnapshot(accountId, market ?? undefined);

  return {
    closedQty,
    netRealizedPnlUsd: netRealized,
    swept,
    sweepRunId: swept > 0 ? runId : null,
    snapshot,
  };
}
