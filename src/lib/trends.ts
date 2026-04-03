import { getDb } from "./db";
import type { EntrySource } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeatmapCell {
  hour: number;   // 8–20
  dow: number;    // 0=Mon … 4=Fri
  count: number;
}

export type PmCategory =
  | "Meetings"
  | "Communication"
  | "Development"
  | "Planning"
  | "Research"
  | "Admin";

export interface CategorySlice {
  category: PmCategory;
  count: number;
}

export interface DayCount {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface TrendsData {
  heatmap: HeatmapCell[];
  categories: CategorySlice[];
  currentWeek: DayCount[];
  previousWeek: DayCount[];
  insights: string[];
  weekStart: string;
  prevWeekStart: string;
}

// ─── PM Category classification ───────────────────────────────────────────────

const PLANNING_KEYWORDS = /\b(plan|sprint|roadmap|priorit|backlog|milestone|scope|requir|spec|story|epic)\b/i;
const RESEARCH_KEYWORDS = /\b(research|invest|analys|review|audit|learn|explor|discover|understand|figur)\b/i;
const ADMIN_KEYWORDS    = /\b(admin|report|status|update|weekly|1:1|one.on.one|sync|stand.?up|retro)\b/i;

function categoryForEntry(source: EntrySource, content: string): PmCategory {
  if (source === "calendar") return "Meetings";
  if (source === "email" || source === "teams") return "Communication";
  if (source === "hook") return "Development";
  if (source === "jira" || source === "confluence") {
    if (PLANNING_KEYWORDS.test(content)) return "Planning";
    if (RESEARCH_KEYWORDS.test(content)) return "Research";
    return "Planning";
  }
  // manual entries: classify by keyword
  if (ADMIN_KEYWORDS.test(content)) return "Admin";
  if (PLANNING_KEYWORDS.test(content)) return "Planning";
  if (RESEARCH_KEYWORDS.test(content)) return "Research";
  return "Development";
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoHour(isoStr: string): number {
  // Handles both UTC (Z) and local offsets; parse as UTC
  return new Date(isoStr).getUTCHours();
}

// day-of-week 0=Mon … 4=Fri from ISO date string
function dowFromDate(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z");
  const js = d.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  return js === 0 ? 6 : js - 1; // Mon=0, Tue=1 … Sun=6
}

function dowFromISO(isoStr: string): number {
  const d = new Date(isoStr);
  const js = d.getUTCDay();
  return js === 0 ? 6 : js - 1;
}

// ─── Main aggregator ──────────────────────────────────────────────────────────

export function getTrendsData(weekStart: string): TrendsData {
  const db = getDb();
  const weekEnd = addDays(weekStart, 6);
  const prevWeekStart = addDays(weekStart, -7);
  const prevWeekEnd = addDays(weekStart, -1);

  // ── Heatmap ────────────────────────────────────────────────────────────────
  // Bucket by hour×dow from calendar events (exact times) + log_entries (created_at)

  const heatCounts = new Map<string, number>();

  const incHeat = (hour: number, dow: number) => {
    if (hour < 8 || hour > 20) return; // outside display range
    if (dow > 4) return; // weekends excluded
    const key = `${hour}:${dow}`;
    heatCounts.set(key, (heatCounts.get(key) ?? 0) + 1);
  };

  // Calendar events: use start_time for hour
  const calRows = db
    .prepare(
      `SELECT start_time FROM calendar_events WHERE week_start = ? AND start_time != ''`
    )
    .all(weekStart) as { start_time: string }[];

  for (const row of calRows) {
    const h = isoHour(row.start_time);
    const dow = dowFromISO(row.start_time);
    incHeat(h, dow);
  }

  // Log entries: use created_at timestamp if available; fall back to entry_date@9am
  const entryRows = db
    .prepare(
      `SELECT created_at, entry_date, source FROM log_entries WHERE week_start = ?`
    )
    .all(weekStart) as { created_at: string; entry_date: string; source: string }[];

  for (const row of entryRows) {
    if (row.source === "calendar") continue; // already counted above
    let h: number;
    let dow: number;
    if (row.created_at) {
      h = isoHour(row.created_at);
      dow = dowFromISO(row.created_at);
    } else {
      h = 9; // default to 9am if no timestamp
      dow = dowFromDate(row.entry_date);
    }
    incHeat(h, dow);
  }

  const heatmap: HeatmapCell[] = [];
  for (let dow = 0; dow <= 4; dow++) {
    for (let hour = 8; hour <= 20; hour++) {
      const count = heatCounts.get(`${hour}:${dow}`) ?? 0;
      heatmap.push({ hour, dow, count });
    }
  }

  // ── Category breakdown ────────────────────────────────────────────────────
  const catMap = new Map<PmCategory, number>();
  const allEntries = db
    .prepare(
      `SELECT source, content FROM log_entries WHERE week_start = ? AND type != 'todo'`
    )
    .all(weekStart) as { source: EntrySource; content: string }[];
  const calCount = calRows.length;

  // Add calendar meetings as their own category count
  catMap.set("Meetings", calCount);

  for (const e of allEntries) {
    if (e.source === "calendar") continue; // already counted
    const cat = categoryForEntry(e.source, e.content);
    catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
  }

  const categories: CategorySlice[] = (
    ["Meetings", "Communication", "Development", "Planning", "Research", "Admin"] as PmCategory[]
  )
    .map((c) => ({ category: c, count: catMap.get(c) ?? 0 }))
    .filter((c) => c.count > 0);

  // ── Weekly trend (current + previous) ────────────────────────────────────
  const currentWeek = buildDayCounts(db, weekStart, weekEnd);
  const previousWeek = buildDayCounts(db, prevWeekStart, prevWeekEnd);

  // ── Insights ─────────────────────────────────────────────────────────────
  const insights = generateInsights({
    heatmap,
    categories,
    currentWeek,
    previousWeek,
    calCount,
    allEntriesCount: allEntries.length,
  });

  return {
    heatmap,
    categories,
    currentWeek,
    previousWeek,
    insights,
    weekStart,
    prevWeekStart,
  };
}

// ─── Day counts helper ─────────────────────────────────────────────────────────

function buildDayCounts(
  db: ReturnType<typeof getDb>,
  weekStart: string,
  weekEnd: string
): DayCount[] {
  const rows = db
    .prepare(
      `SELECT entry_date, COUNT(*) as count
       FROM log_entries
       WHERE entry_date >= ? AND entry_date <= ? AND type != 'todo'
       GROUP BY entry_date`
    )
    .all(weekStart, weekEnd) as { entry_date: string; count: number }[];

  // Also count calendar events
  const calRows = db
    .prepare(
      `SELECT entry_date, COUNT(*) as count
       FROM calendar_events
       WHERE entry_date >= ? AND entry_date <= ?
       GROUP BY entry_date`
    )
    .all(weekStart, weekEnd) as { entry_date: string; count: number }[];

  const dayMap = new Map<string, number>();
  for (const r of rows) dayMap.set(r.entry_date, (dayMap.get(r.entry_date) ?? 0) + r.count);
  for (const r of calRows) dayMap.set(r.entry_date, (dayMap.get(r.entry_date) ?? 0) + r.count);

  // Ensure all 5 weekdays are present
  const result: DayCount[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const dow = dowFromDate(d);
    if (dow <= 4) {
      result.push({ date: d, count: dayMap.get(d) ?? 0 });
    }
  }
  return result;
}

// ─── Insight generation ───────────────────────────────────────────────────────

interface InsightInput {
  heatmap: HeatmapCell[];
  categories: CategorySlice[];
  currentWeek: DayCount[];
  previousWeek: DayCount[];
  calCount: number;
  allEntriesCount: number;
}

const HOUR_LABELS: Record<number, string> = {
  8: "8am", 9: "9am", 10: "10am", 11: "11am", 12: "noon",
  13: "1pm", 14: "2pm", 15: "3pm", 16: "4pm", 17: "5pm",
  18: "6pm", 19: "7pm", 20: "8pm",
};
const DOW_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function generateInsights(inp: InsightInput): string[] {
  const bullets: string[] = [];

  // 1. Busiest hour
  const busiest = [...inp.heatmap].sort((a, b) => b.count - a.count)[0];
  if (busiest && busiest.count > 0) {
    bullets.push(
      `Most active at ${HOUR_LABELS[busiest.hour] ?? `${busiest.hour}h`} on ${DOW_LABELS[busiest.dow] ?? "weekdays"} (${busiest.count} items).`
    );
  }

  // 2. Busiest day this week
  const busyDay = [...inp.currentWeek].sort((a, b) => b.count - a.count)[0];
  const quietDay = [...inp.currentWeek].filter((d) => d.count > 0).sort((a, b) => a.count - b.count)[0];
  if (busyDay && busyDay.count > 0) {
    const label = new Date(busyDay.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    bullets.push(`${label} was your busiest day this week with ${busyDay.count} logged activities.`);
  }
  if (quietDay && quietDay.date !== busyDay?.date) {
    const label = new Date(quietDay.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    bullets.push(`${label} was your lightest day — consider protecting that time for deep work.`);
  }

  // 3. Week-over-week trend
  const curTotal = inp.currentWeek.reduce((s, d) => s + d.count, 0);
  const prevTotal = inp.previousWeek.reduce((s, d) => s + d.count, 0);
  if (prevTotal > 0) {
    const delta = curTotal - prevTotal;
    const pct = Math.round(Math.abs(delta / prevTotal) * 100);
    if (delta > 0) {
      bullets.push(`Activity is up ${pct}% vs last week (${curTotal} vs ${prevTotal} items).`);
    } else if (delta < 0) {
      bullets.push(`Activity is down ${pct}% vs last week (${curTotal} vs ${prevTotal} items).`);
    }
  }

  // 4. Top category
  const topCat = [...inp.categories].sort((a, b) => b.count - a.count)[0];
  const total = inp.categories.reduce((s, c) => s + c.count, 0);
  if (topCat && total > 0) {
    const pct = Math.round((topCat.count / total) * 100);
    bullets.push(`${topCat.category} accounts for ${pct}% of your week (${topCat.count} of ${total} activities).`);
  }

  // 5. Meeting load
  if (inp.calCount > 5) {
    bullets.push(`High meeting load this week (${inp.calCount} events) — look for opportunities to batch or cut.`);
  } else if (inp.calCount > 0) {
    bullets.push(`${inp.calCount} calendar events this week — relatively light on meetings.`);
  }

  return bullets.slice(0, 5);
}
