"use client";

import { useState } from "react";
import type { SimStatus } from "./StatsCards";

const SOURCES = ["SIM", "KRAKEN_PUBLIC", "COINBASE_PUBLIC"] as const;
const SCENARIOS = ["CHOP", "TREND_UP", "PANIC_DOWN", "GAP_UP", "LOW_LIQUIDITY"];

export function SourceSelector({
  status,
  onAction,
}: {
  status: SimStatus;
  onAction: () => void;
}) {
  const [source, setSource] = useState(status.dataSource ?? "SIM");
  const [scenario, setScenario] = useState(status.scenarioName || "CHOP");
  const [pair, setPair] = useState(status.livePair ?? "BTC/USD");
  const [loading, setLoading] = useState(false);

  async function apply() {
    if (status.running) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sim/set-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          scenario: source === "SIM" ? scenario : undefined,
          pair,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onAction();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h3>Data source</h3>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "8px" }}>
        <label className="small" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          Source
          <select
            className="select"
            value={source}
            onChange={(e) => setSource(e.target.value as typeof source)}
            disabled={status.running}
            style={{ minWidth: "140px" }}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s === "SIM" ? "SIM" : s === "KRAKEN_PUBLIC" ? "Kraken Public" : "Coinbase Public"}
              </option>
            ))}
          </select>
        </label>
        {source === "SIM" && (
          <label className="small" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            Scenario
            <select
              className="select"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              disabled={status.running}
              style={{ minWidth: "140px" }}
            >
              {SCENARIOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="small" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          Pair
          <input
            type="text"
            className="input"
            value={pair}
            onChange={(e) => setPair(e.target.value)}
            disabled={status.running}
            style={{ width: "90px" }}
          />
        </label>
        <button
          type="button"
          className="btn primary"
          disabled={status.running || loading}
          onClick={apply}
        >
          {loading ? "…" : "Apply"}
        </button>
      </div>
    </section>
  );
}
