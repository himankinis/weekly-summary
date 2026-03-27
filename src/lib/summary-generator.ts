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

// ─── Constants ────────────────────────────────────────────────────────────────

const DECISION_KEYWORDS =
  /\b(align|aligned|decide|decided|decision|approve|approved|confirm|confirmed|sign.?off|agreed|finalized|resolved)\b/i;

const JIRA_KEY_PATTERN = /\b([A-Z]+-\d+)\b/g;

// ─── Main Generator ───────────────────────────────────────────────────────────

export function generateWeeklySummary(weekStart?: string): WeeklySummaryData {
  const db = getDb();
  const ws = weekStart ?? getWeekStart();
  const weekEnd = format(addDays(parseISO(ws), 6), "yyyy-MM-dd");
  const nextWeekStart = format(addDays(parseISO(ws), 7), "yyyy-MM-dd");

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

  // Fetch next week's calendar events for preview
  const nextCalEvents = db
    .prepare(
      `SELECT * FROM calendar_events WHERE week_start = ? ORDER BY start_time ASC LIMIT 10`
    )
    .all(nextWeekStart) as CalendarEvent[];

  // Partition entries — exclude hook-captured entries from summary
  const manualEntries = entries.filter((e) => e.source !== "hook");

  const highlights: SummaryItem[] = manualEntries
    .filter((e) => e.type === "highlight")
    .map((e) => ({ content: e.content, source: e.source, date: e.entry_date }));

  const lowlights: SummaryItem[] = manualEntries
    .filter((e) => e.type === "lowlight")
    .map((e) => ({ content: e.content, source: e.source, date: e.entry_date }));

  const blockers: SummaryItem[] = manualEntries
    .filter((e) => e.type === "blocker")
    .map((e) => ({ content: e.content, source: e.source, date: e.entry_date }));

  // Meetings with Jira-key enrichment
  const meetings: MeetingSummaryItem[] = calEvents.map((ev) => {
    const related = findRelatedByJiraKey(ev.title, manualEntries);
    return {
      title: ev.title,
      date: ev.entry_date,
      attendee_count: ev.attendee_count,
      ...(related.length > 0 ? { related } : {}),
    };
  });

  // Decisions: meeting titles + manual entries containing decision keywords
  const decisions: SummaryItem[] = buildDecisions(calEvents, manualEntries);

  // Next week preview
  const nextWeekPreview = buildNextWeekPreview(nextCalEvents, blockers, lowlights);

  // Unique active days
  const activeDays = new Set([
    ...entries.map((e) => e.entry_date),
    ...calEvents.map((e) => e.entry_date),
  ]);

  const stats: WeekStats = {
    total_entries: manualEntries.length,
    highlight_count: highlights.length,
    lowlight_count: lowlights.length,
    blocker_count: blockers.length,
    meeting_count: meetings.length,
    days_active: activeDays.size,
    jira_count: manualEntries.filter((e) => e.source === "jira").length,
    email_count: manualEntries.filter((e) => e.source === "email").length,
  };

  const narrative = buildNarrative(highlights, lowlights, blockers, meetings, stats);

  return {
    weekStart: ws,
    weekEnd,
    highlights,
    lowlights,
    blockers,
    meetings,
    decisions,
    nextWeekPreview,
    narrative,
    stats,
  };
}

// ─── Jira Key Enrichment ──────────────────────────────────────────────────────

function findRelatedByJiraKey(meetingTitle: string, entries: LogEntry[]): string[] {
  const keys = [...meetingTitle.matchAll(JIRA_KEY_PATTERN)].map((m) => m[1]);
  if (keys.length === 0) return [];

  const related: string[] = [];
  for (const key of keys) {
    for (const entry of entries) {
      if (
        entry.content.includes(key) ||
        (entry.calendar_uid && entry.calendar_uid.includes(key))
      ) {
        related.push(entry.content);
        if (related.length >= 2) return related;
      }
    }
  }
  return related;
}

