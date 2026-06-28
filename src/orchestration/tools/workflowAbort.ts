import { z } from "zod";
import { workflowEngine } from "../workflow.js";
import { withErrorBoundary } from "../../core/errors.js";

const schema = z.object({
  id: z.string().min(1),
});

export const workflowAbortTool = {
  definition: {
    name: "workflow_abort",
    description:
      "Abort a running workflow. The current step completes naturally; all remaining steps are skipped. Use workflow_status to confirm the abort.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Workflow ID to abort" },
      },
      required: ["id"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { id } = schema.parse(args);
    const aborted = workflowEngine.abort(id);

    if (!aborted) {
      const wf = workflowEngine.getWorkflow(id);
      if (!wf) {
        return {
          content: [{ type: "text", text: `No workflow found with id: ${id}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Cannot abort workflow in status "${wf.status}". Only planning/running/validating workflows can be aborted.`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `🛑 Workflow ${id} is being aborted.\nThe current step will finish, then all remaining steps will be skipped.\nUse workflow_status to confirm.`,
        },
      ],
    };
  }),
};
