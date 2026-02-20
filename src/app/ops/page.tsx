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

interface KrakenBalanceRow {
  asset: string;
  amount: number;
}

interface PaperSnapshot {
  accountId: string;
  balances: { currency: string; amount: number }[];
  position: { base_ccy: string; qty: number; avg_entry: number } | null;
  stats: Record<string, number>;
  lastFills: Array<{
    id: string;
    ts: string;
    side: string;
    qty: number;
    price: number;
    notional: number;
    fee_usd: number;
    liquidity: string;
    realized_pnl_usd: number;
  }>;
  market: { bid: number; ask: number; last: number; ts: string } | null;
  unrealizedPnlUsd: number;
}

export default function OpsPage() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [cumulativeFees24h, setCumulativeFees24h] = useState<number>(0);
  const [ticker, setTicker] = useState<KrakenTicker | null>(null);
  const [tickerError, setTickerError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eodSmokeLoading, setEodSmokeLoading] = useState(false);
  const [eodSmokeError, setEodSmokeError] = useState<string | null>(null);
  const [krakenBalances, setKrakenBalances] = useState<KrakenBalanceRow[]>([]);
  const [krakenBalanceLoading, setKrakenBalanceLoading] = useState(false);
  const [krakenBalanceError, setKrakenBalanceError] = useState<string | null>(null);
  const [paperAccountId, setPaperAccountId] = useState<string>("");
  const [paperSnapshot, setPaperSnapshot] = useState<PaperSnapshot | null>(null);
  const [paperInitLoading, setPaperInitLoading] = useState(false);
  const [paperOrderLoading, setPaperOrderLoading] = useState(false);
  const [paperSnapshotLoading, setPaperSnapshotLoading] = useState(false);
  const [paperCloseoutLoading, setPaperCloseoutLoading] = useState(false);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [paperOrderQty, setPaperOrderQty] = useState("");

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

  async function runEodSmoke() {
    setEodSmokeError(null);
    setEodSmokeLoading(true);
    try {
      const res = await fetch("/api/ops/run-eod-smoke", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEodSmokeError(data.error || data.message || `HTTP ${res.status}`);
        return;
      }
      refresh();
    } catch (e) {
      setEodSmokeError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setEodSmokeLoading(false);
    }
  }

  async function refreshKrakenBalances() {
    setKrakenBalanceError(null);
    setKrakenBalanceLoading(true);
    try {
      const res = await fetch("/api/ops/kraken-balance");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setKrakenBalanceError(data.message || data.error || `HTTP ${res.status}`);
        setKrakenBalances([]);
        return;
      }
      setKrakenBalances(Array.isArray(data.balances) ? data.balances : []);
    } catch (e) {
      setKrakenBalanceError(e instanceof Error ? e.message : "Request failed");
      setKrakenBalances([]);
    } finally {
      setKrakenBalanceLoading(false);
    }
  }

  async function paperInit() {
    setPaperError(null);
    setPaperInitLoading(true);
    try {
      const res = await fetch("/api/paper/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialUsd: 10000 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPaperError(data.error || `HTTP ${res.status}`);
        return;
      }
      if (data.accountId) {
        setPaperAccountId(data.accountId);
        paperFetchSnapshot(data.accountId);
      }
    } catch (e) {
      setPaperError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPaperInitLoading(false);
    }
  }

  async function paperFetchSnapshot(accountId: string) {
    if (!accountId) return;
    setPaperSnapshotLoading(true);
    setPaperError(null);
    try {
      const res = await fetch(`/api/paper/snapshot?accountId=${encodeURIComponent(accountId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPaperError(data.error || `HTTP ${res.status}`);
        return;
      }
      setPaperSnapshot(data as PaperSnapshot);
    } catch (e) {
      setPaperError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPaperSnapshotLoading(false);
    }
  }

  async function paperOrder(side: "buy" | "sell") {
    const qty = parseFloat(paperOrderQty);
    if (!paperAccountId || !Number.isFinite(qty) || qty <= 0) {
      setPaperError("Set account and positive BTC qty");
      return;
    }
    setPaperError(null);
    setPaperOrderLoading(true);
    try {
      const res = await fetch("/api/paper/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: paperAccountId, side, qtyBtc: qty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPaperError(data.error || `HTTP ${res.status}`);
        return;
      }
      if (data.snapshot) setPaperSnapshot(data.snapshot as PaperSnapshot);
      setPaperOrderQty("");
      refresh();
    } catch (e) {
      setPaperError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPaperOrderLoading(false);
    }
  }

  async function paperCloseout() {
    if (!paperAccountId) {
      setPaperError("Init paper account first");
      return;
    }
    setPaperError(null);
    setPaperCloseoutLoading(true);
    try {
      const res = await fetch("/api/paper/closeout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: paperAccountId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPaperError(data.error || `HTTP ${res.status}`);
        return;
      }
      if (data.snapshot) setPaperSnapshot(data.snapshot as PaperSnapshot);
      refresh();
    } catch (e) {
      setPaperError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPaperCloseoutLoading(false);
    }
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
        <div className="card controls-card">
          <h3>Controls</h3>
          <div className="controls-row">
            <button type="button" className="btn" onClick={refresh} disabled={loading}>
              Refresh
            </button>
            <button
              type="button"
              className="btn"
              onClick={runEodSmoke}
              disabled={eodSmokeLoading}
            >
              {eodSmokeLoading ? "Running…" : "Run EOD Smoke (Sim)"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={refreshKrakenBalances}
              disabled={krakenBalanceLoading}
            >
              {krakenBalanceLoading ? "Loading…" : "Refresh Kraken Balances"}
            </button>
          </div>
          {eodSmokeError && <p className="error-msg">{eodSmokeError}</p>}
          {krakenBalanceError && <p className="error-msg">{krakenBalanceError}</p>}
        </div>
        <div className="card">
          <h3>Paper trading (Kraken market data, fake funds)</h3>
          <div className="controls-row">
            <button type="button" className="btn" onClick={paperInit} disabled={paperInitLoading}>
              {paperInitLoading ? "Creating…" : "Init paper acct (10k USD)"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => paperAccountId && paperFetchSnapshot(paperAccountId)}
              disabled={!paperAccountId || paperSnapshotLoading}
            >
              {paperSnapshotLoading ? "Loading…" : "Refresh snapshot"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => paperCloseout()}
              disabled={!paperAccountId || paperCloseoutLoading}
            >
              {paperCloseoutLoading ? "Closing…" : "Closeout + Sweep"}
            </button>
          </div>
          <div className="controls-row" style={{ alignItems: "center", marginTop: 8 }}>
            <label>
              Account:{" "}
              <input
                type="text"
                className="input"
                value={paperAccountId}
                onChange={(e) => setPaperAccountId(e.target.value)}
                placeholder="Init to create"
                style={{ width: 280 }}
              />
            </label>
            <label>
              BTC qty:{" "}
              <input
                type="number"
                className="input"
                value={paperOrderQty}
                onChange={(e) => setPaperOrderQty(e.target.value)}
                placeholder="0.001"
                min="0"
                step="any"
                style={{ width: 100 }}
              />
            </label>
            <button
              type="button"
              className="btn primary"
              onClick={() => paperOrder("buy")}
              disabled={!paperAccountId || paperOrderLoading}
            >
              Market Buy
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => paperOrder("sell")}
              disabled={!paperAccountId || paperOrderLoading}
            >
              Market Sell
            </button>
          </div>
          {paperError && <p className="error-msg">{paperError}</p>}
          {paperSnapshot && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <div className="row">
                <div className="col-12 col-md-6">
                  <strong>Balances:</strong>{" "}
                  {paperSnapshot.balances.map((b) => (
                    <span key={b.currency}>
                      {b.currency} {b.amount.toFixed(4)}{" "}
                    </span>
                  ))}
                </div>
                <div className="col-12 col-md-6">
                  <strong>Position:</strong>{" "}
                  {paperSnapshot.position && paperSnapshot.position.qty !== 0
                    ? `${paperSnapshot.position.qty} ${paperSnapshot.position.base_ccy} @ avg ${paperSnapshot.position.avg_entry.toFixed(2)}`
                    : "—"}
                </div>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <div className="col-12 col-md-6">
                  <strong>Realized PnL:</strong> ${(paperSnapshot.stats.realized_pnl_usd ?? 0).toFixed(2)} ·{" "}
                  <strong>Unrealized PnL:</strong> ${(paperSnapshot.unrealizedPnlUsd ?? 0).toFixed(2)} ·{" "}
                  <strong>Fees paid:</strong> ${(paperSnapshot.stats.fees_paid_usd ?? 0).toFixed(2)}
                </div>
                <div className="col-12 col-md-6">
                  <strong>Volume 30d (USD):</strong> {(paperSnapshot.stats.volume_30d_usd ?? 0).toFixed(0)}
                </div>
              </div>
              {paperSnapshot.market && (
                <p className="muted" style={{ marginTop: 4 }}>
                  Bid: ${paperSnapshot.market.bid.toFixed(2)} · Ask: ${paperSnapshot.market.ask.toFixed(2)} · Last: ${paperSnapshot.market.last.toFixed(2)}
                </p>
              )}
              <div style={{ marginTop: 8 }}>
                <strong>Last fills</strong>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Side</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Notional</th>
                        <th>Fee</th>
                        <th>Realized PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paperSnapshot.lastFills.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="muted">No fills yet</td>
                        </tr>
                      ) : (
                        paperSnapshot.lastFills.slice(0, 10).map((f) => (
                          <tr key={f.id}>
                            <td>{new Date(f.ts).toLocaleString()}</td>
                            <td>{f.side}</td>
                            <td>{f.qty.toFixed(6)}</td>
                            <td>${f.price.toFixed(2)}</td>
                            <td>${f.notional.toFixed(2)}</td>
                            <td>${f.fee_usd.toFixed(2)}</td>
                            <td>${f.realized_pnl_usd.toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
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
            <div className="row">
              <div className="col-12">
                <div className="card">
                  <h3>Kraken Balances (read-only)</h3>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {krakenBalances.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="muted">
                              Click &quot;Refresh Kraken Balances&quot; to load.
                            </td>
                          </tr>
                        ) : (
                          krakenBalances.map((b) => (
                            <tr key={b.asset}>
                              <td>{b.asset}</td>
                              <td>{b.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</td>
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
