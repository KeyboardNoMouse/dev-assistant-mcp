import type { RiskLevel, CommandRisk } from "../core/types.js";

/**
 * CommandRiskAnalyzer — single source of truth for command risk scoring.
 *
 * This used to live inline inside tools/runCommand.ts as a private
 * assessRisk() function. It's pulled out here so the sandbox runtime
 * (DockerSandbox, LocalSandbox) and run_command both score commands
 * identically — one risk policy, not two copies that can drift apart.
 *
 * runCommand.ts now imports `analyzeCommandRisk` from here instead of
 * defining its own version.
 */

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\brm\s+-rf\s+\//, label: "recursive force-delete from root" },
  { pattern: /\bdd\b.*\bof=\/dev\//, label: "raw write to a block device" },
  { pattern: /\bmkfs\b/, label: "filesystem format" },
  { pattern: />\s*\/dev\/sd[a-z]/, label: "direct write to a disk device" },
  { pattern: /\bshutdown\b/, label: "system shutdown" },
  { pattern: /\breboot\b/, label: "system reboot" },
  { pattern: /\bhalt\b/, label: "system halt" },
  { pattern: /\bsudo\b.*\bpasswd\b/, label: "privileged password change" },
  { pattern: /\bcurl\b.*\|\s*(?:bash|sh|zsh)/, label: "curl piped directly into a shell" },
  { pattern: /\bwget\b.*\|\s*(?:bash|sh|zsh)/, label: "wget piped directly into a shell" },
  { pattern: /\bchmod\b.*777\s*\//, label: "world-writable permissions on root-level path" },
  { pattern: /\bchown\b.*root.*\//, label: "ownership change to root on a system path" },
];

const SAFE_PREFIXES: string[] = [
  "npm ", "npx ", "yarn ", "pnpm ",
  "pip ", "pip3 ", "python ", "python3 ",
  "node ", "ts-node ", "tsc ", "tsx ",
  "go ", "cargo ", "rustc ",
  "git ", "gh ",
  "echo ", "cat ", "ls ", "pwd ", "which ",
  "grep ", "find ", "wc ", "head ", "tail ",
  "mkdir ", "cp ", "mv ", "touch ",
  "jest ", "vitest ", "mocha ", "pytest ",
  "eslint ", "prettier ", "ruff ", "golangci-lint ",
  "docker ", "docker-compose ", "docker compose ",
];

/**
 * Score a shell command's risk level. Pure function, no side effects —
 * safe to call speculatively (e.g. to preview risk before deciding
 * whether to run inside a sandbox at all).
 */
export function analyzeCommandRisk(command: string): CommandRisk {
  const trimmed = command.trim();

  for (const { pattern, label } of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { level: "blocked", reason: `Matches a blocked pattern: ${label}` };
    }
  }

  // Shell injection characters outside of quoted strings are dangerous —
  // they let one "safe-looking" command chain into an unreviewed one.
  if (/[;&|`]/.test(trimmed) && !trimmed.startsWith("echo")) {
    if (/\|\s*(?:grep|head|tail|wc|cat|sort|uniq|awk|sed)/.test(trimmed)) {
      return { level: "moderate", reason: "Pipe into a text-processing tool — verify intent before running" };
    }
    return { level: "dangerous", reason: "Shell operators (;, &, |, `) allow command chaining" };
  }

  const isSafe = SAFE_PREFIXES.some((prefix) => trimmed.toLowerCase().startsWith(prefix.toLowerCase()));
  if (isSafe) return { level: "safe", reason: "Matches a known-safe command prefix" };

  return { level: "moderate", reason: "Command is not on the safe list — verify intent before running" };
}

/** Convenience predicate used by callers that just need a yes/no gate. */
export function isRunnable(level: RiskLevel, allowModerate: boolean): boolean {
  if (level === "blocked" || level === "dangerous") return false;
  if (level === "moderate") return allowModerate;
  return true;
}
