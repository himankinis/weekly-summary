import { getDb, getWeekStart } from "./db";
import { format, addDays, parseISO } from "date-fns";
import type {
  LogEntry,
  CalendarEvent,
  WeeklySummaryData,
  SummaryItem,
  MeetingSummaryItem,
  WeekStats,
} from "./types";

// ─── Main Generator ───────────────────────────────────────────────────────────

export function generateWeeklySummary(weekStart?: string): WeeklySummaryData {
  const db = getDb();
  const ws = weekStart ?? getWeekStart();
  const weekEnd = format(addDays(parseISO(ws), 6), "yyyy-MM-dd");

  // Fetch all log entries for the week
  const entries = db
    .prepare(
      `SELECT * FROM log_entries WHERE week_start = ? ORDER BY entry_date ASC, created_at ASC`
    )
    .all(ws) as LogEntry[];

  // Fetch calendar events for the week
  const calEvents = db
    .prepare(
      `SELECT * FROM calendar_events WHERE week_start = ? ORDER BY start_time ASC`
    )
    .all(ws) as CalendarEvent[];

  // Partition entries by type
  const highlights: SummaryItem[] = entries
    .filter((e) => e.type === "highlight")
    .map((e) => ({ content: e.content, source: e.source, date: e.entry_date }));

  const lowlights: SummaryItem[] = entries
    .filter((e) => e.type === "lowlight")
    .map((e) => ({ content: e.content, source: e.source, date: e.entry_date }));

  const blockers: SummaryItem[] = entries
    .filter((e) => e.type === "blocker")
    .map((e) => ({ content: e.content, source: e.source, date: e.entry_date }));

  const meetings: MeetingSummaryItem[] = calEvents.map((ev) => ({
    title: ev.title,
    date: ev.entry_date,
    attendee_count: ev.attendee_count,
  }));

  // Unique active days
  const activeDays = new Set([
    ...entries.map((e) => e.entry_date),
    ...calEvents.map((e) => e.entry_date),
  ]);

  const stats: WeekStats = {
    total_entries: entries.length,
    highlight_count: highlights.length,
    lowlight_count: lowlights.length,
    blocker_count: blockers.length,
    meeting_count: meetings.length,
    days_active: activeDays.size,
  };

  const narrative = buildNarrative(ws, weekEnd, highlights, lowlights, blockers, meetings, stats);

  return {
    weekStart: ws,
    weekEnd,
    highlights,
    lowlights,
    blockers,
    meetings,
    narrative,
    stats,
  };
}

// ─── Narrative Builder ────────────────────────────────────────────────────────

function buildNarrative(
  weekStart: string,
  weekEnd: string,
  highlights: SummaryItem[],
  lowlights: SummaryItem[],
  blockers: SummaryItem[],
  meetings: MeetingSummaryItem[],
  stats: WeekStats
): string {
  const weekLabel = `week of ${format(parseISO(weekStart), "MMM d")}`;
  const parts: string[] = [];

  if (stats.total_entries === 0 && stats.meeting_count === 0) {
    return `No activity logged for the ${weekLabel}.`;
  }

  // Opening
  const activeStr =
    stats.days_active === 1
      ? "1 day"
      : `${stats.days_active} days`;
  parts.push(`Active ${activeStr} during the ${weekLabel}.`);

  // Highlights
  if (highlights.length > 0) {
    const topHighlights = highlights.slice(0, 3).map((h) => h.content);
    if (topHighlights.length === 1) {
      parts.push(`Key win: ${topHighlights[0]}.`);
    } else {
      parts.push(
        `Key wins included: ${topHighlights.slice(0, -1).join("; ")}; and ${topHighlights[topHighlights.length - 1]}.`
      );
    }
  }

  // Lowlights
  if (lowlights.length > 0) {
    parts.push(
      `${lowlights.length} item${lowlights.length > 1 ? "s" : ""} flagged as lowlights or delays.`
    );
  }

  // Blockers
  if (blockers.length > 0) {
    parts.push(
      `${blockers.length} active blocker${blockers.length > 1 ? "s" : ""} need${blockers.length === 1 ? "s" : ""} resolution.`
    );
  }

  // Meetings
  if (meetings.length > 0) {
    parts.push(`Attended ${meetings.length} meeting${meetings.length > 1 ? "s" : ""}.`);
  }

  return parts.join(" ");
}

// ─── Markdown Formatter ───────────────────────────────────────────────────────

export function summaryToMarkdown(summary: WeeklySummaryData): string {
  const lines: string[] = [];
  const dateRange = `${format(parseISO(summary.weekStart), "MMM d")}–${format(parseISO(summary.weekEnd), "MMM d, yyyy")}`;

  lines.push(`# Weekly Summary — ${dateRange}`);
  lines.push("");
  lines.push(`> ${summary.narrative}`);
  lines.push("");

  if (summary.highlights.length > 0) {
    lines.push("## Highlights");
    for (const h of summary.highlights) {
      const badge = h.source !== "manual" ? ` *(${h.source})*` : "";
      lines.push(`- ${h.content}${badge}`);
    }
    lines.push("");
  }

  if (summary.lowlights.length > 0) {
    lines.push("## Lowlights");
    for (const l of summary.lowlights) {
      lines.push(`- ${l.content}`);
    }
    lines.push("");
  }

  if (summary.blockers.length > 0) {
    lines.push("## Blockers");
    for (const b of summary.blockers) {
      lines.push(`- ${b.content}`);
    }
    lines.push("");
  }

  if (summary.meetings.length > 0) {
    lines.push("## Key Meetings");
    for (const m of summary.meetings) {
      const attendees =
        m.attendee_count > 0 ? ` (${m.attendee_count} attendees)` : "";
      lines.push(`- ${m.title}${attendees} — ${format(parseISO(m.date), "EEE MMM d")}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(
    `*Generated by Weekly Pulse on ${format(new Date(), "MMM d, yyyy 'at' h:mm a")}*`
  );

  return lines.join("\n");
}

/** Plain-text version for terminal output */
export function summaryToText(summary: WeeklySummaryData): string {
  const dateRange = `${format(parseISO(summary.weekStart), "MMM d")}–${format(parseISO(summary.weekEnd), "MMM d, yyyy")}`;
  const lines: string[] = [];

  lines.push(`WEEKLY SUMMARY — ${dateRange}`);
  lines.push("=".repeat(50));
  lines.push("");
  lines.push(summary.narrative);
  lines.push("");

  if (summary.highlights.length > 0) {
    lines.push("HIGHLIGHTS");
    lines.push("-".repeat(30));
    for (const h of summary.highlights) lines.push(`  ✓ ${h.content}`);
    lines.push("");
  }

  if (summary.lowlights.length > 0) {
    lines.push("LOWLIGHTS");
    lines.push("-".repeat(30));
    for (const l of summary.lowlights) lines.push(`  ~ ${l.content}`);
    lines.push("");
  }

  if (summary.blockers.length > 0) {
    lines.push("BLOCKERS");
    lines.push("-".repeat(30));
    for (const b of summary.blockers) lines.push(`  ✗ ${b.content}`);
    lines.push("");
  }

  if (summary.meetings.length > 0) {
    lines.push("MEETINGS");
    lines.push("-".repeat(30));
    for (const m of summary.meetings) {
      const attendees =
        m.attendee_count > 0 ? ` (${m.attendee_count})` : "";
      lines.push(`  • ${m.title}${attendees}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
