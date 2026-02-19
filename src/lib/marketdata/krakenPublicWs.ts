import WebSocket from "ws";
import type { MarketDataSource, MarketTick, Pair } from "./types";
import { config } from "../config";
import { logEvent } from "../ledger";

const BACKOFF_MS = [1000, 2000, 5000, 10000, 20000];
const MAX_RECONNECT = 5;
const DEBUG_MSG_LIMIT = 600;

/** Map internal pair to Kraken symbol(s) to try */
export function toKrakenSymbol(pair: Pair): string[] {
  const normalized = pair.replace(/\s/g, "");
  return [normalized, normalized.replace("/", ""), pair];
}

export function createKrakenPublicWs(): MarketDataSource {
  let ws: WebSocket | null = null;
  let running = false;
  let debugCount = 0;
  let reconnectAttempt = 0;

  return {
    kind: "KRAKEN_PUBLIC",
    async start(
      pair: Pair,
      onTick: (t: MarketTick) => void,
      onError: (e: unknown) => void
    ): Promise<void> {
      if (running) return;
      running = true;
      debugCount = 0;
      reconnectAttempt = 0;

      const url = config.KRAKEN_WS_URL;

      function connect() {
        try {
          ws = new WebSocket(url);
        } catch (e) {
          logEvent("RISK_BLOCK", {
            reason: "kraken_subscribe_failed",
            message: e instanceof Error ? e.message : String(e),
          });
          onError(e);
          return;
        }

        ws.on("open", () => {
          const symbols = toKrakenSymbol(pair);
          const sub = {
            method: "subscribe",
            params: {
              channel: "ticker",
              symbol: symbols.slice(0, 1),
              snapshot: true,
            },
          };
          ws!.send(JSON.stringify(sub));
        });

        ws.on("message", (data: WebSocket.RawData) => {
          const raw = data.toString();
          if (debugCount < 3) {
            debugCount++;
            logEvent("DATA_DEBUG", {
              source: "KRAKEN_PUBLIC",
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
              source: "KRAKEN_PUBLIC",
            });
            return;
          }

          const obj = parsed as Record<string, unknown>;
          if (obj.method === "subscribe" && obj.result) {
            const res = obj.result as Record<string, unknown>;
            if (res.status && res.status !== "subscribed") {
              logEvent("RISK_BLOCK", {
                reason: "kraken_subscribe_failed",
                status: res.status,
              });
              onError(new Error(String(res.status)));
            }
            return;
          }

          const channel = obj.channel as string | undefined;
          const tickerData = (obj as { data?: Array<{ bid?: string; ask?: string; last?: string }> }).data;
          if (channel === "ticker" && Array.isArray(tickerData) && tickerData.length > 0) {
            const d = tickerData[0];
            const bid = typeof d.bid === "string" ? parseFloat(d.bid) : NaN;
            const ask = typeof d.ask === "string" ? parseFloat(d.ask) : NaN;
            if (Number.isFinite(bid) && Number.isFinite(ask)) {
              const mid = (bid + ask) / 2;
              const spread = ask - bid;
              onTick({
                ts: Date.now(),
                bid,
                ask,
                mid,
                spread,
                source: "KRAKEN_PUBLIC",
                pair,
              });
            }
            return;
          }

          const arr = parsed as unknown[];
          if (Array.isArray(arr) && arr.length >= 4) {
            const [, payload] = arr as [unknown, unknown];
            const pl = payload as Record<string, unknown> | undefined;
            if (pl && typeof pl.bid === "string" && typeof pl.ask === "string") {
              const bid = parseFloat(pl.bid);
              const ask = parseFloat(pl.ask);
              if (Number.isFinite(bid) && Number.isFinite(ask)) {
                onTick({
                  ts: Date.now(),
                  bid,
                  ask,
                  mid: (bid + ask) / 2,
                  spread: ask - bid,
                  source: "KRAKEN_PUBLIC",
                  pair,
                });
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
              reason: "kraken_subscribe_failed",
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
