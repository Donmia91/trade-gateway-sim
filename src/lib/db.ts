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
