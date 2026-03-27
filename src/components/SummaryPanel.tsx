"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  Loader2, Copy, Download, CheckCheck, Sparkles, RefreshCw,
} from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import type { WeeklySummaryData, SummaryItem } from "@/lib/types";

type Audience = "self" | "manager" | "stakeholders";

interface Props {
  weekStart: string;
}

export default function SummaryPanel({ weekStart }: Props) {
  const [summary, setSummary] = useState<WeeklySummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>("self");

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
      setSummary(json.data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setLoading(false);
    }
  };

  const buildCopyText = (s: WeeklySummaryData, aud: Audience): string => {
    const lines: string[] = [];
    const weekRange = `${format(parseISO(s.weekStart), "MMM d")}–${format(parseISO(s.weekEnd), "MMM d")}`;

    lines.push(`Weekly Summary — ${weekRange}`);
    lines.push("");
    lines.push(quantLine(s));
    lines.push("");
    lines.push(s.narrative);
    lines.push("");

    const highlights = audienceHighlights(s, aud);
    if (highlights.length > 0) {
      lines.push("✅ Highlights");
      highlights.forEach((h) => lines.push(`• ${h.content}`));
      lines.push("");
    }

    if (aud !== "stakeholders" && s.lowlights.length > 0) {
      lines.push("⚠️ Lowlights");
      s.lowlights.forEach((l) => lines.push(`• ${l.content}`));
      lines.push("");
    }

    if (s.blockers.length > 0) {
      lines.push("🚫 Blockers");
      s.blockers.forEach((b) => lines.push(`• ${b.content}`));
      lines.push("");
    }

    if (aud !== "stakeholders" && s.decisions.length > 0) {
      lines.push("🎯 Key Decisions");
      s.decisions.forEach((d) => lines.push(`• ${d.content}`));
      lines.push("");
    }

    if (aud === "self" && s.meetings.length > 0) {
      lines.push("📅 Meetings");
      s.meetings.forEach((m) => lines.push(`• ${m.title}`));
      lines.push("");
    }

    if (aud !== "stakeholders" && s.nextWeekPreview.length > 0) {
      lines.push("🔭 Next Week");
      s.nextWeekPreview.forEach((p) => lines.push(`• ${p}`));
    }

    return lines.join("\n");
  };

  const copyToClipboard = async () => {
    if (!summary) return;
    await navigator.clipboard.writeText(buildCopyText(summary, audience));
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Weekly Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            {summary && (
              <>
                <Select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as Audience)}
                  className="h-7 text-xs py-0 px-2 w-auto"
                >
                  <option value="self">For myself</option>
                  <option value="manager">For 1:1</option>
                  <option value="stakeholders">For stakeholders</option>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => generate(true)} disabled={loading} title="Regenerate">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={copyToClipboard} disabled={copied}>
                  {copied ? <CheckCheck className="h-3.5 w-3.5 mr-1.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
                <Button variant="outline" size="sm" onClick={downloadMarkdown}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  .md
                </Button>
              </>
            )}
          </div>
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
          <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
        )}

        {summary && !loading && (
          <div className="space-y-4">
            {/* Quantitative line */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              {quantLine(summary)}
            </p>

            {/* Narrative */}
            <blockquote className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground italic">
              {summary.narrative}
            </blockquote>

            {/* Highlights */}
            {audienceHighlights(summary, audience).length > 0 && (
              <SummarySection
                title="✅ Highlights"
                items={audienceHighlights(summary, audience).map((h) => ({
                  text: h.content,
                  badge: h.source !== "manual" ? h.source : undefined,
                }))}
              />
            )}

            {/* Lowlights — hidden for stakeholders */}
            {audience !== "stakeholders" && summary.lowlights.length > 0 && (
              <SummarySection
                title="⚠️ Lowlights"
                items={summary.lowlights.map((l) => ({ text: l.content }))}
              />
            )}

            {/* Blockers */}
            {summary.blockers.length > 0 && (
              <SummarySection
                title="🚫 Blockers"
                items={summary.blockers.map((b) => ({ text: b.content }))}
              />
            )}

            {/* Key Decisions — hidden for stakeholders */}
            {audience !== "stakeholders" && summary.decisions.length > 0 && (
              <SummarySection
                title="🎯 Key Decisions"
                items={summary.decisions.map((d) => ({ text: d.content }))}
              />
            )}

            {/* Meetings — only for "self" */}
            {audience === "self" && summary.meetings.length > 0 && (
              <SummarySection
                title="📅 Meetings"
                items={summary.meetings.map((m) => ({
                  text: m.title + (m.attendee_count > 0 ? ` (${m.attendee_count})` : ""),
                  sub: m.related?.map((r) => `Related: ${r}`),
                }))}
              />
            )}

            {/* Next week — hidden for stakeholders */}
            {audience !== "stakeholders" && summary.nextWeekPreview.length > 0 && (
              <SummarySection
                title="🔭 Next Week"
                items={summary.nextWeekPreview.map((p) => ({ text: p }))}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function quantLine(s: WeeklySummaryData): string {
  const parts = [
    `${s.stats.highlight_count} highlight${s.stats.highlight_count !== 1 ? "s" : ""}`,
    `${s.stats.lowlight_count} lowlight${s.stats.lowlight_count !== 1 ? "s" : ""}`,
    `${s.stats.blocker_count} blocker${s.stats.blocker_count !== 1 ? "s" : ""}`,
  ].join(" · ");
  const extras: string[] = [];
  if (s.stats.meeting_count > 0) extras.push(`${s.stats.meeting_count} meetings`);
  if (s.stats.jira_count > 0) extras.push(`${s.stats.jira_count} Jira tickets`);
  if (s.stats.email_count > 0) extras.push(`${s.stats.email_count} emails`);
  return `This week: ${parts}${extras.length > 0 ? " | " + extras.join(" | ") : ""}`;
}

function audienceHighlights(s: WeeklySummaryData, audience: Audience): SummaryItem[] {
  if (audience === "stakeholders") {
    return s.highlights.filter((h) => h.source === "manual").slice(0, 3);
  }
  if (audience === "manager") {
    return s.highlights.slice(0, 5);
  }
  return s.highlights;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummarySection({
  title,
  items,
}: {
  title: string;
  items: { text: string; badge?: string; sub?: string[] }[];
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-1.5">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground mt-1 text-xs shrink-0">•</span>
              <span>
                {item.text}
                {item.badge && (
                  <span className="ml-1.5 text-xs text-muted-foreground">({item.badge})</span>
                )}
              </span>
            </div>
            {item.sub && item.sub.map((s, j) => (
              <p key={j} className="ml-4 text-xs text-muted-foreground italic mt-0.5">{s}</p>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
