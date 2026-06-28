import { z } from "zod";
import { withErrorBoundary } from "../core/errors.js";
import { contextEngine } from "../context/contextEngine.js";
import { runValidationPipeline } from "../validation/validationPipeline.js";
import { BuildValidator } from "../validation/validators/buildValidator.js";
import { TestValidator } from "../validation/validators/testValidator.js";
import { LintValidator } from "../validation/validators/lintValidator.js";
import { RuntimeValidator } from "../validation/validators/runtimeValidator.js";
import type { Validator } from "../validation/validator.js";

const schema = z.object({
  path: z.string().min(1),
  checks: z.array(z.enum(["build", "test", "lint", "runtime"])).optional(),
  timeout_ms: z.number().int().positive().max(180_000).default(60_000),
  allow_network: z.boolean().default(false),
});

const VALIDATOR_MAP: Record<string, () => Validator> = {
  build: () => new BuildValidator(),
  test: () => new TestValidator(),
  lint: () => new LintValidator(),
  runtime: () => new RuntimeValidator(),
};

export const validateRepoTool = {
  definition: {
    name: "validate_repo",
    description:
      "Run the validation pipeline (build, test, lint, runtime checks) against a repository, independent of any workflow. Auto-detects which checks apply based on the repo's framework and tooling. Runs sandboxed (Docker if available).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the repository root to validate" },
        checks: {
          type: "array",
          items: { type: "string", enum: ["build", "test", "lint", "runtime"] },
          description: "Limit to specific checks. Defaults to all four (each auto-skips if not applicable to the repo).",
        },
        timeout_ms: { type: "number", description: "Per-check timeout in ms. Default 60000, max 180000." },
        allow_network: { type: "boolean", description: "Allow network access inside the sandbox for build/test/lint commands. Default false." },
      },
      required: ["path"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { path: repoPath, checks, timeout_ms, allow_network } = schema.parse(args);

    const context = await contextEngine.getContext(repoPath, true);
    const validators = checks ? checks.map((c) => VALIDATOR_MAP[c]()) : undefined;

    const result = await runValidationPipeline(context, {
      timeoutMs: timeout_ms,
      allowNetwork: allow_network,
      validators,
    });

    const icon = result.passed ? "✅" : "❌";
    const lines = [`${icon} ${result.summary}`, ``];

    for (const v of result.validators) {
      const vIcon = v.passed ? "✅" : "❌";
      lines.push(`${vIcon} ${v.kind.toUpperCase()} (${(v.durationMs / 1000).toFixed(1)}s)`);
      lines.push(v.output);
      lines.push("");
    }

    return {
      content: [{ type: "text", text: lines.join("\n").trim() }],
      isError: !result.passed,
    };
  }),
};
