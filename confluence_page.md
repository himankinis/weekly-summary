# Weekly Summary Agent — Setup & Usage Guide

**Status:** Live
**Repo:** https://github.com/himankinis/weekly-summary
**Owner:** Himankini Shah

---

## Overview

Weekly Summary is a local-first weekly work summarizer that auto-pulls from Jira, Outlook, calendar, and Claude Code to generate structured weekly summaries. It produces concise highlights, lowlights, and blockers in multiple formats — a PPM Weekly Highlights table for the team doc, a stakeholder narrative, 1:1 prep, and a personal reference view. Saves 30–60 min/week on status reporting and improves 1:1 quality [1].

All data stays on your machine in a local SQLite database — nothing is sent to any external server.

![Weekly Summary dashboard](docs/screenshots/dashboard.png)

---

## What It Does

- **Manual entries** — log highlights, lowlights, blockers, and to-dos directly from the dashboard; these always take priority in the summary
- **Jira tickets** — syncs resolved, in-progress, and blocked tickets; translates status into accomplishments: "Completed X (Jira: KEY-123)", "Drove progress on X", "Initiated X"
- **Confluence pages** — syncs pages you created or edited; surfaces as "Published X on Confluence" or "Updated X on Confluence"
- **Outlook emails** — groups email threads by topic and synthesizes into PM actions: "Led cross-functional discussion on X (N touchpoints)", "Aligned with Y on Z", "Discussed X with Y" — raw "Sent email: subject" lines are never shown
- **Calendar** — syncs meetings via ICS feed; filters out routine standups, 1:1s, and update meetings; keeps reviews, roadmap sessions, leadership calls, and working sessions
- **Claude Code hooks** — auto-captures prompts as activity entries in the background
- Copy any format to clipboard for pasting into docs, emails, or Teams

---

## Summary Formats

Click **Generate Summary** and choose your audience from the dropdown:

| Format | Contents | Best for |
|---|---|---|
| **PPM Weekly Highlights** (default) | Paste-ready markdown table — max 5 highlights, 3 blockers | PPM Weekly Highlights doc |
| **For Stakeholders** | Executive bullets grouped by initiative: "**Initiative:** lead item — and N more." No sections, scannable in 30 seconds | Leadership updates, status emails |
| **For 1:1 with Manager** | Theme sentence ("This week I focused on X and Y.") + Highlights (initiative-sorted) + Blockers (framed as asks) + Key Decisions + Next Week | Weekly 1:1 prep |
| **For Myself** | Full detail — all sections including meetings with Jira enrichment | Personal record |

All formats synthesize raw data into PM-quality language. Highlights are automatically clustered by initiative using shared keywords. Blockers are reframed as actionable manager asks ("Decision needed on X" or "I need your help with: X"). The summary generator groups related email threads, translates Jira statuses into accomplishments, and filters calendar noise — so every line starts with an action verb and reflects real work, not activity metadata.

![Generated PPM summary](docs/screenshots/summary-output.png)

![Audience toggle](docs/screenshots/audience-toggle.png)

---

## Setup Instructions

**Prerequisites:** Node.js 20+, Claude Code installed (https://confluence.atlassian.fico.com/wiki/spaces/PE/pages/140248200/Claude+Code+Setup)

### Step 1: Clone the repo

```bash
git clone https://github.com/himankinis/weekly-pulse
cd weekly-pulse
npm install
```

### Step 2: Create your .env file

Create a `.env` file in the project root with your own credentials:

```
JIRA_URL=https://fico-prod.atlassian.net
JIRA_EMAIL=your_email@fico.com
JIRA_API_TOKEN=your_token

CONFLUENCE_URL=https://fico-prod.atlassian.net
CONFLUENCE_EMAIL=your_email@fico.com
CONFLUENCE_API_TOKEN=your_token
```

Generate your API token at: https://id.atlassian.com/manage-profile/security/api-tokens

### Step 3: Register Claude Code hooks

```bash
npm run setup
```

This registers a hook that auto-captures your Claude Code prompts as activity entries. Start a new Claude Code session after running setup for the hook to take effect.

### Step 4: Start the dashboard

```bash
npm run dev
```

Open **http://localhost:3000**

### Step 5: Connect your calendar

Click **"Add ICS Feed"** on the dashboard and paste your Outlook calendar ICS URL.

> Outlook Web → Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.

### Step 6 (Optional): Set up Outlook email export

Create a Power Automate flow that exports your sent emails weekly to a JSON file in your personal OneDrive. The agent reads this file to classify emails as highlights, lowlights, or blockers.

### Step 7: Sync Jira, Confluence & Email

Click **"Sync Jira & Confluence"** and **"Sync Emails"** in the dashboard to pull this week's activity.

![Jira & Confluence sync panel](docs/screenshots/sync-panel.png)

---

## Entry Types

| Type | Meaning |
|---|---|
| ✅ Highlight | Accomplishment, shipped work, good decision |
| ⚠️ Lowlight | Delay, missed target, thing that took longer |
| 🚫 Blocker | Dependency, access issue, waiting on others |
| 📋 To-do | Task to complete this week or next — check it off when done |

To-dos appear as a dedicated **📝 To-dos** section in the weekly summary. Completed to-dos are automatically excluded from the summary.

---

## How to Use It

1. Throughout the week, log highlights, lowlights, blockers, and to-dos as they happen in the dashboard; check off to-dos as you complete them
2. Click **"Sync Jira & Confluence"** to pull your latest Jira tickets and Confluence pages
3. Click **"Sync Emails"** to pull your Outlook email export
4. Click **"Generate Summary"** and select your audience format from the dropdown
5. Click **"Copy to clipboard"** and paste into the PPM weekly doc, an email, or a 1:1 doc

You can also navigate to any past week using the arrows in the header, and view all previously generated summaries in the **Past Summaries** panel.

---

## Privacy

All data stays on your machine in a local SQLite database at `~/.weekly-pulse/`. When you share the repo, teammates only get the empty tool — not your data. Each person runs their own instance with their own credentials, calendar, and entries. Nobody sees anyone else's data.

---

## Links

- **GitHub repo:** https://github.com/himankinis/weekly-summary
- **Screenshot:** *(see above)*

---

*[1] Based on estimated time to manually compile weekly highlights, draft 1:1 prep notes, and write stakeholder updates.*
