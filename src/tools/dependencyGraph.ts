import { z } from "zod";
import { withErrorBoundary } from "../core/errors.js";
import { dependencyGraphEngine } from "../intelligence/dependencyGraphEngine.js";

const schema = z.object({
  path: z.string().min(1),
  file: z.string().optional(),
  force_rebuild: z.boolean().default(false),
});

export const dependencyGraphTool = {
  definition: {
    name: "dependency_graph",
    description:
      "Show real, parsed import relationships (not an AI guess). Without `file`, gives a repo-wide overview (file count, parse coverage, external packages used). With `file`, shows exactly what that file imports and exactly what imports it.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the repository root" },
        file: { type: "string", description: "Optional — a specific file's relative path to inspect (e.g. 'src/auth/login.ts')" },
        force_rebuild: { type: "boolean", description: "Bypass the cached graph and re-parse the repo. Default false." },
      },
      required: ["path"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { path: repoPath, file, force_rebuild } = schema.parse(args);
    const graph = await dependencyGraphEngine.getGraph(repoPath, force_rebuild);

    if (file) {
      const node = graph.nodes.get(file);
      if (!node) {
        const close = [...graph.nodes.keys()].filter((p) => p.includes(file)).slice(0, 5);
        return {
          content: [{
            type: "text",
            text: `No file found at exactly "${file}".` +
              (close.length > 0 ? ` Did you mean one of:\n${close.map((p) => `  ${p}`).join("\n")}` : ""),
          }],
        };
      }

      const lines = [
        `📄 ${node.path}${node.unparsed ? " (unparsed — not a JS/TS file)" : ""}`,
        ``,
        `Imports ${node.dependsOn.length} file(s) in this repo:`,
        ...(node.dependsOn.length > 0 ? node.dependsOn.map((d) => `  → ${d}`) : ["  (none)"]),
        ``,
        `Imported by ${node.dependedOnBy.length} file(s):`,
        ...(node.dependedOnBy.length > 0 ? node.dependedOnBy.map((d) => `  ← ${d}`) : ["  (none — nothing in this repo depends on it)"]),
      ];

      if (node.externalPackages.length > 0) {
        lines.push(``, `External packages used: ${node.externalPackages.join(", ")}`);
      }
      if (node.builtinModules.length > 0) {
        lines.push(``, `Node built-ins used: ${node.builtinModules.join(", ")}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    // Repo-wide overview
    const totalFiles = graph.nodes.size;
    const unparsed = [...graph.nodes.values()].filter((n) => n.unparsed).length;
    const totalEdges = [...graph.nodes.values()].reduce((sum, n) => sum + n.dependsOn.length, 0);
    const externalPackages = new Set<string>();
    for (const n of graph.nodes.values()) for (const p of n.externalPackages) externalPackages.add(p);

    const lines = [
      `🗺️  Dependency graph for ${repoPath}`,
      ``,
      `${totalFiles} files indexed (${totalFiles - unparsed} parsed for imports, ${unparsed} unparsed — non-JS/TS)`,
      `${totalEdges} internal import edges`,
      `${externalPackages.size} distinct external packages used`,
      ``,
      `Pass \`file\` with a specific path to see its exact dependencies, or use impact_analysis to find what would be affected by changing it.`,
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }),
};
