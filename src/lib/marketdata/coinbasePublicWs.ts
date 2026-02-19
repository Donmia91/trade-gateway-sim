import WebSocket from "ws";
import type { MarketDataSource, MarketTick, Pair } from "./types";
import { config } from "../config";
import { logEvent } from "../ledger";

const BACKOFF_MS = [1000, 2000, 5000, 10000, 20000];
const MAX_RECONNECT = 5;
const DEBUG_MSG_LIMIT = 600;

export function toCoinbaseProductId(pair: Pair): string {
  return pair.replace("/", "-");
}

export function createCoinbasePublicWs(): MarketDataSource {
  let ws: WebSocket | null = null;
  let running = false;
  let debugCount = 0;
  let reconnectAttempt = 0;

  return {
    kind: "COINBASE_PUBLIC",
    async start(
      pair: Pair,
      onTick: (t: MarketTick) => void,
      onError: (e: unknown) => void
    ): Promise<void> {
      if (running) return;
      running = true;
      debugCount = 0;
      reconnectAttempt = 0;

      const url = config.COINBASE_WS_URL;
      const productId = toCoinbaseProductId(pair);

      function connect() {
        try {
          ws = new WebSocket(url);
        } catch (e) {
          logEvent("RISK_BLOCK", {
            reason: "coinbase_subscribe_failed",
            message: e instanceof Error ? e.message : String(e),
          });
          onError(e);
          return;
        }

        ws.on("open", () => {
          ws!.send(
            JSON.stringify({
              type: "subscribe",
              channel: "ticker",
              product_ids: [productId],
            })
          );
        });

        ws.on("message", (data: WebSocket.RawData) => {
          const raw = data.toString();
          if (debugCount < 3) {
            debugCount++;
            logEvent("DATA_DEBUG", {
              source: "COINBASE_PUBLIC",
              n: debugCount,
              raw: raw.slice(0, DEBUG_MSG_LIMIT),
            });
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            logEvent("RISK_BLOCK", {
              reason: "parse_failed",
              source: "COINBASE_PUBLIC",
            });
            return;
          }

          const obj = parsed as Record<string, unknown>;
          const channel = obj.channel as string | undefined;
          const events = obj.events as Array<Record<string, unknown>> | undefined;

          if (channel === "ticker" && Array.isArray(events)) {
            for (const ev of events) {
              const tickers = ev.tickers as Array<Record<string, unknown>> | undefined;
              if (Array.isArray(tickers) && tickers.length > 0) {
                const t = tickers[0];
                const bestBid = t.best_bid as string | undefined;
                const bestAsk = t.best_ask as string | undefined;
                if (
                  typeof bestBid === "string" &&
                  typeof bestAsk === "string"
                ) {
                  const bid = parseFloat(bestBid);
                  const ask = parseFloat(bestAsk);
                  if (Number.isFinite(bid) && Number.isFinite(ask)) {
                    onTick({
                      ts: Date.now(),
                      bid,
                      ask,
                      mid: (bid + ask) / 2,
                      spread: ask - bid,
                      source: "COINBASE_PUBLIC",
                      pair,
                    });
                  }
                }
              }
            }
          }
        });

        ws.on("error", (e) => {
          onError(e);
        });

        ws.on("close", () => {
          ws = null;
          if (!running) return;
          if (reconnectAttempt >= MAX_RECONNECT) {
            logEvent("RISK_BLOCK", {
              reason: "coinbase_subscribe_failed",
              message: "max_reconnect_exceeded",
            });
            onError(new Error("Max reconnect exceeded"));
            running = false;
            return;
          }
          const delay = BACKOFF_MS[reconnectAttempt] ?? 20000;
          reconnectAttempt++;
          setTimeout(connect, delay);
        });
      }

      connect();
    },
    async stop(): Promise<void> {
      running = false;
      if (ws) {
        ws.close();
        ws = null;
      }
    },
    isRunning(): boolean {
      return running;
    },
  };
}
