import type { RepoContext, ValidatorResult } from "../../core/types.js";
import type { Validator, ValidatorRunOptions } from "../validator.js";
import { getSandbox } from "../../runtime/sandboxFactory.js";
import { formatCommandOutput } from "../formatCommandOutput.js";

/**
 * lintValidator — runs the repo's detected lint command
 * (eslint / flake8 / golangci-lint / cargo clippy, etc.).
 *
 * Skips (returns null) if no linter was detected. Lint failures are
 * real failures here, not warnings — if the repo doesn't want lint
 * to gate workflow completion, the fix is to not configure a linter,
 * not to make this validator silently non-blocking.
 */
export class LintValidator implements Validator {
  readonly kind = "lint" as const;

  async run(context: RepoContext, options: ValidatorRunOptions): Promise<ValidatorResult | null> {
    if (!context.hasLinter || !context.lintCommand) return null;

    const { sandbox } = await getSandbox();
    const result = await sandbox.run(context.lintCommand, {
      cwd: options.repoPath,
      timeoutMs: options.timeoutMs,
      networkDisabled: !options.allowNetwork,
    });

    const { passed, output } = formatCommandOutput(context.lintCommand, result, options.timeoutMs);

    return { kind: "lint", passed, output, durationMs: result.durationMs };
  }
}
