import type { RepoContext, ValidationResult, ValidatorResult } from "../core/types.js";
import type { Validator, ValidatorRunOptions } from "./validator.js";
import { BuildValidator } from "./validators/buildValidator.js";
import { TestValidator } from "./validators/testValidator.js";
import { LintValidator } from "./validators/lintValidator.js";
import { RuntimeValidator } from "./validators/runtimeValidator.js";

/**
 * ValidationPipeline — runs build → test → lint → runtime in sequence
 * and produces a single ValidationResult.
 *
 * Sequential, not parallel: build failing makes test/lint results
 * meaningless (testing un-buildable code wastes the timeout budget and
 * produces confusing output), so each stage only runs if every prior
 * stage either passed or was skipped (not applicable to this repo).
 *
 * A validator returning null (not applicable) is excluded from the
 * result entirely — it neither passes nor fails, and doesn't affect
 * `passed`. A repo with no detected build/test/lint/start commands at
 * all produces an empty validators array and passed=true; "nothing to
 * validate" is not a failure.
 */

const DEFAULT_VALIDATORS: Validator[] = [
  new BuildValidator(),
  new TestValidator(),
  new LintValidator(),
  new RuntimeValidator(),
];

export interface PipelineOptions {
  timeoutMs?: number;
  allowNetwork?: boolean;
  /** Override which validators run, e.g. to skip runtime checks. Defaults to all four. */
  validators?: Validator[];
}

const DEFAULT_TIMEOUT_MS = 60_000;

export async function runValidationPipeline(
  context: RepoContext,
  options: PipelineOptions = {}
): Promise<ValidationResult> {
  const validators = options.validators ?? DEFAULT_VALIDATORS;
  const runOptions: ValidatorRunOptions = {
    repoPath: context.rootPath,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    allowNetwork: options.allowNetwork ?? false,
  };

  const results: ValidatorResult[] = [];
  let blocked = false;

  for (const validator of validators) {
    if (blocked) break;

    let result: ValidatorResult | null;
    try {
      result = await validator.run(context, runOptions);
    } catch (err) {
      // A validator throwing (rather than returning a failed result) is
      // itself a failure worth reporting, not a crash that takes down
      // the whole pipeline.
      result = {
        kind: validator.kind,
        passed: false,
        output: `Validator threw an unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: 0,
      };
    }

    if (result === null) continue; // not applicable to this repo

    results.push(result);
    if (!result.passed) blocked = true; // stop the sequence, don't run later stages on broken code
  }

  const passed = results.every((r) => r.passed);
  const skippedCount = validators.length - results.length;

  const summary = results.length === 0
    ? "No applicable validators for this repo — nothing to validate."
    : passed
      ? `All ${results.length} validation check(s) passed${skippedCount > 0 ? ` (${skippedCount} not applicable)` : ""}.`
      : `${results.filter((r) => !r.passed).length} of ${results.length} validation check(s) failed: ${results.filter((r) => !r.passed).map((r) => r.kind).join(", ")}.`;

  return { passed, validators: results, summary };
}
