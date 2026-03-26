-- Weekly Pulse Database Schema
-- All timestamps stored as ISO 8601 strings in UTC
-- week_start stored as YYYY-MM-DD (Monday of the week)

CREATE TABLE IF NOT EXISTS log_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  content       TEXT    NOT NULL,
  type          TEXT    NOT NULL CHECK (type IN ('highlight', 'lowlight', 'blocker')),
  source        TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'hook', 'calendar')),
  -- For hook-captured entries: the raw prompt text
  raw_prompt    TEXT,
  -- For calendar entries: the event uid from ICS
  calendar_uid  TEXT,
  -- Date the entry was logged (YYYY-MM-DD local)
  entry_date    TEXT    NOT NULL,
  -- Monday of the week this entry belongs to (YYYY-MM-DD)
  week_start    TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_log_entries_week_start  ON log_entries (week_start);
CREATE INDEX IF NOT EXISTS idx_log_entries_entry_date  ON log_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_log_entries_type        ON log_entries (type);
CREATE INDEX IF NOT EXISTS idx_log_entries_source      ON log_entries (source);

-- Calendar events pulled from ICS feeds
CREATE TABLE IF NOT EXISTS calendar_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  uid           TEXT    NOT NULL,           -- from ICS VEVENT UID
  title         TEXT    NOT NULL,
  start_time    TEXT    NOT NULL,           -- ISO 8601
  end_time      TEXT    NOT NULL,           -- ISO 8601
  attendee_count INTEGER NOT NULL DEFAULT 0,
  ics_url       TEXT,                       -- source feed URL
  entry_date    TEXT    NOT NULL,           -- YYYY-MM-DD of event start
  week_start    TEXT    NOT NULL,
  imported_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (uid, ics_url)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_week_start ON calendar_events (week_start);

-- Generated weekly summaries (cached, re-generatable)
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start    TEXT    NOT NULL UNIQUE,
  summary_json  TEXT    NOT NULL,           -- JSON: { highlights, lowlights, blockers, meetings, narrative }
  generated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- App settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('ics_url', ''),
  ('calendar_sync_enabled', 'false'),
  ('hook_capture_enabled', 'true');
