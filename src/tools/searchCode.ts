import { glob } from "glob";
import fs from "fs-extra";

export const searchCodeTool = {
  definition: {
    name: "search_code",
    description: "Search codebase for text",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Root project path",
        },
        query: {
          type: "string",
          description: "Text to search for",
        },
      },
      required: ["path", "query"],
    },
  },

  handler: async ({ path, query }: any) => {
    try {
      // ONLY get files
      const files = await glob(
        `${path}/**/*.{ts,js,tsx,jsx,py,json,md}`,
        {
          nodir: true,
          ignore: [
            "**/node_modules/**",
            "**/.git/**",
            "**/dist/**",
          ],
        }
      );

      const matches: string[] = [];

      for (const file of files) {
        try {
          const content = await fs.readFile(
            file,
            "utf-8"
          );

          if (
            content
              .toLowerCase()
              .includes(query.toLowerCase())
          ) {
            matches.push(file);
          }
        } catch {
          // Skip unreadable files
          continue;
        }
      }

      return {
        content: [
          {
            type: "text",
            text:
              matches.length > 0
                ? matches.join("\n")
                : "No matches found",
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Search error: ${error.message}`,
          },
        ],
      };
    }
  },
};