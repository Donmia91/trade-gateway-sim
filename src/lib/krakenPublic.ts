/**
 * Kraken public REST API — no API keys. Read-only market data.
 */

const TICKER_URL = "https://api.kraken.com/0/public/Ticker";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface KrakenTickerResult {
  pair: string;
  last: number;
  bid: number;
  ask: number;
  ts: number;
}

interface KrakenTickerResponse {
  error?: string[];
  result?: Record<
    string,
    {
      a?: string[]; // ask [price, whole lot, lot decimal]
      b?: string[]; // bid [price, whole lot, lot decimal]
      c?: string[]; // last [price, lot]
    }
  >;
}

function toNum(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Fetch ticker for a pair (e.g. XBTUSD). Uses Node 20 fetch with timeout.
 */
export async function fetchTicker(
  pair: string = "XBTUSD",
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<KrakenTickerResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${TICKER_URL}?pair=${encodeURIComponent(pair)}`;
    const res = await fetch(url, { signal: controller.signal });
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
    if (!tick || !tick.c?.[0] || !tick.b?.[0] || !tick.a?.[0]) {
      throw new Error("Kraken ticker: missing c/b/a");
    }

    const last = toNum(tick.c[0]);
    const bid = toNum(tick.b[0]);
    const ask = toNum(tick.a[0]);

    if (Number.isNaN(last) || Number.isNaN(bid) || Number.isNaN(ask)) {
      throw new Error("Kraken ticker: invalid numeric values");
    }

    return {
      pair: pairKey,
      last,
      bid,
      ask,
      ts: Date.now(),
    };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error) throw e;
    throw new Error(String(e));
  }
}
