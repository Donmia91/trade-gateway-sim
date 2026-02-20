# Trade Gateway Simulator (v1.1)

A **private trading control plane** with paper-only simulation: dashboard, mock broker, scenario-driven or **live** market data (Kraken/Coinbase public WS), scenario suite runner, and SQLite ledger + snapshots. **No real exchange keys**; execution remains MockBroker only.

## How to run

```bash
pnpm install
pnpm dev
```

`better-sqlite3` is built automatically (allowed via `package.json` → `pnpm.onlyBuiltDependencies`). If you see "Could not locate the bindings file", run `pnpm rebuild better-sqlite3` after enabling its build (e.g. `pnpm approve-builds` and select `better-sqlite3`).

Open **http://localhost:3000/dash** (root redirects to `/dash`). If the port is in use, Next.js will use 3001, 3002, etc.—use the URL shown in the terminal.

## Smoke test (2 minutes)

1. `pnpm dev` → open `/dash`.
2. Pick scenario **CHOP** → click **Start**.
3. Confirm:
   - **ticks** increases.
   - **mid** / **spread** / **data age** update.
   - Ledger shows **SIM_STARTED** and periodic **TICK**.
4. Click **Kill**:
   - Ledger shows **KILL_SWITCH_ON**.
   - Strategy logs **RISK_BLOCK** with reason `kill_switch`.
5. Click **Unkill**:
   - Strategy may place orders (see **ORDER_PLACED** / **ORDER_FILLED** / **POSITION** in the ledger).
6. Click **Stop**:
   - Ledger shows **SIM_STOPPED**.

## Data sources (v1.1)

- **SIM** — Synthetic ticks from scenario (CHOP, TREND_UP, etc.).
- **KRAKEN_PUBLIC** — Kraken public WebSocket (best bid/ask). No auth. Pair e.g. `XRP/USD`.
- **COINBASE_PUBLIC** — Coinbase Advanced Trade public WebSocket (ticker). No auth. Pair e.g. `XRP/USD` (product id `XRP-USD`).

Set via dashboard **Data source** or `POST /api/sim/set-source`. Even with live data, orders still go to **MockBroker** (paper only).

## Daily Ops (EOD)

One command produces EOD artifacts and a PASS/FAIL verdict.

| Command | Description |
|--------|---------------|
| `pnpm eod` | Run EOD with default config (`configs/daily.json`). |
| `pnpm eod:smoke` | Fast run using `configs/smoke.json`. |
| `pnpm eod:ci` | Same as `eod` with `--ci` (quiet, for CI). |

**Options:** `--config <path>`, `--seed <number>`, `--ci`

**Outputs:** `out/eod/<runId>/` — `summary.json`, `report.md`, `trades.csv`. **Gates** (from `configs/ops-gates.json`): `error_count === 0`, `trade_count >= minTrades`, `realized_pnl_usd` in `[minPnlUsd, maxPnlUsd]`. Exit code 0 = PASS, 1 = FAIL.

## Suite runner

Run multi-scenario campaigns: **Run Suite** on the dashboard or `POST /api/sim/run-suite` with optional `{ plan, tickMs }`. Default plan: CHOP 15m, TREND_UP 15m, PANIC_DOWN 15m. Returns summary (start/end equity, PnL, max drawdown, trade count, fees).

## Snapshots

Time-series metrics are written every `SNAPSHOT_EVERY_MS` (default 5s) into the `snapshots` table (equity, drawdown, mid, spread, position, etc.). **GET** `/api/sim/snapshots?limit=500` returns latest snapshots (newest last) for charting/analysis.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sim/start` | Start simulation. Body: `{ "scenario?", "tickMs?", "source?", "pair?" }`. Default: SIM CHOP, 250ms. |
| `POST` | `/api/sim/stop` | Stop simulation. |
| `GET`  | `/api/sim/status` | Current status (running, ticks, data source, drawdown, etc.). |
| `POST` | `/api/sim/set-source` | Set data source. Body: `{ "source", "scenario?", "pair?" }`. |
| `POST` | `/api/sim/run-suite` | Run suite. Body: `{ "plan?", "tickMs?" }`. |
| `GET`  | `/api/sim/snapshots?limit=500` | Latest snapshots (newest last). |
| `POST` | `/api/sim/kill`  | Set kill switch ON. |
| `POST` | `/api/sim/unkill`| Set kill switch OFF (still paper mode). |
| `GET`  | `/api/ledger/events?limit=200` | Last N ledger events (newest first). |

## Scenarios

- **CHOP** — Sideways, low vol.
- **TREND_UP** — Gentle uptrend.
- **PANIC_DOWN** — High vol, downward drift.
- **GAP_UP** — Occasional upward shocks.
- **LOW_LIQUIDITY** — Wide spread, high slippage.

## Safety model

- **Paper mode** is ON by default; no real orders. **MockBroker only** in v1.1.
- **Kill switch** is ON by default; strategy is blocked until you hit “Unkill”.
- **TRADING_ENABLED** remains false; no live broker, no keys, no private endpoints.
- Config via `.env.local`: `PAPER_MODE`, `KILL_SWITCH`, `DATA_SOURCE`, `LIVE_PAIR`, `SNAPSHOT_EVERY_MS`, `TICK_LOG_EVERY_N`, `KRAKEN_WS_URL`, `COINBASE_WS_URL`, `KRAKEN_30D_VOLUME_USD` (30-day volume USD for Kraken tiered fees; default 0), etc.

## Event types (ledger)

`SIM_STARTED`, `SIM_STOPPED`, `TICK`, `SIGNAL`, `ORDER_PLACED`, `ORDER_FILLED`, `ORDER_CANCELED`, `POSITION`, `RISK_BLOCK`, `KILL_SWITCH_ON`, `KILL_SWITCH_OFF`, `SNAPSHOT`, `SUITE_STARTED`, `SUITE_STEP`, `SUITE_DONE`, `DATA_DEBUG`.

## Next steps

- Add Kraken/Coinbase **execution** adapters behind the same `Broker` interface (still behind paper + kill switch).
- Keep paper mode and kill switch as mandatory guardrails before enabling live trading.
