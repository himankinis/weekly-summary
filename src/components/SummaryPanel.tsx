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
  // Generator already synthesizes all sources into PM-quality content.
  // Priority: manual > confluence > jira > email (hooks excluded).
  const order = ["manual", "confluence", "jira", "email"];
  return s.highlights
    .filter((h) => order.includes(h.source))
    .sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source))
    .slice(0, 5);
}

function ppmBlockers(s: WeeklySummaryData): SummaryItem[] {
  return s.blockers.filter((b) => b.source === "manual" || b.source === "jira").slice(0, 3);
}

function buildPPMText(s: WeeklySummaryData): string {
  const weekStart = format(parseISO(s.weekStart), "MMM d");
  const weekEnd   = format(parseISO(s.weekEnd),   "MMM d");
  const highlights = ppmHighlights(s);
  const blockers   = ppmBlockers(s);

  const lines: string[] = [
    `## ${weekStart} – ${weekEnd}`,
    "",
    "# Platform Experience & Adoption",
    "",
    "**Himankini Shah**",
    "| Highlights | Blockers |",
    "| --- | --- |",
  ];

  if (highlights.length === 0 && blockers.length === 0) {
    lines.push("| *(no highlights logged this week)* |  |");
  } else {
    const rows = Math.max(highlights.length, blockers.length, 1);
    for (let i = 0; i < rows; i++) {
      const h = highlights[i] ? `· ${highlights[i].content}` : "";
      const b = blockers[i]   ? `· ${blockers[i].content}`   : "";
      lines.push(`| ${h} | ${b} |`);
    }
  }
  const todoText = buildTodoProgressText(s);
  if (todoText) { lines.push(""); lines.push(todoText); }
  return lines.join("\n");
}

