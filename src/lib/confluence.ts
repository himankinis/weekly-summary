import { getDb, getWeekStart, toDateStr } from "./db";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getAuthHeader(): string {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

function getBase(): string {
  const url = process.env.JIRA_URL;
  if (!url) throw new Error("JIRA_URL not set in environment");
  return url.replace(/\/$/, "");
}

async function confluenceFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${getBase()}/wiki/rest/api${path}`, {
    headers: { Authorization: getAuthHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Confluence API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfluencePage {
  id: string;
  title: string;
  space: { name: string; key: string };
  version: {
    when: string;
    by: { displayName: string; email?: string };
    number: number;
  };
  history: {
    createdDate: string;
    createdBy: { displayName: string };
  };
}

interface ConfluenceSearchResponse {
  results: ConfluencePage[];
  size: number;
}

export interface ConfluenceSyncResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export async function syncConfluenceToLog(): Promise<ConfluenceSyncResult> {
  if (!process.env.JIRA_URL || !process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) {
    throw new Error("Confluence credentials not configured. Set JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN in .env");
  }

  const db = getDb();
  const result: ConfluenceSyncResult = { imported: 0, skipped: 0, errors: [] };

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().slice(0, 10);

  let pages: ConfluencePage[] = [];
  try {
    const cql = encodeURIComponent(
      `(creator = currentUser() OR lastModifier = currentUser()) AND lastModified >= "${dateStr}" AND type = page ORDER BY lastModified DESC`
    );
    const data = await confluenceFetch<ConfluenceSearchResponse>(
      `/content/search?cql=${cql}&limit=50&expand=space,version,history`
    );
    pages = data.results ?? [];
  } catch (err) {
    result.errors.push(`Confluence search failed: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const today = new Date();

  for (const page of pages) {
    try {
      const externalId = `confluence:${page.id}`;

      const rawDate = page.version?.when ?? page.history?.createdDate;
      const activityDate = (rawDate ?? toDateStr(today)).slice(0, 10);
      const entryDate = activityDate > toDateStr(today) ? toDateStr(today) : activityDate;
      const weekStart = getWeekStart(new Date(entryDate + "T12:00:00"));

      // Dedup: skip if already synced for this week
      const existing = db
        .prepare(`SELECT id FROM log_entries WHERE calendar_uid = ? AND week_start = ?`)
        .get(externalId, weekStart);
      if (existing) {
        result.skipped++;
        continue;
      }

      const spaceName = page.space?.name ?? page.space?.key ?? "Confluence";
      // version.number === 1 means newly created
      const isNew = (page.version?.number ?? 1) === 1;
      const action = isNew ? "Created" : "Edited";
      const content = `${action} Confluence page: "${page.title}" in ${spaceName}`;

      db.prepare(
        `INSERT INTO log_entries (content, type, source, calendar_uid, entry_date, week_start)
         VALUES (?, 'highlight', 'confluence', ?, ?, ?)`
      ).run(content, externalId, entryDate, weekStart);

      result.imported++;
    } catch (err) {
      result.errors.push(`Page ${page.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
