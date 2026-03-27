import { NextRequest, NextResponse } from "next/server";
import { getDb, getWeekStart, toDateStr } from "@/lib/db";
import { classifyPrompt, summarizePrompt } from "@/lib/classifier";
import type { HookPromptPayload } from "@/lib/types";

// POST /api/hook  — called by hooks/on-prompt.mjs
export async function POST(req: NextRequest) {
  try {
    const payload: HookPromptPayload = await req.json();

    if (!payload.prompt?.trim()) {
      return NextResponse.json({ ok: false, error: "prompt is required" }, { status: 400 });
    }

    const prompt = payload.prompt.trim();

    // Filter noise: too short, system XML, or bare shell commands
    if (prompt.length < 30) return NextResponse.json({ ok: true, data: { skipped: true } });
    if (/<task-notification|<tool-use|<system-reminder/i.test(prompt))
      return NextResponse.json({ ok: true, data: { skipped: true } });
    if (/^(cd|git|npm|node|ls|cat|curl|open|python|bash|sh)\b/i.test(prompt))
      return NextResponse.json({ ok: true, data: { skipped: true } });

    const db = getDb();

    // Check if hook capture is enabled
    const setting = db
      .prepare(`SELECT value FROM settings WHERE key = 'hook_capture_enabled'`)
      .get() as { value: string } | undefined;

    if (setting?.value === "false") {
      return NextResponse.json({ ok: true, data: { skipped: true } });
    }

    const type = classifyPrompt(payload.prompt);
    const summary = summarizePrompt(payload.prompt);
    const entryDate = toDateStr();
    const weekStart = getWeekStart();

    const result = db
      .prepare(
        `INSERT INTO log_entries (content, type, source, raw_prompt, entry_date, week_start)
         VALUES (?, ?, 'hook', ?, ?, ?)`
      )
      .run(summary, type, payload.prompt.slice(0, 2000), entryDate, weekStart);

    return NextResponse.json({
      ok: true,
      data: { id: result.lastInsertRowid, type, content: summary },
    });
  } catch (err) {
    console.error("[POST /api/hook]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
