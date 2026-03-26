"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Copy,
  Download,
  CheckCheck,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import type { WeeklySummaryData } from "@/lib/types";

interface Props {
  weekStart: string;
}

export default function SummaryPanel({ weekStart }: Props) {
  const [summary, setSummary] = useState<WeeklySummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (force) {
        res = await fetch("/api/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ week: weekStart }),
        });
      } else {
        res = await fetch(`/api/summary?week=${weekStart}&cached=false`);
      }
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      // API returns { data: { summary } } for fresh, or { data: { summary, summary_json } } for cached
      setSummary(json.data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!summary) return;
    const lines: string[] = [];
    const weekRange = `${format(parseISO(summary.weekStart), "MMM d")}–${format(parseISO(summary.weekEnd), "MMM d")}`;
    lines.push(`Weekly Summary — ${weekRange}`);
    lines.push("");
    lines.push(summary.narrative);
    lines.push("");

    if (summary.highlights.length > 0) {
      lines.push("✅ Highlights");
      summary.highlights.forEach((h) => lines.push(`• ${h.content}`));
      lines.push("");
    }
    if (summary.lowlights.length > 0) {
      lines.push("⚠️ Lowlights");
      summary.lowlights.forEach((l) => lines.push(`• ${l.content}`));
      lines.push("");
    }
    if (summary.blockers.length > 0) {
      lines.push("🚫 Blockers");
      summary.blockers.forEach((b) => lines.push(`• ${b.content}`));
      lines.push("");
    }
    if (summary.meetings.length > 0) {
      lines.push("📅 Meetings");
      summary.meetings.forEach((m) => lines.push(`• ${m.title}`));
    }

    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = () => {
    window.open(`/api/export?week=${weekStart}&format=markdown`, "_blank");
  };

  const weekEnd = addDays(parseISO(weekStart), 6);
  const weekRange = `${format(parseISO(weekStart), "MMM d")}–${format(weekEnd, "MMM d")}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Weekly Summary
          </CardTitle>
          {summary && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => generate(true)}
                disabled={loading}
                title="Regenerate"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
                disabled={copied}
              >
                {copied ? (
                  <CheckCheck className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                )}
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" onClick={downloadMarkdown}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                .md
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {!summary && !loading && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-4">
              Generate a structured summary of your week's work.
            </p>
            <Button onClick={() => generate(false)} disabled={loading}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Summary
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Building your summary…</span>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {summary && !loading && (
          <div className="space-y-5">
            {/* Stats row */}
            <div className="flex flex-wrap gap-2">
              <StatBadge label="Highlights" count={summary.stats.highlight_count} color="green" />
              <StatBadge label="Lowlights" count={summary.stats.lowlight_count} color="amber" />
              <StatBadge label="Blockers" count={summary.stats.blocker_count} color="red" />
              <StatBadge label="Meetings" count={summary.stats.meeting_count} color="blue" />
              <StatBadge label="Active days" count={summary.stats.days_active} color="slate" />
            </div>

            {/* Narrative */}
            <blockquote className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground italic">
              {summary.narrative}
            </blockquote>

            {/* Sections */}
            {summary.highlights.length > 0 && (
              <SummarySection title="✅ Highlights" items={summary.highlights.map((h) => h.content)} />
            )}
            {summary.lowlights.length > 0 && (
              <SummarySection title="⚠️ Lowlights" items={summary.lowlights.map((l) => l.content)} />
            )}
            {summary.blockers.length > 0 && (
              <SummarySection title="🚫 Blockers" items={summary.blockers.map((b) => b.content)} />
            )}
            {summary.meetings.length > 0 && (
              <SummarySection
                title="📅 Meetings"
                items={summary.meetings.map(
                  (m) => `${m.title}${m.attendee_count > 0 ? ` (${m.attendee_count} attendees)` : ""}`
                )}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "green" | "amber" | "red" | "blue" | "slate";
}) {
  const colorMap = {
    green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[color]}`}
    >
      <strong>{count}</strong> {label}
    </span>
  );
}

function SummarySection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm flex items-start gap-2">
            <span className="text-muted-foreground mt-1 text-xs">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
