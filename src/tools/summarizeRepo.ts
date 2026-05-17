import { glob } from "glob";

export const summarizeRepoTool = {
  definition: {
    name: "summarize_repo",
    description: "Summarize repository structure",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
        },
      },
      required: ["path"],
    },
  },

  handler: async ({ path }: any) => {
    try {
      const files = await glob(`${path}/**/*`, {
        ignore: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
        ],
      });

      return {
        content: [
          {
            type: "text",
            text:
              files.slice(0, 100).join("\n") ||
              "No files found",
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