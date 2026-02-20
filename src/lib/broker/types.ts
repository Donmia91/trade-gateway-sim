export type Pair = "XRP/USD" | string;
export type Side = "buy" | "sell";
export type OrderType = "market" | "limit";

export interface Order {
  id: string;
  pair: Pair;
  side: Side;
  type: OrderType;
  qty: number;
  limitPx?: number;
  ts: number;
}

export interface Fill {
  orderId: string;
  pair: Pair;
  side: Side;
  qty: number;
  px: number;
  feeUsd: number;
  /** True when limit order added liquidity (did not cross); false for market or crossing limit. */
  isMaker?: boolean;
  ts: number;
}

export interface BookTop {
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  spreadBps: number;
  ts: number;
}

export interface Broker {
  getTop(pair: Pair): BookTop;
  placeOrder(order: Omit<Order, "id" | "ts">): { orderId: string };
  cancelOrder(orderId: string): void;
  getOpenOrders(): Order[];
  drainFills(): Fill[];
  getBalances(): { USD: number; XRP: number };
}
