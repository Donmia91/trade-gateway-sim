"use client";

import { useState, useEffect } from "react";

interface SnapshotRow {
  id: number;
  ts: number;
  source: string;
  scenario: string | null;
  mid: number;
  bid: number;
  ask: number;
  spread: number;
  spreadBps: number;
  xrp: number;
  avgPx: number;
  realizedUsd: number;
  unrealizedUsd: number;
  equityUsd: number;
  drawdownPct: number;
  ticks: number;
}

export function SnapshotChart() {
  const [rows, setRows] = useState<SnapshotRow[]>([]);

  useEffect(() => {
    function fetchSnapshots() {
      fetch("/api/sim/snapshots?limit=100")
        .then((r) => r.json())
        .then(setRows)
        .catch(console.error);
    }
    fetchSnapshots();
    const interval = setInterval(fetchSnapshots, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section>
      <h3>Snapshots (last 100)</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>ts</th>
              <th>source</th>
              <th>mid</th>
              <th>spreadBps</th>
              <th>equityUsd</th>
              <th>drawdownPct</th>
              <th>ticks</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(-50).map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.ts).toISOString().slice(11, 19)}</td>
                <td>{r.source}</td>
                <td>{r.mid.toFixed(4)}</td>
                <td>{r.spreadBps.toFixed(1)}</td>
                <td>{r.equityUsd.toFixed(2)}</td>
                <td>{r.drawdownPct.toFixed(2)}%</td>
                <td>{r.ticks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