function PPMView({ summary }: { summary: WeeklySummaryData }) {
  const weekStart = format(parseISO(summary.weekStart), "MMM d");
  const weekEnd   = format(parseISO(summary.weekEnd),   "MMM d");
  const highlights = ppmHighlights(summary);
  const blockers   = ppmBlockers(summary);
  const isEmpty = highlights.length === 0 && blockers.length === 0;
  const rows = Math.max(highlights.length, blockers.length, 1);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Paste-ready for the PPM Weekly Highlights doc. Hit Copy to grab the markdown.
      </p>
      {isEmpty && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
          No highlights logged this week. Add manual entries from the dashboard to populate the PPM table.
        </div>
      )}
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
            {isEmpty ? (
              <tr>
                <td className="border border-border px-2 py-1 align-top text-muted-foreground italic" colSpan={2}>
                  No highlights logged this week
                </td>
              </tr>
            ) : (
              Array.from({ length: rows }).map((_, i) => (
                <tr key={i}>
                  <td className="border border-border px-2 py-1 align-top">
                    {highlights[i] && <span>· {highlights[i].content}</span>}
                  </td>
                  <td className="border border-border px-2 py-1 align-top text-red-700 dark:text-red-400">
                    {blockers[i] && <span>· {blockers[i].content}</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {((summary.todos?.length ?? 0) + (summary.completedTodos?.length ?? 0)) > 0 && (
        <div className="rounded-md border border-border bg-background p-3">
          <TodoProgressSection summary={summary} />
        </div>
      )}
    </div>
  );
}

// ─── Initiative Grouping ──────────────────────────────────────────────────────

/** Words that don't help identify a specific initiative topic */
const INITIATIVE_STOP = new Set([
  "with", "from", "your", "their", "about", "have", "been", "will", "next",
  "last", "some", "several", "multiple", "cross", "functional",
  // action verbs
  "completed", "aligned", "drove", "discussed", "delivered", "shipped", "built",
  "initiated", "created", "updated", "published", "gathered", "getting",
  "following", "working", "sharing", "began", "starting",
  // generic PM nouns
  "leadership", "stakeholders", "approach", "progress", "session", "analysis",
  "approval", "draft", "summary", "status", "commitment", "initiative",
  "forward", "context", "details", "touchpoints", "adoption", "review",
  "weekly", "monthly", "update", "planning", "strategy",
]);

/** Extract words meaningful enough to identify an initiative */
function initWords(text: string): string[] {
  return text.split(/\W+/).filter((w) => {
    if (!w) return false;
    if (/^[A-Z]{2,5}$/.test(w)) return true; // keep acronyms
    return w.length >= 5 && !INITIATIVE_STOP.has(w.toLowerCase());
  });
}

interface InitGroup {
  name: string;
  items: SummaryItem[];
}

/** Cluster highlights that share ≥1 significant word */
function groupByInitiative(items: SummaryItem[]): InitGroup[] {
  if (items.length === 0) return [];

  const wordSets = items.map(
    (item) => new Set(initWords(item.content).map((w) => w.toLowerCase()))
  );

  const parent = items.map((_, i) => i);
  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(a: number, b: number) {
    const pa = find(a), pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if ([...wordSets[j]].some((w) => wordSets[i].has(w))) union(i, j);
    }
  }

  const map = new Map<number, number[]>();
  for (let i = 0; i < items.length; i++) {
    const r = find(i);
    if (!map.has(r)) map.set(r, []);
    map.get(r)!.push(i);
  }

  return [...map.values()]
    .map((indices) => {
      const groupItems = indices.map((i) => items[i]);
      return { name: initiativeName(groupItems), items: groupItems };
    })
    .sort((a, b) => b.items.length - a.items.length);
}

function initiativeName(items: SummaryItem[]): string {
  const acronyms: string[] = [];
  const freq: Record<string, number> = {};
  const firstItem = items[0].content;

  for (const item of items) {
    for (const w of initWords(item.content)) {
      if (/^[A-Z]{2,5}$/.test(w)) {
        if (!acronyms.includes(w)) acronyms.push(w);
      } else {
        const lower = w.toLowerCase();
        freq[lower] = (freq[lower] ?? 0) + 1;
      }
    }
  }

  // Sort: frequency desc, then position in first item (earlier = more prominent)
  const topWords = Object.entries(freq)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const posA = firstItem.toLowerCase().indexOf(a[0]);
      const posB = firstItem.toLowerCase().indexOf(b[0]);
      return posA - posB;
    })
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

  // e.g. "DMP Metering", "PRD Agents", or solo "Decommissioning"
  if (acronyms.length > 0) {
    return topWords[0] ? `${acronyms[0]} ${topWords[0]}` : acronyms[0];
  }
  // Long distinctive single word is enough on its own
  if (topWords[0] && topWords[0].length >= 11) return topWords[0];
  return topWords.length >= 2 ? `${topWords[0]} ${topWords[1]}` : (topWords[0] ?? "Other");
}

/** Short theme name for the opening sentence (no bigrams for long words) */
function shortThemeName(g: InitGroup): string {
  const words = g.name.split(" ");
  // "DMP Metering" → keep; "Migration Strawman" → "Migration"
  if (/^[A-Z]{2,5}$/.test(words[0])) return g.name;
  return words[0];
}

