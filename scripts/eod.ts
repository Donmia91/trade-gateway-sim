/**
 * EOD pipeline: one command produces artifacts and PASS/FAIL verdict.
 * Usage:
 *   pnpm eod                    # --config configs/daily.json
 *   pnpm eod:smoke              # --config configs/smoke.json
 *   pnpm eod:ci                 # --config configs/daily.json --ci
 * Options: --config <path>, --seed <number>, --ci, --gates <path>
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { randomBytes } from "crypto";

const DEFAULT_CONFIG = "configs/daily.json";
const DEFAULT_GATES_PATH = "configs/ops-gates.json";
const OUT_DIR = "out/eod";
const LATEST_DIR = "latest";

interface EodConfig {
  steps: Array<{ mode: string; scenario?: string; durationSec: number }>;
  tickMs?: number;
}

interface OpsGates {
  minTrades: number;
  minPnlUsd: number;
  maxPnlUsd: number;
}

function parseArgv(): {
  configPath: string;
  seed: number | null;
  ci: boolean;
  gatesPath: string;
} {
  const args = process.argv.slice(2);
  let configPath = path.join(process.cwd(), DEFAULT_CONFIG);
  let seed: number | null = null;
  let ci = false;
  let gatesPath = path.join(process.cwd(), DEFAULT_GATES_PATH);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && args[i + 1]) {
      configPath = path.isAbsolute(args[i + 1]) ? args[i + 1] : path.join(process.cwd(), args[i + 1]);
      i++;
    } else if (args[i] === "--seed" && args[i + 1]) {
      const n = Number(args[i + 1]);
      if (Number.isFinite(n)) seed = n;
      i++;
    } else if (args[i] === "--ci") {
      ci = true;
    } else if (args[i] === "--gates" && args[i + 1]) {
      gatesPath = path.isAbsolute(args[i + 1]) ? args[i + 1] : path.join(process.cwd(), args[i + 1]);
      i++;
    }
  }
  return { configPath, seed, ci, gatesPath };
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

async function main(): Promise<void> {
  const { configPath, seed, ci, gatesPath } = parseArgv();

  if (!fs.existsSync(configPath)) {
    console.error("EOD config not found:", configPath);
    process.exit(1);
  }

  const config = loadJson<EodConfig>(configPath);
  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const gitSha = getGitSha();
  const nodeVersion = process.version;
  const configSnapshot = JSON.stringify(config);

  // Ensure DB and EOD tables exist (getDb() creates them)
  process.env.DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "ledger.sqlite");
  const { insertEodRun, updateEodRunStatus, insertEodMetric, insertEodEvent } = await import(
    "../src/lib/eodDb"
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

  const { config: appConfig } = await import("../src/lib/config");
  const { pickKrakenTier } = await import("../src/lib/fees/krakenFees");
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
    const { runSuite } = await import("../src/lib/sim/suiteRunner");
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

  const { applySweep, addFeeUsd } = await import("../src/lib/ledger");
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

  const outRunDir = path.join(process.cwd(), OUT_DIR, runId);
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

  // Trades CSV: from ledger ORDER_FILLED events if available
  const { getEvents } = await import("../src/lib/ledger");
  const events = getEvents(2000);
  const filled = events.filter((e) => e.type === "ORDER_FILLED");
  const csvRows: string[] = ["ts,orderId,pair,side,qty,px,is_maker,fee_usd,fee_rate_bps,fee_tier_label"];
  for (const e of filled) {
    const d = e.data as { ts?: number; orderId?: string; pair?: string; side?: string; qty?: number; px?: number; feeUsd?: number; fee_usd?: number; is_maker?: boolean; liquidity?: string; fee_rate_bps?: number; fee_tier_label?: string };
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

  const latestDir = path.join(process.cwd(), OUT_DIR, LATEST_DIR);
  fs.mkdirSync(latestDir, { recursive: true });
  for (const name of ["summary.json", "report.md", "trades.csv"]) {
    fs.copyFileSync(path.join(outRunDir, name), path.join(latestDir, name));
  }

  if (!ci) {
    console.log(`EOD ${status} — runId ${runId}`);
    console.log(`Artifacts: ${outRunDir}`);
  }

  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
