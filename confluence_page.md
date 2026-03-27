# Weekly Summary Agent — Setup & Usage Guide

**Status:** Live
**Repo:** https://github.com/himankinis/weekly-pulse
**Owner:** Himankini Shah

---

## Overview

Weekly Summary is a local-first weekly work summarizer that auto-pulls from Jira, Outlook, calendar, and Claude Code to generate structured weekly summaries. It produces concise highlights, lowlights, and blockers in multiple formats — a PPM Weekly Highlights table for the team doc, a stakeholder narrative, 1:1 prep, and a personal reference view. Saves 30–60 min/week on status reporting and improves 1:1 quality [1].

All data stays on your machine in a local SQLite database — nothing is sent to any external server.

---

## What It Does

- Pulls Jira tickets (resolved, in progress, blocked) from fico-prod.atlassian.net
- Pulls Outlook sent emails via Power Automate export
- Syncs calendar meetings via ICS feed
- Auto-captures Claude Code activity via hooks
- Supports manual entry of highlights, lowlights, and blockers
- Generates summaries in four formats:
  - **PPM Weekly Highlights** (default) — paste-ready markdown table for the team doc
  - **For Stakeholders** — structured narrative with bold topics and source rollups
  - **For 1:1 with Manager** — stakeholder view + key decisions + next week preview
  - **For Myself** — full detail with all sections including meetings
- Copy to clipboard for easy pasting into docs, emails, or Teams

---

## Setup Instructions

**Prerequisites:** Node.js 20+, Claude Code installed

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
```

Generate your Jira API token at: https://id.atlassian.com/manage-profile/security/api-tokens

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

> To get your ICS URL: Outlook Web → Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.

### Step 6 (Optional): Set up Outlook email export

Create a Power Automate flow that exports your sent emails weekly to a JSON file in your personal OneDrive. The agent reads this file to classify emails as highlights, lowlights, or blockers.

---

## How to Use It

1. Throughout the week, log highlights, lowlights, and blockers as they happen in the dashboard
2. Click **"Sync Jira & Confluence"** to pull your latest Jira activity
3. Click **"Sync Emails"** to pull your Outlook email export
4. Click **"Generate Summary"** and select your audience format from the dropdown
5. Click **"Copy to clipboard"** and paste into the PPM weekly doc, an email, or a 1:1 doc

You can also navigate to any past week using the arrows in the header, and view all previously generated summaries in the **Past Summaries** panel.

---

## Privacy

All data stays on your machine in a local SQLite database at `~/.weekly-pulse/`. When you share the repo, teammates only get the empty tool — not your data. Each person runs their own instance with their own credentials, calendar, and entries. Nobody sees anyone else's data.

---

## Links

- **GitHub repo:** https://github.com/himankinis/weekly-pulse
- **Screenshot:** *(will be added manually)*

---

*[1] Based on estimated time to manually compile weekly highlights, draft 1:1 prep notes, and write stakeholder updates.*
