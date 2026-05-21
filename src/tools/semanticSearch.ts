import fs from "fs-extra";
import { scanRepository } from "../utils/repoScanner.js";
import { askGemini } from "../utils/gemini.js";

export const semanticSearchTool = {
  definition: {
    name: "semantic_search",
    description: "Search repository by meaning using AI",

    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the repository root",
        },
        query: {
          type: "string",
          description: "Natural language search query",
        },
      },
      required: ["path", "query"],
    },
  },

  handler: async ({ path, query }: any) => {
    try {
      const files = await scanRepository(path);

      const summaries: string[] = [];

      for (const file of files.slice(0, 20)) {
        const content = await fs.readFile(file, "utf-8");

        summaries.push(
          `FILE: ${file}\n${content.slice(0, 1200)}`
        );
      }

      const prompt = `
User Query:
${query}

Find the most relevant files.

Repository:
${summaries.join("\n\n")}
`;

      const response = await askGemini(prompt);

      return {
        content: [
          {
            type: "text",
            text: response,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: error.message,
          },
        ],
      };
    }
  },
};
