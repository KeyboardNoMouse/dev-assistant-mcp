import type { SandboxRunResult } from "../runtime/executionSandbox.js";

/**
 * Shared formatting for "ran a command, got a result" validators
 * (build/test/lint all follow this exact shape). Keeps the four
 * validator files from each reimplementing the same truncation logic.
 */
export function formatCommandOutput(
  command: string,
  result: SandboxRunResult,
  timeoutMs: number
): { passed: boolean; output: string } {
  if (result.timedOut) {
    return {
      passed: false,
      output: `Command timed out after ${timeoutMs}ms: ${command}`,
    };
  }

  const passed = result.exitCode === 0;
  const outputTail = (result.stdout + "\n" + result.stderr).trim().slice(-2000);

  return {
    passed,
    output: `$ ${command}\nexit ${result.exitCode}\n\n${outputTail}`,
  };
}
