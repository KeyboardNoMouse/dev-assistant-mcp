import { execFile } from "child_process";
import { promisify } from "util";
import type { ExecutionSandbox, SandboxRunOptions, SandboxRunResult } from "./executionSandbox.js";

const execFileAsync = promisify(execFile);

/**
 * LocalSandbox — direct host execution. This is exactly the behavior
 * run_command had before Docker sandboxing existed: no isolation, no
 * resource limits beyond a timeout and output cap.
 *
 * Used as the fallback when Docker isn't available, and always reports
 * sandboxed: false so callers can show an honest warning rather than
 * implying isolation that didn't happen.
 *
 * `publishPort` is a no-op here — there's no container boundary, so a
 * process that binds to a port on the host is already reachable on
 * that port; nothing needs to be "published".
 */
export class LocalSandbox implements ExecutionSandbox {
  readonly kind = "local (unsandboxed)";

  async isAvailable(): Promise<boolean> {
    return true; // Always available — it's just the host shell.
  }

  async run(command: string, options: SandboxRunOptions): Promise<SandboxRunResult> {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    let timedOut = false;

    try {
      const result = await execFileAsync("sh", ["-c", command], {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        maxBuffer: 5 * 1024 * 1024, // 5MB output cap
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err: any) {
      stdout = err.stdout ?? "";
      stderr = err.stderr ?? "";
      exitCode = err.code ?? 1;
      if (err.killed) timedOut = true;
    }

    return {
      stdout,
      stderr,
      exitCode,
      durationMs: Date.now() - startTime,
      timedOut,
      sandboxed: false,
    };
  }
}
