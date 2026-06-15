import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { withErrorBoundary, ToolError } from "../core/errors.js";
import type { RiskLevel, CommandRisk } from "../core/types.js";

const execFileAsync = promisify(execFile);

// ── Risk assessment ──────────────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\//, // rm -rf /
  /\bdd\b.*\bof=\/dev\//, // dd to block device
  /\bmkfs\b/, // format filesystem
  />\s*\/dev\/sd[a-z]/, // write to block device
  /\bshutdown\b/, /\breboot\b/, /\bhalt\b/, // system control
  /\bsudo\b.*\bpasswd\b/, // password change
  /\bcurl\b.*\|\s*(?:bash|sh|zsh)/, // curl pipe to shell
  /\bwget\b.*\|\s*(?:bash|sh|zsh)/,
  /\bchmod\b.*777\s*\//, // world-write root
  /\bchown\b.*root.*\//, // chown to root
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

function assessRisk(command: string): CommandRisk {
  const trimmed = command.trim();

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { level: "blocked", reason: `Matches blocked pattern: ${pattern.source}` };
    }
  }

  // Shell injection characters outside of quoted strings are dangerous
  if (/[;&|`]/.test(trimmed) && !trimmed.startsWith("echo")) {
    // Allow simple pipes for common safe patterns
    if (/\|\s*(?:grep|head|tail|wc|cat|sort|uniq|awk|sed)/.test(trimmed)) {
      return { level: "moderate", reason: "Pipe to text processing tool — verify intent" };
    }
    return { level: "dangerous", reason: "Shell operators (;, &, |, `) allow command chaining" };
  }

  const isSafe = SAFE_PREFIXES.some((prefix) => trimmed.toLowerCase().startsWith(prefix.toLowerCase()));
  if (isSafe) return { level: "safe", reason: "Matches safe command prefix" };

  return { level: "moderate", reason: "Command not in safe list — verify intent before running" };
}

// ── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  timeout_ms: z.number().int().positive().max(120_000).default(30_000),
  allow_moderate: z.boolean().default(false),
});

// ── Tool ─────────────────────────────────────────────────────────────────────

export const runCommandTool = {
  definition: {
    name: "run_command",
    description:
      "Execute a shell command in the repository directory. Built-in risk assessment blocks dangerous operations. Safe commands (npm, git, tsc, pytest, docker, etc.) run immediately. Set allow_moderate=true to run commands not on the safe list after reviewing them.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run" },
        cwd: { type: "string", description: "Working directory. Defaults to process cwd." },
        timeout_ms: { type: "number", description: "Timeout in milliseconds. Default: 30000, max: 120000" },
        allow_moderate: {
          type: "boolean",
          description: "Allow commands rated 'moderate' risk. Default: false. Review the command carefully before enabling.",
        },
      },
      required: ["command"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { command, cwd, timeout_ms, allow_moderate } = schema.parse(args);

    const risk = assessRisk(command);

    if (risk.level === "blocked") {
      throw new ToolError(`🚫 Command blocked: ${risk.reason}\nCommand: ${command}`);
    }

    if (risk.level === "dangerous") {
      throw new ToolError(
        `⛔ Command rejected (dangerous): ${risk.reason}\nCommand: ${command}\n\nIf you need this, run it manually in your terminal.`
      );
    }

    if (risk.level === "moderate" && !allow_moderate) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️  Command requires review (${risk.reason}):\n\n  ${command}\n\nTo run it, call run_command again with allow_moderate=true after verifying it is safe.`,
          },
        ],
      };
    }

    const riskBadge = risk.level === "safe" ? "✅" : "⚠️ ";
    const workDir = cwd ?? process.cwd();

    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      const result = await execFileAsync("sh", ["-c", command], {
        cwd: workDir,
        timeout: timeout_ms,
        maxBuffer: 5 * 1024 * 1024, // 5MB output cap
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err: any) {
      stdout = err.stdout ?? "";
      stderr = err.stderr ?? "";
      exitCode = err.code ?? 1;

      if (err.killed) {
        throw new ToolError(`Command timed out after ${timeout_ms}ms: ${command}`);
      }
    }

    const durationMs = Date.now() - startTime;
    const status = exitCode === 0 ? "✅ Success" : `❌ Failed (exit ${exitCode})`;

    const parts: string[] = [
      `${riskBadge} ${status} — ${durationMs}ms`,
      `$ ${command}`,
      `cwd: ${workDir}`,
    ];

    if (stdout.trim()) parts.push(`\n--- stdout ---\n${stdout.trim()}`);
    if (stderr.trim()) parts.push(`\n--- stderr ---\n${stderr.trim()}`);

    return {
      content: [{ type: "text", text: parts.join("\n") }],
      isError: exitCode !== 0,
    };
  }),
};
