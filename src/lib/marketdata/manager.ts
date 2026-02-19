import type { DataSourceKind, MarketDataSource, MarketTick, Pair } from "./types";
import { createSimDataSource } from "./simDataSource";
import { createKrakenPublicWs } from "./krakenPublicWs";
import { createCoinbasePublicWs } from "./coinbasePublicWs";

export interface DataSourceManagerStatus {
  kind: DataSourceKind;
  running: boolean;
  lastTick?: MarketTick;
  lastError?: string;
}

let currentKind: DataSourceKind = "SIM";
let currentInstance: MarketDataSource | null = null;
let lastTick: MarketTick | null = null;
let lastError: string | null = null;
let running = false;

function createSource(kind: DataSourceKind, scenarioName?: string, tickMs?: number): MarketDataSource {
  switch (kind) {
    case "SIM":
      return createSimDataSource(scenarioName ?? "CHOP", tickMs ?? 250);
    case "KRAKEN_PUBLIC":
      return createKrakenPublicWs();
    case "COINBASE_PUBLIC":
      return createCoinbasePublicWs();
    default:
      return createSimDataSource("CHOP", 250);
  }
}

export function setDataSource(kind: DataSourceKind): void {
  currentKind = kind;
}

export async function startDataSource(
  pair: Pair,
  onTick: (t: MarketTick) => void,
  onError: (e: unknown) => void,
  options?: { scenarioName?: string; tickMs?: number }
): Promise<void> {
  await stopDataSource();
  lastError = null;
  currentInstance = createSource(currentKind, options?.scenarioName, options?.tickMs);

  const wrappedOnTick = (t: MarketTick) => {
    lastTick = t;
    onTick(t);
  };
  const wrappedOnError = (e: unknown) => {
    lastError = e instanceof Error ? e.message : String(e);
    onError(e);
  };

  running = true;
  await currentInstance.start(pair, wrappedOnTick, wrappedOnError);
}

export async function stopDataSource(): Promise<void> {
  if (currentInstance) {
    await currentInstance.stop();
    currentInstance = null;
  }
  running = false;
}

export function getDataSourceStatus(): DataSourceManagerStatus {
  return {
    kind: currentKind,
    running: currentInstance?.isRunning() ?? false,
    lastTick: lastTick ?? undefined,
    lastError: lastError ?? undefined,
  };
}
