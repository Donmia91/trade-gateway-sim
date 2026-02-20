/**
 * Core EOD pipeline: run config, record metrics, apply sweep, write artifacts.
 * Used by scripts/eod.ts (CLI) and API route POST /api/ops/run-eod-smoke.
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { randomBytes } from "crypto";

const OUT_DIR = "out/eod";
const LATEST_DIR = "latest";

export interface RunEodOptions {
  configPath: string;
  gatesPath?: string;
  seed?: number;
  ci?: boolean;
  writeLatest?: boolean;
}

export interface RunEodResult {
  runId: string;
  status: "PASS" | "FAIL";
  summaryPath: string;
  latestPath: string;
  metrics: {
    trade_count: number;
    realized_pnl_usd: number;
    fees_usd: number;
    usd_balance_before: number;
    usd_balance_after: number;
    swept_to_usd: number;
    error_count: number;
  };
}

interface EodConfig {
  steps: Array<{ mode: string; scenario?: string; durationSec: number }>;
  tickMs?: number;
}

interface OpsGates {
  minTrades: number;
  minPnlUsd: number;
  maxPnlUsd: number;
}

function loadJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function createRunId(): string {
  const ts = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const r = randomBytes(4).toString("hex");
  return `${ts}-${r}`;
}

function getGitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

export async function runEod(opts: RunEodOptions): Promise<RunEodResult> {
  const cwd = process.cwd();
  const configPath = path.isAbsolute(opts.configPath)
    ? opts.configPath
    : path.join(cwd, opts.configPath);
  const gatesPath = opts.gatesPath
    ? path.isAbsolute(opts.gatesPath)
      ? opts.gatesPath
      : path.join(cwd, opts.gatesPath)
    : path.join(cwd, "configs", "ops-gates.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(`EOD config not found: ${configPath}`);
  }

  const config = loadJson<EodConfig>(configPath);
  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const gitSha = getGitSha();
  const nodeVersion = process.version;
  const configSnapshot = JSON.stringify(config);
  const seed = opts.seed ?? null;

  process.env.DB_PATH = process.env.DB_PATH ?? path.join(cwd, "data", "ledger.sqlite");
  const { insertEodRun, updateEodRunStatus, insertEodMetric, insertEodEvent } = await import(
    "../eodDb"
  );

  insertEodRun({
    id: runId,
    started_at: startedAt,
    git_sha: gitSha || null,
    seed,
    config_json: configSnapshot,
    node_version: nodeVersion,
    status: "running",
  });
  insertEodEvent(runId, "info", "EOD run started", startedAt);

  const { config: appConfig } = await import("../config");
  const { pickKrakenTier } = await import("../fees/krakenFees");
  const volume_30d_usd_used = appConfig.KRAKEN_30D_VOLUME_USD ?? 0;
  const fee_tier_label_used = pickKrakenTier(volume_30d_usd_used).label;

  let summary: {
    tradeCount: number;
    pnlUsd: number;
    realizedPnlUsd: number;
    unrealizedPnlUsd: number;
    feesTotalUsd: number;
    maker_trades: number;
    taker_trades: number;
    maker_fees_usd: number;
    taker_fees_usd: number;
  };
  let errorCount = 0;

  try {
    const { runSuite } = await import("../sim/suiteRunner");
    const plan = config.steps.map((s) =>
      s.scenario != null
        ? { mode: s.mode as "SIM", scenario: s.scenario, durationSec: s.durationSec }
        : { mode: s.mode as "KRAKEN_PUBLIC" | "COINBASE_PUBLIC", durationSec: s.durationSec }
    );
    const result = await runSuite(plan, config.tickMs);
    const s = result.summary;
    summary = {
      tradeCount: s.tradeCount,
      pnlUsd: s.pnlUsd,
      realizedPnlUsd: s.realizedPnlUsd,
      unrealizedPnlUsd: s.unrealizedPnlUsd,
      feesTotalUsd: s.feesTotalUsd,
      maker_trades: s.maker_trades,
      taker_trades: s.taker_trades,
      maker_fees_usd: s.maker_fees_usd,
      taker_fees_usd: s.taker_fees_usd,
    };
  } catch (e) {
    errorCount = 1;
    summary = {
      tradeCount: 0,
      pnlUsd: 0,
      realizedPnlUsd: 0,
      unrealizedPnlUsd: 0,
      feesTotalUsd: 0,
      maker_trades: 0,
      taker_trades: 0,
      maker_fees_usd: 0,
      taker_fees_usd: 0,
    };
    insertEodEvent(runId, "error", e instanceof Error ? e.message : String(e));
  }

  const trade_count = summary.tradeCount;
  const realized_pnl_usd = summary.realizedPnlUsd;
  const fees_usd = summary.feesTotalUsd;
  const unrealized_pnl_usd = summary.unrealizedPnlUsd;
  const equity_delta_usd = summary.pnlUsd;

  insertEodMetric(runId, "trade_count", trade_count);
  insertEodMetric(runId, "realized_pnl_usd", realized_pnl_usd);
  insertEodMetric(runId, "fees_usd", fees_usd);
  insertEodMetric(runId, "maker_count", summary.maker_trades);
  insertEodMetric(runId, "taker_count", summary.taker_trades);
  insertEodMetric(runId, "volume_30d_usd_used", volume_30d_usd_used);
  insertEodMetric(runId, "equity_delta_usd", equity_delta_usd);
  insertEodMetric(runId, "unrealized_pnl_usd", unrealized_pnl_usd);
  insertEodMetric(runId, "error_count", errorCount);

  const { applySweep, addFeeUsd } = await import("../ledger");
  await addFeeUsd(runId, fees_usd, `Kraken fee ${fee_tier_label_used} maker|taker`);
  const sweep = await applySweep(runId, realized_pnl_usd);
  insertEodMetric(runId, "usd_balance_before", sweep.before);
  insertEodMetric(runId, "usd_balance_after", sweep.after);
  insertEodMetric(runId, "swept_to_usd", sweep.swept);

  const gatesConfig = fs.existsSync(gatesPath)
    ? loadJson<OpsGates>(gatesPath)
    : { minTrades: 1, minPnlUsd: 0, maxPnlUsd: 999999 };

  const gateErrorOk = errorCount === 0;
  const gateTradesOk = trade_count >= gatesConfig.minTrades;
  const gatePnlOk =
    realized_pnl_usd >= gatesConfig.minPnlUsd && realized_pnl_usd <= gatesConfig.maxPnlUsd;
  const pass = gateErrorOk && gateTradesOk && gatePnlOk;
  const status = pass ? "PASS" : "FAIL";

  updateEodRunStatus(runId, status);

  const outRunDir = path.join(cwd, OUT_DIR, runId);
  fs.mkdirSync(outRunDir, { recursive: true });

  const summaryPayload = {
    runId,
    startedAt,
    gitSha,
    seed,
    nodeVersion,
    config: configSnapshot,
    metrics: {
      trade_count,
      realized_pnl_usd,
      fees_usd,
      maker_count: summary.maker_trades,
      taker_count: summary.taker_trades,
      volume_30d_usd_used,
      fee_tier_label_used,
      equity_delta_usd,
      unrealized_pnl_usd,
      pnl_usd_is_equity_delta: true,
      error_count: errorCount,
      usd_balance_before: sweep.before,
      usd_balance_after: sweep.after,
      swept_to_usd: sweep.swept,
    },
    gates: {
      error_count_ok: gateErrorOk,
      trade_count_ok: gateTradesOk,
      pnl_ok: gatePnlOk,
      minTrades: gatesConfig.minTrades,
      minPnlUsd: gatesConfig.minPnlUsd,
      maxPnlUsd: gatesConfig.maxPnlUsd,
    },
    status,
  };

  fs.writeFileSync(
    path.join(outRunDir, "summary.json"),
    JSON.stringify(summaryPayload, null, 2),
    "utf-8"
  );

  const reportLines = [
    `# EOD Report — ${runId}`,
    "",
    `**Status:** ${status}`,
    `**Started:** ${startedAt}`,
    `**Git SHA:** ${gitSha || "(none)"}`,
    "",
    "## Metrics",
    `- trade_count: ${trade_count}`,
    `- realized_pnl_usd: ${realized_pnl_usd} (net of fees, used for sweep)`,
    `- fees_usd: ${fees_usd}`,
    `- maker_count: ${summary.maker_trades} | taker_count: ${summary.taker_trades}`,
    `- volume_30d_usd_used: ${volume_30d_usd_used} | fee_tier_label_used: ${fee_tier_label_used}`,
    `- equity_delta_usd: ${equity_delta_usd} (not used for sweep)`,
    `- unrealized_pnl_usd: ${unrealized_pnl_usd}`,
    `- error_count: ${errorCount}`,
    `- usd_balance_before: ${sweep.before}`,
    `- usd_balance_after: ${sweep.after}`,
    `- swept_to_usd: ${sweep.swept}`,
    "",
    "## Gates",
    `- error_count === 0: ${gateErrorOk ? "✓" : "✗"}`,
    `- trade_count >= ${gatesConfig.minTrades}: ${gateTradesOk ? "✓" : "✗"}`,
    `- pnl in [${gatesConfig.minPnlUsd}, ${gatesConfig.maxPnlUsd}]: ${gatePnlOk ? "✓" : "✗"}`,
  ];
  fs.writeFileSync(path.join(outRunDir, "report.md"), reportLines.join("\n"), "utf-8");

  const { getEvents } = await import("../ledger");
  const events = getEvents(2000);
  const filled = events.filter((e) => e.type === "ORDER_FILLED");
  const csvRows: string[] = ["ts,orderId,pair,side,qty,px,is_maker,fee_usd,fee_rate_bps,fee_tier_label"];
  for (const e of filled) {
    const d = e.data as {
      ts?: number;
      orderId?: string;
      pair?: string;
      side?: string;
      qty?: number;
      px?: number;
      feeUsd?: number;
      fee_usd?: number;
      is_maker?: boolean;
      liquidity?: string;
      fee_rate_bps?: number;
      fee_tier_label?: string;
    };
    const fee = d?.feeUsd ?? d?.fee_usd ?? "";
    const is_maker = d?.is_maker === true || d?.liquidity === "maker";
    csvRows.push(
      [
        d?.ts ?? "",
        d?.orderId ?? "",
        d?.pair ?? "",
        d?.side ?? "",
        d?.qty ?? "",
        d?.px ?? "",
        is_maker ? "1" : "0",
        fee,
        d?.fee_rate_bps ?? "",
        d?.fee_tier_label ?? "",
      ].join(",")
    );
  }
  if (csvRows.length === 1) {
    csvRows.push("# No trades in this run");
  }
  fs.writeFileSync(path.join(outRunDir, "trades.csv"), csvRows.join("\n"), "utf-8");

  const summaryPath = path.join(outRunDir, "summary.json");
  let latestPath = path.join(cwd, OUT_DIR, LATEST_DIR);

  if (opts.writeLatest !== false) {
    fs.mkdirSync(latestPath, { recursive: true });
    for (const name of ["summary.json", "report.md", "trades.csv"]) {
      fs.copyFileSync(path.join(outRunDir, name), path.join(latestPath, name));
    }
    latestPath = path.join(latestPath, "summary.json");
  } else {
    latestPath = summaryPath;
  }

  return {
    runId,
    status,
    summaryPath,
    latestPath,
    metrics: {
      trade_count,
      realized_pnl_usd,
      fees_usd,
      usd_balance_before: sweep.before,
      usd_balance_after: sweep.after,
      swept_to_usd: sweep.swept,
      error_count: errorCount,
    },
  };
}
