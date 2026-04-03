import ical from "node-ical";
import { getDb, getWeekStart, toDateStr } from "./db";
import {
  parseISO,
  addDays,
  subDays,
  format,
  isWithinInterval,
  startOfDay,
  endOfDay,
} from "date-fns";
import type { CalendarEvent } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  range: { from: string; to: string };
}

// ─── Sync Window ──────────────────────────────────────────────────────────────

// Sync 4 weeks back + 4 weeks forward from today
const WEEKS_BACK = 4;
const WEEKS_FORWARD = 4;

function getSyncWindow(): { from: Date; to: Date } {
  const today = new Date();
  return {
    from: startOfDay(subDays(today, WEEKS_BACK * 7)),
    to: endOfDay(addDays(today, WEEKS_FORWARD * 7)),
  };
}

// ─── RRULE expander ───────────────────────────────────────────────────────────
// Expand recurring events into individual occurrences within a date window.
// Handles FREQ=DAILY|WEEKLY|MONTHLY — sufficient for 99% of work meetings.

interface RRuleParams {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  until: Date | null;
  count: number | null;
  byday: string[]; // e.g. ["MO", "TU"]
}

function parseRRule(rruleStr: string): RRuleParams {
  const parts: Record<string, string> = {};
  for (const part of rruleStr.replace(/^RRULE:/, "").split(";")) {
    const [k, v] = part.split("=");
    if (k && v) parts[k] = v;
  }

  let until: Date | null = null;
  if (parts.UNTIL) {
    const u = parts.UNTIL;
    try {
      // UNTIL can be YYYYMMDDTHHMMSSZ or YYYYMMDD
      const y = u.slice(0, 4), mo = u.slice(4, 6), d = u.slice(6, 8);
      until = new Date(`${y}-${mo}-${d}T00:00:00Z`);
    } catch { /* ignore */ }
  }

  return {
    freq: (parts.FREQ as RRuleParams["freq"]) ?? "WEEKLY",
    interval: parseInt(parts.INTERVAL ?? "1", 10),
    until,
    count: parts.COUNT ? parseInt(parts.COUNT, 10) : null,
    byday: parts.BYDAY ? parts.BYDAY.split(",").map((d) => d.slice(-2)) : [],
  };
}

function expandRecurring(
  baseStart: Date,
  baseEnd: Date,
  rruleStr: string,
  window: { from: Date; to: Date }
): Array<{ start: Date; end: Date }> {
  const rule = parseRRule(rruleStr);
  const duration = baseEnd.getTime() - baseStart.getTime();
  const results: Array<{ start: Date; end: Date }> = [];

  const DAY_MS = 86400000;
  let stepDays: number;
  switch (rule.freq) {
    case "DAILY":   stepDays = rule.interval; break;
    case "WEEKLY":  stepDays = rule.interval * 7; break;
    case "MONTHLY": stepDays = rule.interval * 30; break; // approximate
    case "YEARLY":  stepDays = rule.interval * 365; break;
    default:        stepDays = 7;
  }

  let current = new Date(baseStart);
  let count = 0;
  const MAX_ITER = 500; // safety cap

  while (count < MAX_ITER) {
    if (current > window.to) break;
    if (rule.until && current > rule.until) break;
    if (rule.count !== null && results.length >= rule.count) break;

    if (current >= window.from) {
      // For WEEKLY with BYDAY, filter by day
      if (rule.freq === "WEEKLY" && rule.byday.length > 0) {
        const dayNames = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
        const dayAbbr = dayNames[current.getDay()];
        if (rule.byday.includes(dayAbbr)) {
          results.push({
            start: new Date(current),
            end: new Date(current.getTime() + duration),
          });
        }
      } else {
        results.push({
          start: new Date(current),
          end: new Date(current.getTime() + duration),
        });
      }
    }

    current = new Date(current.getTime() + stepDays * DAY_MS);
    count++;
  }

  return results;
}

// ─── Attendee Counter ─────────────────────────────────────────────────────────

function countAttendees(event: ical.VEvent): number {
  const att = event.attendee;
  if (!att) return 0;
  if (Array.isArray(att)) return att.length;
  if (typeof att === "object") return 1;
  return 0;
}

// ─── Date Extractor ───────────────────────────────────────────────────────────

