import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { WeeklySummary, WeeklySummaryData } from "@/lib/types";

export interface HistoryEntry {
  week_start: string;
  generated_at: string;
  summary: WeeklySummaryData;
}

// GET /api/summary/history — returns all saved week summaries, newest first
export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT week_start, summary_json, generated_at
         FROM weekly_summaries
         ORDER BY week_start DESC
         LIMIT 26`
      )
      .all() as WeeklySummary[];

    const data: HistoryEntry[] = rows.map((r) => ({
      week_start: r.week_start,
      generated_at: r.generated_at,
      summary: JSON.parse(r.summary_json) as WeeklySummaryData,
    }));

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[GET /api/summary/history]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