/** "This week I focused on X and Y." opening for 1:1 */
function themeSentence(highlights: SummaryItem[]): string {
  const source = highlights.filter((h) => h.source === "manual");
  const groups = groupByInitiative(source.length > 0 ? source : highlights);
  if (groups.length === 0) return "";
  const names = groups.slice(0, 2).map(shortThemeName);
  const theme = names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`;
  return `This week I focused on ${theme}.`;
}

/** Reframe a blocker as an actionable ask for the manager */
function frameBlocker(b: SummaryItem): string {
  const c = b.content;
  if (/^(I need|Decision needed|Need your)/i.test(c)) return c;
  const blockedMatch = c.match(/^(.+?)\s+is\s+blocked/i);
  if (blockedMatch) return `Decision needed on ${blockedMatch[1].trim()}`;
  return `I need your help with: ${c}`;
}

// ─── Stakeholders View ────────────────────────────────────────────────────────

function buildStakeholdersText(s: WeeklySummaryData): string {
  const ws = format(parseISO(s.weekStart), "MMM d");
  const we = format(parseISO(s.weekEnd), "MMM d");
  const lines: string[] = [`Weekly update for ${ws}–${we}:`, ""];

  const groups = groupByInitiative(s.highlights);
  for (const g of groups.slice(0, 6)) {
    const content = g.items[0].content;
    const more = g.items.length > 1 ? ` — and ${g.items.length - 1} more` : "";
    lines.push(`· ${g.name}: ${content}${more}.`);
  }

  for (const b of s.blockers.slice(0, 2)) {
    const jira = extractJiraKey(b.content);
    const topic = b.content
      .replace(/\s*\(Jira:.*?\)\s*$/i, "")
      .replace(/\s+is\s+blocked.*$/i, "")
      .trim();
    lines.push(`· ${topic}: Pending resolution${jira ? ` (${jira})` : ""}. At risk.`);
  }

  if (groups.length === 0 && s.blockers.length === 0) {
    lines.push("No activity logged this week.");
  }

  const todoText = buildTodoProgressText(s);
  if (todoText) { lines.push(""); lines.push(todoText); }

  return lines.join("\n");
}

function StakeholdersView({ summary: s }: { summary: WeeklySummaryData }) {
  const ws = format(parseISO(s.weekStart), "MMM d");
  const we = format(parseISO(s.weekEnd), "MMM d");
  const groups = groupByInitiative(s.highlights);

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground italic">Weekly update for {ws}–{we}</p>
      {groups.length === 0 && s.blockers.length === 0 ? (
        <p className="text-muted-foreground italic text-sm">No activity logged this week.</p>
      ) : (
        <ul className="space-y-2">
          {groups.slice(0, 6).map((g, i) => {
            const content = g.items[0].content;
            const more = g.items.length > 1
              ? <span className="text-muted-foreground"> — and {g.items.length - 1} more</span>
              : null;
            return (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5 shrink-0">·</span>
                <span>
                  <strong className="text-foreground">{g.name}:</strong>{" "}
                  {content}{more}.
                </span>
              </li>
            );
          })}
          {s.blockers.slice(0, 2).map((b, i) => {
            const jira = extractJiraKey(b.content);
            const topic = b.content
              .replace(/\s*\(Jira:.*?\)\s*$/i, "")
              .replace(/\s+is\s+blocked.*$/i, "")
              .trim();
            return (
              <li key={`b-${i}`} className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5 shrink-0">·</span>
                <span>
                  <strong className="text-foreground">{topic}:</strong>{" "}
                  Pending resolution{jira ? ` (${jira})` : ""}.{" "}
                  <span className="text-amber-600 dark:text-amber-400 font-medium">At risk.</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {((s.todos?.length ?? 0) + (s.completedTodos?.length ?? 0)) > 0 && (
        <div className="mt-2">
          <TodoProgressSection summary={s} />
        </div>
      )}
    </div>
  );
}

// ─── Manager (1:1) View ───────────────────────────────────────────────────────

function buildManagerText(s: WeeklySummaryData): string {
  const lines: string[] = [];

  const theme = themeSentence(s.highlights);
  if (theme) { lines.push(theme); lines.push(""); }

  if (s.highlights.length > 0) {
    lines.push("### Highlights");
    // Order by initiative group for cohesion
    groupByInitiative(s.highlights)
      .flatMap((g) => g.items)
      .slice(0, 5)
      .forEach((h) => lines.push(`· ${h.content}`));
    lines.push("");
  }

  if (s.blockers.length > 0) {
    lines.push("### Blockers");
    s.blockers.slice(0, 3).forEach((b) => lines.push(`· ${frameBlocker(b)}`));
    lines.push("");
  }

  if (s.decisions.length > 0) {
    lines.push("### Key Decisions");
    s.decisions.slice(0, 3).forEach((d) => lines.push(`· ${d.content}`));
    lines.push("");
  }

  const nextMeetings = s.nextWeekPreview
    .filter((p) => p.startsWith("  ·"))
    .map((p) => p.replace(/^\s+·\s*/, ""))
    .slice(0, 3);
  const carryOver = s.nextWeekPreview.find((p) => p.startsWith("🔄"));
  if (nextMeetings.length > 0 || carryOver) {
    lines.push("### Next Week");
    nextMeetings.forEach((m) => lines.push(`· ${m}`));
    if (carryOver) lines.push(`· ${carryOver}`);
  }

  const todoText = buildTodoProgressText(s);
  if (todoText) { lines.push(""); lines.push(todoText); }

  return lines.join("\n");
}

function ManagerView({ summary: s }: { summary: WeeklySummaryData }) {
  const theme = themeSentence(s.highlights);
  const sortedHighlights = groupByInitiative(s.highlights).flatMap((g) => g.items).slice(0, 5);
  const nextMeetings = s.nextWeekPreview
    .filter((p) => p.startsWith("  ·"))
    .map((p) => p.replace(/^\s+·\s*/, ""))
    .slice(0, 3);
  const carryOver = s.nextWeekPreview.find((p) => p.startsWith("🔄"));

  return (
    <div className="space-y-4 text-sm">
      {theme && (
        <p className="font-medium">{theme}</p>
      )}

      {sortedHighlights.length > 0 && (
        <div>
          <h4 className="font-semibold mb-1.5">Highlights</h4>
          <ul className="space-y-1.5">
            {sortedHighlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5 shrink-0">·</span>
                <span>{h.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

        {((s.todos?.length ?? 0) + (s.completedTodos?.length ?? 0)) > 0 && (
          <TodoProgressSection summary={s} />
        )}

      {s.blockers.length > 0 && (
        <div>
          <h4 className="font-semibold mb-1.5">Blockers</h4>
          <ul className="space-y-1.5">
            {s.blockers.slice(0, 3).map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5 shrink-0">·</span>
                <span>{frameBlocker(b)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.decisions.length > 0 && (
        <div>
          <h4 className="font-semibold mb-1.5">Key Decisions</h4>
          <ul className="space-y-1.5">
            {s.decisions.slice(0, 3).map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5 shrink-0">·</span>
                <span>{d.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(nextMeetings.length > 0 || carryOver) && (
        <div>
          <h4 className="font-semibold mb-1.5">Next Week</h4>
          <ul className="space-y-1.5">
            {nextMeetings.map((m, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5 shrink-0">·</span>
                <span>{m}</span>
              </li>
            ))}
            {carryOver && (
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5 shrink-0">·</span>
                <span className="text-muted-foreground">{carryOver}</span>
              </li>
            )}
          </ul>
        </div>
      )}

      {sortedHighlights.length === 0 && (
        <p className="text-muted-foreground italic">No highlights logged — add entries from the dashboard.</p>
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
  const todoText = buildTodoProgressText(s);
  if (todoText) { lines.push(todoText); lines.push(""); }
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
      {((s.todos?.length ?? 0) + (s.completedTodos?.length ?? 0)) > 0 && (
        <TodoProgressSection summary={s} />
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

// ─── To-Do Progress ───────────────────────────────────────────────────────────

function TodoProgressSection({ summary: s }: { summary: WeeklySummaryData }) {
  const incomplete = s.todos ?? [];
  const completed = s.completedTodos ?? [];
  const total = incomplete.length + completed.length;
  if (total === 0) return null;

  return (
    <div className="text-sm space-y-1.5">
      <h4 className="font-semibold flex items-center gap-1.5">
        📝 To-Do Progress
        <span className="text-xs font-normal text-muted-foreground">
          {completed.length}/{total} completed
        </span>
      </h4>
      {completed.length > 0 && (
        <ul className="space-y-1">
          {completed.map((t, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5 shrink-0">✓</span>
              <span className="line-through text-muted-foreground">{t.content}</span>
            </li>
          ))}
        </ul>
      )}
      {incomplete.length > 0 && (
        <ul className="space-y-1">
          {incomplete.map((t, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5 shrink-0">→</span>
              <span className="text-muted-foreground">{t.content}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function buildTodoProgressText(s: WeeklySummaryData): string {
  const incomplete = s.todos ?? [];
  const completed = s.completedTodos ?? [];
  const total = incomplete.length + completed.length;
  if (total === 0) return "";
  const lines: string[] = [`📝 To-Do Progress: ${completed.length}/${total} completed`];
  completed.forEach((t) => lines.push(`  ✓ ${t.content}`));
  incomplete.forEach((t) => lines.push(`  → ${t.content} (carrying over)`));
  return lines.join("\n");
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
