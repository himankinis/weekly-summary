"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Zap, User, Calendar, ChevronDown, ChevronRight } from "lucide-react";
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
  lowlight: { label: "Lowlight", emoji: "⚠️", badgeVariant: "lowlight", groupLabel: "Lowlights" },
  blocker: { label: "Blocker", emoji: "🚫", badgeVariant: "blocker", groupLabel: "Blockers" },
};

const SOURCE_ICON: Record<EntrySource, React.ReactNode> = {
  manual: <User className="h-3 w-3" />,
  hook: <Zap className="h-3 w-3" />,
  calendar: <Calendar className="h-3 w-3" />,
};

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
        <div className="flex items-center gap-2 mt-1">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {SOURCE_ICON[entry.source]}
            {entry.source}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
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
          <span className="text-xs text-muted-foreground">
            {format(parseISO(entry.entry_date), "EEE MMM d")}
          </span>
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

export default function EntryList({ entries, onDelete }: Props) {
  const manualEntries = entries.filter((e) => e.source !== "hook");
  const hookEntries = entries.filter((e) => e.source === "hook");

  if (entries.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p className="text-sm">No entries yet this week.</p>
        <p className="text-xs mt-1">Log your first highlight, lowlight, or blocker above.</p>
      </div>
    );
  }

  // Group manual entries by type in fixed order
  const grouped = (["highlight", "lowlight", "blocker"] as EntryType[]).map((type) => ({
    type,
    cfg: TYPE_CONFIG[type],
    items: manualEntries.filter((e) => e.type === type),
  }));

  return (
    <div className="space-y-5">
      {grouped
        .filter((g) => g.items.length > 0)
        .map(({ type, cfg, items }) => (
          <div key={type}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-foreground">{cfg.groupLabel}</span>
              <Badge variant={cfg.badgeVariant} className="text-xs px-1.5 py-0">
                {items.length}
              </Badge>
            </div>
            {items.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onDelete={onDelete} />
            ))}
          </div>
        ))}

      {hookEntries.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-sm font-medium text-foreground">Claude Activity</span>
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              {hookEntries.length}
            </Badge>
          </div>
          {hookEntries.map((entry) => (
            <HookActivityRow key={entry.id} entry={entry} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
