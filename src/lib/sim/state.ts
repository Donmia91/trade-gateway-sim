import type { BookTop } from "../broker/types";
import type { DataSourceKind } from "../marketdata/types";
import type { MarketTick } from "../marketdata/types";
import { config } from "../config";

export interface PnlSnapshot {
  realizedUsd: number;
  unrealizedUsd: number;
  equityUsd: number;
}

export interface PositionSnapshot {
  xrp: number;
  avgPx: number;
}

export type SuiteStep =
  | { mode: "SIM"; scenario: string; durationSec: number }
  | { mode: "KRAKEN_PUBLIC" | "COINBASE_PUBLIC"; durationSec: number };

export interface SuiteState {
  running: boolean;
  plan: SuiteStep[];
  idx: number;
  startedAt: number;
}

export interface SimStatus {
  running: boolean;
  scenarioName: string;
  startedAt: number;
  ticks: number;
  lastTickTs: number;
  lastPrice: number;
  lastTop: BookTop | null;
  pnl: PnlSnapshot;
  position: PositionSnapshot;
  killSwitch: boolean;
  paperMode: boolean;
  tradingEnabled: boolean;
  dataSource: DataSourceKind;
  livePair: string;
  suite?: SuiteState;
  peakEquityUsd: number;
  drawdownPct: number;
  lastMarketTick?: MarketTick;
}

const defaultPnl: PnlSnapshot = {
  realizedUsd: 0,
  unrealizedUsd: 0,
  equityUsd: 0,
};

const defaultPosition: PositionSnapshot = {
  xrp: 0,
  avgPx: 0,
};

const defaultTop: BookTop = {
  bid: 0,
  ask: 0,
  mid: 0,
  spread: 0,
  spreadBps: 0,
  ts: 0,
};

export const simState: {
  running: boolean;
  scenarioName: string;
  startedAt: number;
  ticks: number;
  lastTickTs: number;
  lastPrice: number;
  lastTop: BookTop | null;
  pnl: PnlSnapshot;
  position: PositionSnapshot;
  killSwitch: boolean;
  paperMode: boolean;
  tradingEnabled: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
  dataSource: DataSourceKind;
  livePair: string;
  suite?: SuiteState;
  peakEquityUsd: number;
  drawdownPct: number;
  lastMarketTick?: MarketTick;
  snapshotIntervalId: ReturnType<typeof setInterval> | null;
  suiteTimeoutId: ReturnType<typeof setTimeout> | null;
} = {
  running: false,
  scenarioName: "CHOP",
  startedAt: 0,
  ticks: 0,
  lastTickTs: 0,
  lastPrice: 0,
  lastTop: null,
  pnl: { ...defaultPnl },
  position: { ...defaultPosition },
  killSwitch: config.KILL_SWITCH,
  paperMode: config.PAPER_MODE,
  tradingEnabled: config.TRADING_ENABLED,
  intervalId: null,
  dataSource: config.DATA_SOURCE,
  livePair: config.LIVE_PAIR,
  peakEquityUsd: 0,
  drawdownPct: 0,
  snapshotIntervalId: null,
  suiteTimeoutId: null,
};

export function resetPnlAndPosition(): void {
  simState.pnl = { ...defaultPnl };
  simState.position = { ...defaultPosition };
  simState.peakEquityUsd = 0;
  simState.drawdownPct = 0;
}

export function setKillSwitch(on: boolean): void {
  simState.killSwitch = on;
}

export function getStatus(): SimStatus {
  return {
    running: simState.running,
    scenarioName: simState.scenarioName,
    startedAt: simState.startedAt,
    ticks: simState.ticks,
    lastTickTs: simState.lastTickTs,
    lastPrice: simState.lastPrice,
    lastTop: simState.lastTop ? { ...simState.lastTop } : null,
    pnl: { ...simState.pnl },
    position: { ...simState.position },
    killSwitch: simState.killSwitch,
    paperMode: simState.paperMode,
    tradingEnabled: simState.tradingEnabled,
    dataSource: simState.dataSource,
    livePair: simState.livePair,
    suite: simState.suite ? { ...simState.suite } : undefined,
    peakEquityUsd: simState.peakEquityUsd,
    drawdownPct: simState.drawdownPct,
    lastMarketTick: simState.lastMarketTick ? { ...simState.lastMarketTick } : undefined,
  };
}
