import { z } from "zod";
import { withErrorBoundary } from "../../core/errors.js";
import { getWorkflowRepository } from "../../persistence/repositoryFactory.js";

const schema = z.object({
  id: z.string().optional(),
  metrics: z.boolean().default(false),
});

function formatLog(entries: ReturnType<ReturnType<typeof getWorkflowRepository>["getExecutionLog"]>): string {
  if (entries.length === 0) return "(no logged events)";
  return entries
    .map((e) => {
      const time = new Date(e.createdAt).toISOString();
      const tool = e.tool ? ` [${e.tool}]` : "";
      const detail = e.detail ? ` — ${e.detail}` : "";
      return `${time}  ${e.event}${tool}${detail}`;
    })
    .join("\n");
}

export const workflowHistoryTool = {
  definition: {
    name: "workflow_history",
    description:
      "Inspect the durable execution log for a workflow (every step transition, including retries/repairs that were later overwritten), or get an aggregate metrics summary across all workflows ever run. Survives server restarts.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Workflow ID to view the execution log for" },
        metrics: { type: "boolean", description: "Set true to get an aggregate metrics summary instead of a single workflow's log" },
      },
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { id, metrics } = schema.parse(args);
    const repo = getWorkflowRepository();

    if (metrics) {
      const m = repo.getMetricsSummary();
      const lines = [
        `📊 Workflow metrics (all-time, persisted)`,
        `Started: ${m.workflowsStarted}  •  Completed: ${m.workflowsCompleted}  •  Failed: ${m.workflowsFailed}  •  Active: ${m.workflowsActive}`,
        `Avg duration: ${m.avgDurationMs !== null ? `${(m.avgDurationMs / 1000).toFixed(1)}s` : "n/a"}`,
        `Total retries across all steps: ${m.totalRetries}`,
        ``,
        `Tool execution counts:`,
        ...Object.entries(m.toolExecutionCounts).map(
          ([tool, n]) => `  ${tool}: ${n} runs${m.toolFailureCounts[tool] ? ` (${m.toolFailureCounts[tool]} failed)` : ""}`
        ),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    if (!id) {
      return {
        content: [{ type: "text", text: "Provide an id to view a workflow's execution log, or set metrics=true for an aggregate summary." }],
      };
    }

    const log = repo.getExecutionLog(id);
    return { content: [{ type: "text", text: `Execution log for ${id}:\n\n${formatLog(log)}` }] };
  }),
};
