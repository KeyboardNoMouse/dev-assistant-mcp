import fs from "fs-extra";
import { askGemini } from "../utils/gemini.js";

export const refactorCodeTool = {
  definition: {
    name: "refactor_code",
    description: "Get AI-powered code refactoring suggestions",

    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the source code file to refactor",
        },
      },
      required: ["path"],
    },
  },

  handler: async ({ path }: any) => {
    try {
      const code = await fs.readFile(path, "utf-8");

      const prompt = `
Refactor this code.

Provide:
1. Cleaner architecture
2. Better performance
3. Better readability
4. Better TypeScript practices
5. Modularization suggestions

CODE:
${code.slice(0, 12000)}
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
