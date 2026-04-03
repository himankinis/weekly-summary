import { NextResponse } from "next/server";
import { syncTeamsToLog, TEAMS_EXPORT_PATH } from "@/lib/teams";

export async function POST() {
  try {
    const result = syncTeamsToLog();
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error("[POST /api/teams]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, data: { path: TEAMS_EXPORT_PATH } });
}
