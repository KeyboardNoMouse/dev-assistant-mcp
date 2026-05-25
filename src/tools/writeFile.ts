import fs from "fs-extra";
import path from "path";
import { z } from "zod";

const schema = z.object({
  path: z.string().min(1, "path is required"),
  content: z.string(),
  create_if_missing: z.boolean().default(true),
  backup: z.boolean().default(true),
});

export const writeFileTool = {
  definition: {
    name: "write_file",
    description:
      "Write or overwrite a file with new content. Optionally creates parent directories. Creates a .bak backup of the original file before overwriting unless backup=false.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to write" },
        content: { type: "string", description: "Content to write to the file" },
        create_if_missing: {
          type: "boolean",
          description: "Create the file (and parent directories) if it does not exist. Default: true",
        },
        backup: {
          type: "boolean",
          description: "Create a .bak backup of the original file before overwriting. Default: true",
        },
      },
      required: ["path", "content"],
    },
  },

  handler: async (args: unknown) => {
    try {
      const { path: filePath, content, create_if_missing, backup } = schema.parse(args);

      const exists = await fs.pathExists(filePath);

      if (!exists && !create_if_missing) {
        return {
          content: [{ type: "text", text: `File does not exist: ${filePath}. Set create_if_missing=true to create it.` }],
          isError: true,
        };
      }

      // Backup existing file
      if (exists && backup) {
        const backupPath = filePath + ".bak";
        await fs.copy(filePath, backupPath, { overwrite: true });
      }

      // Ensure parent directory exists
      if (create_if_missing) {
        await fs.ensureDir(path.dirname(filePath));
      }

      await fs.writeFile(filePath, content, "utf-8");

      const lines = content.split("\n").length;
      const size = Buffer.byteLength(content, "utf-8");

      return {
        content: [{
          type: "text",
          text: `✅ Written: ${filePath}\n${lines} lines | ${(size / 1024).toFixed(1)} KB${exists && backup ? `\nBackup saved to: ${filePath}.bak` : ""}`,
        }],
      };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { content: [{ type: "text", text: `Invalid input: ${error.errors.map(e => e.message).join(", ")}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Error writing file: ${error.message}` }], isError: true };
    }
  },
};
