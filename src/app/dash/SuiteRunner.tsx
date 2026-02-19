"use client";

import { useState } from "react";
import type { SimStatus } from "./StatsCards";

export function SuiteRunner({
  status,
  onAction,
}: {
  status: SimStatus;
  onAction: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{
    startEquityUsd: number;
    endEquityUsd: number;
    pnlUsd: number;
    maxDrawdownPct: number;
    tradeCount: number;
    feesTotalUsd: number;
  } | null>(null);

  async function runSuite() {
    setLoading(true);
    setSummary(null);
    try {
      const res = await fetch("/api/sim/run-suite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickMs: 250 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.ok && data.summary) setSummary(data.summary);
      onAction();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const suite = status.suite;

  return (
    <section>
      <h3>Suite runner</h3>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn primary"
          disabled={status.running || loading}
          onClick={runSuite}
        >
          {loading ? "Running suite…" : "Run Suite"}
        </button>
        {suite?.running && (
          <span className="pill">
            Step {suite.idx + 1} / {suite.plan?.length ?? 0}
          </span>
        )}
      </div>
      {summary && (
        <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--muted)" }}>
          <div>Start: ${summary.startEquityUsd.toFixed(2)} → End: ${summary.endEquityUsd.toFixed(2)}</div>
          <div>PnL: ${summary.pnlUsd.toFixed(2)} · Drawdown: {summary.maxDrawdownPct.toFixed(2)}%</div>
          <div>Trades: {summary.tradeCount} · Fees: ${summary.feesTotalUsd.toFixed(2)}</div>
        </div>
      )}
    </section>
  );
}
