import { DockerSandbox } from "./dockerSandbox.js";
import { LocalSandbox } from "./localSandbox.js";
import type { ExecutionSandbox } from "./executionSandbox.js";

/**
 * sandboxFactory — the one place that decides Docker vs. direct execution.
 *
 * Policy (per project decision): prefer Docker, but never hard-fail if it's
 * unavailable. Falls back to LocalSandbox (today's pre-sandboxing behavior)
 * with a visible warning surfaced to the caller, rather than silently
 * downgrading isolation without telling anyone.
 *
 * The availability check result is cached for the process lifetime —
 * Docker either is or isn't running for the duration of one server
 * session; re-checking on every single command call adds latency for
 * no real benefit. Call resetSandboxCache() in tests or after a known
 * environment change (e.g. Docker just got installed) to force a recheck.
 */

let cachedSandbox: ExecutionSandbox | null = null;
let cachedWarning: string | null = null;

export interface ResolvedSandbox {
  sandbox: ExecutionSandbox;
  /** Set when we fell back to LocalSandbox — show this to the user. */
  warning: string | null;
}

export async function getSandbox(): Promise<ResolvedSandbox> {
  if (cachedSandbox) {
    return { sandbox: cachedSandbox, warning: cachedWarning };
  }

  const docker = new DockerSandbox();
  const dockerReady = await docker.isAvailable();

  if (dockerReady) {
    cachedSandbox = docker;
    cachedWarning = null;
  } else {
    cachedSandbox = new LocalSandbox();
    cachedWarning =
      "⚠️  Docker is not available — running unsandboxed on the host. " +
      "Commands still go through risk assessment, but isolation, resource limits, " +
      "and network restriction are NOT in effect. Start Docker Desktop (or the Docker " +
      "daemon) to enable sandboxed execution.";
  }

  return { sandbox: cachedSandbox, warning: cachedWarning };
}

/** Force the next getSandbox() call to re-check Docker availability. */
export function resetSandboxCache(): void {
  cachedSandbox = null;
  cachedWarning = null;
}
