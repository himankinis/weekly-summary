# Weekly Summary

A local-first weekly work summarizer for PMs. Auto-pulls from Jira, Outlook, calendar, and Claude Code to generate structured weekly summaries in multiple formats — PPM Weekly Highlights table, stakeholder narrative, 1:1 prep, and personal reference. Saves 30–60 min/week on status reporting.

Built as part of the **AI Hacks for PMs** initiative.

![Weekly Summary dashboard](docs/screenshots/dashboard.png)

## What it does

- **Manual entries** — log highlights, lowlights, and blockers directly from the dashboard
- **Jira via API** — syncs tickets and translates status into accomplishments: "Completed X", "Drove progress on X", "Initiated X"
- **Confluence via API** — syncs pages you created or edited; surfaces as "Published X on Confluence"
- **Outlook emails via Power Automate** — groups email threads by topic and synthesizes into PM actions: "Led cross-functional discussion on X", "Aligned with Y on Z", "Drove alignment on X with Y (N touchpoints)"
- **Calendar via ICS** — pulls meetings and filters out routine standups, 1:1s, and update meetings; keeps reviews, roadmap sessions, leadership calls, and working sessions
- **Claude Code auto-capture** — captures prompts via a hook on every Claude Code session

The summary generator synthesizes all raw data into PM-quality highlights — no "Sent email: Subject to Person" noise. Manual entries always take priority (up to 5 highlights, 3 blockers); synthesized items fill remaining slots ranked by source quality.

All data stays on your machine at `~/.weekly-pulse/weekly-pulse.db` — nothing is sent to any external server.

## Summary formats

Click **Generate Summary** and choose your audience from the dropdown:

| Format | Best for |
|---|---|
| **PPM Weekly Highlights** (default) | Paste-ready markdown table — max 5 highlights, 3 blockers |
| **For Stakeholders** | Executive bullets grouped by initiative: "**Initiative:** lead item — and N more." Scannable in 30 seconds |
| **For 1:1 with Manager** | Theme sentence + Highlights (initiative-sorted) + Blockers (framed as asks) + Key Decisions + Next Week |
| **For Myself** | Full detail — all sections including meetings and Jira enrichment |

All formats synthesize raw data into PM-quality language. Highlights are automatically clustered by initiative. Blockers are reframed as actionable asks ("Decision needed on X" or "I need your help with: X"). Raw email subjects and Jira ticket IDs are never shown as-is.

![Generated PPM summary](docs/screenshots/summary-output.png)

![Audience toggle](docs/screenshots/audience-toggle.png)

## Setup

**Prerequisites:** Node.js 20+, Claude Code installed

```bash
git clone https://github.com/himankinis/weekly-pulse
cd weekly-pulse
npm install
```

### 1. Configure credentials

Create a `.env` file in the project root:

```
JIRA_URL=https://fico-prod.atlassian.net
JIRA_EMAIL=your_email@fico.com
JIRA_API_TOKEN=your_token

CONFLUENCE_URL=https://fico-prod.atlassian.net
CONFLUENCE_EMAIL=your_email@fico.com
CONFLUENCE_API_TOKEN=your_token
```

Generate your API token at: https://id.atlassian.com/manage-profile/security/api-tokens

### 2. Register Claude Code hooks

```bash
npm run setup
```

Start a new Claude Code session after running setup for the hook to take effect. The dev server must be running for auto-capture to work.

### 3. Start the dashboard

```bash
npm run dev
```

Open **http://localhost:3000**.

### 4. Connect your calendar

Click **"Add ICS Feed"** on the dashboard and paste your Outlook calendar ICS URL.

> Outlook Web → Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.

### 5. Set up Outlook email export (optional)

Create a Power Automate flow that exports your sent emails to a JSON file in your OneDrive. The agent reads this file weekly to classify emails as highlights or blockers.

### 6. Sync Jira & Confluence

Click **"Sync Jira & Confluence"** in the dashboard to pull this week's tickets and pages.

![Jira & Confluence sync panel](docs/screenshots/sync-panel.png)

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
- **Integrations:** Jira REST API, Confluence REST API, Outlook via Power Automate, ICS calendar feeds
