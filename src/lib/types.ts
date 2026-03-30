// ─── Entry Types ──────────────────────────────────────────────────────────────

export type EntryType = "highlight" | "lowlight" | "blocker" | "todo";
export type EntrySource = "manual" | "hook" | "calendar" | "jira" | "confluence" | "email";

export interface LogEntry {
  id: number;
  content: string;
  type: EntryType;
  source: EntrySource;
  raw_prompt: string | null;
  calendar_uid: string | null;
  entry_date: string; // YYYY-MM-DD
  week_start: string; // YYYY-MM-DD (Monday)
  completed: number; // 0 or 1
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LogEntryInput {
  content: string;
  type: EntryType;
  source?: EntrySource;
  raw_prompt?: string;
  calendar_uid?: string;
  entry_date?: string; // defaults to today
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: number;
  uid: string;
  title: string;
  start_time: string;
  end_time: string;
  attendee_count: number;
  ics_url: string | null;
  entry_date: string;
  week_start: string;
  imported_at: string;
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export interface WeeklySummaryData {
  weekStart: string;
  weekEnd: string; // Sunday
  highlights: SummaryItem[];
  lowlights: SummaryItem[];
  blockers: SummaryItem[];
  todos: SummaryItem[];
  meetings: MeetingSummaryItem[];
  decisions: SummaryItem[];
  nextWeekPreview: string[];
  narrative: string; // plain-English paragraph
  stats: WeekStats;
}

export interface SummaryItem {
  content: string;
  source: EntrySource;
  date: string;
}

export interface MeetingSummaryItem {
  title: string;
  date: string;
  attendee_count: number;
  related?: string[]; // Jira-key matched entry contents
}

export interface WeekStats {
  total_entries: number;
  highlight_count: number;
  lowlight_count: number;
  blocker_count: number;
  todo_count?: number;
  meeting_count: number;
  days_active: number;
  jira_count: number;
  email_count: number;
}

export interface WeeklySummary {
  id: number;
  week_start: string;
  summary_json: string; // serialized WeeklySummaryData
  generated_at: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  ics_url: string;
  calendar_sync_enabled: boolean;
  hook_capture_enabled: boolean;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Hook Payload ─────────────────────────────────────────────────────────────

export interface HookPromptPayload {
  prompt: string;
  cwd?: string;
  session_id?: string;
  timestamp?: string;
}
