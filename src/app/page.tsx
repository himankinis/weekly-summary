"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import DailyLogInput from "@/components/DailyLogInput";
import EntryList from "@/components/EntryList";
import SummaryPanel from "@/components/SummaryPanel";
import CalendarPanel from "@/components/CalendarPanel";
import AtlassianPanel from "@/components/AtlassianPanel";
import EmailPanel from "@/components/EmailPanel";
import TodosPanel from "@/components/TodosPanel";
import WeekNav from "@/components/WeekNav";
import PastSummariesPanel from "@/components/PastSummariesPanel";
import { format, subDays, parseISO } from "date-fns";
import { Activity, Zap } from "lucide-react";
import type { LogEntry } from "@/lib/types";

function getThisWeekStart(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

interface WeekCounts {
  highlights: number;
  lowlights: number;
  blockers: number;
}

export default function Dashboard() {
  const [weekStart, setWeekStart] = useState(getThisWeekStart);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [prevCounts, setPrevCounts] = useState<WeekCounts | null>(null);
  const [meetingCount, setMeetingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summaryKey, setSummaryKey] = useState(0);

  const fetchEntries = useCallback(async (week: string) => {
    setLoading(true);
    const prevWeek = format(subDays(parseISO(week), 7), "yyyy-MM-dd");
    try {
      const [entriesRes, calRes, prevRes] = await Promise.all([
        fetch(`/api/entries?week=${week}`),
        fetch(`/api/calendar?week=${week}`),
        fetch(`/api/entries?week=${prevWeek}`),
      ]);
      const [entriesJson, calJson, prevJson] = await Promise.all([
        entriesRes.json(),
        calRes.json(),
        prevRes.json(),
      ]);
      if (entriesJson.ok) setEntries(entriesJson.data);
      if (calJson.ok) setMeetingCount(calJson.data.length);
      if (prevJson.ok) {
        const prev: LogEntry[] = prevJson.data;
        setPrevCounts({
          highlights: prev.filter((e) => e.type === "highlight" && e.source !== "hook").length,
          lowlights:  prev.filter((e) => e.type === "lowlight"  && e.source !== "hook").length,
          blockers:   prev.filter((e) => e.type === "blocker"   && e.source !== "hook").length,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(weekStart);
    setSummaryKey((k) => k + 1);
  }, [weekStart, fetchEntries]);

  const handleEntryAdded = (entry: LogEntry) => {
    setEntries((prev) => [entry, ...prev]);
  };

  const handleEntryDeleted = (id: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleEntryUpdated = (updated: LogEntry) => {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  const highlightCount = entries.filter((e) => e.type === "highlight" && e.source !== "hook").length;
  const lowlightCount  = entries.filter((e) => e.type === "lowlight"  && e.source !== "hook").length;
  const blockerCount   = entries.filter((e) => e.type === "blocker"   && e.source !== "hook").length;
  const hookCount      = entries.filter((e) => e.source === "hook").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">Weekly Summary</span>
          </div>
          <WeekNav weekStart={weekStart} onWeekChange={setWeekStart} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard value={highlightCount} label="Highlights" color="green" />
          <StatCard value={lowlightCount}  label="Lowlights"  color="amber" />
          <StatCard value={blockerCount}   label="Blockers"   color="red"   />
          <StatCard value={meetingCount}   label="Meetings"   color="blue"  />
          <StatCard value={hookCount} label="Auto-captured" color="slate" icon={<Zap className="h-3.5 w-3.5" />} />
        </div>

        {/* Progress bar + trend */}
        {!loading && (
          <ProgressBar
            highlights={highlightCount}
            lowlights={lowlightCount}
            blockers={blockerCount}
            prev={prevCounts}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column */}
          <div className="lg:col-span-3 space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Log an entry</CardTitle>
                <CardDescription>
                  {format(new Date(), "EEEE, MMMM d")} — quick-capture a highlight, lowlight, or blocker
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DailyLogInput onEntryAdded={handleEntryAdded} />
              </CardContent>
            </Card>

            <TodosPanel weekStart={weekStart} />

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">This week's log</CardTitle>
                  {!loading && (
                    <span className="text-xs text-muted-foreground">
                      {entries.length} {entries.length === 1 ? "entry" : "entries"}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
                ) : (
                  <EntryList entries={entries} onDelete={handleEntryDeleted} onUpdate={handleEntryUpdated} />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-5">
            <SummaryPanel key={`${weekStart}-${summaryKey}`} weekStart={weekStart} />
            <AtlassianPanel onSynced={() => fetchEntries(weekStart)} />
            <EmailPanel onSynced={() => fetchEntries(weekStart)} />
            <CalendarPanel weekStart={weekStart} />
            <PastSummariesPanel />
          </div>
        </div>
      </main>

      <footer className="mt-12 border-t border-border py-4">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Weekly Summary — local-first, data stays on your machine</span>
          <span>~/.weekly-pulse/weekly-pulse.db</span>
        </div>
      </footer>
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  highlights,
  lowlights,
  blockers,
  prev,
}: {
  highlights: number;
  lowlights: number;
  blockers: number;
  prev: WeekCounts | null;
}) {
  const total = highlights + lowlights + blockers;
  if (total === 0) return null;

  const hPct = Math.round((highlights / total) * 100);
  const lPct = Math.round((lowlights  / total) * 100);
  const bPct = 100 - hPct - lPct;

  // Trend deltas vs prev week
  const trends: string[] = [];
  if (prev) {
    const diffs: { label: string; delta: number }[] = [
      { label: "highlight", delta: highlights - prev.highlights },
      { label: "lowlight",  delta: lowlights  - prev.lowlights  },
      { label: "blocker",   delta: blockers   - prev.blockers   },
    ];
    for (const { label, delta } of diffs) {
      if (delta === 0) continue;
      const arrow = delta > 0 ? "↑" : "↓";
      const abs = Math.abs(delta);
      trends.push(`${arrow} ${abs} ${label}${abs > 1 ? "s" : ""}`);
      if (trends.length === 2) break;
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {hPct > 0 && <div className="bg-green-500" style={{ width: `${hPct}%` }} />}
        {lPct > 0 && <div className="bg-amber-400" style={{ width: `${lPct}%` }} />}
        {bPct > 0 && <div className="bg-red-500"   style={{ width: `${bPct}%` }} />}
      </div>
      {trends.length > 0 && (
        <p className="text-xs text-muted-foreground">
          vs last week: {trends.join(" · ")}
        </p>
      )}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  value,
  label,
  color,
  icon,
}: {
  value: number;
  label: string;
  color: "green" | "amber" | "red" | "blue" | "slate";
  icon?: React.ReactNode;
}) {
  const colorMap = {
    green: "text-green-700 dark:text-green-400",
    amber: "text-amber-700 dark:text-amber-400",
    red:   "text-red-700 dark:text-red-400",
    blue:  "text-blue-700 dark:text-blue-400",
    slate: "text-slate-600 dark:text-slate-400",
  };

  return (
    <Card className="py-4 px-4">
      <div className="flex items-center gap-1.5">
        <span className={`text-2xl font-bold tabular-nums ${colorMap[color]}`}>{value}</span>
        {icon && <span className={colorMap[color]}>{icon}</span>}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </Card>
  );
}
