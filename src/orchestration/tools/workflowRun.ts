import { z } from "zod";
import { workflowEngine } from "../workflow.js";
import { withErrorBoundary } from "../../core/errors.js";

const schema = z.object({
  goal: z.string().min(3),
  repo_path: z.string().min(1),
});

export const workflowRunTool = {
  definition: {
    name: "workflow_run",
    description:
      "Start an agentic multi-step workflow from a natural language engineering goal. The system will plan, execute, and validate a sequence of tool calls automatically. Returns a workflow ID — use workflow_status to track progress.",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: 'Natural language engineering goal. Examples: "Add input validation to all API routes", "Find and fix security issues in the auth module", "Analyze why the build is failing"',
        },
        repo_path: {
          type: "string",
          description: "Absolute path to the repository root",
        },
      },
      required: ["goal", "repo_path"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { goal, repo_path } = schema.parse(args);
    const id = await workflowEngine.start(goal, repo_path);

    return {
      content: [
        {
          type: "text",
          text: [
            `🚀 Workflow started`,
            `ID: ${id}`,
            `Goal: ${goal}`,
            `Repo: ${repo_path}`,
            ``,
            `The system is planning and executing steps autonomously.`,
            `Use workflow_status with id="${id}" to check progress.`,
          ].join("\n"),
        },
      ],
    };
  }),
};
