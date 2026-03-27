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

type Audience = "ppm" | "self" | "manager" | "stakeholders";

interface Props {
  weekStart: string;
}

export default function SummaryPanel({ weekStart }: Props) {
  const [summary, setSummary] = useState<WeeklySummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>("ppm");

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

  const copyToClipboard = async () => {
    if (!summary) return;
    let text = "";
    if (audience === "ppm")          text = buildPPMText(summary);
    else if (audience === "stakeholders") text = buildStakeholdersText(summary);
    else if (audience === "manager")  text = buildManagerText(summary);
    else                              text = buildSelfText(summary);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = () => {
    window.open(`/api/export?week=${weekStart}&format=markdown`, "_blank");
  };

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
                  <option value="ppm">PPM Weekly</option>
                  <option value="stakeholders">For stakeholders</option>
                  <option value="manager">For 1:1</option>
                  <option value="self">For myself</option>
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

        {summary && !loading && audience === "ppm" && <PPMView summary={summary} />}
        {summary && !loading && audience === "stakeholders" && <StakeholdersView summary={summary} />}
        {summary && !loading && audience === "manager" && <ManagerView summary={summary} />}
        {summary && !loading && audience === "self" && <SelfView summary={summary} />}
      </CardContent>
    </Card>
  );
}

// ─── PPM View ─────────────────────────────────────────────────────────────────

function ppmHighlights(s: WeeklySummaryData): SummaryItem[] {
  // All sources — manual first, then jira, hook, email, calendar
  const order = ["manual", "jira", "hook", "email", "calendar"];
  return [...s.highlights].sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source)).slice(0, 5);
}

function ppmBlockers(s: WeeklySummaryData): SummaryItem[] {
  return s.blockers.filter((b) => b.source === "manual" || b.source === "jira").slice(0, 3);
}

