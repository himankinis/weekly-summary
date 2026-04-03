"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { format, parseISO, addDays, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Activity, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import type { TrendsData, PmCategory } from "@/lib/trends";

// ─── Week helpers ─────────────────────────────────────────────────────────────

function getThisWeekStart(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function prevWeek(w: string) { return format(subDays(parseISO(w), 7), "yyyy-MM-dd"); }
function nextWeek(w: string) { return format(addDays(parseISO(w), 7), "yyyy-MM-dd"); }
function isCurrentWeek(w: string) { return w === getThisWeekStart(); }

// ─── Heatmap constants ────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8–20
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HOUR_LABELS: Record<number, string> = {
  8: "8am", 9: "9am", 10: "10am", 11: "11am", 12: "12pm",
  13: "1pm", 14: "2pm", 15: "3pm", 16: "4pm", 17: "5pm",
  18: "6pm", 19: "7pm", 20: "8pm",
};

// ─── Category colors ──────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<PmCategory, string> = {
  Meetings:      "#3b82f6",
  Communication: "#14b8a6",
  Development:   "#f97316",
  Planning:      "#8b5cf6",
  Research:      "#ec4899",
  Admin:         "#94a3b8",
};

// ─── Heatmap component ────────────────────────────────────────────────────────

function Heatmap({ cells }: { cells: TrendsData["heatmap"] }) {
  const [tooltip, setTooltip] = useState<{ hour: number; dow: number; count: number } | null>(null);
  const maxCount = Math.max(...cells.map((c) => c.count), 1);

  function cellColor(count: number): string {
    if (count === 0) return "hsl(var(--muted))";
    const intensity = count / maxCount;
    // Blue spectrum matching primary
    const lightness = Math.round(70 - intensity * 45); // 70% (light) → 25% (dark)
    return `hsl(217, 91%, ${lightness}%)`;
  }

  const cellMap = new Map<string, number>();
  for (const c of cells) cellMap.set(`${c.hour}:${c.dow}`, c.count);

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Day header */}
        <div className="flex mb-1 pl-12">
          {DAYS.map((d) => (
            <div key={d} className="flex-1 text-center text-xs text-muted-foreground font-medium">
              {d}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        {HOURS.map((hour) => (
          <div key={hour} className="flex items-center mb-0.5">
            <div className="w-12 text-right pr-2 text-xs text-muted-foreground shrink-0">
              {HOUR_LABELS[hour]}
            </div>
            {DAYS.map((_, dow) => {
              const count = cellMap.get(`${hour}:${dow}`) ?? 0;
              return (
                <div key={dow} className="flex-1 px-0.5">
                  <div
                    className="w-full h-6 rounded-sm cursor-default transition-transform hover:scale-110 relative"
                    style={{ backgroundColor: cellColor(count) }}
                    onMouseEnter={() => setTooltip({ hour, dow, count })}
                    onMouseLeave={() => setTooltip(null)}
                    title={`${HOUR_LABELS[hour]} ${DAYS[dow]}: ${count} item${count !== 1 ? "s" : ""}`}
                  />
                </div>
              );
            })}
          </div>
        ))}

        {/* Tooltip */}
        {tooltip && (
          <div className="mt-2 text-xs text-center text-muted-foreground">
            {HOUR_LABELS[tooltip.hour]} on {DAYS[tooltip.dow]}:{" "}
            <span className="font-medium text-foreground">
              {tooltip.count} item{tooltip.count !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 justify-end">
          <span className="text-xs text-muted-foreground">Less</span>
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v, i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: v === 0 ? "hsl(var(--muted))" : `hsl(217, 91%, ${Math.round(70 - v * 45)}%)` }}
            />
          ))}
          <span className="text-xs text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  );
}

// ─── Category chart ───────────────────────────────────────────────────────────

function CategoryChart({ categories }: { categories: TrendsData["categories"] }) {
  if (categories.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No activity data yet.</p>;
  }

  const total = categories.reduce((s, c) => s + c.count, 0);
  const data = categories.map((c) => ({ ...c, pct: Math.round((c.count / total) * 100) }));

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="category"
            width={100}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value) => {
              const v = typeof value === "number" ? value : 0;
              return [`${v} items (${Math.round((v / total) * 100)}%)`];
            }}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((entry) => (
              <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category as PmCategory]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Percentage labels */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((c) => (
          <div key={c.category} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: CATEGORY_COLORS[c.category as PmCategory] }}
            />
            <span className="text-xs text-muted-foreground">
              {c.category} <span className="font-medium text-foreground">{c.pct}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Trend comparison chart ───────────────────────────────────────────────────

function TrendChart({
  currentWeek,
  previousWeek,
  weekStart,
  prevWeekStart,
}: Pick<TrendsData, "currentWeek" | "previousWeek" | "weekStart" | "prevWeekStart">) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const data = days.map((day, i) => ({
    day,
    current: currentWeek[i]?.count ?? 0,
    previous: previousWeek[i]?.count ?? 0,
  }));

  const curLabel = format(parseISO(weekStart), "MMM d");
  const prevLabel = format(parseISO(prevWeekStart), "MMM d");

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={24} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="current"
          name={`This week (${curLabel})`}
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="previous"
          name={`Last week (${prevLabel})`}
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={{ r: 2 }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrendsPage() {
  const [weekStart, setWeekStart] = useState(getThisWeekStart);
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (week: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trends?week=${week}`);
      const json = await res.json();
      if (json.ok) setData(json.data);
      else setError(json.error ?? "Unknown error");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(weekStart); }, [weekStart, fetchData]);

  const isCurrent = isCurrentWeek(weekStart);
  const weekEnd = format(addDays(parseISO(weekStart), 6), "MMM d");
  const weekStartFmt = format(parseISO(weekStart), "MMM d");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">Time Intelligence</span>
          </div>

          {/* Week nav */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setWeekStart(prevWeek(weekStart))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium min-w-[150px] text-center">
              {weekStartFmt}–{weekEnd}, {format(parseISO(weekStart), "yyyy")}
              {isCurrent && (
                <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  This week
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setWeekStart(nextWeek(weekStart))}
              disabled={isCurrent}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {error && (
          <div className="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3">{error}</div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
        ) : data ? (
          <>
            {/* Row 1: Heatmap (full width) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Activity Heatmap</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Work intensity by hour and day — calendar events, logged entries, and Claude activity
                </p>
              </CardHeader>
              <CardContent>
                <Heatmap cells={data.heatmap} />
              </CardContent>
            </Card>

            {/* Row 2: Category + Trend side-by-side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Work Category Breakdown</CardTitle>
                  <p className="text-xs text-muted-foreground">How you spent your time this week</p>
                </CardHeader>
                <CardContent>
                  <CategoryChart categories={data.categories} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Weekly Trend</CardTitle>
                  <p className="text-xs text-muted-foreground">Daily activity vs the previous week</p>
                </CardHeader>
                <CardContent>
                  <TrendChart
                    currentWeek={data.currentWeek}
                    previousWeek={data.previousWeek}
                    weekStart={data.weekStart}
                    prevWeekStart={data.prevWeekStart}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Row 3: Insights */}
            {data.insights.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Time Allocation Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {data.insights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 shrink-0 text-primary font-bold">•</span>
                        {insight}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
