import { getDb, getWeekStart, toDateStr } from "./db";
import type { EntryType } from "./types";

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

async function jiraFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${getBase()}/rest/api/3${path}`, {
    headers: { Authorization: getAuthHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Jira API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
      statusCategory: { key: string };
    };
    priority: { name: string } | null;
    assignee: { emailAddress: string } | null;
    reporter: { emailAddress: string } | null;
    resolutiondate: string | null;
    created: string;
    updated: string;
    labels: string[];
  };
}

interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
}

export interface JiraSyncResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ─── Classification ───────────────────────────────────────────────────────────

function classifyIssue(issue: JiraIssue): EntryType {
  const statusCategory = issue.fields.status.statusCategory.key.toLowerCase();
  const status = issue.fields.status.name.toLowerCase();
  const priority = (issue.fields.priority?.name ?? "").toLowerCase();
  const labels = issue.fields.labels.map((l) => l.toLowerCase());

  if (statusCategory === "done") return "highlight";

  if (
    priority === "blocker" ||
    status.includes("blocked") ||
    labels.includes("blocked") ||
    labels.includes("blocker")
  ) {
    return "blocker";
  }

  return "lowlight";
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

const FIELDS = "summary,status,priority,assignee,reporter,resolutiondate,created,updated,labels";

export async function syncJiraToLog(): Promise<JiraSyncResult> {
  if (!process.env.JIRA_URL || !process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) {
    throw new Error("Jira credentials not configured. Set JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN in .env");
  }

  const db = getDb();
  const result: JiraSyncResult = { imported: 0, skipped: 0, errors: [] };

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().slice(0, 10);

  // Collect all issues, deduplicating by key
  const issueMap = new Map<string, JiraIssue>();

  // Query 1: issues where I'm involved with recent activity
  try {
    const jql = encodeURIComponent(
      `(assignee = currentUser() OR reporter = currentUser()) AND updated >= "${dateStr}" ORDER BY updated DESC`
    );
    const data = await jiraFetch<JiraSearchResponse>(
      `/search?jql=${jql}&maxResults=50&fields=${FIELDS}`
    );
    for (const issue of data.issues ?? []) issueMap.set(issue.key, issue);
  } catch (err) {
    result.errors.push(`Activity query failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Query 2: in-progress issues assigned to me (may not have been updated recently)
  try {
    const jql = encodeURIComponent(
      `assignee = currentUser() AND status = "In Progress" ORDER BY updated DESC`
    );
    const data = await jiraFetch<JiraSearchResponse>(
      `/search?jql=${jql}&maxResults=20&fields=${FIELDS}`
    );
    for (const issue of data.issues ?? []) {
      if (!issueMap.has(issue.key)) issueMap.set(issue.key, issue);
    }
  } catch (err) {
    result.errors.push(`In-progress query failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const today = new Date();

  for (const issue of issueMap.values()) {
    try {
      const externalId = `jira:${issue.key}`;

      // Use resolution date if resolved, otherwise use updated date
      const rawDate = issue.fields.resolutiondate ?? issue.fields.updated;
      const activityDate = rawDate.slice(0, 10);
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

      const type = classifyIssue(issue);
      const statusName = issue.fields.status.name;
      const content = `[${issue.key}] ${issue.fields.summary} (${statusName})`;

      db.prepare(
        `INSERT INTO log_entries (content, type, source, calendar_uid, entry_date, week_start)
         VALUES (?, ?, 'jira', ?, ?, ?)`
      ).run(content, type, externalId, entryDate, weekStart);

      result.imported++;
    } catch (err) {
      result.errors.push(`${issue.key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
