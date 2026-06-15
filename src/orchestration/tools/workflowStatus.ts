import { z } from "zod";
import { workflowEngine } from "../workflow.js";
import { withErrorBoundary } from "../../core/errors.js";
import type { Workflow, WorkflowStep } from "../../core/types.js";

const schema = z.object({
  id: z.string().optional(),
  list: z.boolean().default(false),
});

const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  running: "🔄",
  done: "✅",
  failed: "❌",
  skipped: "⏭️ ",
  rolled_back: "↩️ ",
};

const WORKFLOW_ICONS: Record<string, string> = {
  planning: "🧠",
  running: "⚙️ ",
  validating: "🔍",
  done: "✅",
  failed: "❌",
  aborted: "🛑",
};

function formatStep(step: WorkflowStep, idx: number): string {
  const icon = STATUS_ICONS[step.status] ?? "•";
  const duration =
    step.startedAt && step.finishedAt
      ? ` (${((step.finishedAt - step.startedAt) / 1000).toFixed(1)}s)`
      : step.status === "running"
      ? " (running…)"
      : "";

  const lines = [`  ${icon} Step ${idx + 1}: ${step.description}${duration}`];
  if (step.retryCount > 0) lines.push(`      ↺ retried ${step.retryCount}x`);
  if (step.error) lines.push(`      Error: ${step.error.slice(0, 200)}`);
  if (step.status === "done" && step.result) {
    const preview = step.result.content.map((c) => c.text).join("").slice(0, 300);
    if (preview.trim()) lines.push(`      → ${preview.replace(/\n/g, " ").trim()}`);
  }
  return lines.join("\n");
}

function formatWorkflow(wf: Workflow): string {
  const icon = WORKFLOW_ICONS[wf.status] ?? "•";
  const age = Math.round((Date.now() - wf.createdAt) / 1000);
  const doneSteps = wf.steps.filter((s) => s.status === "done").length;
  const totalSteps = wf.steps.length;

  const header = [
    `${icon} Workflow: ${wf.goal}`,
    `   ID: ${wf.id}`,
    `   Status: ${wf.status.toUpperCase()}  •  ${doneSteps}/${totalSteps} steps  •  ${age}s ago`,
  ];

  if (wf.error) header.push(`   Error: ${wf.error}`);

  const stepLines = wf.steps.length > 0
    ? ["\nSteps:", ...wf.steps.map((s, i) => formatStep(s, i))]
    : ["\n  (planning — steps not yet available)"];

  return [...header, ...stepLines].join("\n");
}

export const workflowStatusTool = {
  definition: {
    name: "workflow_status",
    description:
      "Check the status of a running or completed workflow. Pass an id to inspect a specific workflow, or set list=true to see all recent workflows.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Workflow ID returned by workflow_run" },
        list: { type: "boolean", description: "Set true to list all workflows instead of inspecting one" },
      },
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { id, list } = schema.parse(args);

    if (list) {
      const all = workflowEngine.listWorkflows();
      if (all.length === 0) {
        return { content: [{ type: "text", text: "No workflows have been started yet." }] };
      }
      const text = all.map(formatWorkflow).join("\n\n" + "─".repeat(60) + "\n\n");
      return { content: [{ type: "text", text: text }] };
    }

    if (!id) {
      return {
        content: [{ type: "text", text: "Provide an id to inspect a specific workflow, or set list=true to list all." }],
      };
    }

    const wf = workflowEngine.getWorkflow(id);
    if (!wf) {
      return {
        content: [{ type: "text", text: `No workflow found with id: ${id}` }],
        isError: true,
      };
    }

    return { content: [{ type: "text", text: formatWorkflow(wf) }] };
  }),
};
