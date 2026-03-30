import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import os from "os";
import type { AppSettings } from "./types";

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(os.homedir(), ".weekly-pulse");
const DB_PATH = path.join(DATA_DIR, "weekly-pulse.db");
const SCHEMA_PATH = path.join(process.cwd(), "src/lib/db/schema.sql");

// ─── Singleton ────────────────────────────────────────────────────────────────

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure data directory exists
  fs.mkdirSync(DATA_DIR, { recursive: true });

  _db = new Database(DB_PATH);

  // Performance & integrity settings (same pattern as PM Pulse)
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("synchronous = NORMAL");

  // Apply schema on first run (idempotent — all CREATE IF NOT EXISTS)
  const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
  _db.exec(schema);

  // Migrate existing DBs to support jira/confluence sources
  migrateSourceConstraint(_db);
  // Migrate existing DBs to add completed state for todos
  migrateCompletedColumn(_db);

  return _db;
}

// ─── Migrations ───────────────────────────────────────────────────────────────

/** Recreates log_entries with the updated source CHECK if it's missing email */
function migrateSourceConstraint(db: Database.Database): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='log_entries'")
    .get() as { sql: string } | undefined;

  if (!row || row.sql.includes("'email'")) return; // already up to date

  db.exec(`
    ALTER TABLE log_entries RENAME TO _log_entries_v1;

    CREATE TABLE log_entries (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      content       TEXT    NOT NULL,
      type          TEXT    NOT NULL CHECK (type IN ('highlight', 'lowlight', 'blocker')),
      source        TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'hook', 'calendar', 'jira', 'confluence', 'email')),
      raw_prompt    TEXT,
      calendar_uid  TEXT,
      entry_date    TEXT    NOT NULL,
      week_start    TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO log_entries SELECT * FROM _log_entries_v1;
    DROP TABLE _log_entries_v1;

    CREATE INDEX IF NOT EXISTS idx_log_entries_week_start  ON log_entries (week_start);
    CREATE INDEX IF NOT EXISTS idx_log_entries_entry_date  ON log_entries (entry_date);
    CREATE INDEX IF NOT EXISTS idx_log_entries_type        ON log_entries (type);
    CREATE INDEX IF NOT EXISTS idx_log_entries_source      ON log_entries (source);
  `);
}

/** Adds todo type + completed/completed_at columns if they don't exist yet */
function migrateCompletedColumn(db: Database.Database): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='log_entries'")
    .get() as { sql: string } | undefined;
  if (!row) return;

  const hasTodo = row.sql.includes("'todo'");
  const hasCompleted = row.sql.includes("completed");

  if (hasTodo && hasCompleted) return;

  // Recreate table to update the type CHECK constraint and add completed columns
  db.exec(`
    ALTER TABLE log_entries RENAME TO _log_entries_v2;

    CREATE TABLE log_entries (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      content       TEXT    NOT NULL,
      type          TEXT    NOT NULL CHECK (type IN ('highlight', 'lowlight', 'blocker', 'todo')),
      source        TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'hook', 'calendar', 'jira', 'confluence', 'email')),
      raw_prompt    TEXT,
      calendar_uid  TEXT,
      entry_date    TEXT    NOT NULL,
      week_start    TEXT    NOT NULL,
      completed     INTEGER NOT NULL DEFAULT 0,
      completed_at  TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO log_entries (id, content, type, source, raw_prompt, calendar_uid, entry_date, week_start, created_at, updated_at)
      SELECT id, content, type, source, raw_prompt, calendar_uid, entry_date, week_start, created_at, updated_at
      FROM _log_entries_v2;

    DROP TABLE _log_entries_v2;

    CREATE INDEX IF NOT EXISTS idx_log_entries_week_start  ON log_entries (week_start);
    CREATE INDEX IF NOT EXISTS idx_log_entries_entry_date  ON log_entries (entry_date);
    CREATE INDEX IF NOT EXISTS idx_log_entries_type        ON log_entries (type);
    CREATE INDEX IF NOT EXISTS idx_log_entries_source      ON log_entries (source);
  `);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const SETTING_DEFAULTS: AppSettings = {
  ics_url: "",
  calendar_sync_enabled: false,
  hook_capture_enabled: true,
};

export function loadSettings(): AppSettings {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT key, value FROM settings").all() as {
      key: string;
      value: string;
    }[];
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;

    return {
      ics_url: map.ics_url ?? SETTING_DEFAULTS.ics_url,
      calendar_sync_enabled:
        (map.calendar_sync_enabled ?? "false") === "true",
      hook_capture_enabled:
        (map.hook_capture_enabled ?? "true") === "true",
    };
  } catch {
    return { ...SETTING_DEFAULTS };
  }
}

export function saveSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value);
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/** Returns the Monday of the week containing `date` as YYYY-MM-DD */
export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, …
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Returns YYYY-MM-DD for a given Date */
export function toDateStr(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
