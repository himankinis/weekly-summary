import { getDb, getWeekStart } from "./db";
import { format, addDays, parseISO } from "date-fns";
import type {
  LogEntry,
  CalendarEvent,
  WeeklySummaryData,
  SummaryItem,
  MeetingSummaryItem,
  WeekStats,
  EntryType,
} from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

const DECISION_KEYWORDS =
  /\b(align|aligned|decide|decided|decision|approve|approved|confirm|confirmed|sign.?off|agreed|finalized|resolved)\b/i;

const JIRA_KEY_PATTERN = /\b([A-Z]+-\d+)\b/g;

const TODO_PATTERN = /\b(todo|to do|todo:)\b/i;

// ─── Email Synthesis ──────────────────────────────────────────────────────────

interface ParsedEmail {
  subject: string;
  primaryRecipient: string;
  recipientCount: number;
  entry: LogEntry;
}

/** Emails that carry no signal — calendar noise, auto-notifications, forwards */
const NOISE_EMAIL_PATTERNS = [
  /^(Accepted|Declined|Tentative|Canceled|Cancelled):/i,
  /^(FW|Fwd|AW|TR):\s/i,
  /\bshared\b.+\bwith you\b/i,       // "X shared Y with you" (SharePoint)
  /\bmentioned you\b/i,               // "X mentioned you in Y"
  /\breplied to a comment\b/i,        // "X replied to a comment in Y"
  /\bhas invited you\b/i,
  /\bno.?reply\b/i,
  /\bdo.?not.?reply\b/i,
  /\bunsubscribe\b/i,
  /\bwelcome to\b/i,
  /\bpassword\b/i,
  /\bverification code\b/i,
];

