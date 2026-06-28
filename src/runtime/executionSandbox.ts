import type { CommandRisk } from "../core/types.js";

/**
 * ExecutionSandbox — storage-agnostic-style abstraction for command
 * execution, mirroring the WorkflowRepository pattern from persistence/.
 *
 * Callers (run_command tool, workflow executor) depend ONLY on this
 * interface. sandboxFactory.ts decides at runtime whether a DockerSandbox
 * or LocalSandbox instance backs it — nothing upstream needs to know or care.
 */
export interface ExecutionSandbox {
  /** Human-readable name shown in tool output, e.g. "docker" or "local (unsandboxed)". */
  readonly kind: string;

  /**
   * Run a command. Implementations are responsible for enforcing their
   * own resource limits and timeout; callers should not assume the
   * process keeps running past `options.timeoutMs`.
   */
  run(command: string, options: SandboxRunOptions): Promise<SandboxRunResult>;

  /** Cheap readiness check — e.g. "is the Docker daemon reachable". */
  isAvailable(): Promise<boolean>;
}

export interface SandboxRunOptions {
  /** Host directory to mount/use as the working directory. */
  cwd: string;
  timeoutMs: number;
  /** Memory limit in megabytes. Ignored by sandboxes that can't enforce it. */
  memoryLimitMb?: number;
  /** CPU limit as a fraction of one core (e.g. 1.0 = one full core). Ignored where unsupported. */
  cpuLimit?: number;
  /** Disable network access inside the sandbox. Defaults to true for Docker; ignored by LocalSandbox. */
  networkDisabled?: boolean;
  /**
   * Publish a container port to the host (Docker only, ignored by LocalSandbox).
   * Format: "hostPort:containerPort". Needed for runtimeValidator's
   * best-effort port probe — without this, a containerized server's
   * port is unreachable from outside the container, which is correct
   * isolation behavior but means the probe must opt in explicitly.
   */
  publishPort?: { host: number; container: number };
}

export interface SandboxRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  /** True if this command ran inside real isolation (Docker); false for the direct-exec fallback. */
  sandboxed: boolean;
}

export interface RiskGate {
  risk: CommandRisk;
  /** Whether the command is permitted to run given the caller's allowModerate flag. */
  permitted: boolean;
}
