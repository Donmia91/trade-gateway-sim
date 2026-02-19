import { MockBroker } from "../broker/mockBroker";
import { logEvent, insertSnapshot } from "../ledger";
import { nowMs, elapsedSec } from "../time";
import { config } from "../config";
import { getScenario, listScenarios, type Scenario } from "./scenarios";
import {
  simState,
  getStatus,
  resetPnlAndPosition,
  type SimStatus,
} from "./state";
import { runMomentumLite } from "../strategy/momentumLite";
import * as dataSourceManager from "../marketdata/manager";
import type { MarketTick } from "../marketdata/types";

const DEFAULT_PAIR = "XRP/USD";
const TICK_STALL_THRESHOLD_MS = 3 * 250; // 3 * SIM_TICK_MS default
const SNAPSHOT_LOG_EVERY_N = 6;

let broker: MockBroker | null = null;
let currentScenario: Scenario | null = null;
let snapshotCounter = 0;

function getBroker(): MockBroker {
  if (!broker) {
    broker = new MockBroker({
      mid: 2.5,
      spreadBps: 10,
    });
  }
  return broker;
}

function applyFillsToPositionAndPnl(): void {
  const b = getBroker();
  const fills = b.drainFills();
  for (const f of fills) {
    logEvent("ORDER_FILLED", {
      orderId: f.orderId,
      pair: f.pair,
      side: f.side,
      qty: f.qty,
      px: f.px,
      feeUsd: f.feeUsd,
      ts: f.ts,
    });
    if (f.side === "buy") {
      const prev = simState.position.xrp;
      const prevAvg = simState.position.avgPx;
      const totalQty = prev + f.qty;
      simState.position.xrp = totalQty;
      simState.position.avgPx =
        totalQty > 0
          ? (prev * prevAvg + f.qty * f.px) / totalQty
          : 0;
    } else {
      const realized = f.qty * (f.px - simState.position.avgPx) - f.feeUsd;
      simState.pnl.realizedUsd += realized;
      simState.position.xrp -= f.qty;
      if (simState.position.xrp <= 0) {
        simState.position.avgPx = 0;
      }
    }
  }
  const bal = b.getBalances();
  const mark = simState.lastPrice;
  simState.pnl.unrealizedUsd =
    simState.position.xrp > 0
      ? simState.position.xrp * (mark - simState.position.avgPx)
      : 0;
  simState.pnl.equityUsd = bal.USD + simState.position.xrp * mark;
  if (fills.length > 0) {
    logEvent("POSITION", {
      xrp: simState.position.xrp,
      avgPx: simState.position.avgPx,
      realizedUsd: simState.pnl.realizedUsd,
      unrealizedUsd: simState.pnl.unrealizedUsd,
      equityUsd: simState.pnl.equityUsd,
    });
  }
}

