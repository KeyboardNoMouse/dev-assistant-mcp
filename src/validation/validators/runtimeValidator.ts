import net from "net";
import type { RepoContext, ValidatorResult } from "../../core/types.js";
import type { Validator, ValidatorRunOptions } from "../validator.js";
import { getSandbox } from "../../runtime/sandboxFactory.js";

/**
 * runtimeValidator — the least exact of the four validators, by necessity.
 *
 * "Process starts successfully" and "expected ports open" require
 * actually running the app, which means:
 *   1. There's no reliable way to know in advance how long is "long
 *      enough" to prove a server started correctly — we use a bounded
 *      probe window (default 8s) and treat "still alive when time's up"
 *      as success. A server that crashes after 9 seconds would be a
 *      false negative for this check; that's a known, accepted limit
 *      of "probe for N seconds" as a strategy.
 *   2. Port detection (RepoContext.expectedPort) is a best-effort GUESS
 *      from a .env default or framework convention, not a hard fact —
 *      see frameworkDetector.ts. If the guess is wrong, the port check
 *      is skipped rather than reported as a false failure.
 *   3. Probing a port behind Docker's network isolation requires
 *      explicitly publishing it, which means this validator opts the
 *      container OUT of the network-disabled default for this one run.
 *      That's a deliberate, scoped exception — every other validator
 *      stays network-disabled.
 *
 * Skips (returns null) entirely if no start command was detected —
 * a CLI tool or library with no server to start has nothing for this
 * validator to check.
 */

const DEFAULT_PROBE_MS = 8000;
const PORT_PROBE_RETRY_MS = 500;

function findFreeHostPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("Could not allocate a free host port"));
      });
    });
    server.on("error", reject);
  });
}

function probePort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    const attempt = () => {
      const socket = new net.Socket();
      const onResult = (ok: boolean) => {
        socket.destroy();
        if (ok) return resolve(true);
        if (Date.now() >= deadline) return resolve(false);
        setTimeout(attempt, PORT_PROBE_RETRY_MS);
      };
      socket.setTimeout(1000);
      socket.once("connect", () => onResult(true));
      socket.once("timeout", () => onResult(false));
      socket.once("error", () => onResult(false));
      socket.connect(port, host);
    };

    attempt();
  });
}

export class RuntimeValidator implements Validator {
  readonly kind = "runtime" as const;

  async run(context: RepoContext, options: ValidatorRunOptions): Promise<ValidatorResult | null> {
    if (!context.startCommand) return null;

    const probeMs = Math.min(options.timeoutMs, DEFAULT_PROBE_MS);
    const { sandbox } = await getSandbox();

    let hostPort: number | null = null;
    let publishPort: { host: number; container: number } | undefined;

    if (context.expectedPort) {
      try {
        hostPort = await findFreeHostPort();
        publishPort = { host: hostPort, container: context.expectedPort };
      } catch {
        // Couldn't allocate a probe port — proceed without port checking.
        hostPort = null;
      }
    }

    const startTime = Date.now();
    // The start command is expected to run a long-lived server, so we
    // treat the probe window itself as the timeout: if the process is
    // still running (sandbox.run hasn't returned) when time's up, that's
    // a SUCCESS for "process starts and stays up", not a failure.
    const resultPromise = sandbox.run(context.startCommand, {
      cwd: options.repoPath,
      timeoutMs: probeMs,
      networkDisabled: publishPort ? false : true,
      publishPort,
    });

    let portOpen: boolean | null = null;
    if (hostPort) {
      // Give the process a moment to actually start listening before probing.
      portOpen = await probePort("127.0.0.1", hostPort, Math.max(probeMs - 1000, 1000));
    }

    const result = await resultPromise;
    const durationMs = Date.now() - startTime;

    // sandbox.run's `timedOut` flag means "still running when probeMs elapsed" —
    // for a server process, that IS the success case, not a failure.
    const stayedUp = result.timedOut;
    const crashedEarly = !stayedUp && result.exitCode !== 0;

    const lines = [
      `$ ${context.startCommand}`,
      stayedUp
        ? `✅ Process was still running after ${probeMs}ms probe window (did not crash immediately)`
        : crashedEarly
          ? `❌ Process exited early with code ${result.exitCode} before the ${probeMs}ms probe window elapsed`
          : `Process exited with code ${result.exitCode} before the probe window elapsed`,
    ];

    if (hostPort && context.expectedPort) {
      lines.push(
        portOpen
          ? `✅ Port ${context.expectedPort} (best-effort guess) opened and accepted a connection`
          : `⚠️  Port ${context.expectedPort} (best-effort guess) did not accept a connection within the probe window — this may be a wrong guess, not necessarily a failure`
      );
    } else if (context.expectedPort) {
      lines.push(`⚠️  Could not allocate a host port to probe ${context.expectedPort} — port check skipped`);
    } else {
      lines.push(`ℹ️  No expected port could be guessed for this repo — port check skipped`);
    }

    if (result.stdout.trim()) lines.push(`\n--- stdout ---\n${result.stdout.trim().slice(-1500)}`);
    if (result.stderr.trim()) lines.push(`\n--- stderr ---\n${result.stderr.trim().slice(-1500)}`);

    // Pass criteria: process didn't crash early. Port check is informational
    // (logged either way) but does NOT gate pass/fail, since the port guess
    // can legitimately be wrong for a repo we've never run before.
    const passed = stayedUp;

    return {
      kind: "runtime",
      passed,
      output: lines.join("\n"),
      durationMs,
    };
  }
}
