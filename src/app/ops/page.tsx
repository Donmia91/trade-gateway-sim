"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Balance {
  currency: string;
  amount: number;
}

interface RunRow {
  run_id: string;
  started_at: string;
  status: string;
  pass: boolean;
  pnl_usd: number;
  trades: number;
  errors: number;
  fees_usd: number;
  maker_count: number;
  taker_count: number;
  swept_to_usd: number;
  usd_balance_after: number;
}

interface KrakenTicker {
  pair: string;
  last: number;
  bid: number;
  ask: number;
  ts: string;
}

export default function OpsPage() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [cumulativeFees24h, setCumulativeFees24h] = useState<number>(0);
  const [ticker, setTicker] = useState<KrakenTicker | null>(null);
  const [tickerError, setTickerError] = useState(false);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    setTickerError(false);
    Promise.all([
      fetch("/api/ops/balance")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => (data != null ? setBalance(data as Balance) : null)),
      fetch("/api/ops/runs?limit=10")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data != null && typeof data === "object" && "runs" in data) {
            const obj = data as { runs: RunRow[]; cumulative_fees_usd_24h?: number };
            setRuns(Array.isArray(obj.runs) ? obj.runs : []);
            setCumulativeFees24h(typeof obj.cumulative_fees_usd_24h === "number" ? obj.cumulative_fees_usd_24h : 0);
          } else {
            setRuns(Array.isArray(data) ? (data as RunRow[]) : []);
          }
        }),
      fetch("/api/kraken/ticker")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data != null && typeof data.last === "number" && typeof data.bid === "number" && typeof data.ask === "number") {
            setTicker(data as KrakenTicker);
          } else {
            setTickerError(true);
          }
        })
        .catch(() => setTickerError(true)),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <>
      <div className="header">
        <div className="header-inner">
          <div className="brand">
            <span className="title">Ops — Ledger &amp; runs</span>
            <span className="sub">
              <Link href="/dash">Dashboard</Link>
              {" · "}
              USD balance &amp; EOD runs
            </span>
          </div>
          <button type="button" className="btn" onClick={refresh}>
            Refresh
          </button>
        </div>
      </div>
      <div className="container">
        {loading && balance === null ? (
          <p className="small">Loading…</p>
        ) : (
          <>
            <div className="row">
              <div className="col-12 col-md-6">
                <div className="card">
                  <h3>USD balance</h3>
                  <div className="metric">
                    {balance != null ? (
                      <span>${balance.amount.toFixed(2)}</span>
                    ) : (
                      <span className="muted">0.00</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-12 col-md-6">
                <div className="card">
                  <h3>Cumulative fees (24h)</h3>
                  <div className="metric">
                    <span>${cumulativeFees24h.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="row">
              <div className="col-12 col-md-6">
                <div className="card">
                  <h3>Kraken BTC/USD</h3>
                  {tickerError || ticker == null ? (
                    <div className="metric">
                      <span className="muted">Unavailable</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: "14px" }}>
                      <div>Last: ${ticker.last.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div>Bid: ${ticker.bid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Ask: ${ticker.ask.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="muted" style={{ fontSize: "12px", marginTop: "4px" }}>
                        {ticker.ts ? new Date(ticker.ts).toLocaleString() : ""}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="row">
              <div className="col-12">
                <div className="card">
                  <h3>Last 10 EOD runs</h3>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Started</th>
                          <th>Status</th>
                          <th>PnL (USD)</th>
                          <th>Trades</th>
                          <th>Errors</th>
                          <th>Fees</th>
                          <th>Maker / Taker</th>
                          <th>Swept</th>
                          <th>USD after</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="muted">
                              No EOD runs yet. Run <code>pnpm eod:smoke</code> or{" "}
                              <code>pnpm eod</code>.
                            </td>
                          </tr>
                        ) : (
                          runs.map((r) => (
                            <tr key={r.run_id}>
                              <td>{new Date(r.started_at).toLocaleString()}</td>
                              <td>
                                <span className={r.pass ? "ok" : "danger"}>
                                  {r.status}
                                </span>
                              </td>
                              <td>${r.pnl_usd.toFixed(2)}</td>
                              <td>{r.trades}</td>
                              <td>{r.errors}</td>
                              <td>${(r.fees_usd ?? 0).toFixed(2)}</td>
                              <td>{(r.maker_count ?? 0)} / {(r.taker_count ?? 0)}</td>
                              <td>${(r.swept_to_usd ?? 0).toFixed(2)}</td>
                              <td>${(r.usd_balance_after ?? 0).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