function parseEmailContent(entry: LogEntry): ParsedEmail {
  const content = entry.content;
  const prefix = 'Sent email: "';
  if (!content.startsWith(prefix)) {
    return { subject: content, primaryRecipient: "", recipientCount: 1, entry };
  }
  // Use last occurrence of '" to ' to handle subjects with internal quotes
  const suffix = '" to ';
  const lastIdx = content.lastIndexOf(suffix);

  let subject: string;
  let rest: string;
  if (lastIdx > prefix.length) {
    subject = content.slice(prefix.length, lastIdx);
    rest = content.slice(lastIdx + suffix.length);
  } else {
    subject = content.slice(prefix.length).replace(/"$/, "");
    rest = "";
  }

  const plusMatch = rest.match(/\s\+(\d+)$/);
  const extraCount = plusMatch ? parseInt(plusMatch[1]) : 0;
  const primaryRecipient = rest.replace(/\s\+\d+$/, "").trim();
  return { subject, primaryRecipient, recipientCount: 1 + extraCount, entry };
}

function isNoisyEmail(parsed: ParsedEmail): boolean {
  return NOISE_EMAIL_PATTERNS.some((p) => p.test(parsed.subject));
}

function extractTopic(subject: string): string {
  const cleaned = subject.replace(/^(Re|RE|Fwd|FW|AW|TR):\s*/gi, "").trim();
  return cleaned.length > 72 ? cleaned.slice(0, 69) + "…" : cleaned;
}

/** Two subjects are about the same topic if they share ≥1 significant word (≥4 chars) */
function topicsSimilar(a: string, b: string): boolean {
  const stopWords = new Set([
    "the", "and", "for", "with", "this", "that", "from", "your", "our",
    "about", "have", "been", "will", "please", "thanks", "hello", "dear",
    // generic meeting/action verbs that aren't content signals
    "connect", "update", "discuss", "meeting", "follow",
  ]);
  const words = (s: string) =>
    s.toLowerCase().split(/\W+/).filter((w) => w.length >= 4 && !stopWords.has(w));
  const aSet = new Set(words(a));
  return words(b).some((w) => aSet.has(w));
}

function groupEmailsByTopic(emails: ParsedEmail[]): ParsedEmail[][] {
  const groups: ParsedEmail[][] = [];
  const used = new Set<number>();
  for (let i = 0; i < emails.length; i++) {
    if (used.has(i)) continue;
    const group: ParsedEmail[] = [emails[i]];
    used.add(i);
    for (let j = i + 1; j < emails.length; j++) {
      if (used.has(j)) continue;
      if (topicsSimilar(emails[i].subject, emails[j].subject)) {
        group.push(emails[j]);
        used.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

function firstNameOf(fullName: string): string {
  return fullName.split(/[\s,]+/)[0] ?? fullName;
}

function synthesizeEmailGroup(group: ParsedEmail[]): SummaryItem {
  // Prefer a non-reply subject as the representative topic
  const bestSubject =
    group.map((e) => e.subject).find((s) => !/^(Re|RE|Fwd|FW):/i.test(s)) ??
    group[0].subject;
  const topic = extractTopic(bestSubject);

  const recipientMap = new Map<string, string>(); // firstName → fullName
  let maxCount = 0;
  for (const e of group) {
    if (e.primaryRecipient) {
      const first = firstNameOf(e.primaryRecipient);
      if (!recipientMap.has(first)) recipientMap.set(first, e.primaryRecipient);
    }
    maxCount = Math.max(maxCount, e.recipientCount);
  }

  const uniqueRecipients = [...recipientMap.values()];
  const recipientStr =
    uniqueRecipients.length === 0
      ? "stakeholders"
      : uniqueRecipients.length === 1
      ? uniqueRecipients[0]
      : uniqueRecipients.slice(0, 2).join(", ") +
        (uniqueRecipients.length > 2 ? ` +${uniqueRecipients.length - 2}` : "");

  let content: string;
  if (group.length >= 3) {
    content =
      maxCount >= 3
        ? `Led cross-functional discussion on ${topic} (${group.length} touchpoints)`
        : `Drove alignment on ${topic} with ${recipientStr} (${group.length} touchpoints)`;
  } else if (maxCount >= 3) {
    content = `Led cross-functional working session on ${topic}`;
  } else if (group.length === 2) {
    content = `Aligned with ${recipientStr} on ${topic}`;
  } else {
    content = `Discussed ${topic} with ${recipientStr}`;
  }

  const latestEntry = group.reduce((a, b) =>
    a.entry.entry_date > b.entry.entry_date ? a : b
  ).entry;

  return { content, source: "email" as const, date: latestEntry.entry_date };
}

function synthesizeEmails(entries: LogEntry[]): SummaryItem[] {
  const parsed = entries.filter((e) => e.source === "email").map(parseEmailContent);
  const filtered = parsed.filter((e) => !isNoisyEmail(e));
  return groupEmailsByTopic(filtered).map(synthesizeEmailGroup);
}

// ─── Jira Synthesis ───────────────────────────────────────────────────────────

interface ParsedJira {
  key: string;
  summary: string;
  status: string;
  entry: LogEntry;
}

function parseJiraContent(entry: LogEntry): ParsedJira {
  const m = entry.content.match(/^\[([A-Z]+-\d+)\]\s+(.+?)\s+\((.+?)\)$/);
  if (!m) return { key: "", summary: entry.content, status: "", entry };
  return { key: m[1], summary: m[2], status: m[3], entry };
}

function synthesizeJira(entries: LogEntry[]): {
  highlights: SummaryItem[];
  lowlights: SummaryItem[];
  blockers: SummaryItem[];
} {
  const highlights: SummaryItem[] = [];
  const lowlights: SummaryItem[] = [];
  const blockers: SummaryItem[] = [];

  for (const entry of entries.filter((e) => e.source === "jira")) {
    const { key, summary, status, entry: e } = parseJiraContent(entry);
    const jiraRef = key ? ` (Jira: ${key})` : "";
    const statusLower = status.toLowerCase();

    let content: string;
    let type: EntryType;

    if (
      e.type === "highlight" ||
      ["done", "closed", "resolved", "complete"].includes(statusLower)
    ) {
      content = `Completed ${summary}${jiraRef}`;
      type = "highlight";
    } else if (
      e.type === "blocker" ||
      statusLower.includes("block") ||
      statusLower.includes("impediment")
    ) {
      content = `${summary} is blocked${jiraRef}`;
      type = "blocker";
    } else if (["in progress", "in review", "in development"].includes(statusLower)) {
      content = `Drove progress on ${summary}${jiraRef}`;
      type = "lowlight";
    } else {
      content = `Initiated ${summary}${jiraRef}`;
      type = "lowlight";
    }

    const item: SummaryItem = { content, source: "jira", date: e.entry_date };
    if (type === "highlight") highlights.push(item);
    else if (type === "blocker") blockers.push(item);
    else lowlights.push(item);
  }

  return { highlights, lowlights, blockers };
}

// ─── Confluence Synthesis ─────────────────────────────────────────────────────

function synthesizeConfluence(entries: LogEntry[]): SummaryItem[] {
  return entries
    .filter((e) => e.source === "confluence" && e.type === "highlight")
    .map((e) => {
      const created = e.content.match(/^Created Confluence page: "(.+?)" in (.+)$/);
      if (created) {
        return {
          content: `Published "${created[1]}" on Confluence`,
          source: "confluence" as const,
          date: e.entry_date,
        };
      }
      const edited = e.content.match(/^Edited Confluence page: "(.+?)" in (.+)$/);
      if (edited) {
        return {
          content: `Updated "${edited[1]}" on Confluence`,
          source: "confluence" as const,
          date: e.entry_date,
        };
      }
      return { content: e.content, source: "confluence" as const, date: e.entry_date };
    });
}

function synthesizeTodos(entries: LogEntry[]): { incomplete: SummaryItem[]; completed: SummaryItem[] } {
  const incomplete: SummaryItem[] = [];
  const completed: SummaryItem[] = [];
  const seen = new Set<number>();

  for (const e of entries) {
    if ((e.type === "todo" || TODO_PATTERN.test(e.content)) && !seen.has(e.id)) {
      seen.add(e.id);
      const item: SummaryItem = { content: e.content.trim(), source: e.source, date: e.entry_date };
      if (e.completed) {
        completed.push(item);
      } else {
        incomplete.push(item);
      }
    }
  }

  return { incomplete, completed };
}

// ─── Calendar Filtering ───────────────────────────────────────────────────────

const ROUTINE_MEETING_PATTERNS = [
  /\bstand.?up\b/i,
  /\bdaily\s*(sync|scrum|standup)?\b/i,
  /\b(weekly|bi-?weekly)\s+(sync|check.?in|team)\b/i,
  /\b1.?on.?1\b/i,
  /\bone.?on.?one\b/i,
  /\bteam\s+sync\b/i,
  /^sync$/i,
  /^(OOO|PTO)\b/i,
  /\b(OOO|PTO)\b/i,
  /\b(Reminder|Weekly Reminder)\b/i,
  /\b(Monthly|Weekly)\b.+\bUpdate\b/i,  // e.g. "Monthly Metering Update", "Weekly Status Update"
  /\bUpdate\s*$/i,                        // titles ending in just "Update"
  /^[A-Za-z]{1,3}$/,                     // very short titles like "Aq"
];

const NOTABLE_MEETING_PATTERNS = [
  /\b(review|planning|alignment|align|decision|kickoff|kick.?off|working\s+session|workshop|retrospective|retro|roadmap|strategy|launch|demo|presentation|discovery|steering|council|leadership|commitment|staff\s+meeting)\b/i,
];

function filterAndFormatCalendar(events: CalendarEvent[]): MeetingSummaryItem[] {
  return events
    .filter((ev) => !ROUTINE_MEETING_PATTERNS.some((p) => p.test(ev.title)))
    .filter((ev) =>
      NOTABLE_MEETING_PATTERNS.some((p) => p.test(ev.title)) || ev.attendee_count >= 4
    )
    .map((ev) => ({ title: ev.title, date: ev.entry_date, attendee_count: ev.attendee_count }));
}

// ─── Main Generator ───────────────────────────────────────────────────────────

export function generateWeeklySummary(weekStart?: string): WeeklySummaryData {
  const db = getDb();
  const ws = weekStart ?? getWeekStart();
  const weekEnd = format(addDays(parseISO(ws), 6), "yyyy-MM-dd");
  const nextWeekStart = format(addDays(parseISO(ws), 7), "yyyy-MM-dd");

  const entries = db
    .prepare(
      `SELECT * FROM log_entries WHERE week_start = ? ORDER BY entry_date ASC, created_at ASC`
    )
    .all(ws) as LogEntry[];

  const calEvents = db
    .prepare(
      `SELECT * FROM calendar_events WHERE week_start = ? ORDER BY start_time ASC`
    )
    .all(ws) as CalendarEvent[];

  const nextCalEvents = db
    .prepare(
      `SELECT * FROM calendar_events WHERE week_start = ? ORDER BY start_time ASC LIMIT 10`
    )
    .all(nextWeekStart) as CalendarEvent[];

  // ── Manual entries — highest trust, used as-is ─────────────────────────────
  const manualEntries = entries.filter((e) => e.source === "manual" && e.type !== "todo");
  const manualHighlights: SummaryItem[] = manualEntries
    .filter((e) => e.type === "highlight")
    .map((e) => ({ content: e.content, source: e.source, date: e.entry_date }));
  const manualLowlights: SummaryItem[] = manualEntries
    .filter((e) => e.type === "lowlight")
    .map((e) => ({ content: e.content, source: e.source, date: e.entry_date }));
  const manualBlockers: SummaryItem[] = manualEntries
    .filter((e) => e.type === "blocker")
    .map((e) => ({ content: e.content, source: e.source, date: e.entry_date }));

  // ── Synthesized entries ────────────────────────────────────────────────────
  const confluenceItems = synthesizeConfluence(entries);
  const jira = synthesizeJira(entries);
  const emailHighlights = synthesizeEmails(entries);
  const { incomplete: todos, completed: completedTodos } = synthesizeTodos(entries);

  // ── Merge with priority order and enforce limits ───────────────────────────
  // manual > confluence > jira > email; max 5 highlights, 3 blockers
  const highlights: SummaryItem[] = [
    ...manualHighlights,
    ...confluenceItems,
    ...jira.highlights,
    ...emailHighlights,
  ].slice(0, 5);

  const lowlights: SummaryItem[] = [
    ...manualLowlights,
    ...jira.lowlights,
  ].slice(0, 5);

  const blockers: SummaryItem[] = [
    ...manualBlockers,
    ...jira.blockers,
  ].slice(0, 3);

  // ── Calendar: filter noise, keep notable meetings ─────────────────────────
  const meetings: MeetingSummaryItem[] = filterAndFormatCalendar(calEvents);

  // ── Decisions (manual + calendar only) ────────────────────────────────────
  const decisions: SummaryItem[] = buildDecisions(calEvents, manualEntries);

  // ── Next week preview ─────────────────────────────────────────────────────
  const nextWeekPreview = buildNextWeekPreview(nextCalEvents, blockers, lowlights, todos);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const activeDays = new Set([
    ...entries.map((e) => e.entry_date),
    ...calEvents.map((e) => e.entry_date),
  ]);

  const stats: WeekStats = {
    total_entries: entries.filter((e) => e.source === "manual").length,
    highlight_count: highlights.length,
    lowlight_count: lowlights.length,
    blocker_count: blockers.length,
    todo_count: todos.length,
    meeting_count: meetings.length,
    days_active: activeDays.size,
    jira_count: entries.filter((e) => e.source === "jira").length,
    email_count: entries.filter((e) => e.source === "email").length,
  };

  const narrative = buildNarrative(highlights, lowlights, blockers, meetings, stats);

  return {
    weekStart: ws,
    weekEnd,
    highlights,
    todos,
    completedTodos,
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
  lowlights: SummaryItem[],
  incompleteTodos: SummaryItem[] = []
): string[] {
  const preview: string[] = [];

  const notableNext = filterAndFormatCalendar(nextCalEvents);
  if (notableNext.length > 0) {
    preview.push(
      `📅 ${notableNext.length} notable meeting${notableNext.length > 1 ? "s" : ""} scheduled`
    );
    notableNext.slice(0, 3).forEach((ev) => preview.push(`  · ${ev.title}`));
  }

  const inProgress = blockers.length + lowlights.length;
  if (inProgress > 0) {
    preview.push(
      `🔄 ${inProgress} item${inProgress > 1 ? "s" : ""} carrying over from this week`
    );
  }

  if (incompleteTodos.length > 0) {
    preview.push(
      `📝 ${incompleteTodos.length} to-do${incompleteTodos.length > 1 ? "s" : ""} carrying over`
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

  const theme = extractTopTheme(highlights);
  if (theme) {
    parts.push(`This week I focused on ${theme}.`);
  } else if (stats.days_active > 0) {
    parts.push(`Active ${stats.days_active} day${stats.days_active > 1 ? "s" : ""} this week.`);
  }

  const manualHighlights = highlights.filter((h) => h.source === "manual");
  const topHighlights = (manualHighlights.length > 0 ? manualHighlights : highlights).slice(0, 2);
  if (topHighlights.length === 1) {
    parts.push(`Key win: ${topHighlights[0].content}.`);
  } else if (topHighlights.length >= 2) {
    parts.push(`Key wins: ${topHighlights[0].content}; and ${topHighlights[1].content}.`);
  }

  if (blockers.length > 0) {
    parts.push(
      blockers.length === 1
        ? `The main blocker is: ${blockers[0].content}.`
        : `${blockers.length} active blockers need resolution.`
    );
  }

  if (lowlights.length > 0) {
    parts.push(
      `${lowlights.length} item${lowlights.length > 1 ? "s" : ""} took longer than expected.`
    );
  }

  if (meetings.length > 0) {
    parts.push(`Attended ${meetings.length} key meeting${meetings.length > 1 ? "s" : ""}.`);
  }

  return parts.join(" ");
}

function extractTopTheme(highlights: SummaryItem[]): string {
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

  const hasAnyTodos = (summary.todos?.length ?? 0) + (summary.completedTodos?.length ?? 0) > 0;
  if (hasAnyTodos) {
    lines.push("## 📝 To-Do Progress");
    const total = (summary.todos?.length ?? 0) + (summary.completedTodos?.length ?? 0);
    const completedCount = summary.completedTodos?.length ?? 0;
    lines.push(`> ${completedCount}/${total} completed`);
    lines.push("");
    if (summary.completedTodos && summary.completedTodos.length > 0) {
      lines.push("**Completed:**");
      for (const t of summary.completedTodos) lines.push(`- ~~${t.content}~~`);
      lines.push("");
    }
    if (summary.todos && summary.todos.length > 0) {
      lines.push("**Carrying over:**");
      for (const t of summary.todos) lines.push(`- ${t.content}`);
      lines.push("");
    }
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

  const hasAnyTodosText = (summary.todos?.length ?? 0) + (summary.completedTodos?.length ?? 0) > 0;
  if (hasAnyTodosText) {
    const total = (summary.todos?.length ?? 0) + (summary.completedTodos?.length ?? 0);
    const completedCount = summary.completedTodos?.length ?? 0;
    lines.push(`TO-DO PROGRESS (${completedCount}/${total} completed)`);
    lines.push("-".repeat(30));
    if (summary.completedTodos && summary.completedTodos.length > 0) {
      lines.push("  Completed:");
      for (const t of summary.completedTodos) lines.push(`    ✓ ${t.content}`);
    }
    if (summary.todos && summary.todos.length > 0) {
      lines.push("  Carrying over:");
      for (const t of summary.todos) lines.push(`    → ${t.content}`);
    }
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
    lines.push("KEY MEETINGS");
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
