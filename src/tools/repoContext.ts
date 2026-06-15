import { z } from "zod";
import { contextEngine } from "../context/contextEngine.js";
import { withErrorBoundary } from "../core/errors.js";

const schema = z.object({
  path: z.string().min(1),
  force_refresh: z.boolean().default(false),
});

export const repoContextTool = {
  definition: {
    name: "repo_context",
    description:
      "Analyze a repository to detect its language, frameworks, package manager, test framework, build system, and entry points. Results are cached for 10 minutes. Use force_refresh=true to re-index after major changes.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the repository root" },
        force_refresh: {
          type: "boolean",
          description: "Force re-analysis even if a recent result is cached. Default: false",
        },
      },
      required: ["path"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { path: rootPath, force_refresh } = schema.parse(args);
    const ctx = await contextEngine.getContext(rootPath, force_refresh);

    const lines = [
      `📦 Repository Context`,
      `   Path: ${ctx.rootPath}`,
      `   Language: ${ctx.language}`,
      `   Frameworks: ${ctx.frameworks.length > 0 ? ctx.frameworks.join(", ") : "none detected"}`,
      `   Package manager: ${ctx.packageManager}`,
      ``,
      `🔧 Build & Tooling`,
      `   Build: ${ctx.hasBuild ? `✅ ${ctx.buildCommand}` : "❌ none detected"}`,
      `   Tests: ${ctx.hasTests ? `✅ ${ctx.testFramework ?? "unknown"} — ${ctx.testCommand}` : "❌ none detected"}`,
      `   Linter: ${ctx.hasLinter ? `✅ ${ctx.lintCommand}` : "❌ none detected"}`,
      ``,
      `📍 Entry Points`,
      ctx.entryPoints.length > 0
        ? ctx.entryPoints.map((e) => `   • ${e}`).join("\n")
        : "   (none detected)",
      ``,
      `⏱️  Indexed: ${new Date(ctx.indexedAt).toLocaleTimeString()}`,
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }),
};
