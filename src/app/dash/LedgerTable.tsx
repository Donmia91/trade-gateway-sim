"use client";

import { useState, useEffect, useRef } from "react";

interface LedgerEvent {
  id: number;
  ts: number;
  type: string;
  data: unknown;
}

export function LedgerTable() {
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const seenIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    function fetchEvents() {
      fetch("/api/ledger/events?limit=200")
        .then((r) => r.json())
        .then((next: LedgerEvent[]) => {
          const added = new Set<number>();
          for (const ev of next) {
            if (!seenIds.current.has(ev.id)) {
              added.add(ev.id);
            }
            seenIds.current.add(ev.id);
          }
          setNewIds(added);
          setEvents(next);
        })
        .catch(console.error);
    }
    fetchEvents();
    const interval = setInterval(fetchEvents, 1000);
    return () => clearInterval(interval);
  }, []);

  function truncate(data: unknown): string {
    const s = typeof data === "string" ? data : JSON.stringify(data);
    return s.length > 80 ? s.slice(0, 80) + "…" : s;
  }

  return (
    <section>
      <h3>Ledger (last 200, poll 1s)</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>id</th>
              <th>ts</th>
              <th>type</th>
              <th>data</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} className={newIds.has(ev.id) ? "new-row" : ""}>
                <td>{ev.id}</td>
                <td>{new Date(ev.ts).toISOString().slice(11, 23)}</td>
                <td>
                  <span
                    className="pill"
                    style={{
                      fontSize: "10px",
                      padding: "4px 6px",
                      background:
                        ev.type === "RISK_BLOCK" || ev.type === "KILL_SWITCH_ON"
                          ? "rgba(255,77,77,0.2)"
                          : ev.type === "ORDER_FILLED" || ev.type === "POSITION"
                            ? "rgba(47,228,123,0.15)"
                            : undefined,
                    }}
                  >
                    {ev.type}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="code"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      font: "inherit",
                      padding: 0,
                      maxWidth: "100%",
                    }}
                    onClick={() =>
                      setExpandedId(expandedId === ev.id ? null : ev.id)
                    }
                  >
                    {expandedId === ev.id
                      ? JSON.stringify(ev.data, null, 2)
                      : truncate(ev.data)}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
