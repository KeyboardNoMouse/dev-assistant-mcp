import type { RepoContext, ValidatorResult } from "../../core/types.js";
import type { Validator, ValidatorRunOptions } from "../validator.js";
import { getSandbox } from "../../runtime/sandboxFactory.js";
import { formatCommandOutput } from "../formatCommandOutput.js";

/**
 * testValidator — runs the repo's detected test command
 * (npm test / pytest / go test ./... / cargo test, etc.).
 *
 * Skips (returns null) if no test framework/command was detected.
 */
export class TestValidator implements Validator {
  readonly kind = "test" as const;

  async run(context: RepoContext, options: ValidatorRunOptions): Promise<ValidatorResult | null> {
    if (!context.hasTests || !context.testCommand) return null;

    const { sandbox } = await getSandbox();
    const result = await sandbox.run(context.testCommand, {
      cwd: options.repoPath,
      timeoutMs: options.timeoutMs,
      networkDisabled: !options.allowNetwork,
    });

    const { passed, output } = formatCommandOutput(context.testCommand, result, options.timeoutMs);

    return { kind: "test", passed, output, durationMs: result.durationMs };
  }
}
