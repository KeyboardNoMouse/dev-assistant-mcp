import fs from "fs-extra";
import { scanRepository } from "../utils/repoScanner.js";

export const securityScanTool = {
  definition: {
    name: "security_scan",
    description: "Scan repository for hardcoded secrets and security risks",

    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the repository root to scan",
        },
      },
      required: ["path"],
    },
  },

  handler: async ({ path }: any) => {
    try {
      const files = await scanRepository(path);

      const findings: string[] = [];

      const riskyPatterns = [
        "API_KEY",
        "SECRET",
        "PASSWORD",
        "TOKEN",
        "PRIVATE_KEY",
      ];

      for (const file of files) {
        const content = await fs.readFile(file, "utf-8");

        for (const pattern of riskyPatterns) {
          if (content.includes(pattern)) {
            findings.push(`${pattern} found in ${file}`);
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text:
              findings.length > 0
                ? findings.join("\n")
                : "No security risks found",
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
