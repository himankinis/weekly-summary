/**
 * Weekly Summary — Claude Code "on-prompt" hook
 *
 * Fires on every Claude Code prompt submission. Sends the prompt text to the
 * local Weekly Summary server which classifies it and stores it as a log entry.
 *
 * Registered by: npm run setup
 * Requires: Weekly Summary dev server running (npm run dev)
 */

import { execSync } from "child_process";

const WEEKLY_PULSE_URL = process.env.WEEKLY_PULSE_URL ?? "http://localhost:3000";

// Claude Code passes the hook event as JSON on stdin
let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", async () => {
  try {
    const event = JSON.parse(raw || "{}");
    const prompt = event.prompt ?? event.userPrompt ?? event.message ?? "";

    if (!prompt || prompt.length < 10) process.exit(0);

    const payload = {
      prompt,
      cwd: process.env.PWD ?? process.cwd(),
      session_id: event.session_id ?? event.sessionId ?? null,
      timestamp: new Date().toISOString(),
    };

    // Fire-and-forget — don't block Claude Code's response
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    await fetch(`${WEEKLY_PULSE_URL}/api/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch(() => {
      // Server not running — silently skip
    });

    clearTimeout(timeout);
  } catch {
    // Never crash Claude Code
  }

  process.exit(0);
});
