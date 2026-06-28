import { z } from "zod";
import { withErrorBoundary } from "../core/errors.js";
import { dependencyGraphEngine } from "../intelligence/dependencyGraphEngine.js";
import { analyzeImpact } from "../intelligence/impactAnalyzer.js";

const schema = z.object({
  path: z.string().min(1),
  target: z.string().min(1),
  max_depth: z.number().int().positive().max(20).default(5),
  force_rebuild: z.boolean().default(false),
});

export const impactAnalysisTool = {
  definition: {
    name: "impact_analysis",
    description:
      "Answer 'if I change this file, what else is affected?' — finds every file that directly or transitively depends on a target file, based on a real parsed import graph (not a guess). `target` can be an exact relative path, an absolute path, or a substring (e.g. 'auth' matches files under an auth/ directory). Use this before making a change to gauge its blast radius.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the repository root" },
        target: { type: "string", description: "File to analyze — exact relative path, absolute path, or substring match (e.g. 'auth', 'login.ts')" },
        max_depth: { type: "number", description: "Maximum hops to traverse outward. Default 5, max 20." },
        force_rebuild: { type: "boolean", description: "Bypass the cached graph and re-parse the repo. Default false — use after recent file changes." },
      },
      required: ["path", "target"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { path: repoPath, target, max_depth, force_rebuild } = schema.parse(args);

    const graph = await dependencyGraphEngine.getGraph(repoPath, force_rebuild);
    const result = analyzeImpact(graph, target, { maxDepth: max_depth });

    if (result.targetFiles.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No file matched "${target}" in the parsed dependency graph (${graph.nodes.size} files indexed). Try a different substring, or check the path is correct relative to ${repoPath}.`,
        }],
      };
    }

    const lines = [
      `🎯 Impact analysis for: ${result.targetFiles.join(", ")}`,
      ``,
      `${result.affectedFiles.length} file(s) would be affected by a change here` +
        (result.truncated ? ` (traversal stopped at depth ${max_depth} — the true radius may be larger)` : "") + `:`,
      ``,
    ];

    if (result.affectedFiles.length === 0) {
      lines.push(`(nothing in this repo imports the target file, directly or transitively)`);
    } else {
      let currentDistance = -1;
      for (const f of result.affectedFiles) {
        if (f.distance !== currentDistance) {
          currentDistance = f.distance;
          lines.push(`-- ${f.distance} hop${f.distance > 1 ? "s" : ""} away --`);
        }
        lines.push(`  ${f.path}`);
      }
    }

    if (result.affectedAreas.length > 0) {
      lines.push(``, `Affected areas (directories): ${result.affectedAreas.join(", ")}`);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }),
};
