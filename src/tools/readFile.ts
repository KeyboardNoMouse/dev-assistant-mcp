import fs from "fs-extra";

export const readFileTool = {
  definition: {
    name: "read_file",
    description: "Read contents of a file",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to file",
        },
      },
      required: ["path"],
    },
  },

  handler: async ({ path }: any) => {
    try {
      const content = await fs.readFile(path, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
      };
    }
  },
};