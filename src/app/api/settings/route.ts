import { NextRequest, NextResponse } from "next/server";
import { loadSettings, saveSetting } from "@/lib/db";

// GET /api/settings
export async function GET() {
  try {
    const settings = loadSettings();
    return NextResponse.json({ ok: true, data: settings });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// PATCH /api/settings
export async function PATCH(req: NextRequest) {
  try {
    const body: Record<string, string | boolean> = await req.json();

    for (const [key, val] of Object.entries(body)) {
      saveSetting(key, String(val));
    }

    const updated = loadSettings();
    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
