import { getDb } from "./db";
import { nowMs } from "./time";

export interface LedgerEvent {
  id: number;
  ts: number;
  type: string;
  data: unknown;
}

export function logEvent(type: string, data: unknown): void {
  const db = getDb();
  const ts = nowMs();
  const dataStr = JSON.stringify(data ?? {});
  db.prepare("INSERT INTO events (ts, type, data) VALUES (?, ?, ?)").run(
    ts,
    type,
    dataStr
  );
}

export function getEvents(limit = 200): LedgerEvent[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, ts, type, data FROM events ORDER BY id DESC LIMIT ?"
    )
    .all(limit) as Array<{ id: number; ts: number; type: string; data: string }>;
  return rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    type: r.type,
    data: (() => {
      try {
        return JSON.parse(r.data) as unknown;
      } catch {
        return r.data;
      }
    })(),
  }));
}

export interface SnapshotRow {
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

export function insertSnapshot(row: Omit<SnapshotRow, "id">): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO snapshots (ts, source, scenario, mid, bid, ask, spread, spreadBps, xrp, avgPx, realizedUsd, unrealizedUsd, equityUsd, drawdownPct, ticks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.ts,
    row.source,
    row.scenario ?? null,
    row.mid,
    row.bid,
    row.ask,
    row.spread,
    row.spreadBps,
    row.xrp,
    row.avgPx,
    row.realizedUsd,
    row.unrealizedUsd,
    row.equityUsd,
    row.drawdownPct,
    row.ticks
  );
}

export function getSnapshots(options: { limit?: number; sinceTs?: number }): SnapshotRow[] {
  const db = getDb();
  const limit = Math.min(options.limit ?? 500, 2000);
  let sql = "SELECT id, ts, source, scenario, mid, bid, ask, spread, spreadBps, xrp, avgPx, realizedUsd, unrealizedUsd, equityUsd, drawdownPct, ticks FROM snapshots";
  const params: (number | string)[] = [];
  if (options.sinceTs != null) {
    sql += " WHERE ts >= ?";
    params.push(options.sinceTs);
  }
  sql += " ORDER BY ts DESC LIMIT ?";
  params.push(limit);
  const rows = db.prepare(sql).all(...params) as SnapshotRow[];
  return rows.reverse();
}
