/**
 * Live metrics — process-lifetime counters for every tool call, not just
 * workflow-scoped ones. Phase 1's WorkflowRepository.getMetricsSummary()
 * already covers workflows (persisted, survives restarts); this module
 * covers the broader surface: every single MCP tool invocation, whether
 * or not it happened inside a workflow.
 *
 * Deliberately in-memory only — these reset on restart. That's the
 * correct tradeoff here: workflow history needs to survive a restart
 * (Phase 1 handles that), but "how many times has read_file been called
 * since the server started" doesn't need database durability, and
 * keeping it in-memory avoids a write on every single tool call.
 */

interface ToolStats {
  calls: number;
  failures: number;
  totalDurationMs: number;
}

interface RetryRepairStats {
  retries: number;
  repairAttempts: number;
  repairSuccesses: number;
}

const toolStats = new Map<string, ToolStats>();
const startTime = Date.now();
let workflowsStartedLive = 0;
let workflowsCompletedLive = 0;
let workflowsFailedLive = 0;
const retryRepair: RetryRepairStats = { retries: 0, repairAttempts: 0, repairSuccesses: 0 };

export const metrics = {
  recordToolCall(toolName: string, durationMs: number, failed: boolean): void {
    const stats = toolStats.get(toolName) ?? { calls: 0, failures: 0, totalDurationMs: 0 };
    stats.calls += 1;
    if (failed) stats.failures += 1;
    stats.totalDurationMs += durationMs;
    toolStats.set(toolName, stats);
  },

  recordWorkflowStarted(): void {
    workflowsStartedLive += 1;
  },

  recordWorkflowFinished(passed: boolean): void {
    if (passed) workflowsCompletedLive += 1;
    else workflowsFailedLive += 1;
  },

  recordRetry(): void {
    retryRepair.retries += 1;
  },

  recordRepairAttempt(succeeded: boolean): void {
    retryRepair.repairAttempts += 1;
    if (succeeded) retryRepair.repairSuccesses += 1;
  },

  /** Snapshot of everything tracked since process start. */
  getSnapshot() {
    const tools = Array.from(toolStats.entries()).map(([name, s]) => ({
      name,
      calls: s.calls,
      failures: s.failures,
      failureRate: s.calls > 0 ? s.failures / s.calls : 0,
      avgDurationMs: s.calls > 0 ? Math.round(s.totalDurationMs / s.calls) : 0,
    }));

    return {
      uptimeMs: Date.now() - startTime,
      workflowsStarted: workflowsStartedLive,
      workflowsCompleted: workflowsCompletedLive,
      workflowsFailed: workflowsFailedLive,
      retries: retryRepair.retries,
      repairAttempts: retryRepair.repairAttempts,
      repairSuccesses: retryRepair.repairSuccesses,
      repairSuccessRate: retryRepair.repairAttempts > 0 ? retryRepair.repairSuccesses / retryRepair.repairAttempts : null,
      tools: tools.sort((a, b) => b.calls - a.calls),
    };
  },
};

export type MetricsSnapshot = ReturnType<typeof metrics.getSnapshot>;
