import { NextRequest, NextResponse } from "next/server";
import { getDb, getWeekStart, toDateStr } from "@/lib/db";
import { format, subDays, parseISO } from "date-fns";
import type { LogEntry } from "@/lib/types";

// GET /api/todos?week=YYYY-MM-DD
// Returns todos for the given week, auto-carrying forward any incomplete todos
// from the previous week that haven't been carried yet.
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const week = req.nextUrl.searchParams.get("week") ?? getWeekStart();
    const prevWeek = format(subDays(parseISO(week), 7), "yyyy-MM-dd");

    // Carry forward incomplete todos from the previous week
    const incompletePrev = db
      .prepare(
        `SELECT * FROM log_entries WHERE week_start = ? AND type = 'todo' AND completed = 0`
      )
      .all(prevWeek) as LogEntry[];

    const today = toDateStr();
    for (const prev of incompletePrev) {
      const existing = db
        .prepare(
          `SELECT id FROM log_entries WHERE week_start = ? AND carried_from_id = ?`
        )
        .get(week, prev.id);
      if (!existing) {
        db.prepare(
          `INSERT INTO log_entries (content, type, source, entry_date, week_start, carried_from_id)
           VALUES (?, 'todo', 'manual', ?, ?, ?)`
        ).run(prev.content, today, week, prev.id);
      }
    }

    const todos = db
      .prepare(
        `SELECT * FROM log_entries
         WHERE week_start = ? AND type = 'todo'
         ORDER BY completed ASC, created_at ASC`
      )
      .all(week) as LogEntry[];

    return NextResponse.json({ ok: true, data: todos });
  } catch (err) {
    console.error("[GET /api/todos]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// POST /api/todos
export async function POST(req: NextRequest) {
  try {
    const body: { content: string; week?: string } = await req.json();

    if (!body.content?.trim()) {
      return NextResponse.json(
        { ok: false, error: "content is required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const today = toDateStr();
    const weekStart = body.week ?? getWeekStart(new Date(today + "T12:00:00"));

    const result = db
      .prepare(
        `INSERT INTO log_entries (content, type, source, entry_date, week_start)
         VALUES (?, 'todo', 'manual', ?, ?)`
      )
      .run(body.content.trim(), today, weekStart);

    const created = db
      .prepare(`SELECT * FROM log_entries WHERE id = ?`)
      .get(result.lastInsertRowid) as LogEntry;

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/todos]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
