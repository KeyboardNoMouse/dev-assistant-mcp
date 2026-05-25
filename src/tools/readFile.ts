import fs from "fs-extra";
import path from "path";
import { z } from "zod";

const MAX_FILE_SIZE = 500 * 1024; // 500KB hard limit

const schema = z.object({
  path: z.string().min(1, "path is required"),
  start_line: z.number().int().positive().optional(),
  end_line: z.number().int().positive().optional(),
});

export const readFileTool = {
  definition: {
    name: "read_file",
    description:
      "Read the contents of a file. Supports reading a specific line range via start_line / end_line. Refuses files larger than 500KB to avoid flooding context.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative path to the file" },
        start_line: { type: "number", description: "First line to read (1-based, optional)" },
        end_line: { type: "number", description: "Last line to read (1-based, inclusive, optional)" },
      },
      required: ["path"],
    },
  },

  handler: async (args: unknown) => {
    try {
      const { path: filePath, start_line, end_line } = schema.parse(args);

      const stat = await fs.stat(filePath);

      if (stat.size > MAX_FILE_SIZE) {
        return {
          content: [{
            type: "text",
            text: `File is too large (${(stat.size / 1024).toFixed(1)} KB). Use start_line / end_line to read a specific section, or use search_code to find relevant parts first.`,
          }],
          isError: true,
        };
      }

      const rawContent = await fs.readFile(filePath, "utf-8");
      const lines = rawContent.split("\n");
      const totalLines = lines.length;

      let content: string;
      let rangeNote = "";

      if (start_line !== undefined || end_line !== undefined) {
        const from = (start_line ?? 1) - 1;
        const to = end_line ?? totalLines;
        const slice = lines.slice(from, to);
        content = slice.map((l, i) => `${from + i + 1}: ${l}`).join("\n");
        rangeNote = `\n[Lines ${from + 1}–${Math.min(to, totalLines)} of ${totalLines}]`;
      } else {
        content = lines.map((l, i) => `${i + 1}: ${l}`).join("\n");
      }

      const ext = path.extname(filePath).slice(1);
      const meta = `File: ${filePath}\nSize: ${(stat.size / 1024).toFixed(1)} KB | Lines: ${totalLines} | Modified: ${stat.mtime.toISOString()}${rangeNote}\n\n`;

      return {
        content: [{
          type: "text",
          text: meta + "```" + ext + "\n" + content + "\n```",
        }],
      };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { content: [{ type: "text", text: `Invalid input: ${error.errors.map(e => e.message).join(", ")}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Error reading file: ${error.message}` }], isError: true };
    }
  },
};
