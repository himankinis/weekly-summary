# Weekly Pulse

A local-first weekly work summarizer for PMs. Captures daily highlights, lowlights, and blockers — plus auto-captures Claude Code activity via hooks — and generates a structured weekly summary.

Built as part of the **AI Hacks for PMs** initiative.

## What it does

- **Manual entries** — log highlights, lowlights, and blockers from the dashboard
- **Claude Code activity** — auto-captures prompts via a hook on every Claude Code session
- **Calendar sync** — pulls events from an ICS URL and classifies them as meetings
- **Weekly summary** — one click generates a narrative summary ready to paste into a standup, Slack, or doc

All data stays on your machine at `~/.weekly-pulse/weekly-pulse.db`.

## Setup

**Prerequisites:** Node.js 20+

```bash
git clone https://github.com/himankinis/weekly-pulse
cd weekly-pulse
npm install

# Register the Claude Code hook
npm run setup

# Start the dashboard
npm run dev
```

Open **http://localhost:3000**.

> Start a new Claude Code session after `npm run setup` for the hook to take effect. The dev server must be running for auto-capture to work.

## Usage

| Script | Description |
|---|---|
| `npm run dev` | Start dashboard at http://localhost:3000 |
| `npm run setup` | Register Claude Code hooks |
| `npm run report` | Print weekly summary in terminal |

## Entry types

| Type | Meaning |
|---|---|
| ✅ Highlight | Accomplishment, shipped work, good decision |
| ⚠️ Lowlight | Delay, missed target, thing that took longer |
| 🚫 Blocker | Dependency, access issue, waiting on others |

## Tech stack

- **Framework:** Next.js 15 with App Router
- **Database:** SQLite via `better-sqlite3`
- **UI:** shadcn/ui + Tailwind CSS
- **Language:** TypeScript
