#!/usr/bin/env node
/**
 * Weekly Pulse Setup Script
 * Registers the on-prompt hook in Claude Code's settings.json
 *
 * Usage: npm run setup
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const HOOK_PATH = path.join(PROJECT_ROOT, "hooks", "on-prompt.mjs");

// Claude Code settings locations (try both)
const SETTINGS_PATHS = [
  path.join(os.homedir(), ".claude", "settings.json"),
  path.join(os.homedir(), "Library", "Application Support", "Claude", "settings.json"),
];

function findSettingsPath() {
  for (const p of SETTINGS_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  // Default to first option, creating dirs as needed
  return SETTINGS_PATHS[0];
}

function loadSettings(settingsPath) {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  } catch {
    return {};
  }
}

function saveSettings(settingsPath, settings) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

const settingsPath = findSettingsPath();
const settings = loadSettings(settingsPath);

// Ensure hooks structure exists
if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];

// Check if already registered
const hookCommand = `node ${HOOK_PATH}`;
const alreadyRegistered = settings.hooks.UserPromptSubmit.some(
  (h) =>
    (typeof h === "string" && h.includes("weekly-pulse")) ||
    (h?.command && h.command.includes("weekly-pulse")) ||
    (h?.hooks && JSON.stringify(h).includes("weekly-pulse"))
);

if (alreadyRegistered) {
  console.log("✅ Weekly Pulse hook is already registered.");
  process.exit(0);
}

// Add the hook entry
// Claude Code hooks format: array of { matcher, hooks } objects or simple strings
settings.hooks.UserPromptSubmit.push({
  matcher: ".*",
  hooks: [
    {
      type: "command",
      command: hookCommand,
    },
  ],
});

saveSettings(settingsPath, settings);

console.log(`
✅ Weekly Pulse hook registered!

Hook file:   ${HOOK_PATH}
Settings:    ${settingsPath}

The hook will auto-capture your Claude Code prompts and classify them
as highlights, lowlights, or blockers.

⚠️  Make sure to run the dashboard first so the server is ready:
    npm run dev

Then start a new Claude Code session for the hook to take effect.
`);
