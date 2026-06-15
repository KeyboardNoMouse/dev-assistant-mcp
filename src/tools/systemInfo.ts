import os from "os";

export const systemInfoTool = {
  definition: {
    name: "system_info",
    description: "Get system information: platform, CPU, memory, Node.js version, and uptime.",
    inputSchema: { type: "object", properties: {} },
  },

  handler: async () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const uptimeSec = os.uptime();
    const hours = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);

    const info = {
      platform: `${os.platform()} ${os.release()} (${os.arch()})`,
      hostname: os.hostname(),
      node_version: process.version,
      cpu: {
        model: os.cpus()[0]?.model ?? "unknown",
        cores: os.cpus().length,
      },
      memory: {
        total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        used: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        free: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        usage_percent: `${((usedMem / totalMem) * 100).toFixed(1)}%`,
      },
      uptime: `${hours}h ${minutes}m`,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
    };
  },
};