function buildPPMText(s: WeeklySummaryData): string {
  const weekStart = format(parseISO(s.weekStart), "MMM d");
  const weekEnd   = format(parseISO(s.weekEnd),   "MMM d");
  const highlights = ppmHighlights(s);
  const blockers   = ppmBlockers(s);
  const rows = Math.max(highlights.length, blockers.length, 1);

  const lines: string[] = [
    `## ${weekStart} – ${weekEnd}`,
    "",
    "# Platform Experience & Adoption",
    "",
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

function PPMView({ summary }: { summary: WeeklySummaryData }) {
  const weekStart = format(parseISO(summary.weekStart), "MMM d");
  const weekEnd   = format(parseISO(summary.weekEnd),   "MMM d");
  const highlights = ppmHighlights(summary);
  const blockers   = ppmBlockers(summary);
  const rows = Math.max(highlights.length, blockers.length, 1);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Paste-ready for the PPM Weekly Highlights doc. Hit Copy to grab the markdown.
      </p>
      <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1.5 text-sm font-mono">
        <p className="font-semibold">## {weekStart} – {weekEnd}</p>
        <p className="font-semibold"># Platform Experience &amp; Adoption</p>
        <p className="font-bold">Himankini Shah</p>
        <table className="w-full text-xs border-collapse mt-1">
          <thead>
            <tr>
              <th className="border border-border px-2 py-1 text-left font-semibold w-1/2">Highlights</th>
              <th className="border border-border px-2 py-1 text-left font-semibold w-1/2">Blockers</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i}>
                <td className="border border-border px-2 py-1 align-top">
                  {highlights[i] && <span>· {highlights[i].content}</span>}
                </td>
                <td className="border border-border px-2 py-1 align-top text-red-700 dark:text-red-400">
                  {blockers[i] && <span>· {blockers[i].content}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Stakeholders View ────────────────────────────────────────────────────────

function buildStakeholdersText(s: WeeklySummaryData): string {
  const ws = format(parseISO(s.weekStart), "MMM d");
  const we = format(parseISO(s.weekEnd),   "MMM d");
  const lines: string[] = [];

  lines.push(`Based on your recent activities and project updates for the week of ${ws} to ${we}, here is your weekly work summary.`);
  lines.push("");
  lines.push(quantLine(s));
  lines.push("");

  if (s.highlights.length > 0) {
    lines.push("### Highlights: Key Accomplishments");
    const manualH = s.highlights.filter((h) => h.source === "manual");
    manualH.forEach((h) => lines.push(`- **${firstPhrase(h.content)}** — ${h.content}`));
    if (s.stats.jira_count > 0)  lines.push(`- **Jira activity** — ${s.stats.jira_count} ticket${s.stats.jira_count > 1 ? "s" : ""} resolved or updated`);
    if (s.stats.email_count > 0) lines.push(`- **Email** — ${s.stats.email_count} emails sent across active workstreams`);
    lines.push("");
  }

  if (s.lowlights.length > 0) {
    lines.push("### Lowlights: Challenges & Risks");
    s.lowlights.forEach((l) => lines.push(`- **${firstPhrase(l.content)}** — ${l.content}`));
    lines.push("");
  }

  if (s.blockers.length > 0) {
    lines.push("### Blockers");
    s.blockers.forEach((b) => {
      const jiraRef = extractJiraKey(b.content);
      lines.push(`- **${firstPhrase(b.content)}** — ${b.content}${jiraRef ? ` (Jira: ${jiraRef})` : ""}`);
    });
    lines.push("");
  }

  lines.push("### Relevant Sources");
  const sources: string[] = [];
  if (s.stats.jira_count > 0)    sources.push(`Jira: ${s.stats.jira_count} ticket${s.stats.jira_count > 1 ? "s" : ""} updated`);
  if (s.stats.meeting_count > 0) sources.push(`Calendar: ${s.stats.meeting_count} meetings`);
  if (s.stats.email_count > 0)   sources.push(`Outlook: ${s.stats.email_count} emails`);
  const manualCount = s.highlights.filter((h) => h.source === "manual").length +
                      s.lowlights.filter((l) => l.source === "manual").length +
                      s.blockers.filter((b) => b.source === "manual").length;
  if (manualCount > 0) sources.push(`Manual: ${manualCount} entries`);
  sources.forEach((src) => lines.push(`- ${src}`));

  return lines.join("\n");
}

function StakeholdersView({ summary: s }: { summary: WeeklySummaryData }) {
  const ws = format(parseISO(s.weekStart), "MMM d");
  const we = format(parseISO(s.weekEnd),   "MMM d");
  const manualH = s.highlights.filter((h) => h.source === "manual");

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted-foreground leading-relaxed">{quantLine(s)}</p>
      <p className="text-muted-foreground italic text-xs">
        Based on activities for the week of {ws} to {we}.
      </p>

      {s.highlights.length > 0 && (
        <div>
          <h4 className="font-semibold mb-1.5">Highlights: Key Accomplishments</h4>
          <ul className="space-y-1">
            {manualH.map((h, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1 text-xs shrink-0">•</span>
                <span><strong>{firstPhrase(h.content)}</strong> — {h.content}</span>
              </li>
            ))}
            {s.stats.jira_count > 0 && (
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1 text-xs shrink-0">•</span>
                <span><strong>Jira activity</strong> — {s.stats.jira_count} ticket{s.stats.jira_count > 1 ? "s" : ""} resolved or updated</span>
              </li>
            )}
            {s.stats.email_count > 0 && (
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1 text-xs shrink-0">•</span>
                <span><strong>Email</strong> — {s.stats.email_count} emails sent across active workstreams</span>
              </li>
            )}
          </ul>
        </div>
      )}

      {s.lowlights.length > 0 && (
        <div>
          <h4 className="font-semibold mb-1.5">Lowlights: Challenges &amp; Risks</h4>
          <ul className="space-y-1">
            {s.lowlights.map((l, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1 text-xs shrink-0">•</span>
                <span><strong>{firstPhrase(l.content)}</strong> — {l.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.blockers.length > 0 && (
        <div>
          <h4 className="font-semibold mb-1.5">Blockers</h4>
          <ul className="space-y-1">
            {s.blockers.map((b, i) => {
              const jiraRef = extractJiraKey(b.content);
              return (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-red-500 mt-1 text-xs shrink-0">•</span>
                  <span>
                    <strong>{firstPhrase(b.content)}</strong> — {b.content}
                    {jiraRef && <span className="ml-1 text-xs text-muted-foreground">(Jira: {jiraRef})</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <h4 className="font-semibold mb-1.5">Relevant Sources</h4>
        <SourcesLine stats={s.stats} highlights={s.highlights} lowlights={s.lowlights} blockers={s.blockers} />
      </div>
    </div>
  );
}

// ─── Manager (1:1) View ───────────────────────────────────────────────────────

function buildManagerText(s: WeeklySummaryData): string {
  const base = buildStakeholdersText(s);
  const lines: string[] = [base, ""];

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

function ManagerView({ summary: s }: { summary: WeeklySummaryData }) {
  return (
    <div className="space-y-4">
      <StakeholdersView summary={s} />

      {s.decisions.length > 0 && (
        <div className="text-sm">
          <h4 className="font-semibold mb-1.5">🎯 Key Decisions Made</h4>
          <ul className="space-y-1">
            {s.decisions.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1 text-xs shrink-0">•</span>
                <span>{d.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.nextWeekPreview.length > 0 && (
        <div className="text-sm">
          <h4 className="font-semibold mb-1.5">🔭 Next Week Preview</h4>
          <ul className="space-y-1">
            {s.nextWeekPreview.map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1 text-xs shrink-0">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Self View ────────────────────────────────────────────────────────────────

function buildSelfText(s: WeeklySummaryData): string {
  const lines: string[] = [];
  const weekRange = `${format(parseISO(s.weekStart), "MMM d")}–${format(parseISO(s.weekEnd), "MMM d")}`;
  lines.push(`Weekly Summary — ${weekRange}`);
  lines.push("");
  lines.push(quantLine(s));
  lines.push("");
  lines.push(s.narrative);
  lines.push("");

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
    lines.push("");
  }
  if (s.meetings.length > 0) {
    lines.push("📅 Meetings");
    s.meetings.forEach((m) => lines.push(`• ${m.title}`));
    lines.push("");
  }
  if (s.nextWeekPreview.length > 0) {
    lines.push("🔭 Next Week");
    s.nextWeekPreview.forEach((p) => lines.push(`• ${p}`));
  }
  return lines.join("\n");
}

function SelfView({ summary: s }: { summary: WeeklySummaryData }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{quantLine(s)}</p>
      <blockquote className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground italic">
        {s.narrative}
      </blockquote>
      {s.highlights.length > 0 && (
        <SummarySection title="✅ Highlights" items={s.highlights.map((h) => ({
          text: h.content,
          badge: h.source !== "manual" ? h.source : undefined,
        }))} />
      )}
      {s.lowlights.length > 0 && (
        <SummarySection title="⚠️ Lowlights" items={s.lowlights.map((l) => ({ text: l.content }))} />
      )}
      {s.blockers.length > 0 && (
        <SummarySection title="🚫 Blockers" items={s.blockers.map((b) => ({ text: b.content }))} />
      )}
      {s.decisions.length > 0 && (
        <SummarySection title="🎯 Key Decisions" items={s.decisions.map((d) => ({ text: d.content }))} />
      )}
      {s.meetings.length > 0 && (
        <SummarySection title="📅 Meetings" items={s.meetings.map((m) => ({
          text: m.title + (m.attendee_count > 0 ? ` (${m.attendee_count})` : ""),
          sub: m.related?.map((r) => `Related: ${r}`),
        }))} />
      )}
      {s.nextWeekPreview.length > 0 && (
        <SummarySection title="🔭 Next Week" items={s.nextWeekPreview.map((p) => ({ text: p }))} />
      )}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

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

/** Extract the first meaningful phrase (up to first verb or comma) as a bold topic label */
function firstPhrase(text: string): string {
  const cleaned = text.replace(/^(Sent email:|Completed|Aligned|Updated|Finished)\s*/i, "").trim();
  const cut = cleaned.split(/[,;—]/)[0].trim();
  return cut.length > 50 ? cut.slice(0, 47) + "…" : cut;
}

function extractJiraKey(text: string): string | null {
  const m = text.match(/\b([A-Z]+-\d+)\b/);
  return m ? m[1] : null;
}

function SourcesLine({ stats, highlights, lowlights, blockers }: {
  stats: WeeklySummaryData["stats"];
  highlights: SummaryItem[];
  lowlights: SummaryItem[];
  blockers: SummaryItem[];
}) {
  const manualCount = [...highlights, ...lowlights, ...blockers].filter((e) => e.source === "manual").length;
  const items: string[] = [];
  if (stats.jira_count > 0)    items.push(`Jira: ${stats.jira_count} ticket${stats.jira_count > 1 ? "s" : ""} updated`);
  if (stats.meeting_count > 0) items.push(`Calendar: ${stats.meeting_count} meetings`);
  if (stats.email_count > 0)   items.push(`Outlook: ${stats.email_count} emails`);
  if (manualCount > 0)         items.push(`Manual: ${manualCount} entries`);
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {items.map((item, i) => <li key={i}>· {item}</li>)}
    </ul>
  );
}

// ─── SummarySection ───────────────────────────────────────────────────────────

function SummarySection({
  title,
  items,
}: {
  title: string;
  items: { text: string; badge?: string; sub?: string[] }[];
}) {
  return (
    <div className="text-sm">
      <h4 className="font-semibold mb-1.5">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i}>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground mt-1 text-xs shrink-0">•</span>
              <span>
                {item.text}
                {item.badge && <span className="ml-1.5 text-xs text-muted-foreground">({item.badge})</span>}
              </span>
            </div>
            {item.sub?.map((s, j) => (
              <p key={j} className="ml-4 text-xs text-muted-foreground italic mt-0.5">{s}</p>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
