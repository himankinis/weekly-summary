import { NextResponse } from "next/server";
import { syncEmailToLog, EMAIL_EXPORT_PATH } from "@/lib/email";

export async function POST() {
  try {
    const result = syncEmailToLog();
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error("[POST /api/email]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, data: { path: EMAIL_EXPORT_PATH } });
}
