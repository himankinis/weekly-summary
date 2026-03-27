# Weekly Summary

A local-first weekly work summarizer. Captures daily highlights, lowlights, and blockers — plus auto-captures Claude Code activity via hooks — and generates a structured weekly summary.

## Project Purpose

Replace the manual "what did I do this week?" struggle with a running log that collects:
- **Manual entries**: quick notes tagged as highlight / lowlight / blocker
- **Claude Code activity**: auto-captured from hooks (prompts → classified as highlights when they ship work)
- **Calendar events**: pulled from ICS URL, classified as meetings

At week's end, one button generates a formatted summary ready to paste into a standup, Slack, or doc.

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Database**: SQLite via better-sqlite3 at `~/.weekly-pulse/weekly-pulse.db`
- **UI**: shadcn/ui + Tailwind CSS
- **Language**: TypeScript (strict)

## Project Structure

```
src/app/           # Next.js App Router pages + API routes
src/lib/           # DB layer, types, classification, summary generation
src/components/    # React UI components
hooks/             # Claude Code hook implementations (.mjs)
scripts/           # CLI setup (setup.mjs) and report (report.mjs)
```

## Key Files

- `src/lib/db.ts` — SQLite singleton, returns cached connection, creates schema on first run
- `src/lib/db/schema.sql` — Database schema (log_entries, calendar_events, weekly_summaries)
- `src/lib/types.ts` — All TypeScript types
- `src/lib/classifier.ts` — Classifies entries into highlight/lowlight/blocker
- `src/lib/ics-ingestor.ts` — Fetches ICS URL, parses VEVENT/RRULE, upserts to calendar_events
- `src/lib/summary-generator.ts` — Produces weekly summary from DB entries
- `src/app/page.tsx` — Dashboard (current week view + log input)
- `src/app/api/entries/route.ts` — CRUD for log entries
- `src/app/api/calendar/route.ts` — GET events, POST to sync ICS, DELETE individual event
- `src/app/api/summary/route.ts` — Generate/fetch weekly summary
- `hooks/on-prompt.mjs` — Claude Code hook that captures prompts
- `scripts/setup.mjs` — Registers hooks in Claude Code settings
- `scripts/report.mjs` — CLI weekly report printer

## Entry Types

| Type       | Color  | Meaning                                      |
|------------|--------|----------------------------------------------|
| highlight  | green  | Accomplishment, shipped work, good decision  |
| lowlight   | amber  | Delay, missed target, thing that took longer |
| blocker    | red    | Dependency, access issue, waiting on others  |

## Entry Sources

| Source   | How captured                                      |
|----------|---------------------------------------------------|
| manual   | Typed in dashboard log input                      |
| hook     | Auto-captured from Claude Code prompt hook        |
| calendar | Pulled from ICS URL feed                          |

## NPM Scripts

- `npm run dev` — Start dashboard at http://localhost:3000
- `npm run setup` — Register Claude Code hooks
- `npm run report` — Print weekly summary in terminal

## Database Location

`~/.weekly-pulse/weekly-pulse.db` — local only, never synced.

## Week Boundaries

Weeks run Monday–Sunday. The `week_start` field on every entry stores the Monday ISO date string (YYYY-MM-DD) for easy grouping.

## Development Notes

- `better-sqlite3` is synchronous and must only run in API routes (server-side). Never import db.ts in client components.
- The hook at `hooks/on-prompt.mjs` posts to the local Next.js server. The server must be running for hook auto-capture to work.
- Calendar sync is triggered manually from the dashboard or via the ICS settings panel.
