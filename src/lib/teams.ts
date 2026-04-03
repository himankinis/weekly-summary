import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { getDb, getWeekStart, toDateStr } from "./db";
import { classifyPrompt } from "./classifier";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamsMessage {
  conversation_id: string;
  channel: string;
  sender: string;
  timestamp: string;
  body: string;
}

/** Raw shape from a Teams Graph API export or manual JSON dump */
interface RawTeamsMessage {
  id?: string;
  // Conversation / thread ID
  conversation_id?: string;
  conversationId?: string;
  // Channel or chat name
  channel?: string;
  channelName?: string;
  channel_name?: string;
  chat_name?: string;
  chatName?: string;
  // Sender
  sender?: string;
  from?: string | { user?: { displayName?: string; id?: string } };
  // Timestamp
  timestamp?: string;
  createdDateTime?: string;
  // Message body
  body?: string | { content?: string; contentType?: string };
  text?: string;
  // Optional type flag to skip system messages
  messageType?: string;
  type?: string;
}

export interface TeamsSyncResult {
  imported: number;
  skipped: number;
  errors: string[];
  file: string;
}

// ─── Path ─────────────────────────────────────────────────────────────────────

export const TEAMS_EXPORT_PATH = path.join(
  os.homedir(),
  "OneDrive - FICO",
  "WeeklyPulse",
  "teams_export.json"
);

// ─── Normalise ────────────────────────────────────────────────────────────────

function normalizeMessage(raw: RawTeamsMessage): TeamsMessage | null {
  // Skip known system message types
  const msgType = (raw.messageType ?? raw.type ?? "").toLowerCase();
  if (msgType && !["message", "chatmessage", ""].includes(msgType)) return null;

  const conversation_id =
    raw.conversation_id ?? raw.conversationId ?? crypto.randomUUID();

  const channel =
    raw.channel ??
    raw.channelName ??
    raw.channel_name ??
    raw.chatName ??
    raw.chat_name ??
    "Teams";

  // Resolve sender
  let sender: string;
  if (typeof raw.from === "string") {
    sender = raw.from;
  } else if (raw.from?.user?.displayName) {
    sender = raw.from.user.displayName;
  } else {
    sender = raw.sender ?? "Unknown";
  }

  const timestamp = raw.timestamp ?? raw.createdDateTime ?? "";
  if (!timestamp) return null;

  // Resolve body
  let body: string;
  if (typeof raw.body === "string") {
    body = raw.body;
  } else if (raw.body?.content) {
    body = raw.body.content;
  } else {
    body = raw.text ?? "";
  }

  // Strip HTML tags (Teams rich-text export)
  body = body.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

  if (!body) return null;

  return { conversation_id, channel, sender, timestamp, body };
}

// ─── Noise filtering ──────────────────────────────────────────────────────────

/** Single-line patterns that carry no work signal */
const NOISE_PATTERNS = [
  /^(👍|👋|✅|🙏|👏|😊|👌|🔥|💯|🎉|\+\d*)$/,
  /^(ok|ok!|okay|sure|thanks|thank you|thx|ty|got it|sounds good|will do|noted|lgtm|\+1|ack)\.?$/i,
  /^(meeting started|meeting ended|call started|call ended|you have a missed call)$/i,
  /^https?:\/\/\S+$/,           // bare URL only
  /^\+?\d+\s+reaction/i,        // reaction summary
  /^@\w+\s*$/,                  // @mention with nothing else
];

function isNoisy(msg: TeamsMessage): boolean {
  if (msg.body.length < 15) return true;
  return NOISE_PATTERNS.some((p) => p.test(msg.body.trim()));
}

// ─── Dedup key ────────────────────────────────────────────────────────────────

function messageId(msg: TeamsMessage): string {
  const day = msg.timestamp.slice(0, 10);
  const raw = `${day}|${msg.conversation_id}|${msg.sender}|${msg.body.slice(0, 60)}`;
  return "teams:" + crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

// ─── Content format ───────────────────────────────────────────────────────────

/** Human-readable one-liner stored in log_entries.content */
export function formatTeamsContent(msg: TeamsMessage): string {
  const channelPart = msg.channel !== "Teams" ? ` in ${msg.channel}` : "";
  const snippet =
    msg.body.length > 80 ? msg.body.slice(0, 77) + "…" : msg.body;
  return `Teams chat${channelPart}: "${snippet}"`;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export function syncTeamsToLog(filePath = TEAMS_EXPORT_PATH): TeamsSyncResult {
  const result: TeamsSyncResult = {
    imported: 0,
    skipped: 0,
    errors: [],
    file: filePath,
  };

  let messages: TeamsMessage[];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    // Accept: bare array, { messages: [...] }, { value: [...] }, { chats: [...] }
    const items: RawTeamsMessage[] = Array.isArray(parsed)
      ? parsed
      : parsed.messages ?? parsed.value ?? parsed.chats ?? [];
    messages = items
      .map(normalizeMessage)
      .filter((m): m is TeamsMessage => m !== null);
  } catch (err) {
    throw new Error(
      `Cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const db = getDb();
  const today = new Date();

  for (const msg of messages) {
    try {
      if (isNoisy(msg)) {
        result.skipped++;
        continue;
      }

      const externalId = messageId(msg);

      const rawDate = new Date(msg.timestamp);
      if (isNaN(rawDate.getTime())) {
        result.errors.push(`Skipped message: invalid timestamp "${msg.timestamp}"`);
        continue;
      }

      const entryDate =
        toDateStr(rawDate) > toDateStr(today)
          ? toDateStr(today)
          : toDateStr(rawDate);
      const weekStart = getWeekStart(new Date(entryDate + "T12:00:00"));

      // Dedup: skip if already imported
      const existing = db
        .prepare(
          `SELECT id FROM log_entries WHERE calendar_uid = ? AND week_start = ?`
        )
        .get(externalId, weekStart);
      if (existing) {
        result.skipped++;
        continue;
      }

      const type = classifyPrompt(msg.body);
      const content = formatTeamsContent(msg);

      db.prepare(
        `INSERT INTO log_entries (content, type, source, calendar_uid, entry_date, week_start)
         VALUES (?, ?, 'teams', ?, ?, ?)`
      ).run(content, type, externalId, entryDate, weekStart);

      result.imported++;
    } catch (err) {
      result.errors.push(
        `Message error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}
