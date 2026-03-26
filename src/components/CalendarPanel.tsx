"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  RefreshCw,
  Loader2,
  Trash2,
  Settings2,
  CheckCircle2,
  Users,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { CalendarEvent } from "@/lib/types";

interface Props {
  weekStart: string;
}

interface SyncResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  range: { from: string; to: string };
}

export default function CalendarPanel({ weekStart }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [icsUrl, setIcsUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (week: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?week=${week}`);
      const json = await res.json();
      if (json.ok) setEvents(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load saved ICS URL from settings
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((json) => {
        if (json.ok && json.data.ics_url) {
          setSavedUrl(json.data.ics_url);
          setIcsUrl(json.data.ics_url);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchEvents(weekStart);
  }, [weekStart, fetchEvents]);

  const handleSync = async () => {
    setError(null);
    setSyncing(true);
    try {
      const body: { ics_url?: string } = {};
      if (icsUrl.trim() && icsUrl.trim() !== savedUrl) {
        body.ics_url = icsUrl.trim();
      }
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setLastSync(json.data as SyncResult);
      if (icsUrl.trim()) setSavedUrl(icsUrl.trim());
      await fetchEvents(weekStart);
      setShowSetup(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/calendar?id=${id}`, { method: "DELETE" });
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const groupByDay = (evs: CalendarEvent[]) => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of evs) {
      const day = ev.entry_date;
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(ev);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  };

  const grouped = groupByDay(events);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-500" />
            Meetings
            {events.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                ({events.length})
              </span>
            )}
          </CardTitle>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowSetup((v) => !v)}
              title="Configure ICS feed"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
            {savedUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleSync}
                disabled={syncing}
                title="Sync now"
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Setup panel */}
        {showSetup && (
          <div className="rounded-lg border border-dashed border-border p-3 space-y-2.5">
            <p className="text-xs text-muted-foreground">
              Paste your calendar ICS URL. Find it in Google Calendar → Settings → your calendar → "Secret address in iCal format".
            </p>
            <input
              type="url"
              value={icsUrl}
              onChange={(e) => setIcsUrl(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/..."
              className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="text-xs h-7"
                onClick={handleSync}
                disabled={syncing || !icsUrl.trim()}
              >
                {syncing ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1.5" />
                )}
                {syncing ? "Syncing…" : "Save & Sync"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7"
                onClick={() => setShowSetup(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 text-destructive px-3 py-2 text-xs">
            {error}
          </div>
        )}

        {/* Sync result feedback */}
        {lastSync && !error && (
          <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 rounded-md px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            Synced: {lastSync.imported} new
            {lastSync.updated > 0 && `, ${lastSync.updated} updated`}
            {lastSync.errors.length > 0 && (
              <span className="text-amber-600 ml-1">
                · {lastSync.errors.length} skipped
              </span>
            )}
          </div>
        )}

        {/* No URL configured yet */}
        {!savedUrl && !showSetup && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">
              Connect a calendar to auto-populate meetings.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSetup(true)}
            >
              <Settings2 className="h-3.5 w-3.5 mr-1.5" />
              Add ICS Feed
            </Button>
          </div>
        )}

        {/* Event list */}
        {loading && savedUrl && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {!loading && savedUrl && events.length === 0 && (
          <p className="text-sm text-center text-muted-foreground py-4">
            No meetings this week.
          </p>
        )}

        {!loading && grouped.length > 0 && (
          <div className="space-y-4">
            {grouped.map(([day, dayEvents]) => (
              <div key={day}>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  {format(parseISO(day), "EEEE, MMM d")}
                </p>
                <div className="space-y-1.5">
                  {dayEvents.map((ev) => (
                    <EventRow key={ev.id} event={ev} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EventRow({
  event,
  onDelete,
}: {
  event: CalendarEvent;
  onDelete: (id: number) => void;
}) {
  const startTime = format(new Date(event.start_time), "h:mm a");
  const endTime = format(new Date(event.end_time), "h:mm a");
  const durationMs =
    new Date(event.end_time).getTime() - new Date(event.start_time).getTime();
  const durationMin = Math.round(durationMs / 60000);

  return (
    <div className="group flex items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-accent/50 transition-colors">
      {/* Time block */}
      <div className="text-xs text-muted-foreground w-16 flex-shrink-0 tabular-nums">
        {startTime}
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{event.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {durationMin < 60
              ? `${durationMin}m`
              : `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? ` ${durationMin % 60}m` : ""}`}
          </span>
          {event.attendee_count > 1 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {event.attendee_count}
            </span>
          )}
        </div>
      </div>

      {/* Delete */}
      <Button
        variant="ghost"
        size="icon"
        className="opacity-0 group-hover:opacity-100 h-6 w-6 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(event.id)}
        title="Remove meeting"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}
