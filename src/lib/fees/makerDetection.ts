/**
 * Maker/taker classification for limit orders.
 * - Limit BUY: maker if limitPrice < bestAsk (rests); taker if limitPrice >= bestAsk (crosses).
 * - Limit SELL: maker if limitPrice > bestBid (rests); taker if limitPrice <= bestBid (crosses).
 */

export type Side = "buy" | "sell";

export function isMakerLimit(
  side: Side,
  limitPx: number,
  bestBid: number,
  bestAsk: number
): boolean {
  if (side === "buy") {
    return limitPx < bestAsk;
  }
  return limitPx > bestBid;
}
