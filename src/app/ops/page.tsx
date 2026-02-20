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
  swept_to_usd: number;
  usd_balance_after: number;
}

export default function OpsPage() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    Promise.all([
      fetch("/api/ops/balance")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => (data != null ? setBalance(data as Balance) : null)),
      fetch("/api/ops/runs?limit=10")
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setRuns(Array.isArray(data) ? (data as RunRow[]) : [])),
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
                          <th>Swept to USD</th>
                          <th>USD after</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="muted">
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
                              <td>${r.swept_to_usd.toFixed(2)}</td>
                              <td>${r.usd_balance_after.toFixed(2)}</td>
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
