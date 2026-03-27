import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { getDb, getWeekStart, toDateStr } from "./db";
import { classifyPrompt } from "./classifier";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailRecord {
  subject: string;
  recipients: string | string[];
  date: string; // ISO 8601 or YYYY-MM-DD
  body_snippet: string;
}

export interface EmailSyncResult {
  imported: number;
  skipped: number;
  errors: string[];
  file: string;
}

// ─── Path ─────────────────────────────────────────────────────────────────────

export const EMAIL_EXPORT_PATH = path.join(
  os.homedir(),
  "OneDrive - FICO",
  "WeeklyPulse",
  "email_export.json"
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stable dedup key for an email — hash of date + subject */
function emailId(email: EmailRecord): string {
  const raw = `${email.date}|${email.subject}`;
  return "email:" + crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

function normalizeRecipients(recipients: string | string[]): string[] {
  if (Array.isArray(recipients)) return recipients;
  // comma-separated string
  return recipients.split(",").map((r) => r.trim()).filter(Boolean);
}

function formatContent(email: EmailRecord): string {
  const recipients = normalizeRecipients(email.recipients);
  const to =
    recipients.length === 0
      ? ""
      : recipients.length === 1
      ? ` to ${recipients[0]}`
      : ` to ${recipients[0]} +${recipients.length - 1}`;
  return `Sent email: "${email.subject}"${to}`;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export function syncEmailToLog(filePath = EMAIL_EXPORT_PATH): EmailSyncResult {
  const result: EmailSyncResult = {
    imported: 0,
    skipped: 0,
    errors: [],
    file: filePath,
  };

  // Read and parse the JSON export
  let emails: EmailRecord[];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    emails = Array.isArray(parsed) ? parsed : parsed.emails ?? parsed.value ?? [];
  } catch (err) {
    throw new Error(
      `Cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const db = getDb();
  const today = new Date();

  for (const email of emails) {
    try {
      if (!email.subject || !email.date) {
        result.errors.push(`Skipped email missing subject or date`);
        continue;
      }

      const externalId = emailId(email);

      // Parse the email date
      const rawDate = new Date(email.date);
      if (isNaN(rawDate.getTime())) {
        result.errors.push(`Skipped "${email.subject}": invalid date "${email.date}"`);
        continue;
      }

      const entryDate = toDateStr(rawDate) > toDateStr(today)
        ? toDateStr(today)
        : toDateStr(rawDate);
      const weekStart = getWeekStart(new Date(entryDate + "T12:00:00"));

      // Dedup: skip if already imported for this week
      const existing = db
        .prepare(`SELECT id FROM log_entries WHERE calendar_uid = ? AND week_start = ?`)
        .get(externalId, weekStart);
      if (existing) {
        result.skipped++;
        continue;
      }

      // Classify using subject + body snippet
      const textToClassify = [email.subject, email.body_snippet].filter(Boolean).join(" ");
      const type = classifyPrompt(textToClassify);
      const content = formatContent(email);

      db.prepare(
        `INSERT INTO log_entries (content, type, source, calendar_uid, entry_date, week_start)
         VALUES (?, ?, 'email', ?, ?, ?)`
      ).run(content, type, externalId, entryDate, weekStart);

      result.imported++;
    } catch (err) {
      result.errors.push(
        `"${email.subject ?? "unknown"}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}
