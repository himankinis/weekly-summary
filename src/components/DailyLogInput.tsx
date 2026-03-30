"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { EntryType, LogEntry } from "@/lib/types";

interface Props {
  onEntryAdded: (entry: LogEntry) => void;
}

const TYPE_OPTIONS: { value: EntryType; label: string; emoji: string; description: string }[] = [
  { value: "highlight", label: "Highlight", emoji: "✅", description: "Win, shipped work, good decision" },
  { value: "lowlight", label: "Lowlight", emoji: "⚠️", description: "Delay, missed target, took longer" },
  { value: "blocker", label: "Blocker", emoji: "🚫", description: "Dependency, access issue, waiting on someone" },
  { value: "todo", label: "To-do", emoji: "📋", description: "Task to complete this week or next" },
];

export default function DailyLogInput({ onEntryAdded }: Props) {
  const [content, setContent] = useState("");
  const [type, setType] = useState<EntryType>("highlight");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedType = TYPE_OPTIONS.find((t) => t.value === type)!;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), type }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      onEntryAdded(json.data as LogEntry);
      setContent("");
      textareaRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entry");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Type selector — pill buttons */}
      <div className="flex gap-2 flex-wrap">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setType(opt.value)}
            title={opt.description}
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all",
              type === opt.value
                ? opt.value === "highlight"
                  ? "bg-green-100 border-green-400 text-green-800 dark:bg-green-900 dark:text-green-200 dark:border-green-600"
                  : opt.value === "lowlight"
                  ? "bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-600"
                  : opt.value === "blocker"
                  ? "bg-red-100 border-red-400 text-red-800 dark:bg-red-900 dark:text-red-200 dark:border-red-600"
                  : "bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-600"
                : "bg-transparent border-border text-muted-foreground hover:border-foreground/30",
            ].join(" ")}
          >
            <span>{opt.emoji}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Text input */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            type === "highlight"
              ? "What did you ship, accomplish, or decide?"
              : type === "lowlight"
              ? "What took longer, slipped, or didn't go well?"
              : type === "blocker"
              ? "What's blocking you or what are you waiting on?"
              : "What do you need to get done this week?"
          }
          rows={3}
          className="resize-none pr-24"
          disabled={loading}
        />
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
          ⌘↵ to save
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {selectedType.emoji} Logging as{" "}
          <strong>{selectedType.label}</strong>
        </span>
        <Button type="submit" size="sm" disabled={loading || !content.trim()}>
          {loading ? "Saving…" : "Log entry"}
        </Button>
      </div>
    </form>
  );
}
