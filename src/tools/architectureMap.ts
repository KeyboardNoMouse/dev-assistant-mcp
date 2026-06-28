import { z } from "zod";
import { withErrorBoundary } from "../core/errors.js";
import { dependencyGraphEngine } from "../intelligence/dependencyGraphEngine.js";
import { generateArchitectureMap } from "../intelligence/architectureMapGenerator.js";

const schema = z.object({
  path: z.string().min(1),
  force_rebuild: z.boolean().default(false),
});

export const architectureMapTool = {
  definition: {
    name: "architecture_map",
    description:
      "Deterministic structural facts derived from the parsed import graph: which directories depend on which, the most-depended-on files (real fan-in counts — strong signal for 'risky to change'), and any circular dependencies. This is DIFFERENT from analyze_architecture, which is an AI's qualitative opinion from skimmed file snippets — everything here is a counted, verifiable fact from the actual parsed imports, not a guess.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the repository root" },
        force_rebuild: { type: "boolean", description: "Bypass the cached graph and re-parse the repo. Default false." },
      },
      required: ["path"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { path: repoPath, force_rebuild } = schema.parse(args);
    const graph = await dependencyGraphEngine.getGraph(repoPath, force_rebuild);
    const map = generateArchitectureMap(graph);

    const lines = [
      `🏛️  Architecture map for ${repoPath}`,
      ``,
      `${map.totalFiles} files (${map.parsedFiles} parsed, ${map.unparsedFiles} unparsed — non-JS/TS)`,
      ``,
      `📦 Modules (by file count):`,
    ];

    for (const mod of map.modules.slice(0, 15)) {
      lines.push(`  ${mod.directory} (${mod.fileCount} files)`);
      if (mod.dependsOnModules.length > 0) lines.push(`    depends on: ${mod.dependsOnModules.join(", ")}`);
      if (mod.dependedOnByModules.length > 0) lines.push(`    depended on by: ${mod.dependedOnByModules.join(", ")}`);
    }
    if (map.modules.length > 15) lines.push(`  ... and ${map.modules.length - 15} more`);

    lines.push(``, `🔥 Most depended-on files (highest fan-in — review carefully before changing):`);
    if (map.mostDependedOn.length === 0) {
      lines.push(`  (no internal dependencies detected)`);
    } else {
      for (const f of map.mostDependedOn) {
        lines.push(`  ${f.path} — depended on by ${f.dependedOnByCount} file(s)`);
      }
    }

    if (map.circularDependencies.length > 0) {
      lines.push(``, `⚠️  Circular dependencies detected (${map.circularDependencies.length}):`);
      for (const c of map.circularDependencies.slice(0, 10)) {
        lines.push(`  ${c.cycle.join(" → ")} → ${c.cycle[0]}`);
      }
      if (map.circularDependencies.length > 10) {
        lines.push(`  ... and ${map.circularDependencies.length - 10} more`);
      }
    } else {
      lines.push(``, `✅ No circular dependencies detected.`);
    }

    if (map.externalPackagesUsed.length > 0) {
      lines.push(``, `📚 External packages (${map.externalPackagesUsed.length}): ${map.externalPackagesUsed.join(", ")}`);
    }
    if (map.builtinModulesUsed.length > 0) {
      lines.push(``, `🧰 Node built-ins used (${map.builtinModulesUsed.length}): ${map.builtinModulesUsed.join(", ")}`);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }),
};
