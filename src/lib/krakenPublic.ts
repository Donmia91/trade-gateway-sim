/**
 * Kraken public REST API — no API keys. Read-only market data.
 * Ref: https://docs.kraken.com/rest/#tag/Market-Data/operation/getTickerInformation
 */

const TICKER_URL = "https://api.kraken.com/0/public/Ticker?pair=XBTUSD";
const TIMEOUT_MS = 5000;
const MAX_RETRIES = 1;

export type KrakenTicker = {
  pair: "XBTUSD";
  last: number;
  bid: number;
  ask: number;
  ts: string;
};

interface KrakenTickerResponse {
  error?: string[];
  result?: Record<
    string,
    { a?: string[]; b?: string[]; c?: string[] }
  >;
}

function toNum(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Fetch Kraken BTC/USD (XBTUSD) ticker. Uses AbortController with timeout. Retries once on failure.
 */
export async function fetchKrakenTickerXbtUsd(): Promise<KrakenTicker> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(TICKER_URL, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Kraken ticker HTTP ${res.status}`);
      }

      const data = (await res.json()) as KrakenTickerResponse;

      if (data.error && data.error.length > 0) {
        throw new Error(data.error.join("; ") || "Kraken API error");
      }

      const result = data.result;
      if (!result || typeof result !== "object") {
        throw new Error("Kraken ticker: missing result");
      }

      const pairKey = Object.keys(result)[0];
      const tick = result[pairKey];
      if (!tick?.c?.[0] || !tick?.b?.[0] || !tick?.a?.[0]) {
        throw new Error("Kraken ticker: missing c/b/a");
      }

      const last = toNum(tick.c[0]);
      const bid = toNum(tick.b[0]);
      const ask = toNum(tick.a[0]);

      if (Number.isNaN(last) || Number.isNaN(bid) || Number.isNaN(ask)) {
        throw new Error("Kraken ticker: invalid numeric values");
      }

      return {
        pair: "XBTUSD",
        last,
        bid,
        ask,
        ts: new Date().toISOString(),
      };
    } catch (e) {
      clearTimeout(timeoutId);
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt === MAX_RETRIES) break;
    }
  }
  throw lastErr ?? new Error("Kraken ticker failed");
}

export type BestBidAskPair = "XBT/USD" | "XBTUSD";

export interface BestBidAsk {
  bid: number;
  ask: number;
  last: number;
  ts: string;
}

/**
 * Get best bid/ask for BTC/USD. Pair "XBT/USD" or "XBTUSD" both map to Kraken XBTUSD. Timeout + 1 retry.
 */
export async function getBestBidAsk(_pair: BestBidAskPair): Promise<BestBidAsk> {
  const ticker = await fetchKrakenTickerXbtUsd();
  return { bid: ticker.bid, ask: ticker.ask, last: ticker.last, ts: ticker.ts };
}
