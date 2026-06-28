import { glob } from "glob";
import fs from "fs-extra";
import path from "path";
import { z } from "zod";

const schema = z.object({
  path: z.string().min(1),
});

function buildTree(files: string[], rootPath: string): string {
  // Build a nested tree structure
  const tree: Record<string, any> = {};

  for (const file of files) {
    const rel = path.relative(rootPath, file);
    const parts = rel.split(path.sep);
    let node = tree;
    for (const part of parts) {
      if (!node[part]) node[part] = {};
      node = node[part];
    }
  }

  function render(node: Record<string, any>, indent = ""): string {
    const entries = Object.keys(node).sort((a, b) => {
      const aIsDir = Object.keys(node[a]).length > 0;
      const bIsDir = Object.keys(node[b]).length > 0;
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.localeCompare(b);
    });

    return entries
      .map((key, i) => {
        const isLast = i === entries.length - 1;
        const prefix = indent + (isLast ? "└── " : "├── ");
        const childIndent = indent + (isLast ? "    " : "│   ");
        const children = node[key];
        const hasChildren = Object.keys(children).length > 0;
        return prefix + key + (hasChildren ? "\n" + render(children, childIndent) : "");
      })
      .join("\n");
  }

  return render(tree);
}

export const summarizeRepoTool = {
  definition: {
    name: "summarize_repo",
    description:
      "Display the file and folder structure of a repository as a tree, along with a breakdown of file types and counts.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative path to the repository root" },
      },
      required: ["path"],
    },
  },

  handler: async (args: unknown) => {
    try {
      const { path: rootPath } = schema.parse(args);

      const files = await glob(`${rootPath}/**/*`, {
        nodir: true,
        ignore: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/build/**",
          "**/.next/**",
          "**/coverage/**",
          "**/__pycache__/**",
          "**/*.min.js",
        ],
      });

      if (files.length === 0) {
        return { content: [{ type: "text", text: "No files found." }] };
      }

      // Count by extension
      const extCounts: Record<string, number> = {};
      let totalSize = 0;

      for (const file of files) {
        const ext = path.extname(file).toLowerCase() || "(no ext)";
        extCounts[ext] = (extCounts[ext] || 0) + 1;
        try {
          const stat = await fs.stat(file);
          totalSize += stat.size;
        } catch { /* skip */ }
      }

      const tree = buildTree(files, rootPath);

      const extSummary = Object.entries(extCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([ext, count]) => `  ${ext.padEnd(12)} ${count} file${count !== 1 ? "s" : ""}`)
        .join("\n");

      const header = `Repository: ${rootPath}\n${files.length} files | ${(totalSize / 1024).toFixed(1)} KB total\n\n`;
      const breakdown = `File types:\n${extSummary}\n\nStructure:\n${path.basename(rootPath)}\n${tree}`;

      return { content: [{ type: "text", text: header + breakdown }] };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { content: [{ type: "text", text: `Invalid input: ${error.errors.map(e => e.message).join(", ")}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  },
};
