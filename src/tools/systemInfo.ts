import os from "os";

export const systemInfoTool = {
  definition: {
    name: "system_info",
    description: "Get system information",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  handler: async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              platform: os.platform(),
              cpuCores: os.cpus().length,
              totalMemory: os.totalmem(),
              freeMemory: os.freemem(),
              uptime: os.uptime(),
            },
            null,
            2
          ),
        },
      ],
    };
  },
};