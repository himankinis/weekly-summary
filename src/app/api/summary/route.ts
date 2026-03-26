import { NextRequest, NextResponse } from "next/server";
import { getDb, getWeekStart } from "@/lib/db";
import { generateWeeklySummary } from "@/lib/summary-generator";
import type { WeeklySummary, WeeklySummaryData } from "@/lib/types";

// GET /api/summary?week=YYYY-MM-DD&cached=true
export async function GET(req: NextRequest) {
  try {
    const week = req.nextUrl.searchParams.get("week") ?? getWeekStart();
    const wantCached = req.nextUrl.searchParams.get("cached") !== "false";

    const db = getDb();

    if (wantCached) {
      const existing = db
        .prepare(`SELECT * FROM weekly_summaries WHERE week_start = ?`)
        .get(week) as WeeklySummary | undefined;

      if (existing) {
        return NextResponse.json({
          ok: true,
          data: { summary: JSON.parse(existing.summary_json) as WeeklySummaryData },
        });
      }
    }

    // Generate fresh
    const summary = generateWeeklySummary(week);

    // Cache it
    db.prepare(
      `INSERT INTO weekly_summaries (week_start, summary_json, generated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(week_start) DO UPDATE SET
         summary_json = excluded.summary_json,
         generated_at = excluded.generated_at`
    ).run(week, JSON.stringify(summary));

    return NextResponse.json({ ok: true, data: { summary } });
  } catch (err) {
    console.error("[GET /api/summary]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// POST /api/summary/regenerate (force refresh)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const week = (body as { week?: string }).week ?? getWeekStart();

    const summary = generateWeeklySummary(week);
    const db = getDb();

    db.prepare(
      `INSERT INTO weekly_summaries (week_start, summary_json, generated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(week_start) DO UPDATE SET
         summary_json = excluded.summary_json,
         generated_at = excluded.generated_at`
    ).run(week, JSON.stringify(summary));

    return NextResponse.json({ ok: true, data: { summary } });
  } catch (err) {
    console.error("[POST /api/summary]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
