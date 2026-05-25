import { glob } from "glob";
import fs from "fs-extra";
import { z } from "zod";

const CONTEXT_LINES = 2;

const schema = z.object({
  path: z.string().min(1),
  query: z.string().min(1),
  case_sensitive: z.boolean().default(false),
  use_regex: z.boolean().default(false),
  file_extension: z.string().optional(),
  max_results: z.number().int().positive().max(200).default(50),
});

export const searchCodeTool = {
  definition: {
    name: "search_code",
    description:
      "Search codebase for text or a regex pattern. Returns matching file paths, line numbers, and surrounding context lines — not just filenames.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Root project path to search under" },
        query: { type: "string", description: "Text or regex pattern to search for" },
        case_sensitive: { type: "boolean", description: "Case-sensitive match. Default: false" },
        use_regex: { type: "boolean", description: "Treat query as a regex pattern. Default: false" },
        file_extension: { type: "string", description: "Limit search to this extension, e.g. 'ts' or 'py'. Default: all supported types" },
        max_results: { type: "number", description: "Maximum number of matching lines to return. Default: 50" },
      },
      required: ["path", "query"],
    },
  },

  handler: async (args: unknown) => {
    try {
      const { path: rootPath, query, case_sensitive, use_regex, file_extension, max_results } = schema.parse(args);

      const pattern = file_extension
        ? `${rootPath}/**/*.${file_extension}`
        : `${rootPath}/**/*.{ts,tsx,js,jsx,py,java,go,rs,rb,cs,php,json,md,yaml,yml,sh}`;

      const files = await glob(pattern, {
        nodir: true,
        ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"],
      });

      let regex: RegExp;
      try {
        const flags = case_sensitive ? "g" : "gi";
        regex = use_regex ? new RegExp(query, flags) : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
      } catch (e: any) {
        return { content: [{ type: "text", text: `Invalid regex: ${e.message}` }], isError: true };
      }

      const results: string[] = [];
      let totalMatches = 0;

      for (const file of files) {
        if (totalMatches >= max_results) break;

        let content: string;
        try {
          content = await fs.readFile(file, "utf-8");
        } catch {
          continue;
        }

        const lines = content.split("\n");
        const fileMatches: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          if (totalMatches >= max_results) break;
          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            const from = Math.max(0, i - CONTEXT_LINES);
            const to = Math.min(lines.length - 1, i + CONTEXT_LINES);
            const contextBlock = lines
              .slice(from, to + 1)
              .map((l, offset) => {
                const lineNum = from + offset + 1;
                const marker = lineNum === i + 1 ? ">>>" : "   ";
                return `  ${marker} ${String(lineNum).padStart(4)}: ${l}`;
              })
              .join("\n");

            fileMatches.push(contextBlock);
            totalMatches++;
          }
        }

        if (fileMatches.length > 0) {
          results.push(`📄 ${file} (${fileMatches.length} match${fileMatches.length > 1 ? "es" : ""})\n${fileMatches.join("\n  ---\n")}`);
        }
      }

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No matches found for "${query}" in ${files.length} files.` }] };
      }

      const header = `Found ${totalMatches} match${totalMatches !== 1 ? "es" : ""} across ${results.length} file${results.length !== 1 ? "s" : ""}${totalMatches >= max_results ? ` (capped at ${max_results})` : ""}:\n\n`;
      return { content: [{ type: "text", text: header + results.join("\n\n") }] };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { content: [{ type: "text", text: `Invalid input: ${error.errors.map(e => e.message).join(", ")}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Search error: ${error.message}` }], isError: true };
    }
  },
};
