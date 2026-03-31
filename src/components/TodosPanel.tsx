"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2, CheckSquare } from "lucide-react";
import type { LogEntry } from "@/lib/types";

interface Props {
  weekStart: string;
}

export default function TodosPanel({ weekStart }: Props) {
  const [todos, setTodos] = useState<LogEntry[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/todos?week=${weekStart}`);
      const json = await res.json();
      if (json.ok) setTodos(json.data);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const addTodo = async () => {
    if (!newTodo.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newTodo.trim(), week: weekStart }),
      });
      const json = await res.json();
      if (json.ok) {
        setTodos((prev) => [...prev, json.data]);
        setNewTodo("");
      }
    } finally {
      setAdding(false);
    }
  };

  const toggleTodo = async (todo: LogEntry) => {
    const res = await fetch(`/api/entries/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !todo.completed }),
    });
    const json = await res.json();
    if (json.ok) {
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? json.data : t)));
    }
  };

  const deleteTodo = async (id: number) => {
    const res = await fetch(`/api/entries/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      setTodos((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const incompleteTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);
  const total = todos.length;
  const completedCount = completedTodos.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            Weekly To-Dos
          </CardTitle>
          {total > 0 && (
            <span className="text-xs text-muted-foreground font-medium tabular-nums">
              {completedCount}/{total} completed
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Add input */}
        <div className="flex gap-2">
          <input
            value={newTodo}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTodo(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && addTodo()}
            placeholder="Add a to-do…"
            className="h-8 flex-1 rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <Button
            size="sm"
            onClick={addTodo}
            disabled={adding || !newTodo.trim()}
            className="h-8 px-3 shrink-0"
          >
            {adding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        ) : todos.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No to-dos yet. Add one above.
          </p>
        ) : (
          <div className="space-y-0.5">
            {/* Incomplete todos */}
            {incompleteTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={toggleTodo}
                onDelete={deleteTodo}
              />
            ))}

            {/* Divider */}
            {incompleteTodos.length > 0 && completedTodos.length > 0 && (
              <div className="border-t border-border pt-1 mt-1" />
            )}

            {/* Completed todos */}
            {completedTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={toggleTodo}
                onDelete={deleteTodo}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Todo Item ────────────────────────────────────────────────────────────────

function TodoItem({
  todo,
  onToggle,
  onDelete,
}: {
  todo: LogEntry;
  onToggle: (todo: LogEntry) => void;
  onDelete: (id: number) => void;
}) {
  const isCompleted = Boolean(todo.completed);

  return (
    <div className="flex items-start gap-2 group py-1">
      {/* Checkbox */}
      <button
        onClick={() => onToggle(todo)}
        className={`mt-0.5 h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
          isCompleted
            ? "bg-primary border-primary"
            : "border-input hover:border-primary bg-background"
        }`}
        aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
      >
        {isCompleted && (
          <svg
            className="h-2.5 w-2.5 text-primary-foreground"
            viewBox="0 0 10 10"
            fill="none"
          >
            <path
              d="M1.5 5l2.5 2.5 4.5-5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Content */}
      <span
        className={`text-sm flex-1 leading-snug min-w-0 ${
          isCompleted ? "line-through text-muted-foreground" : "text-foreground"
        }`}
      >
        {todo.content}
        {todo.carried_from_id && (
          <span className="ml-1.5 text-xs text-muted-foreground not-italic">
            (carried over)
          </span>
        )}
      </span>

      {/* Delete button */}
      <button
        onClick={() => onDelete(todo.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0"
        aria-label="Delete to-do"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
