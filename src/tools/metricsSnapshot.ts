import { z } from "zod";
import { withErrorBoundary } from "../core/errors.js";
import { metrics } from "../observability/metrics.js";

const schema = z.object({});

export const metricsSnapshotTool = {
  definition: {
    name: "metrics_snapshot",
    description:
      "Get a live snapshot of process metrics since the server started: tool call counts, failure rates, average durations per tool, workflow start/completion counts, retry counts, and AI-repair success rate. For all-time persisted metrics across restarts, use workflow_history with metrics=true instead. The observability dashboard (printed at server startup, default http://localhost:4477) shows both views visually.",
    inputSchema: { type: "object", properties: {} },
  },

  handler: withErrorBoundary(async (_args: unknown) => {
    const snap = metrics.getSnapshot();
    const uptimeS = Math.round(snap.uptimeMs / 1000);

    const lines = [
      `📊 Live metrics (since server start, ${uptimeS}s ago)`,
      ``,
      `Workflows: ${snap.workflowsStarted} started • ${snap.workflowsCompleted} completed • ${snap.workflowsFailed} failed`,
      `Retries: ${snap.retries}  •  AI-repair attempts: ${snap.repairAttempts}` +
        (snap.repairSuccessRate !== null ? ` (${(snap.repairSuccessRate * 100).toFixed(0)}% successful)` : ""),
      ``,
      `Tool usage (this session):`,
    ];

    if (snap.tools.length === 0) {
      lines.push(`  (no tool calls recorded yet)`);
    } else {
      for (const t of snap.tools) {
        const failPct = (t.failureRate * 100).toFixed(0);
        lines.push(`  ${t.name}: ${t.calls} calls, ${t.failures} failed (${failPct}%), avg ${t.avgDurationMs}ms`);
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }),
};
