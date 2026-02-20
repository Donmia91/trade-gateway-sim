import type { BookTop, Fill, Order, Pair, Side } from "./types";
import { nowMs } from "../time";
import { config } from "../config";
import { calcFeeUsd } from "../fees/krakenFees";
import { isMakerLimit } from "../fees/makerDetection";

const DEFAULT_PAIR: Pair = "BTC/USD";

let orderIdCounter = 0;
function nextOrderId(): string {
  return `mock-${++orderIdCounter}-${Date.now()}`;
}

export interface MockBrokerOptions {
  mid: number;
  spreadBps: number;
  slippageFactor?: number;
  /** 30-day volume USD for Kraken tiered fees; default from config */
  volume30dUsd?: number;
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
      volume30dUsd: config.KRAKEN_30D_VOLUME_USD,
      ...options,
    };
  }

  private getVolume30dUsd(): number {
    const v = this.options.volume30dUsd ?? config.KRAKEN_30D_VOLUME_USD;
    return Number.isFinite(v) ? v : 0;
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
      const notionalUsd = full.qty * fillPx;
      const isMaker = false;
      const { feeUsd, tier, rateBps } = calcFeeUsd(notionalUsd, isMaker, this.getVolume30dUsd());

      if (full.side === "buy") {
        const cost = notionalUsd + feeUsd;
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
        this.balances.USD += notionalUsd - feeUsd;
      }

      this.fillsQueue.push({
        orderId: full.id,
        pair: full.pair,
        side: full.side,
        qty: full.qty,
        px: fillPx,
        feeUsd,
        liquidity: "taker",
        fee_rate_bps: rateBps,
        fee_tier_label: tier.label,
        ts: nowMs(),
      });
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
    const vol30d = this.getVolume30dUsd();
    for (const order of [...this.openOrders]) {
      if (order.type !== "limit" || order.limitPx === undefined) continue;
      let fillPx: number;
      let isMaker: boolean;
      if (order.side === "buy" && top.ask <= order.limitPx) {
        fillPx = Math.min(top.ask * slippage, order.limitPx);
        isMaker = isMakerLimit("buy", order.limitPx, top.bid, top.ask);
      } else if (order.side === "sell" && top.bid >= order.limitPx) {
        fillPx = Math.max(top.bid / slippage, order.limitPx);
        isMaker = isMakerLimit("sell", order.limitPx, top.bid, top.ask);
      } else continue;

      const notionalUsd = order.qty * fillPx;
      const { feeUsd, tier, rateBps } = calcFeeUsd(notionalUsd, isMaker, vol30d);

      if (order.side === "buy") {
        const cost = notionalUsd + feeUsd;
        if (this.balances.USD < cost) continue;
        this.balances.USD -= cost;
        this.balances.XRP += order.qty;
      } else {
        if (this.balances.XRP < order.qty) continue;
        this.balances.XRP -= order.qty;
        this.balances.USD += notionalUsd - feeUsd;
      }

      this.fillsQueue.push({
        orderId: order.id,
        pair: order.pair,
        side: order.side,
        qty: order.qty,
        px: fillPx,
        feeUsd,
        liquidity: isMaker ? "maker" : "taker",
        fee_rate_bps: rateBps,
        fee_tier_label: tier.label,
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
