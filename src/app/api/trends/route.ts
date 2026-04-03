import { NextRequest, NextResponse } from "next/server";
import { getTrendsData } from "@/lib/trends";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const week = searchParams.get("week");
    if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
      return NextResponse.json({ ok: false, error: "Missing or invalid week param" }, { status: 400 });
    }
    const data = getTrendsData(week);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
