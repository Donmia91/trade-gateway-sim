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
  // Exchange fee (Kraken Pro spot baseline tier)
  EXCHANGE: envStr("EXCHANGE", "kraken"),
  FEE_MODEL: envStr("FEE_MODEL", "maker_taker"),
  MAKER_FEE_RATE: envNum("MAKER_FEE_RATE", 0.0025),
  TAKER_FEE_RATE: envNum("TAKER_FEE_RATE", 0.004),
} as const;
