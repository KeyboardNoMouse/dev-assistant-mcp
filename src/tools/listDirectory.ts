import fs from "fs-extra";
import path from "path";
import { z } from "zod";

const schema = z.object({
  path: z.string().min(1),
  show_hidden: z.boolean().default(false),
});

export const listDirectoryTool = {
  definition: {
    name: "list_directory",
    description:
      "List the immediate contents of a single directory with file sizes and types. Faster and more focused than summarize_repo when you just want to browse one folder.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the directory to list" },
        show_hidden: { type: "boolean", description: "Include hidden files (dotfiles). Default: false" },
      },
      required: ["path"],
    },
  },

  handler: async (args: unknown) => {
    try {
      const { path: dirPath, show_hidden } = schema.parse(args);

      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        return { content: [{ type: "text", text: `${dirPath} is not a directory. Use read_file to read files.` }], isError: true };
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const filtered = show_hidden ? entries : entries.filter(e => !e.name.startsWith("."));
      const sorted = filtered.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      const rows: string[] = [];
      for (const entry of sorted) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          // Count children
          try {
            const children = await fs.readdir(fullPath);
            rows.push(`📁 ${entry.name}/  (${children.length} items)`);
          } catch {
            rows.push(`📁 ${entry.name}/`);
          }
        } else {
          try {
            const fstat = await fs.stat(fullPath);
            const size = fstat.size < 1024
              ? `${fstat.size} B`
              : fstat.size < 1024 * 1024
              ? `${(fstat.size / 1024).toFixed(1)} KB`
              : `${(fstat.size / 1024 / 1024).toFixed(1)} MB`;
            rows.push(`📄 ${entry.name}  (${size})`);
          } catch {
            rows.push(`📄 ${entry.name}`);
          }
        }
      }

      const header = `📂 ${dirPath}\n${filtered.length} item${filtered.length !== 1 ? "s" : ""}\n\n`;
      return { content: [{ type: "text", text: header + rows.join("\n") }] };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { content: [{ type: "text", text: `Invalid input: ${error.errors.map(e => e.message).join(", ")}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  },
};
