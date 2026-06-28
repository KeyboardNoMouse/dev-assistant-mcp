import { z } from "zod";
import { withErrorBoundary } from "../core/errors.js";
import { getSandbox, resetSandboxCache } from "../runtime/sandboxFactory.js";

const schema = z.object({
  refresh: z.boolean().default(false),
});

export const sandboxStatusTool = {
  definition: {
    name: "sandbox_status",
    description:
      "Check whether sandboxed (Docker) execution is currently active for run_command and workflow steps, or whether the server has fallen back to direct host execution. Set refresh=true to re-check Docker availability (e.g. after starting Docker Desktop).",
    inputSchema: {
      type: "object",
      properties: {
        refresh: {
          type: "boolean",
          description: "Force a fresh Docker availability check instead of using the cached result. Default: false",
        },
      },
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { refresh } = schema.parse(args);
    if (refresh) resetSandboxCache();

    const { sandbox, warning } = await getSandbox();

    const lines = [
      `🛡️  Execution Sandbox Status`,
      `   Active backend: ${sandbox.kind}`,
      `   Isolation: ${warning ? "❌ disabled (host execution)" : "✅ enabled (Docker)"}`,
    ];

    if (warning) {
      lines.push(``, warning);
    } else {
      lines.push(
        ``,
        `Resource limits in effect per command: 1024MB memory, 1 CPU, 256 PID limit, network disabled by default.`,
        `Override per-call with run_command's allow_network or bypass_sandbox params.`
      );
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }),
};
