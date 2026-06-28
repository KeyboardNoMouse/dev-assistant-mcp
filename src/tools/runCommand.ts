import { z } from "zod";
import { withErrorBoundary, ToolError } from "../core/errors.js";
import { analyzeCommandRisk } from "../runtime/commandRiskAnalyzer.js";
import { getSandbox } from "../runtime/sandboxFactory.js";

/**
 * run_command — risk-assessed, sandboxed shell execution.
 *
 * As of Phase 2, this tool no longer calls execFile directly. It delegates
 * to the runtime sandbox (Docker by default, falling back to direct host
 * execution with a visible warning if Docker isn't available — see
 * runtime/sandboxFactory.ts). Risk scoring now lives in
 * runtime/commandRiskAnalyzer.ts and is shared with the rest of the
 * platform rather than living only inside this file.
 */

const schema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  timeout_ms: z.number().int().positive().max(120_000).default(30_000),
  allow_moderate: z.boolean().default(false),
  allow_network: z.boolean().default(false),
  bypass_sandbox: z.boolean().default(false),
});

export const runCommandTool = {
  definition: {
    name: "run_command",
    description:
      "Execute a shell command. Built-in risk assessment blocks dangerous operations. Safe commands (npm, git, tsc, pytest, docker, etc.) run immediately. Runs inside an isolated Docker container by default (resource-limited, no network) if Docker is available; otherwise falls back to direct execution with a warning. Set allow_moderate=true to run commands not on the safe list after reviewing them.",
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
        allow_network: {
          type: "boolean",
          description: "Allow network access inside the sandbox (e.g. for npm install). Default: false — most build/test/lint commands don't need it. Ignored when running unsandboxed.",
        },
        bypass_sandbox: {
          type: "boolean",
          description: "Force direct host execution even if Docker is available. Default: false. Use sparingly — this loses isolation and resource limits.",
        },
      },
      required: ["command"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { command, cwd, timeout_ms, allow_moderate, allow_network, bypass_sandbox } = schema.parse(args);

    const risk = analyzeCommandRisk(command);

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

    const workDir = cwd ?? process.cwd();
    const riskBadge = risk.level === "safe" ? "✅" : "⚠️ ";

    let result;
    let sandboxLabel: string;
    let warningLine = "";

    if (bypass_sandbox) {
      const { LocalSandbox } = await import("../runtime/localSandbox.js");
      const local = new LocalSandbox();
      result = await local.run(command, { cwd: workDir, timeoutMs: timeout_ms });
      sandboxLabel = "local (bypass requested)";
    } else {
      const { sandbox, warning } = await getSandbox();
      if (warning) warningLine = warning + "\n\n";
      result = await sandbox.run(command, {
        cwd: workDir,
        timeoutMs: timeout_ms,
        networkDisabled: !allow_network,
      });
      sandboxLabel = sandbox.kind;
    }

    if (result.timedOut) {
      throw new ToolError(`Command timed out after ${timeout_ms}ms: ${command}`);
    }

    const status = result.exitCode === 0 ? "✅ Success" : `❌ Failed (exit ${result.exitCode})`;
    const isolationBadge = result.sandboxed ? "🔒 sandboxed" : "🔓 unsandboxed";

    const parts: string[] = [
      `${warningLine}${riskBadge} ${status} — ${result.durationMs}ms  •  ${isolationBadge} (${sandboxLabel})`,
      `$ ${command}`,
      `cwd: ${workDir}`,
    ];

    if (result.stdout.trim()) parts.push(`\n--- stdout ---\n${result.stdout.trim()}`);
    if (result.stderr.trim()) parts.push(`\n--- stderr ---\n${result.stderr.trim()}`);

    return {
      content: [{ type: "text", text: parts.join("\n") }],
      isError: result.exitCode !== 0,
    };
  }),
};