function handleTick(t: MarketTick): void {
  if (!simState.running || !broker) return;

  simState.lastMarketTick = t;
  simState.lastTickTs = t.ts;
  simState.lastPrice = t.mid;
  simState.ticks++;

  const spreadBps = t.mid > 0 ? (t.spread / t.mid) * 10000 : 0;
  broker.setOptions({ mid: t.mid, spreadBps });
  const top = broker.getTop(DEFAULT_PAIR);
  simState.lastTop = top;

  simState.pnl.unrealizedUsd =
    simState.position.xrp > 0
      ? simState.position.xrp * (t.mid - simState.position.avgPx)
      : 0;
  const bal = broker.getBalances();
  simState.pnl.equityUsd = bal.USD + simState.position.xrp * t.mid;

  if (simState.pnl.equityUsd > simState.peakEquityUsd) {
    simState.peakEquityUsd = simState.pnl.equityUsd;
  }
  if (simState.peakEquityUsd > 0) {
    simState.drawdownPct =
      ((simState.peakEquityUsd - simState.pnl.equityUsd) / simState.peakEquityUsd) * 100;
  }

  const tickLogEveryN = config.TICK_LOG_EVERY_N ?? 8;
  if (simState.ticks % tickLogEveryN === 0) {
    logEvent("TICK", {
      ticks: simState.ticks,
      mid: top.mid,
      spreadBps: top.spreadBps,
      ts: top.ts,
      source: t.source,
    });
  }

  try {
    runMomentumLite(top, {
      broker,
      killSwitch: simState.killSwitch,
      positionXrp: simState.position.xrp,
      avgPx: simState.position.avgPx,
    });
  } catch (e) {
    logEvent("RISK_BLOCK", {
      reason: "strategy_error",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  broker.tryFillLimitOrders(top);
  applyFillsToPositionAndPnl();
}

export async function start(options: {
  scenario?: string;
  tickMs?: number;
  source?: "SIM" | "KRAKEN_PUBLIC" | "COINBASE_PUBLIC";
  pair?: string;
}): Promise<SimStatus> {
  if (simState.running) {
    return getStatus();
  }

  const scenarioName = options.scenario ?? "CHOP";
  const kind = options.source ?? simState.dataSource;
  const pair = options.pair ?? simState.livePair ?? DEFAULT_PAIR;

  if (kind === "SIM") {
    const scenario = getScenario(scenarioName);
    if (!scenario) throw new Error(`Unknown scenario: ${scenarioName}`);
    currentScenario = scenario;
    broker = new MockBroker({
      mid: scenario.startPrice,
      spreadBps: scenario.baseSpreadBps,
      slippageFactor: 1 + (1 - scenario.liquidity) * 0.002,
    });
  } else {
    currentScenario = null;
    broker = new MockBroker({
      mid: 2.5,
      spreadBps: 10,
    });
  }

  simState.dataSource = kind;
  simState.livePair = pair;
  simState.scenarioName = kind === "SIM" ? scenarioName : "";
  simState.startedAt = nowMs();
  simState.ticks = 0;
  simState.lastTickTs = 0;
  simState.lastPrice = kind === "SIM" && currentScenario ? currentScenario.startPrice : 0;
  resetPnlAndPosition();
  snapshotCounter = 0;

  const tickMs = options.tickMs ?? config.SIM_TICK_MS;

  logEvent("SIM_STARTED", {
    scenario: scenarioName,
    tickMs,
    dataSource: kind,
    pair,
    maxRuntimeSec: config.SIM_MAX_RUNTIME_SEC,
  });

  dataSourceManager.setDataSource(kind);
  simState.running = true;

  await dataSourceManager.startDataSource(
    pair,
    handleTick,
    (e) => {
      logEvent("RISK_BLOCK", {
        reason: "datasource_error",
        message: e instanceof Error ? e.message : String(e),
      });
    },
    kind === "SIM" ? { scenarioName, tickMs } : undefined
  );

  const stallCheckMs = Math.max(500, tickMs);
  const intervalId = setInterval(() => {
    if (!simState.running) return;
    if (elapsedSec(simState.startedAt) >= config.SIM_MAX_RUNTIME_SEC) {
      stop();
      logEvent("SIM_STOPPED", { reason: "max_runtime" });
      return;
    }
    const sinceTick = nowMs() - simState.lastTickTs;
    if (simState.ticks > 0 && sinceTick > TICK_STALL_THRESHOLD_MS) {
      logEvent("RISK_BLOCK", { reason: "tick_stall", sinceTickMs: sinceTick });
      stop();
    }
  }, stallCheckMs);
  simState.intervalId = intervalId;

  const snapshotIntervalId = setInterval(() => {
    if (!simState.running || !simState.lastTop) return;
    snapshotCounter++;
    const row = {
      ts: nowMs(),
      source: simState.dataSource,
      scenario: simState.scenarioName || null,
      mid: simState.lastTop.mid,
      bid: simState.lastTop.bid,
      ask: simState.lastTop.ask,
      spread: simState.lastTop.spread,
      spreadBps: simState.lastTop.spreadBps,
      xrp: simState.position.xrp,
      avgPx: simState.position.avgPx,
      realizedUsd: simState.pnl.realizedUsd,
      unrealizedUsd: simState.pnl.unrealizedUsd,
      equityUsd: simState.pnl.equityUsd,
      drawdownPct: simState.drawdownPct,
      ticks: simState.ticks,
    };
    insertSnapshot(row);
    if (snapshotCounter % SNAPSHOT_LOG_EVERY_N === 0) {
      logEvent("SNAPSHOT", { n: snapshotCounter, equityUsd: row.equityUsd });
    }
  }, config.SNAPSHOT_EVERY_MS);
  simState.snapshotIntervalId = snapshotIntervalId;

  return getStatus();
}

export async function stop(): Promise<SimStatus> {
  if (simState.intervalId) {
    clearInterval(simState.intervalId);
    simState.intervalId = null;
  }
  if (simState.snapshotIntervalId) {
    clearInterval(simState.snapshotIntervalId);
    simState.snapshotIntervalId = null;
  }
  if (simState.suiteTimeoutId) {
    clearTimeout(simState.suiteTimeoutId);
    simState.suiteTimeoutId = null;
  }
  await dataSourceManager.stopDataSource();
  simState.running = false;
  logEvent("SIM_STOPPED", { reason: "user" });
  return getStatus();
}

export function status(): SimStatus {
  return getStatus();
}

export { getStatus } from "./state";
export { listScenarios, getScenario } from "./scenarios";
export { setDataSource } from "../marketdata/manager";
