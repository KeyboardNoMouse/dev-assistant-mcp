import { Server } from "@modelcontextprotocol/sdk/server/index.js";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { readFileTool } from "./tools/readFile.js";
import { summarizeRepoTool } from "./tools/summarizeRepo.js";
import { searchCodeTool } from "./tools/searchCode.js";
import { systemInfoTool } from "./tools/systemInfo.js";
import { analyzeCodeTool } from "./tools/analyzeCode.js";
import { semanticSearchTool } from "./tools/semanticSearch.js";
import { analyzeArchitectureTool } from "./tools/analyzeArchitecture.js";
import { refactorCodeTool } from "./tools/refactorCode.js";
import { securityScanTool } from "./tools/securityScan.js";

const server = new Server(
  {
    name: "dev-assistant-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools = [
  readFileTool,
  summarizeRepoTool,
  searchCodeTool,
  systemInfoTool,
  analyzeCodeTool,
  semanticSearchTool,
  analyzeArchitectureTool,
  refactorCodeTool,
  securityScanTool,
];

server.setRequestHandler(
  ListToolsRequestSchema,
  async () => {
    return {
      tools: tools.map((tool) => tool.definition),
    };
  }
);

server.setRequestHandler(
  CallToolRequestSchema,
  async (request) => {
    try {
      const tool = tools.find(
        (t) =>
          t.definition.name ===
          request.params.name
      );

      if (!tool) {
        throw new Error(
          `Tool not found: ${request.params.name}`
        );
      }

      return await tool.handler(
        request.params.arguments || {}
      );
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Tool execution error: ${error.message}`,
          },
        ],
      };
    }
  }
);

async function main() {
  try {
    console.error(
      "Starting Dev Assistant MCP Server..."
    );

    const transport =
      new StdioServerTransport();

    console.error("Transport initialized");

    await server.connect(transport);

    console.error(
      "Dev Assistant MCP Server Connected"
    );
  } catch (error) {
    console.error(
      "Fatal MCP Startup Error:",
      error
    );

    process.exit(1);
  }
}

main();