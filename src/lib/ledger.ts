import { randomUUID } from "crypto";
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

// --- USD balance & sweep (EOD run_id = eod_runs.id) ---

export async function ensureBalance(currency: string): Promise<void> {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO balances (currency, amount) VALUES (?, 0)").run(currency);
}

export async function getBalance(currency: string): Promise<number> {
  const db = getDb();
  const row = db.prepare("SELECT amount FROM balances WHERE currency = ?").get(currency) as
    | { amount: number }
    | undefined;
  return row?.amount ?? 0;
}

export interface LedgerEntryInput {
  id?: string;
  run_id: string;
  ts?: string;
  type: string;
  currency: string;
  delta: number;
  note?: string | null;
}

export async function addLedgerEntry(entry: LedgerEntryInput): Promise<void> {
  const db = getDb();
  const id = entry.id ?? randomUUID();
  const ts = entry.ts ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO ledger_entries (id, run_id, ts, type, currency, delta, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    entry.run_id,
    ts,
    entry.type,
    entry.currency,
    entry.delta,
    entry.note ?? null
  );
}

/** Record a fee as a ledger entry (type FEE_USD, delta negative). */
export async function addFee(
  runId: string,
  feeUsd: number,
  note?: string
): Promise<void> {
  const value = Number.isFinite(feeUsd) ? feeUsd : 0;
  if (value <= 0) return;
  await addLedgerEntry({
    run_id: runId,
    type: "FEE_USD",
    currency: "USD",
    delta: -value,
    note: note ?? `Kraken fees for run ${runId}`,
  });
}

export interface SweepResult {
  before: number;
  after: number;
  swept: number;
}

export interface LedgerEntryRow {
  id: string;
  run_id: string;
  ts: string;
  type: string;
  currency: string;
  delta: number;
  note: string | null;
}

export async function getLedgerEntries(limit = 100): Promise<LedgerEntryRow[]> {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, run_id, ts, type, currency, delta, note FROM ledger_entries ORDER BY ts DESC LIMIT ?"
    )
    .all(Math.min(limit, 500)) as LedgerEntryRow[];
  return rows;
}

export async function applySweep(
  runId: string,
  realizedPnlUsd: number
): Promise<SweepResult> {
  await ensureBalance("USD");
  const before = await getBalance("USD");
  if (!(Number.isFinite(realizedPnlUsd) && realizedPnlUsd > 0)) {
    return { before, after: before, swept: 0 };
  }
  const db = getDb();
  const tx = db.transaction((rid: string, delta: number) => {
    const id = randomUUID();
    const ts = new Date().toISOString();
    const note = `EOD sweep run ${rid}`;
    db.prepare(
      "INSERT INTO ledger_entries (id, run_id, ts, type, currency, delta, note) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, rid, ts, "SWEEP_TO_USD", "USD", delta, note);
    db.prepare("UPDATE balances SET amount = amount + ? WHERE currency = ?").run(delta, "USD");
  });
  tx(runId, realizedPnlUsd);
  const after = before + realizedPnlUsd;
  return { before, after, swept: realizedPnlUsd };
}
