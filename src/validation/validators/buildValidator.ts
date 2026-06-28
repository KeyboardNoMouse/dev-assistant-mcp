import type { RepoContext, ValidatorResult } from "../../core/types.js";
import type { Validator, ValidatorRunOptions } from "../validator.js";
import { getSandbox } from "../../runtime/sandboxFactory.js";
import { formatCommandOutput } from "../formatCommandOutput.js";

/**
 * buildValidator — runs the repo's detected build command
 * (npm run build / go build ./... / cargo build / mvn package, etc.)
 * through the same sandbox run_command uses, so the validation pipeline
 * gets the same isolation guarantees as any other command execution.
 *
 * Skips (returns null) if ContextEngine didn't detect a build command —
 * not every repo has a build step (e.g. a plain script-based Python repo).
 */
export class BuildValidator implements Validator {
  readonly kind = "build" as const;

  async run(context: RepoContext, options: ValidatorRunOptions): Promise<ValidatorResult | null> {
    if (!context.hasBuild || !context.buildCommand) return null;

    const { sandbox } = await getSandbox();
    const result = await sandbox.run(context.buildCommand, {
      cwd: options.repoPath,
      timeoutMs: options.timeoutMs,
      networkDisabled: !options.allowNetwork,
    });

    const { passed, output } = formatCommandOutput(context.buildCommand, result, options.timeoutMs);

    return { kind: "build", passed, output, durationMs: result.durationMs };
  }
}
