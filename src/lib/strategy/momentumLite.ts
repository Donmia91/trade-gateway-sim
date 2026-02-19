import type { BookTop } from "../broker/types";
import type { MockBroker } from "../broker/mockBroker";
import { logEvent } from "../ledger";
import { nowMs } from "../time";

const WINDOW = 60;
const SHORT_MA = 10;
const LONG_MA = 30;
const THRESHOLD_BPS = 5;
const MAX_POSITION_NOTIONAL = 300;
const SPREAD_BLOCK_BPS = 30;
const DATA_AGE_MS = 2000;
const ORDER_NOTIONAL_USD = 50;

const mids: number[] = [];

function pushMid(mid: number): void {
  mids.push(mid);
  if (mids.length > WINDOW) mids.shift();
}

function shortMA(): number {
  if (mids.length < SHORT_MA) return mids[mids.length - 1] ?? 0;
  const slice = mids.slice(-SHORT_MA);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function longMA(): number {
  if (mids.length < LONG_MA) return mids[mids.length - 1] ?? 0;
  const slice = mids.slice(-LONG_MA);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export interface MomentumLiteContext {
  broker: MockBroker;
  killSwitch: boolean;
  positionXrp: number;
  avgPx: number;
}

/**
 * Momentum-lite: short MA vs long MA. Buy when short > long + threshold, sell when short < long - threshold.
 * Risk: max position notional $300, block if spread > 30 bps or data age > 2s, always obey kill switch.
 */
export function runMomentumLite(
  top: BookTop,
  ctx: MomentumLiteContext
): void {
  const dataAge = nowMs() - top.ts;
  if (dataAge > DATA_AGE_MS) {
    logEvent("RISK_BLOCK", { reason: "data_age", dataAgeMs: dataAge });
    return;
  }
  if (top.spreadBps > SPREAD_BLOCK_BPS) {
    logEvent("RISK_BLOCK", {
      reason: "spread_too_wide",
      spreadBps: top.spreadBps,
      maxBps: SPREAD_BLOCK_BPS,
    });
    return;
  }
  if (ctx.killSwitch) {
    logEvent("RISK_BLOCK", { reason: "kill_switch" });
    return;
  }

  pushMid(top.mid);
  const short = shortMA();
  const long = longMA();
  const diffBps = long !== 0 ? ((short - long) / long) * 10000 : 0;

  logEvent("SIGNAL", {
    shortMA: short,
    longMA: long,
    diffBps,
    positionXrp: ctx.positionXrp,
    spreadBps: top.spreadBps,
  });

  const pair = "XRP/USD";
  const positionNotional = ctx.positionXrp * top.mid;
  if (positionNotional >= MAX_POSITION_NOTIONAL) {
    logEvent("RISK_BLOCK", {
      reason: "max_position",
      positionNotional,
      max: MAX_POSITION_NOTIONAL,
    });
    return;
  }

  if (diffBps >= THRESHOLD_BPS && ctx.positionXrp <= 0) {
    const qty = Math.min(ORDER_NOTIONAL_USD / top.ask, 1000);
    if (qty <= 0) return;
    try {
      const { orderId } = ctx.broker.placeOrder({
        pair,
        side: "buy",
        type: "market",
        qty,
      });
      logEvent("ORDER_PLACED", { orderId, side: "buy", qty, pair });
    } catch (e) {
      logEvent("RISK_BLOCK", {
        reason: "place_failed",
        message: e instanceof Error ? e.message : String(e),
      });
    }
    return;
  }

  if (diffBps <= -THRESHOLD_BPS && ctx.positionXrp > 0) {
    const qty = ctx.positionXrp;
    try {
      const { orderId } = ctx.broker.placeOrder({
        pair,
        side: "sell",
        type: "market",
        qty,
      });
      logEvent("ORDER_PLACED", { orderId, side: "sell", qty, pair });
    } catch (e) {
      logEvent("RISK_BLOCK", {
        reason: "place_failed",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
