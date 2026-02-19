export type DataSourceKind = "SIM" | "KRAKEN_PUBLIC" | "COINBASE_PUBLIC";

export type Pair = string;

export interface MarketTick {
  ts: number;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  source: DataSourceKind;
  pair: Pair;
}

export interface MarketDataSource {
  kind: DataSourceKind;
  start(
    pair: Pair,
    onTick: (t: MarketTick) => void,
    onError: (e: unknown) => void
  ): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}
