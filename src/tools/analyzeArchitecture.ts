import { scanRepository } from "../utils/repoScanner.js";
import { askGemini } from "../utils/gemini.js";

export const analyzeArchitectureTool = {
  definition: {
    name: "analyze_architecture",
    description: "Analyze repository architecture and structure with AI",

    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the repository root",
        },
      },
      required: ["path"],
    },
  },

  handler: async ({ path }: any) => {
    try {
      const files = await scanRepository(path);

      const prompt = `
Analyze this repository structure.

Files:
${files.join("\n")}

Explain:
1. Architecture style
2. Folder structure
3. Design quality
4. Scalability
5. Weaknesses
6. Recommendations
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
