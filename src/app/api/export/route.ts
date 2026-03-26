import { NextRequest, NextResponse } from "next/server";
import { getWeekStart } from "@/lib/db";
import {
  generateWeeklySummary,
  summaryToMarkdown,
  summaryToText,
} from "@/lib/summary-generator";

// GET /api/export?week=YYYY-MM-DD&format=markdown|text
export async function GET(req: NextRequest) {
  try {
    const week = req.nextUrl.searchParams.get("week") ?? getWeekStart();
    const fmt = req.nextUrl.searchParams.get("format") ?? "markdown";

    const summary = generateWeeklySummary(week);

    let content: string;
    let contentType: string;
    let filename: string;

    if (fmt === "text") {
      content = summaryToText(summary);
      contentType = "text/plain";
      filename = `weekly-summary-${week}.txt`;
    } else {
      content = summaryToMarkdown(summary);
      contentType = "text/markdown";
      filename = `weekly-summary-${week}.md`;
    }

    return new NextResponse(content, {
      headers: {
        "Content-Type": `${contentType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/export]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