// ─── Decisions ────────────────────────────────────────────────────────────────

function buildDecisions(calEvents: CalendarEvent[], entries: LogEntry[]): SummaryItem[] {
  const decisions: SummaryItem[] = [];

  for (const ev of calEvents) {
    if (DECISION_KEYWORDS.test(ev.title)) {
      decisions.push({ content: ev.title, source: "calendar", date: ev.entry_date });
    }
  }

  for (const entry of entries) {
    if (DECISION_KEYWORDS.test(entry.content)) {
      decisions.push({ content: entry.content, source: entry.source, date: entry.entry_date });
    }
  }

  return decisions.slice(0, 5);
}

// ─── Next Week Preview ────────────────────────────────────────────────────────

function buildNextWeekPreview(
  nextCalEvents: CalendarEvent[],
  blockers: SummaryItem[],
  lowlights: SummaryItem[]
): string[] {
  const preview: string[] = [];

  if (nextCalEvents.length > 0) {
    preview.push(`📅 ${nextCalEvents.length} meeting${nextCalEvents.length > 1 ? "s" : ""} scheduled`);
    nextCalEvents.slice(0, 3).forEach((ev) => preview.push(`  · ${ev.title}`));
  }

  const inProgress = blockers.length + lowlights.length;
  if (inProgress > 0) {
    preview.push(
      `🔄 ${inProgress} item${inProgress > 1 ? "s" : ""} carrying over from this week`
    );
  }

  return preview;
}

// ─── Narrative Builder ────────────────────────────────────────────────────────

function buildNarrative(
  highlights: SummaryItem[],
  lowlights: SummaryItem[],
  blockers: SummaryItem[],
  meetings: MeetingSummaryItem[],
  stats: WeekStats
): string {
  if (stats.total_entries === 0 && stats.meeting_count === 0) {
    return "No activity logged this week.";
  }

  const parts: string[] = [];

  // Top theme: most-frequent word (≥6 chars) across all highlight content
  const theme = extractTopTheme(highlights);

  // Opening sentence
  if (theme) {
    parts.push(`This week I focused on ${theme}.`);
  } else if (stats.days_active > 0) {
    parts.push(`Active ${stats.days_active} day${stats.days_active > 1 ? "s" : ""} this week.`);
  }

  // Key wins — prefer manual highlights
  const manualHighlights = highlights.filter((h) => h.source === "manual");
  const topHighlights = (manualHighlights.length > 0 ? manualHighlights : highlights).slice(0, 2);
  if (topHighlights.length === 1) {
    parts.push(`Key win: ${topHighlights[0].content}.`);
  } else if (topHighlights.length >= 2) {
    parts.push(`Key wins: ${topHighlights[0].content}; and ${topHighlights[1].content}.`);
  }

  // Blockers
  if (blockers.length > 0) {
    parts.push(
      blockers.length === 1
        ? `The main blocker is: ${blockers[0].content}.`
        : `${blockers.length} active blockers need resolution.`
    );
  }

  // Lowlights
  if (lowlights.length > 0) {
    parts.push(
      `${lowlights.length} item${lowlights.length > 1 ? "s" : ""} took longer than expected.`
    );
  }

  // Meetings
  if (meetings.length > 0) {
    parts.push(`Attended ${meetings.length} meeting${meetings.length > 1 ? "s" : ""}.`);
  }

  return parts.join(" ");
}

