"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2, Zap, User, Calendar, ChevronDown, ChevronRight,
  SquareKanban, FileText, Mail, LayoutList, Layers,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { EntryType, EntrySource, LogEntry } from "@/lib/types";

interface Props {
  entries: LogEntry[];
  onDelete: (id: number) => void;
}

const TYPE_CONFIG: Record<
  EntryType,
  { label: string; emoji: string; badgeVariant: "highlight" | "lowlight" | "blocker"; groupLabel: string }
> = {
  highlight: { label: "Highlight", emoji: "✅", badgeVariant: "highlight", groupLabel: "Highlights" },
  lowlight:  { label: "Lowlight",  emoji: "⚠️", badgeVariant: "lowlight",  groupLabel: "Lowlights"  },
  blocker:   { label: "Blocker",   emoji: "🚫", badgeVariant: "blocker",   groupLabel: "Blockers"   },
};

interface SourceConfig {
  icon: React.ReactNode;
  label: string;
  pill: string; // Tailwind classes for pill
}

const SOURCE_CONFIG: Record<EntrySource, SourceConfig> = {
  jira:       { icon: <SquareKanban className="h-3 w-3" />, label: "Jira",       pill: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  calendar:   { icon: <Calendar     className="h-3 w-3" />, label: "Calendar",   pill: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"     },
  email:      { icon: <Mail         className="h-3 w-3" />, label: "Email",      pill: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  hook:       { icon: <Zap          className="h-3 w-3" />, label: "Claude",     pill: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  manual:     { icon: <User         className="h-3 w-3" />, label: "Manual",     pill: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"  },
  confluence: { icon: <FileText     className="h-3 w-3" />, label: "Confluence", pill: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"  },
};

// Source sections order for grouped view
const SOURCE_ORDER: EntrySource[] = ["manual", "jira", "confluence", "email", "hook"];

function SourcePill({ source }: { source: EntrySource }) {
  const cfg = SOURCE_CONFIG[source];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.pill}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function EntryRow({ entry, onDelete }: { entry: LogEntry; onDelete: (id: number) => void }) {
  const [deleting, setDeleting] = useState(false);
  const cfg = TYPE_CONFIG[entry.type];

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/entries/${entry.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) onDelete(entry.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="group flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <span className="mt-0.5 text-base leading-none">{cfg.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-relaxed">{entry.content}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <SourcePill source={entry.source} />
          <span className="text-xs text-muted-foreground">
            {format(parseISO(entry.entry_date), "EEE MMM d")}
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="opacity-0 group-hover:opacity-100 h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={handleDelete}
        disabled={deleting}
        title="Delete entry"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function HookActivityRow({ entry, onDelete }: { entry: LogEntry; onDelete: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cfg = TYPE_CONFIG[entry.type];

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/entries/${entry.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) onDelete(entry.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="group border-b border-border/50 last:border-0">
      <div className="flex items-start gap-3 py-2.5">
        <button
          onClick={() => entry.raw_prompt && setExpanded((v) => !v)}
          className="mt-1 text-muted-foreground hover:text-foreground flex-shrink-0"
          title={entry.raw_prompt ? "Show raw prompt" : undefined}
        >
          {entry.raw_prompt ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <span className="h-3.5 w-3.5 block" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={cfg.badgeVariant} className="text-xs px-1.5 py-0">{cfg.label}</Badge>
            <p className="text-sm leading-relaxed truncate">{entry.content}</p>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <SourcePill source={entry.source} />
            <span className="text-xs text-muted-foreground">
              {format(parseISO(entry.entry_date), "EEE MMM d")}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover:opacity-100 h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
          onClick={handleDelete}
          disabled={deleting}
          title="Delete entry"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {expanded && entry.raw_prompt && (
        <div className="ml-6 mb-2.5 rounded-md bg-muted px-3 py-2">
          <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words">
            {entry.raw_prompt}
          </p>
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  pill,
  icon,
  children,
}: {
  title: string;
  count: number;
  pill: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 mb-2 w-full text-left group/section"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pill}`}>
          {icon}
          {title}
        </span>
        <span className="text-xs text-muted-foreground">{count}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

export default function EntryList({ entries, onDelete }: Props) {
  const [viewMode, setViewMode] = useState<"type" | "source">("type");

  if (entries.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p className="text-sm">No entries yet this week.</p>
        <p className="text-xs mt-1">Log your first highlight, lowlight, or blocker above.</p>
      </div>
    );
  }

  const manualEntries = entries.filter((e) => e.source !== "hook");
  const hookEntries = entries.filter((e) => e.source === "hook");

  return (
    <div className="space-y-5">
      {/* View toggle */}
      <div className="flex justify-end">
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setViewMode("type")}
            title="Group by type"
            className={`px-2 py-1 text-xs flex items-center gap-1 ${viewMode === "type" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            By type
          </button>
          <button
            onClick={() => setViewMode("source")}
            title="Group by source"
            className={`px-2 py-1 text-xs flex items-center gap-1 border-l border-border ${viewMode === "source" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Layers className="h-3.5 w-3.5" />
            By source
          </button>
        </div>
      </div>

      {viewMode === "type" ? (
        // ── Type-grouped view (original) ──────────────────────────────────
        <>
          {(["highlight", "lowlight", "blocker"] as EntryType[])
            .map((type) => ({ type, cfg: TYPE_CONFIG[type], items: manualEntries.filter((e) => e.type === type) }))
            .filter((g) => g.items.length > 0)
            .map(({ type, cfg, items }) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-foreground">{cfg.groupLabel}</span>
                  <Badge variant={cfg.badgeVariant} className="text-xs px-1.5 py-0">{items.length}</Badge>
                </div>
                {items.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} onDelete={onDelete} />
                ))}
              </div>
            ))}

          {hookEntries.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-sm font-medium text-foreground">Claude Activity</span>
                <Badge variant="outline" className="text-xs px-1.5 py-0">{hookEntries.length}</Badge>
              </div>
              {hookEntries.map((entry) => (
                <HookActivityRow key={entry.id} entry={entry} onDelete={onDelete} />
              ))}
            </div>
          )}
        </>
      ) : (
        // ── Source-grouped view ───────────────────────────────────────────
        <>
          {SOURCE_ORDER.map((source) => {
            const items = entries.filter((e) => e.source === source);
            if (items.length === 0) return null;
            const cfg = SOURCE_CONFIG[source];
            return (
              <CollapsibleSection
                key={source}
                title={cfg.label}
                count={items.length}
                pill={cfg.pill}
                icon={cfg.icon}
              >
                {items.map((entry) =>
                  entry.source === "hook" ? (
                    <HookActivityRow key={entry.id} entry={entry} onDelete={onDelete} />
                  ) : (
                    <EntryRow key={entry.id} entry={entry} onDelete={onDelete} />
                  )
                )}
              </CollapsibleSection>
            );
          })}
        </>
      )}
    </div>
  );
}
