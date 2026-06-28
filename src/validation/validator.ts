import type { RepoContext, ValidatorResult } from "../core/types.js";

/**
 * Validator — a single check in the validation pipeline.
 *
 * Each validator decides for itself whether it's applicable to a given
 * repo (e.g. lintValidator skips silently if RepoContext.hasLinter is
 * false) by returning null from run(). The pipeline filters those out
 * rather than reporting a confusing "passed: false" for a check that
 * was never meaningful for this repo.
 */
export interface Validator {
  readonly kind: ValidatorResult["kind"];

  /**
   * Run the check. Return null if this validator doesn't apply to the
   * given repo (e.g. no test command detected) — the pipeline treats
   * that as "skipped", not "failed".
   */
  run(context: RepoContext, options: ValidatorRunOptions): Promise<ValidatorResult | null>;
}

export interface ValidatorRunOptions {
  /** Repository root — also the sandbox working directory. */
  repoPath: string;
  timeoutMs: number;
  /** Whether this validator run is allowed to use network inside the sandbox (e.g. installing deps). */
  allowNetwork?: boolean;
}