function extractTopTheme(highlights: SummaryItem[]): string {
  // Only use manual entries — email/hook subjects contain names and noise
  const source = highlights.filter((h) => h.source === "manual");
  if (source.length === 0) return "";

  const stopWords = new Set([
    "the", "and", "for", "with", "this", "that", "from", "have", "been",
    "were", "they", "their", "into", "also", "sent", "email", "about",
    "shared", "completed", "update", "updates", "review", "meeting",
  ]);

  const freq: Record<string, number> = {};
  for (const h of source) {
    const words = h.content.split(/\W+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.length < 6) continue;
      const lower = w.toLowerCase();
      if (stopWords.has(lower)) continue;
      // Skip proper nouns: capitalized mid-sentence (not the first word)
      if (i > 0 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()) continue;
      freq[lower] = (freq[lower] ?? 0) + 1;
    }
  }

  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 2) return "";

  return top[0].charAt(0).toUpperCase() + top[0].slice(1);
}

// ─── Markdown Formatter ───────────────────────────────────────────────────────

export function summaryToMarkdown(summary: WeeklySummaryData): string {
  const lines: string[] = [];
  const dateRange = `${format(parseISO(summary.weekStart), "MMM d")}–${format(parseISO(summary.weekEnd), "MMM d, yyyy")}`;

  lines.push(`# Weekly Summary — ${dateRange}`);
  lines.push("");

  // Quantitative line
  lines.push(
    `> **This week:** ${summary.stats.highlight_count} highlights · ${summary.stats.lowlight_count} lowlights · ${summary.stats.blocker_count} blockers | ${summary.stats.meeting_count} meetings | ${summary.stats.jira_count} Jira tickets | ${summary.stats.email_count} emails`
  );
  lines.push("");
  lines.push(`> ${summary.narrative}`);
  lines.push("");

  if (summary.highlights.length > 0) {
    lines.push("## ✅ Highlights");
    for (const h of summary.highlights) {
      const badge = h.source !== "manual" ? ` *(${h.source})*` : "";
      lines.push(`- ${h.content}${badge}`);
    }
    lines.push("");
  }

  if (summary.lowlights.length > 0) {
    lines.push("## ⚠️ Lowlights");
    for (const l of summary.lowlights) lines.push(`- ${l.content}`);
    lines.push("");
  }

  if (summary.blockers.length > 0) {
    lines.push("## 🚫 Blockers");
    for (const b of summary.blockers) lines.push(`- ${b.content}`);
    lines.push("");
  }

  if (summary.decisions.length > 0) {
    lines.push("## 🎯 Key Decisions");
    for (const d of summary.decisions) lines.push(`- ${d.content}`);
    lines.push("");
  }

  if (summary.meetings.length > 0) {
    lines.push("## 📅 Key Meetings");
    for (const m of summary.meetings) {
      const attendees = m.attendee_count > 0 ? ` (${m.attendee_count} attendees)` : "";
      lines.push(`- ${m.title}${attendees} — ${format(parseISO(m.date), "EEE MMM d")}`);
      if (m.related && m.related.length > 0) {
        m.related.forEach((r) => lines.push(`  - Related: ${r}`));
      }
    }
    lines.push("");
  }

  if (summary.nextWeekPreview.length > 0) {
    lines.push("## 🔭 Next Week");
    for (const p of summary.nextWeekPreview) lines.push(`- ${p}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(
    `*Generated by Weekly Summary on ${format(new Date(), "MMM d, yyyy 'at' h:mm a")}*`
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

  if (summary.decisions.length > 0) {
    lines.push("KEY DECISIONS");
    lines.push("-".repeat(30));
    for (const d of summary.decisions) lines.push(`  • ${d.content}`);
    lines.push("");
  }

  if (summary.meetings.length > 0) {
    lines.push("MEETINGS");
    lines.push("-".repeat(30));
    for (const m of summary.meetings) {
      const attendees = m.attendee_count > 0 ? ` (${m.attendee_count})` : "";
      lines.push(`  • ${m.title}${attendees}`);
    }
    lines.push("");
  }

  if (summary.nextWeekPreview.length > 0) {
    lines.push("NEXT WEEK");
    lines.push("-".repeat(30));
    for (const p of summary.nextWeekPreview) lines.push(`  ${p}`);
    lines.push("");
  }

  return lines.join("\n");
}
