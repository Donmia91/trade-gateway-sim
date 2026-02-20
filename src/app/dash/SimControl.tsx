"use client";

import { useState } from "react";
import type { SimStatus } from "./StatsCards";

const SCENARIOS = [
  "CHOP",
  "TREND_UP",
  "PANIC_DOWN",
  "GAP_UP",
  "LOW_LIQUIDITY",
];

export function SimControl({
  status,
  onAction,
}: {
  status: SimStatus;
  onAction: () => void;
}) {
  const [scenario, setScenario] = useState(status.scenarioName);
  const [tickMs, setTickMs] = useState("250");
  const [loading, setLoading] = useState<string | null>(null);

  async function doPost(url: string, body?: object) {
    setLoading(url);
    try {
      const startBody =
        url === "/api/sim/start" && body
          ? {
              ...body,
              source: status.dataSource ?? "SIM",
              pair: status.livePair ?? "BTC/USD",
            }
          : body;
      const res = await fetch(url, {
        method: "POST",
        headers: startBody ? { "Content-Type": "application/json" } : undefined,
        body: startBody ? JSON.stringify(startBody) : undefined,
      });
      if (!res.ok) throw new Error(await res.text());
      onAction();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(null);
    }
  }

  return (
    <section style={{ marginTop: "12px" }}>
      <h3>Controls</h3>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
        <label className="small" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          Scenario
          <select
            className="select"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            disabled={status.running}
            style={{ minWidth: "120px" }}
          >
            {SCENARIOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="small" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          TickMs
          <input
            type="number"
            className="input"
            min={100}
            max={2000}
            step={50}
            value={tickMs}
            onChange={(e) => setTickMs(e.target.value)}
            disabled={status.running}
            style={{ width: "80px" }}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn primary"
          disabled={status.running || loading !== null}
          onClick={() =>
            doPost("/api/sim/start", {
              scenario,
              tickMs: parseInt(tickMs, 10) || 250,
            })
          }
        >
          {loading === "/api/sim/start" ? "…" : "Start"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!status.running || loading !== null}
          onClick={() => doPost("/api/sim/stop")}
        >
          {loading === "/api/sim/stop" ? "…" : "Stop"}
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={loading !== null}
          onClick={() => doPost("/api/sim/kill")}
        >
          Kill
        </button>
        <button
          type="button"
          className="btn"
          disabled={loading !== null}
          onClick={() => doPost("/api/sim/unkill")}
        >
          Unkill
        </button>
      </div>
    </section>
  );
}
