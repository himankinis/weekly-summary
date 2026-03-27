"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  History, ChevronDown, ChevronRight, Copy, CheckCheck, Loader2,
} from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import type { WeeklySummaryData, SummaryItem } from "@/lib/types";

interface HistoryEntry {
  week_start: string;
  generated_at: string;
  summary: WeeklySummaryData;
}

type Audience = "ppm" | "stakeholders" | "manager" | "self";

export default function PastSummariesPanel() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>("ppm");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/summary/history")
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setHistory(json.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (week: string) =>
    setExpandedWeek((prev) => (prev === week ? null : week));

  const copy = async (entry: HistoryEntry) => {
    const text = buildText(entry.summary, audience);
    await navigator.clipboard.writeText(text);
    setCopied(entry.week_start);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Past Summaries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Past Summaries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            No saved summaries yet. Generate a summary for a week to see it here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Past Summaries
            <span className="text-xs font-normal text-muted-foreground">({history.length})</span>
          </CardTitle>
          <Select
            value={audience}
            onChange={(e) => setAudience(e.target.value as Audience)}
            className="h-7 text-xs py-0 px-2 w-auto"
          >
            <option value="ppm">PPM Weekly</option>
            <option value="stakeholders">For stakeholders</option>
            <option value="manager">For 1:1</option>
            <option value="self">For myself</option>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {history.map((entry) => {
            const ws = format(parseISO(entry.week_start), "MMM d");
            const we = format(addDays(parseISO(entry.week_start), 6), "MMM d");
            const s = entry.summary;
            const isOpen = expandedWeek === entry.week_start;

            return (
              <div key={entry.week_start}>
                {/* Row header */}
                <button
                  onClick={() => toggle(entry.week_start)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  {isOpen
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{ws} – {we}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {s.stats.highlight_count}H · {s.stats.lowlight_count}L · {s.stats.blocker_count}B
                      {s.stats.meeting_count > 0 && ` · ${s.stats.meeting_count} meetings`}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(parseISO(entry.generated_at.replace(" ", "T") + "Z"), "MMM d")}
                  </span>
                </button>

                {/* Expanded summary */}
                {isOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Copy button */}
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copy(entry)}
                        disabled={copied === entry.week_start}
                      >
                        {copied === entry.week_start
                          ? <><CheckCheck className="h-3.5 w-3.5 mr-1.5 text-green-600" />Copied!</>
                          : <><Copy className="h-3.5 w-3.5 mr-1.5" />Copy</>
                        }
                      </Button>
                    </div>

                    {/* Summary body */}
                    <CompactSummaryView summary={s} audience={audience} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Compact summary display ──────────────────────────────────────────────────

function CompactSummaryView({
  summary: s,
  audience,
}: {
  summary: WeeklySummaryData;
  audience: Audience;
}) {
  if (audience === "ppm") return <PPMCompact summary={s} />;
  if (audience === "stakeholders") return <StakeholdersCompact summary={s} />;
  if (audience === "manager") return <ManagerCompact summary={s} />;
  return <SelfCompact summary={s} />;
}

// PPM compact
function PPMCompact({ summary: s }: { summary: WeeklySummaryData }) {
  const highlights = ppmHighlights(s);
  const blockers   = ppmBlockers(s);
  const rows = Math.max(highlights.length, blockers.length, 1);

  return (
    <div className="rounded-md border border-border bg-muted/40 overflow-hidden">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-muted">
            <th className="border-b border-border px-3 py-1.5 text-left font-semibold w-1/2">Highlights</th>
            <th className="border-b border-border px-3 py-1.5 text-left font-semibold w-1/2">Blockers</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              <td className="px-3 py-1.5 align-top">
                {highlights[i] && <span>· {highlights[i].content}</span>}
              </td>
              <td className="px-3 py-1.5 align-top text-red-700 dark:text-red-400">
                {blockers[i] && <span>· {blockers[i].content}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Stakeholders compact
function StakeholdersCompact({ summary: s }: { summary: WeeklySummaryData }) {
  const manualH = s.highlights.filter((h) => h.source === "manual");

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">{quantLine(s)}</p>
      {s.narrative && (
        <blockquote className="border-l-2 border-primary/40 pl-3 text-xs text-muted-foreground italic">
          {s.narrative}
        </blockquote>
      )}
      {manualH.length > 0 && (
        <BulletSection title="Highlights" items={manualH.map((h) => h.content)} />
      )}
      {s.blockers.length > 0 && (
        <BulletSection title="Blockers" items={s.blockers.map((b) => b.content)} color="red" />
      )}
    </div>
  );
}

// Manager compact
function ManagerCompact({ summary: s }: { summary: WeeklySummaryData }) {
  return (
    <div className="space-y-3 text-sm">
      <StakeholdersCompact summary={s} />
      {s.decisions.length > 0 && (
        <BulletSection title="🎯 Key Decisions" items={s.decisions.map((d) => d.content)} />
      )}
      {s.nextWeekPreview.length > 0 && (
        <BulletSection title="🔭 Next Week" items={s.nextWeekPreview} />
      )}
    </div>
  );
}

// Self compact
function SelfCompact({ summary: s }: { summary: WeeklySummaryData }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">{quantLine(s)}</p>
      {s.narrative && (
        <blockquote className="border-l-2 border-primary/40 pl-3 text-xs text-muted-foreground italic">
          {s.narrative}
        </blockquote>
      )}
      {s.highlights.length > 0 && (
        <BulletSection title="✅ Highlights" items={s.highlights.map((h) => h.content + (h.source !== "manual" ? ` (${h.source})` : ""))} />
      )}
      {s.lowlights.length > 0 && (
        <BulletSection title="⚠️ Lowlights" items={s.lowlights.map((l) => l.content)} />
      )}
      {s.blockers.length > 0 && (
        <BulletSection title="🚫 Blockers" items={s.blockers.map((b) => b.content)} color="red" />
      )}
      {s.decisions.length > 0 && (
        <BulletSection title="🎯 Key Decisions" items={s.decisions.map((d) => d.content)} />
      )}
    </div>
  );
}

function BulletSection({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color?: "red";
}) {
  return (
    <div>
      <p className="font-semibold text-xs mb-1">{title}</p>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className={`flex items-start gap-1.5 text-xs ${color === "red" ? "text-red-700 dark:text-red-400" : ""}`}>
            <span className="shrink-0 mt-0.5 text-muted-foreground">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Shared helpers (mirrors SummaryPanel) ────────────────────────────────────

function ppmHighlights(s: WeeklySummaryData): SummaryItem[] {
  const order = ["manual", "jira", "hook", "email", "calendar"];
  return [...s.highlights].sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source)).slice(0, 5);
}

function ppmBlockers(s: WeeklySummaryData): SummaryItem[] {
  return s.blockers.filter((b) => b.source === "manual" || b.source === "jira").slice(0, 3);
}

function quantLine(s: WeeklySummaryData): string {
  const parts = [
    `${s.stats.highlight_count} highlight${s.stats.highlight_count !== 1 ? "s" : ""}`,
    `${s.stats.lowlight_count} lowlight${s.stats.lowlight_count !== 1 ? "s" : ""}`,
    `${s.stats.blocker_count} blocker${s.stats.blocker_count !== 1 ? "s" : ""}`,
  ].join(" · ");
  const extras: string[] = [];
  if (s.stats.meeting_count > 0) extras.push(`${s.stats.meeting_count} meetings`);
  if (s.stats.jira_count > 0)    extras.push(`${s.stats.jira_count} Jira tickets`);
  if (s.stats.email_count > 0)   extras.push(`${s.stats.email_count} emails`);
  return `This week: ${parts}${extras.length > 0 ? " | " + extras.join(" | ") : ""}`;
}

// ─── Copy text builders ───────────────────────────────────────────────────────

function buildText(s: WeeklySummaryData, audience: Audience): string {
  if (audience === "ppm")          return buildPPMText(s);
  if (audience === "stakeholders") return buildStakeholdersText(s);
  if (audience === "manager")      return buildManagerText(s);
  return buildSelfText(s);
}

function buildPPMText(s: WeeklySummaryData): string {
  const ws = format(parseISO(s.weekStart), "MMM d");
  const we = format(parseISO(s.weekEnd),   "MMM d");
  const highlights = ppmHighlights(s);
  const blockers   = ppmBlockers(s);
  const rows = Math.max(highlights.length, blockers.length, 1);
  const lines = [
    `## ${ws} – ${we}`, "",
    "# Platform Experience & Adoption", "",
    "**Himankini Shah**",
    "| Highlights | Blockers |",
    "| --- | --- |",
  ];
  for (let i = 0; i < rows; i++) {
    const h = highlights[i] ? `· ${highlights[i].content}` : "";
    const b = blockers[i]   ? `· ${blockers[i].content}`   : "";
    lines.push(`| ${h} | ${b} |`);
  }
  return lines.join("\n");
}

function buildStakeholdersText(s: WeeklySummaryData): string {
  const ws = format(parseISO(s.weekStart), "MMM d");
  const we = format(parseISO(s.weekEnd),   "MMM d");
  const lines: string[] = [
    `Based on your recent activities and project updates for the week of ${ws} to ${we}, here is your weekly work summary.`,
    "", quantLine(s), "",
  ];
  if (s.highlights.length > 0) {
    lines.push("### Highlights: Key Accomplishments");
    s.highlights.filter((h) => h.source === "manual").forEach((h) => {
      const phrase = h.content.split(/[,;—]/)[0].trim().slice(0, 50);
      lines.push(`- **${phrase}** — ${h.content}`);
    });
    if (s.stats.jira_count > 0)  lines.push(`- **Jira activity** — ${s.stats.jira_count} ticket${s.stats.jira_count > 1 ? "s" : ""} resolved or updated`);
    if (s.stats.email_count > 0) lines.push(`- **Email** — ${s.stats.email_count} emails sent across active workstreams`);
    lines.push("");
  }
  if (s.lowlights.length > 0) {
    lines.push("### Lowlights: Challenges & Risks");
    s.lowlights.forEach((l) => lines.push(`- ${l.content}`));
    lines.push("");
  }
  if (s.blockers.length > 0) {
    lines.push("### Blockers");
    s.blockers.forEach((b) => lines.push(`- ${b.content}`));
    lines.push("");
  }
  lines.push("### Relevant Sources");
  if (s.stats.jira_count > 0)    lines.push(`- Jira: ${s.stats.jira_count} tickets updated`);
  if (s.stats.meeting_count > 0) lines.push(`- Calendar: ${s.stats.meeting_count} meetings`);
  if (s.stats.email_count > 0)   lines.push(`- Outlook: ${s.stats.email_count} emails`);
  return lines.join("\n");
}

function buildManagerText(s: WeeklySummaryData): string {
  const lines = [buildStakeholdersText(s), ""];
  if (s.decisions.length > 0) {
    lines.push("### Key Decisions Made");
    s.decisions.forEach((d) => lines.push(`- ${d.content}`));
    lines.push("");
  }
  if (s.nextWeekPreview.length > 0) {
    lines.push("### Next Week Preview");
    s.nextWeekPreview.forEach((p) => lines.push(`- ${p}`));
  }
  return lines.join("\n");
}

function buildSelfText(s: WeeklySummaryData): string {
  const range = `${format(parseISO(s.weekStart), "MMM d")}–${format(parseISO(s.weekEnd), "MMM d")}`;
  const lines = [`Weekly Summary — ${range}`, "", quantLine(s), "", s.narrative, ""];
  if (s.highlights.length > 0) {
    lines.push("✅ Highlights");
    s.highlights.forEach((h) => lines.push(`• ${h.content}${h.source !== "manual" ? ` (${h.source})` : ""}`));
    lines.push("");
  }
  if (s.lowlights.length > 0) {
    lines.push("⚠️ Lowlights");
    s.lowlights.forEach((l) => lines.push(`• ${l.content}`));
    lines.push("");
  }
  if (s.blockers.length > 0) {
    lines.push("🚫 Blockers");
    s.blockers.forEach((b) => lines.push(`• ${b.content}`));
    lines.push("");
  }
  if (s.decisions.length > 0) {
    lines.push("🎯 Key Decisions");
    s.decisions.forEach((d) => lines.push(`• ${d.content}`));
  }
  return lines.join("\n");
}
