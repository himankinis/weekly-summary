# Weekly Summary — AI Productivity Tool for PMs

**Status:** Live
**Repo:** https://github.com/himankinis/weekly-pulse
**Owner:** Himankini Shah

---

## What is it?

Weekly Summary is a local-first weekly work summarizer built as part of the **AI Hacks for PMs** initiative. It replaces the manual "what did I do this week?" struggle by automatically collecting your work activity throughout the week and generating a structured summary on demand.

All data stays on your machine (`~/.weekly-pulse/weekly-pulse.db`) — nothing is sent to any server.

---

## How it works

Weekly Summary collects entries from three sources:

| Source | How it's captured |
|---|---|
| **Manual** | Type highlights, lowlights, or blockers directly in the dashboard |
| **Claude Code activity** | Auto-captured via a hook that fires on every prompt you submit to Claude Code |
| **Calendar** | Pulled from your calendar ICS feed and classified as meetings |

At week's end, one click generates a formatted summary covering accomplishments, delays, blockers, and key meetings.

---

## Entry types

| Type | Meaning |
|---|---|
| ✅ Highlight | Accomplishment, shipped work, good decision |
| ⚠️ Lowlight | Delay, missed target, thing that took longer than expected |
| 🚫 Blocker | Dependency, access issue, waiting on others |

---

## Setup

**Prerequisites:** Node.js 20+, npm

```bash
# 1. Clone the repo
git clone https://github.com/himankinis/weekly-pulse
cd weekly-pulse

# 2. Install dependencies
npm install

# 3. Register the Claude Code hook (auto-captures your prompts)
npm run setup

# 4. Start the dashboard
npm run dev
```

Open **http://localhost:3000** — the dashboard is ready.

> The server must be running for Claude Code activity to be auto-captured. Start a new Claude Code session after running `npm run setup` for the hook to take effect.

---

## Using the dashboard

- **Log an entry** — type a note and tag it as highlight / lowlight / blocker
- **Claude Activity** — auto-captured Claude Code prompts appear in a dedicated section (expandable to see the raw prompt); excluded from the weekly summary
- **Calendar** — paste your ICS URL in settings to sync meetings
- **Generate summary** — click "Generate Summary" in the right panel to produce a narrative for the week
- **Navigate weeks** — use the week arrows in the header to review past weeks

---

## Weekly summary

The generated summary includes:
- Narrative overview (active days, key wins, blockers)
- Highlights, lowlights, and blockers (manual entries only)
- Meeting list from calendar

You can also run a terminal report:
```bash
npm run report
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Database | SQLite via `better-sqlite3` at `~/.weekly-pulse/` |
| UI | shadcn/ui + Tailwind CSS |
| Language | TypeScript (strict) |

---

*Built as part of AI Hacks for PMs · Data is local-only and never synced*
