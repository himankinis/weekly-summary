import type { EntryType } from "./types";

// ─── Keyword Pattern Classifier ───────────────────────────────────────────────
// Classifies a Claude Code prompt as highlight/lowlight/blocker based on
// keywords. Used by the hook to auto-tag captured prompts.

interface PatternRule {
  type: EntryType;
  patterns: RegExp[];
  weight: number;
}

const RULES: PatternRule[] = [
  {
    // File-sharing notifications — always a highlight; outweighs incidental "access" hits
    type: "highlight",
    weight: 4,
    patterns: [
      /\bshared\b.+\bwith\s+(you|me)\b/i,
      /\bhas\s+shared\b/i,
    ],
  },
  {
    type: "highlight",
    weight: 2,
    patterns: [
      /\b(ship|shipped|deploy|deployed|release|released|launch|launched)\b/i,
      /\b(build|built|implement|implemented|added|created|wrote|write)\b/i,
      /\b(fix|fixed|resolve|resolved|close|closed|merge|merged)\b/i,
      /\b(complete|completed|finish|finished|done|delivered)\b/i,
      /\b(refactor|refactored|optimize|optimized|improved)\b/i,
      /\b(test|tests|spec|passing|green)\b/i,
    ],
  },
  {
    type: "blocker",
    weight: 2,
    patterns: [
      /\b(blocked|blocking|blocker|stuck|waiting|wait for)\b/i,
      /\b(broken|failing|failed|error|exception|crash|bug)\b/i,
      /\b(can'?t|cannot|unable|doesn'?t work|not working)\b/i,
      /\b(access|permission|denied|403|401|missing)\b/i,
      /\b(dependency|depends on|need approval|waiting on)\b/i,
    ],
  },
  {
    type: "lowlight",
    weight: 1,
    patterns: [
      /\b(slow|slower|takes longer|delayed|delay|behind)\b/i,
      /\b(debug|debugging|investigate|troubleshoot|why is)\b/i,
      /\b(missed|miss|didn'?t|not done|incomplete|todo)\b/i,
      /\b(revert|reverted|rollback|undo)\b/i,
      /\b(complicated|complex|difficult|hard|confusing)\b/i,
    ],
  },
];

/** Classify a prompt string. Returns the best-matching type, defaulting to highlight. */
export function classifyPrompt(prompt: string): EntryType {
  const scores: Record<EntryType, number> = {
    highlight: 0,
    lowlight: 0,
    blocker: 0,
  };

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(prompt)) {
        scores[rule.type] += rule.weight;
      }
    }
  }

  const best = (Object.entries(scores) as [EntryType, number][]).sort(
    (a, b) => b[1] - a[1]
  )[0];

  // If no signals, default to highlight (it was something you were working on)
  return best[1] > 0 ? best[0] : "highlight";
}

/** Truncate a prompt to a readable summary line */
export function summarizePrompt(prompt: string, maxLen = 120): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1) + "…";
}
