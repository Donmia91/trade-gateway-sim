import Database from "better-sqlite3";
import path from "path";
import { config } from "./config";

let db: ReturnType<typeof Database> | null = null;

function getDbPath(): string {
  const p = config.DB_PATH;
  if (path.isAbsolute(p)) return p;
  return path.join(process.cwd(), p);
}

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    try {
      const fs = require("fs");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        source TEXT NOT NULL,
        scenario TEXT,
        mid REAL,
        bid REAL,
        ask REAL,
        spread REAL,
        spreadBps REAL,
        xrp REAL,
        avgPx REAL,
        realizedUsd REAL,
        unrealizedUsd REAL,
        equityUsd REAL,
        drawdownPct REAL,
        ticks INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(ts);
      CREATE TABLE IF NOT EXISTS eod_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        git_sha TEXT,
        seed INTEGER,
        config_json TEXT,
        node_version TEXT,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS eod_metrics (
        run_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value REAL NOT NULL,
        PRIMARY KEY(run_id, key)
      );
      CREATE TABLE IF NOT EXISTS eod_events (
        run_id TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT,
        ts TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_eod_events_run_id ON eod_events(run_id);
    `);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
