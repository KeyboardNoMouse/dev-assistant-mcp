import { spawn } from "child_process";
import { randomUUID } from "crypto";
import type { ExecutionSandbox, SandboxRunOptions, SandboxRunResult } from "./executionSandbox.js";

/**
 * DockerSandbox — runs each command in a fresh, disposable container.
 *
 * Design choices:
 * - One container per command (not a long-lived dev container). Simpler
 *   lifecycle, no state leaks between unrelated workflow steps, and a
 *   crashed/hung container can't strand future commands.
 * - Single shared base image (default: node:20-bookworm-slim, override via
 *   DEV_ASSISTANT_SANDBOX_IMAGE) rather than per-language images. This repo
 *   already has Node/TS as its primary toolchain; for repos in other
 *   languages, the image still has a shell and coreutils so read-only
 *   inspection commands work, but cargo/go/etc. would need a custom image —
 *   intentionally out of scope for a first pass per "functionality over UI".
 * - Working directory is bind-mounted read-write at the same path inside
 *   the container as on the host, so relative paths in tool output stay
 *   meaningful to the person reading them.
 * - Network is disabled by default (`--network none`) unless the caller
 *   explicitly opts in — most build/test/lint commands don't need network,
 *   and this is the single highest-value isolation guarantee for a
 *   "sandboxed execution" feature.
 * - We use `spawn` with an argv array, never a concatenated shell string,
 *   when invoking the `docker` binary itself. The user's command still
 *   runs through `sh -c` *inside* the container — that's an intentional,
 *   already-risk-scored shell invocation (same as LocalSandbox), not an
 *   injection point into the `docker` command line.
 */

const DEFAULT_IMAGE = process.env.DEV_ASSISTANT_SANDBOX_IMAGE ?? "node:20-bookworm-slim";
const DOCKER_CHECK_TIMEOUT_MS = 3000;

function runDocker(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 5 * 1024 * 1024) child.kill("SIGKILL"); // 5MB output cap
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 5 * 1024 * 1024) child.kill("SIGKILL");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + `\n${err.message}`, exitCode: 1, timedOut: false });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1, timedOut });
    });
  });
}

export class DockerSandbox implements ExecutionSandbox {
  readonly kind = `docker (${DEFAULT_IMAGE})`;

  async isAvailable(): Promise<boolean> {
    try {
      const result = await runDocker(["info", "--format", "{{.ServerVersion}}"], DOCKER_CHECK_TIMEOUT_MS);
      return result.exitCode === 0 && !result.timedOut;
    } catch {
      return false;
    }
  }

  async run(command: string, options: SandboxRunOptions): Promise<SandboxRunResult> {
    const startTime = Date.now();
    const containerName = `dev-assistant-${randomUUID().slice(0, 8)}`;
    // Publishing a port requires the container to have a network at all —
    // "--network none" and "-p" are mutually exclusive in Docker. A port
    // publish request is an explicit signal the caller needs reachability,
    // so it overrides the network-disabled default for this run only.
    const networkDisabled = options.publishPort ? false : (options.networkDisabled ?? true);
    const memoryLimitMb = options.memoryLimitMb ?? 1024;
    const cpuLimit = options.cpuLimit ?? 1.0;

    const args = [
      "run",
      "--rm", // always clean up the container on exit
      "--name", containerName,
      "-v", `${options.cwd}:${options.cwd}`,
      "-w", options.cwd,
      "--memory", `${memoryLimitMb}m`,
      "--cpus", String(cpuLimit),
      "--pids-limit", "256", // fork-bomb guard
      "--security-opt", "no-new-privileges",
      "--cap-drop", "ALL",
    ];

    if (networkDisabled) args.push("--network", "none");
    if (options.publishPort) {
      args.push("-p", `${options.publishPort.host}:${options.publishPort.container}`);
    }

    args.push(DEFAULT_IMAGE, "sh", "-c", command);

    // Add a small buffer beyond the caller's timeout so the `docker run`
    // process itself has time to receive and act on `docker stop`/SIGKILL
    // before we give up on it entirely.
    const result = await runDocker(args, options.timeoutMs + 5000);

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: Date.now() - startTime,
      timedOut: result.timedOut,
      sandboxed: true,
    };
  }
}
