import { logEvent, getEvents } from "../ledger";
import { getStatus, simState, type SuiteStep } from "./state";
import * as simEngine from "./simEngine";

const DEFAULT_PLAN: SuiteStep[] = [
  { mode: "SIM", scenario: "CHOP", durationSec: 15 * 60 },
  { mode: "SIM", scenario: "TREND_UP", durationSec: 15 * 60 },
  { mode: "SIM", scenario: "PANIC_DOWN", durationSec: 15 * 60 },
];

export interface SuiteSummary {
  startEquityUsd: number;
  endEquityUsd: number;
  pnlUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  maxDrawdownPct: number;
  tradeCount: number;
  feesTotalUsd: number;
  maker_trades: number;
  taker_trades: number;
  maker_fees_usd: number;
  taker_fees_usd: number;
}

export async function runSuite(
  plan: SuiteStep[] = DEFAULT_PLAN,
  tickMs?: number
): Promise<{ ok: true; summary: SuiteSummary; plan: SuiteStep[] }> {
  await simEngine.stop();

  const startStatus = getStatus();
  let startEquityUsd = startStatus.pnl.equityUsd;
  let startRealizedUsd = startStatus.pnl.realizedUsd;
  let maxDrawdownPct = 0;
  let tradeCount = 0;
  let feesTotalUsd = 0;
  let maker_trades = 0;
  let taker_trades = 0;
  let maker_fees_usd = 0;
  let taker_fees_usd = 0;

  simState.suite = {
    running: true,
    plan,
    idx: 0,
    startedAt: Date.now(),
  };
  logEvent("SUITE_STARTED", { plan: plan.map((p) => ({ mode: p.mode, scenario: "scenario" in p ? p.scenario : undefined, durationSec: p.durationSec })) });

  for (let idx = 0; idx < plan.length; idx++) {
    const step = plan[idx];
    simState.suite = { ...simState.suite!, idx, startedAt: Date.now() };
    logEvent("SUITE_STEP", { idx, step: step.mode, scenario: "scenario" in step ? step.scenario : undefined, durationSec: step.durationSec });

    simState.dataSource = step.mode;
    if (step.mode === "SIM" && "scenario" in step) {
      simState.scenarioName = step.scenario;
      await simEngine.start({
        scenario: step.scenario,
        tickMs,
        source: "SIM",
      });
    } else if (step.mode === "KRAKEN_PUBLIC" || step.mode === "COINBASE_PUBLIC") {
      await simEngine.start({
        source: step.mode,
        pair: simState.livePair,
      });
    }

    if (idx === 0) {
      const s = getStatus();
      startEquityUsd = s.pnl.equityUsd;
      startRealizedUsd = s.pnl.realizedUsd;
    }

    await new Promise<void>((resolve) => {
      const durationMs = step.durationSec * 1000;
      simState.suiteTimeoutId = setTimeout(resolve, durationMs);
    });

    await simEngine.stop();
    const after = getStatus();
    if (after.drawdownPct > maxDrawdownPct) maxDrawdownPct = after.drawdownPct;
  }

  const endStatus = getStatus();
  const events = getEvents(2000);
  for (const ev of events) {
    if (ev.type === "ORDER_FILLED") {
      tradeCount++;
      const d = ev.data as { feeUsd?: number; fee_usd?: number; liquidity?: "maker" | "taker" };
      const fee = typeof d?.feeUsd === "number" ? d.feeUsd : typeof d?.fee_usd === "number" ? d.fee_usd : 0;
      feesTotalUsd += fee;
      const liq = d?.liquidity === "maker" ? "maker" : "taker";
      if (liq === "maker") {
        maker_trades++;
        maker_fees_usd += fee;
      } else {
        taker_trades++;
        taker_fees_usd += fee;
      }
    }
  }

  const summary: SuiteSummary = {
    startEquityUsd,
    endEquityUsd: endStatus.pnl.equityUsd,
    pnlUsd: endStatus.pnl.equityUsd - startEquityUsd,
    realizedPnlUsd: endStatus.pnl.realizedUsd - startRealizedUsd,
    unrealizedPnlUsd: endStatus.pnl.unrealizedUsd,
    maxDrawdownPct,
    tradeCount,
    feesTotalUsd,
    maker_trades,
    taker_trades,
    maker_fees_usd,
    taker_fees_usd,
  };

  simState.suite = { ...simState.suite!, running: false };
  logEvent("SUITE_DONE", { summary });

  return { ok: true, summary, plan };
}

export function getDefaultPlan(): SuiteStep[] {
  return [...DEFAULT_PLAN];
}
