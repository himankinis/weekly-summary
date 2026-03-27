import { NextResponse } from "next/server";
import { syncJiraToLog } from "@/lib/jira";
import { syncConfluenceToLog } from "@/lib/confluence";

export async function POST() {
  try {
    const [jira, confluence] = await Promise.allSettled([
      syncJiraToLog(),
      syncConfluenceToLog(),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        jira:
          jira.status === "fulfilled"
            ? jira.value
            : { imported: 0, skipped: 0, errors: [jira.reason?.message ?? String(jira.reason)] },
        confluence:
          confluence.status === "fulfilled"
            ? confluence.value
            : { imported: 0, skipped: 0, errors: [confluence.reason?.message ?? String(confluence.reason)] },
      },
    });
  } catch (err) {
    console.error("[POST /api/atlassian]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
