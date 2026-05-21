import fs from "fs-extra";
import { askGemini } from "../utils/gemini.js";

const MAX_CHARS = 12000;

export const analyzeCodeTool = {
  definition: {
    name: "analyze_code",
    description: "Analyze source code with AI",

    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the source code file to analyze",
        },
      },
      required: ["path"],
    },
  },

  handler: async ({ path }: any) => {
    try {
      const code = await fs.readFile(path, "utf-8");

      const trimmedCode =
        code.length > MAX_CHARS
          ? code.slice(0, MAX_CHARS)
          : code;

      const prompt = `
Analyze this codebase file.

Explain:
1. Purpose
2. Bugs
3. Performance issues
4. Security issues
5. Improvements
6. Architecture quality

CODE:
${trimmedCode}
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