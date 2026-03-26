import { NextRequest, NextResponse } from "next/server";
import { getDb, getWeekStart, toDateStr } from "@/lib/db";
import type { LogEntry, LogEntryInput } from "@/lib/types";

// GET /api/entries?week=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const week = req.nextUrl.searchParams.get("week") ?? getWeekStart();

    const entries = db
      .prepare(
        `SELECT * FROM log_entries WHERE week_start = ? ORDER BY entry_date DESC, created_at DESC`
      )
      .all(week) as LogEntry[];

    return NextResponse.json({ ok: true, data: entries });
  } catch (err) {
    console.error("[GET /api/entries]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// POST /api/entries
export async function POST(req: NextRequest) {
  try {
    const body: LogEntryInput = await req.json();

    if (!body.content?.trim()) {
      return NextResponse.json(
        { ok: false, error: "content is required" },
        { status: 400 }
      );
    }
    if (!["highlight", "lowlight", "blocker"].includes(body.type)) {
      return NextResponse.json(
        { ok: false, error: "type must be highlight, lowlight, or blocker" },
        { status: 400 }
      );
    }

    const db = getDb();
    const entryDate = body.entry_date ?? toDateStr();
    const weekStart = getWeekStart(new Date(entryDate + "T12:00:00"));

    const result = db
      .prepare(
        `INSERT INTO log_entries (content, type, source, raw_prompt, calendar_uid, entry_date, week_start)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.content.trim(),
        body.type,
        body.source ?? "manual",
        body.raw_prompt ?? null,
        body.calendar_uid ?? null,
        entryDate,
        weekStart
      );

    const created = db
      .prepare(`SELECT * FROM log_entries WHERE id = ?`)
      .get(result.lastInsertRowid) as LogEntry;

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/entries]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