function extractDate(val: any): Date | null {
  if (!val) return null;
  // runtime-safe Date detection (covers plain Date and date-like objects)
  if (Object.prototype.toString.call(val) === "[object Date]") return (val as unknown) as Date;
  // node-ical sometimes returns objects with a toJSDate() method
  if (typeof val === "object" && val !== null && "toJSDate" in val && typeof (val as any).toJSDate === "function") {
    return (val as any).toJSDate();
  }
  return null;
}

// ─── Main Sync ────────────────────────────────────────────────────────────────

export async function syncCalendar(icsUrl: string): Promise<SyncResult> {
  const db = getDb();
  const window = getSyncWindow();
  const result: SyncResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    range: {
      from: format(window.from, "yyyy-MM-dd"),
      to: format(window.to, "yyyy-MM-dd"),
    },
  };

  // Fetch and parse ICS
  let events: ical.CalendarResponse;
  try {
    events = await ical.async.fromURL(icsUrl);
  } catch (err) {
    throw new Error(`Failed to fetch ICS feed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const upsert = db.prepare(`
    INSERT INTO calendar_events
      (uid, title, start_time, end_time, attendee_count, ics_url, entry_date, week_start)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uid, ics_url) DO UPDATE SET
      title          = excluded.title,
      start_time     = excluded.start_time,
      end_time       = excluded.end_time,
      attendee_count = excluded.attendee_count,
      entry_date     = excluded.entry_date,
      week_start     = excluded.week_start,
      imported_at    = datetime('now')
  `);

  const insertMany = db.transaction(
    (rows: Array<{ uid: string; title: string; start: Date; end: Date; attendees: number; isNew: boolean }>) => {
      for (const row of rows) {
        const entryDate = format(row.start, "yyyy-MM-dd");
        const weekStart = getWeekStart(row.start);
        const info = upsert.run(
          row.uid,
          row.title,
          row.start.toISOString(),
          row.end.toISOString(),
          row.attendees,
          icsUrl,
          entryDate,
          weekStart
        );
        if (info.changes > 0) {
          // SQLite doesn't distinguish INSERT vs UPDATE here easily,
          // but we track via lastInsertRowid
          if (info.lastInsertRowid) result.imported++;
          else result.updated++;
        } else {
          result.skipped++;
        }
      }
    }
  );

  const toInsert: Parameters<typeof insertMany>[0] = [];

  for (const key of Object.keys(events)) {
    const event = events[key];
    if (event.type !== "VEVENT") continue;

    const title = (event as ical.VEvent).summary ?? "(no title)";
    const attendees = countAttendees(event as ical.VEvent);
    const uid = (event as ical.VEvent).uid ?? key;
    const rrule = (event as ical.VEvent).rrule;

    const rawStart = extractDate((event as ical.VEvent).start);
    const rawEnd = extractDate((event as ical.VEvent).end) ??
      (rawStart ? new Date(rawStart.getTime() + 3600000) : null);

    if (!rawStart || !rawEnd) {
      result.errors.push(`Skipped event "${title}": missing start/end date`);
      continue;
    }

    if (rrule) {
      // Expand recurring event into individual occurrences
      const rruleStr = typeof rrule === "string" ? rrule : rrule.toString();
      const occurrences = expandRecurring(rawStart, rawEnd, rruleStr, window);
      for (let i = 0; i < occurrences.length; i++) {
        const occ = occurrences[i];
        // Use uid + index as unique key for each occurrence
        toInsert.push({
          uid: `${uid}_occ${i}`,
          title,
          start: occ.start,
          end: occ.end,
          attendees,
          isNew: true,
        });
      }
    } else {
      // Single event — check if in window
      if (rawStart >= window.from && rawStart <= window.to) {
        toInsert.push({ uid, title, start: rawStart, end: rawEnd, attendees, isNew: true });
      } else {
        result.skipped++;
      }
    }
  }

  insertMany(toInsert);

  // Update last sync time in settings
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('last_calendar_sync', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(new Date().toISOString());

  return result;
}

// ─── Fetch events for a week ──────────────────────────────────────────────────

export function getCalendarEventsForWeek(weekStart: string): CalendarEvent[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM calendar_events WHERE week_start = ? ORDER BY start_time ASC`
    )
    .all(weekStart) as CalendarEvent[];
}
