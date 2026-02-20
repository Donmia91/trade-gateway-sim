"use client";

export interface SimStatus {
  running: boolean;
  scenarioName: string;
  startedAt: number;
  ticks: number;
  lastTickTs: number;
  lastPrice: number;
  lastTop: {
    bid: number;
    ask: number;
    mid: number;
    spread: number;
    spreadBps: number;
    ts: number;
  } | null;
  pnl: { realizedUsd: number; unrealizedUsd: number; equityUsd: number };
  position: { xrp: number; avgPx: number };
  killSwitch: boolean;
  paperMode: boolean;
  tradingEnabled: boolean;
  dataSource?: string;
  livePair?: string;
  suite?: { running: boolean; plan: unknown[]; idx: number; startedAt: number };
  peakEquityUsd?: number;
  drawdownPct?: number;
}

export function StatsCards({ status }: { status: SimStatus }) {
  const dataAge =
    status.lastTickTs > 0 ? Date.now() - status.lastTickTs : null;
  const runtimeSec =
    status.startedAt > 0 && status.running
      ? Math.floor((Date.now() - status.startedAt) / 1000)
      : 0;

  return (
    <>
      <div className="col-3">
        <div className="card">
          <h3>Mid / Spread</h3>
          <div className="metric">
            {status.lastTop ? status.lastTop.mid.toFixed(4) : "—"}
          </div>
          <div className="small">
            {status.lastTop ? `${status.lastTop.spreadBps.toFixed(1)} bps` : "—"}
          </div>
        </div>
      </div>
      <div className="col-3">
        <div className="card">
          <h3>Equity</h3>
          <div className="metric">{status.pnl.equityUsd.toFixed(2)}</div>
          <div className="small">
            {status.drawdownPct != null
              ? `Drawdown ${status.drawdownPct.toFixed(2)}%`
              : "USD"}
          </div>
        </div>
      </div>
      <div className="col-3">
        <div className="card">
          <h3>Ticks / Runtime</h3>
          <div className="metric">{status.ticks}</div>
          <div className="small">{runtimeSec}s · age {dataAge ?? "—"}ms</div>
        </div>
      </div>
      <div className="col-3">
        <div className="card">
          <h3>Position</h3>
          <div className="metric">{status.position.xrp.toFixed(4)} {(status.livePair ?? "BTC/USD").split("/")[0]}</div>
          <div className="small">
            {status.position.avgPx > 0
              ? `avg ${status.position.avgPx.toFixed(4)}`
              : status.dataSource ?? "—"}
          </div>
        </div>
      </div>
    </>
  );
}
