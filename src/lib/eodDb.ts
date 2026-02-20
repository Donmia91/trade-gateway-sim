/**
 * EOD pipeline persistence: runs, metrics, events (no ledger).
 */
import { getDb } from "./db";

export function insertEodRun(params: {
  id: string;
  started_at: string;
  git_sha: string | null;
  seed: number | null;
  config_json: string;
  node_version: string;
  status: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO eod_runs (id, started_at, git_sha, seed, config_json, node_version, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.started_at,
    params.git_sha,
    params.seed,
    params.config_json,
    params.node_version,
    params.status
  );
}

export function updateEodRunStatus(id: string, status: string): void {
  const db = getDb();
  db.prepare("UPDATE eod_runs SET status = ? WHERE id = ?").run(status, id);
}

export function insertEodMetric(run_id: string, key: string, value: number): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO eod_metrics (run_id, key, value) VALUES (?, ?, ?)"
  ).run(run_id, key, value);
}

export function insertEodEvent(
  run_id: string,
  level: string,
  message: string,
  ts?: string
): void {
  const db = getDb();
  const t = ts ?? new Date().toISOString();
  db.prepare(
    "INSERT INTO eod_events (run_id, level, message, ts) VALUES (?, ?, ?, ?)"
  ).run(run_id, level, message, t);
}

export interface EodRunRow {
  id: string;
  started_at: string;
  git_sha: string | null;
  seed: number | null;
  config_json: string;
  node_version: string;
  status: string;
}

export function getEodRuns(limit: number): EodRunRow[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, started_at, git_sha, seed, config_json, node_version, status FROM eod_runs ORDER BY started_at DESC LIMIT ?"
    )
    .all(Math.min(limit, 100)) as EodRunRow[];
}

export function getEodMetrics(run_id: string): Record<string, number> {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, value FROM eod_metrics WHERE run_id = ?")
    .all(run_id) as Array<{ key: string; value: number }>;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}
