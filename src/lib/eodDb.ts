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
