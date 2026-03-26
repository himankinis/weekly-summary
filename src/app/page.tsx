"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import DailyLogInput from "@/components/DailyLogInput";
import EntryList from "@/components/EntryList";
import SummaryPanel from "@/components/SummaryPanel";
import CalendarPanel from "@/components/CalendarPanel";
import WeekNav from "@/components/WeekNav";
import { format } from "date-fns";
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

export default function Dashboard() {
  const [weekStart, setWeekStart] = useState(getThisWeekStart);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [meetingCount, setMeetingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summaryKey, setSummaryKey] = useState(0); // bump to remount SummaryPanel

  const fetchEntries = useCallback(async (week: string) => {
    setLoading(true);
    try {
      const [entriesRes, calRes] = await Promise.all([
        fetch(`/api/entries?week=${week}`),
        fetch(`/api/calendar?week=${week}`),
      ]);
      const [entriesJson, calJson] = await Promise.all([
        entriesRes.json(),
        calRes.json(),
      ]);
      if (entriesJson.ok) setEntries(entriesJson.data);
      if (calJson.ok) setMeetingCount(calJson.data.length);
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

  const highlightCount = entries.filter((e) => e.type === "highlight").length;
  const lowlightCount = entries.filter((e) => e.type === "lowlight").length;
  const blockerCount = entries.filter((e) => e.type === "blocker").length;
  const hookCount = entries.filter((e) => e.source === "hook").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">Weekly Pulse</span>
          </div>
          <WeekNav weekStart={weekStart} onWeekChange={setWeekStart} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard value={highlightCount} label="Highlights" color="green" />
          <StatCard value={lowlightCount} label="Lowlights" color="amber" />
          <StatCard value={blockerCount} label="Blockers" color="red" />
          <StatCard value={meetingCount} label="Meetings" color="blue" />
          <StatCard
            value={hookCount}
            label="Auto-captured"
            color="slate"
            icon={<Zap className="h-3.5 w-3.5" />}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column: log input + entry list */}
          <div className="lg:col-span-3 space-y-5">
            {/* Daily log input */}
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

            {/* Entry list */}
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
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : (
                  <EntryList entries={entries} onDelete={handleEntryDeleted} />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: summary + calendar */}
          <div className="lg:col-span-2 space-y-5">
            <SummaryPanel key={`${weekStart}-${summaryKey}`} weekStart={weekStart} />
            <CalendarPanel weekStart={weekStart} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-border py-4">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Weekly Pulse — local-first, data stays on your machine</span>
          <span>~/.weekly-pulse/weekly-pulse.db</span>
        </div>
      </footer>
    </div>
  );
}

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
    red: "text-red-700 dark:text-red-400",
    blue: "text-blue-700 dark:text-blue-400",
    slate: "text-slate-600 dark:text-slate-400",
  };

  return (
    <Card className="py-4 px-4">
      <div className="flex items-center gap-1.5">
        <span className={`text-2xl font-bold tabular-nums ${colorMap[color]}`}>
          {value}
        </span>
        {icon && <span className={colorMap[color]}>{icon}</span>}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </Card>
  );
}
