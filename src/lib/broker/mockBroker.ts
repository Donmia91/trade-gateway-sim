import type { BookTop, Fill, Order, Pair, Side } from "./types";
import { nowMs } from "../time";
import { config } from "../config";

const MAKER_FEE_RATE = config.MAKER_FEE_RATE;
const TAKER_FEE_RATE = config.TAKER_FEE_RATE;
const DEFAULT_PAIR: Pair = "XRP/USD";

let orderIdCounter = 0;
function nextOrderId(): string {
  return `mock-${++orderIdCounter}-${Date.now()}`;
}

export interface MockBrokerOptions {
  /** Current mid price (set by sim) */
  mid: number;
  /** Spread in bps (basis points) */
  spreadBps: number;
  /** Slippage factor for market orders (e.g. 1.001 = 0.1% worse) */
  slippageFactor?: number;
}

export class MockBroker {
  private balances = { USD: 1000, XRP: 0 };
  private openOrders: Order[] = [];
  private fillsQueue: Fill[] = [];
  private options: MockBrokerOptions;
  private pair: Pair = DEFAULT_PAIR;

  constructor(options: MockBrokerOptions) {
    this.options = {
      slippageFactor: 1.001,
      ...options,
    };
  }

  setOptions(opts: Partial<MockBrokerOptions>): void {
    this.options = { ...this.options, ...opts };
  }

  getTop(pair: Pair): BookTop {
    const { mid, spreadBps } = this.options;
    const spread = (mid * spreadBps) / 10000;
    const half = spread / 2;
    const bid = mid - half;
    const ask = mid + half;
    return {
      bid,
      ask,
      mid,
      spread,
      spreadBps,
      ts: nowMs(),
    };
  }

  placeOrder(order: Omit<Order, "id" | "ts">): { orderId: string } {
    const full: Order = {
      ...order,
      id: nextOrderId(),
      ts: nowMs(),
    };
    this.openOrders.push(full);

    const top = this.getTop(full.pair);
    const slippage = this.options.slippageFactor ?? 1.001;

    if (full.type === "market") {
      const fillPx =
        full.side === "buy"
          ? top.ask * slippage
          : top.bid / slippage;
      const notional = full.qty * fillPx;
      const liquidity: "maker" | "taker" = "taker";
      const feeUsd = notional * TAKER_FEE_RATE;

      if (full.side === "buy") {
        const cost = notional + feeUsd;
        if (this.balances.USD < cost) {
          throw new Error("RISK_BLOCK: insufficient USD");
        }
        this.balances.USD -= cost;
        this.balances.XRP += full.qty;
      } else {
        if (this.balances.XRP < full.qty) {
          throw new Error("RISK_BLOCK: insufficient XRP");
        }
        this.balances.XRP -= full.qty;
        this.balances.USD += notional - feeUsd;
      }

      const fill: Fill = {
        orderId: full.id,
        pair: full.pair,
        side: full.side,
        qty: full.qty,
        px: fillPx,
        feeUsd,
        liquidity,
        ts: nowMs(),
      };
      this.fillsQueue.push(fill);
      this.openOrders = this.openOrders.filter((o) => o.id !== full.id);
    }
    // limit orders: fill when price crosses (handled in sim tick when we update mid)
    return { orderId: full.id };
  }

  cancelOrder(orderId: string): void {
    this.openOrders = this.openOrders.filter((o) => o.id !== orderId);
  }

  tryFillLimitOrders(top: BookTop): void {
    const slippage = this.options.slippageFactor ?? 1.001;
    for (const order of [...this.openOrders]) {
      if (order.type !== "limit" || order.limitPx === undefined) continue;
      let fillPx: number;
      let liquidity: "maker" | "taker";
      if (order.side === "buy" && top.ask <= order.limitPx) {
        fillPx = Math.min(top.ask * slippage, order.limitPx);
        liquidity = top.ask < order.limitPx ? "maker" : "taker";
      } else if (order.side === "sell" && top.bid >= order.limitPx) {
        fillPx = Math.max(top.bid / slippage, order.limitPx);
        liquidity = order.limitPx > top.bid ? "maker" : "taker";
      } else continue;

      const notional = order.qty * fillPx;
      const feeRate = liquidity === "maker" ? MAKER_FEE_RATE : TAKER_FEE_RATE;
      const feeUsd = notional * feeRate;

      if (order.side === "buy") {
        const cost = notional + feeUsd;
        if (this.balances.USD < cost) continue;
        this.balances.USD -= cost;
        this.balances.XRP += order.qty;
      } else {
        if (this.balances.XRP < order.qty) continue;
        this.balances.XRP -= order.qty;
        this.balances.USD += notional - feeUsd;
      }

      this.fillsQueue.push({
        orderId: order.id,
        pair: order.pair,
        side: order.side,
        qty: order.qty,
        px: fillPx,
        feeUsd,
        liquidity,
        ts: nowMs(),
      });
      this.openOrders = this.openOrders.filter((o) => o.id !== order.id);
    }
  }

  getOpenOrders(): Order[] {
    return [...this.openOrders];
  }

  drainFills(): Fill[] {
    const out = [...this.fillsQueue];
    this.fillsQueue.length = 0;
    return out;
  }

  getBalances(): { USD: number; XRP: number } {
    return { ...this.balances };
  }
}
