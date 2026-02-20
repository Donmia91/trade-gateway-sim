import type { BookTop, Fill, Order, Pair, Side } from "./types";
import { nowMs } from "../time";

const FEE_RATE = 0.0026; // 0.26%
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
  /** Optional fee in bps (overrides FEE_RATE when set; default 0 when from config) */
  feeBps?: number;
  /** Optional slippage in bps against you (overrides slippageFactor when set) */
  slippageBps?: number;
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
    const slippage =
      this.options.slippageBps !== undefined
        ? 1 + this.options.slippageBps / 10000
        : (this.options.slippageFactor ?? 1.001);
    const feeRate =
      this.options.feeBps !== undefined ? this.options.feeBps / 10000 : FEE_RATE;

    if (full.type === "market") {
      const fillPx =
        full.side === "buy"
          ? top.ask * slippage
          : top.bid / slippage;
      const notional = full.qty * fillPx;
      const feeUsd = notional * feeRate;

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
    const slippage =
      this.options.slippageBps !== undefined
        ? 1 + this.options.slippageBps / 10000
        : (this.options.slippageFactor ?? 1.001);
    const feeRate =
      this.options.feeBps !== undefined ? this.options.feeBps / 10000 : FEE_RATE;
    for (const order of [...this.openOrders]) {
      if (order.type !== "limit" || order.limitPx === undefined) continue;
      let fillPx: number;
      if (order.side === "buy" && top.ask <= order.limitPx) {
        fillPx = Math.min(top.ask * slippage, order.limitPx);
      } else if (order.side === "sell" && top.bid >= order.limitPx) {
        fillPx = Math.max(top.bid / slippage, order.limitPx);
      } else continue;

      if (order.side === "buy") {
        const cost = order.qty * fillPx * (1 + feeRate);
        if (this.balances.USD < cost) continue;
        this.balances.USD -= cost;
        this.balances.XRP += order.qty;
      } else {
        if (this.balances.XRP < order.qty) continue;
        this.balances.XRP -= order.qty;
        const notional = order.qty * fillPx;
        this.balances.USD += notional * (1 - feeRate);
      }

      const feeUsd = order.qty * fillPx * feeRate;
      this.fillsQueue.push({
        orderId: order.id,
        pair: order.pair,
        side: order.side,
        qty: order.qty,
        px: fillPx,
        feeUsd,
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
