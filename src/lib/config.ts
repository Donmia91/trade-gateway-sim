/**
 * Load from env with safe defaults. No secrets in client.
 */
function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return v.toLowerCase() === "true" || v === "1";
}

function envNum(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function envStr(key: string, fallback: string): string {
  const v = process.env[key];
  return v !== undefined && v !== "" ? v : fallback;
}

export const config = {
  PAPER_MODE: envBool("PAPER_MODE", true),
  TRADING_ENABLED: envBool("TRADING_ENABLED", false),
  KILL_SWITCH: envBool("KILL_SWITCH", true),
  SIM_TICK_MS: envNum("SIM_TICK_MS", 250),
  SIM_MAX_RUNTIME_SEC: envNum("SIM_MAX_RUNTIME_SEC", 21600),
  DB_PATH: envStr("DB_PATH", "./data/ledger.sqlite"),
  // v1.1
  DATA_SOURCE: envStr("DATA_SOURCE", "SIM") as "SIM" | "KRAKEN_PUBLIC" | "COINBASE_PUBLIC",
  LIVE_PAIR: envStr("LIVE_PAIR", "BTC/USD"),
  SNAPSHOT_EVERY_MS: envNum("SNAPSHOT_EVERY_MS", 5000),
  TICK_LOG_EVERY_N: envNum("TICK_LOG_EVERY_N", 8),
  SUITE_DEFAULT: envBool("SUITE_DEFAULT", true),
  KRAKEN_WS_URL: envStr("KRAKEN_WS_URL", "wss://ws.kraken.com/v2"),
  COINBASE_WS_URL: envStr("COINBASE_WS_URL", "wss://advanced-trade-ws.coinbase.com"),
  /** 30-day volume (USD) for Kraken tiered fee; default 0 = Tier 0. */
  KRAKEN_30D_VOLUME_USD: envNum("KRAKEN_30D_VOLUME_USD", 0),
} as const;
