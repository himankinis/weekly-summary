import { NextRequest, NextResponse } from "next/server";
import { getDb, getWeekStart } from "@/lib/db";
import { syncCalendar, getCalendarEventsForWeek } from "@/lib/ics-ingestor";
import type { CalendarEvent } from "@/lib/types";

// GET /api/calendar?week=YYYY-MM-DD
// Returns calendar events for the given week
export async function GET(req: NextRequest) {
  try {
    const week = req.nextUrl.searchParams.get("week") ?? getWeekStart();
    const events = getCalendarEventsForWeek(week);
    return NextResponse.json({ ok: true, data: events });
  } catch (err) {
    console.error("[GET /api/calendar]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// POST /api/calendar
// Body: { ics_url?: string }  — triggers a sync
// If ics_url is provided, saves it to settings first
export async function POST(req: NextRequest) {
  try {
    const body: { ics_url?: string } = await req.json().catch(() => ({}));
    const db = getDb();

    // Optionally update the stored ICS URL
    if (body.ics_url) {
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('ics_url', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(body.ics_url.trim());

      // Enable calendar sync now that a URL is set
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('calendar_sync_enabled', 'true', datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run();
    }

    // Read the current ICS URL
    const row = db
      .prepare(`SELECT value FROM settings WHERE key = 'ics_url'`)
      .get() as { value: string } | undefined;

    const icsUrl = row?.value?.trim();
    if (!icsUrl) {
      return NextResponse.json(
        { ok: false, error: "No ICS URL configured. Provide ics_url in the request body." },
        { status: 400 }
      );
    }

    const result = await syncCalendar(icsUrl);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error("[POST /api/calendar]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// DELETE /api/calendar?id=123  — remove a single event
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    }
    const db = getDb();
    db.prepare(`DELETE FROM calendar_events WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true, data: { id: Number(id) } });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
