import type { MarketDataSource, MarketTick, Pair } from "./types";
import { getScenario, nextPrice, mulberry32 } from "../sim/scenarios";

export function createSimDataSource(
  scenarioName: string,
  tickMs: number
): MarketDataSource {
  const scenario = getScenario(scenarioName);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioName}`);

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let running = false;

  return {
    kind: "SIM",
    async start(pair: Pair, onTick: (t: MarketTick) => void, onError: (e: unknown) => void): Promise<void> {
      if (running) return;
      running = true;
      const rand = mulberry32(scenario.seed);
      let currentPrice = scenario.startPrice;
      const startTs = Date.now();

      intervalId = setInterval(() => {
        try {
          const elapsed = Date.now() - startTs;
          currentPrice = nextPrice(scenario, currentPrice, elapsed, rand);
          const spread = (currentPrice * scenario.baseSpreadBps) / 10000;
          const half = spread / 2;
          const bid = currentPrice - half;
          const ask = currentPrice + half;
          const tick: MarketTick = {
            ts: Date.now(),
            bid,
            ask,
            mid: currentPrice,
            spread,
            source: "SIM",
            pair,
          };
          onTick(tick);
        } catch (e) {
          onError(e);
        }
      }, tickMs);
    },
    async stop(): Promise<void> {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      running = false;
    },
    isRunning(): boolean {
      return running;
    },
  };
}
