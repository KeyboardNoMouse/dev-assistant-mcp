import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Core tools (no AI required)
import { readFileTool } from "./tools/readFile.js";
import { writeFileTool } from "./tools/writeFile.js";
import { listDirectoryTool } from "./tools/listDirectory.js";
import { summarizeRepoTool } from "./tools/summarizeRepo.js";
import { searchCodeTool } from "./tools/searchCode.js";
import { systemInfoTool } from "./tools/systemInfo.js";
import { gitStatusTool, gitDiffTool, gitLogTool } from "./tools/gitTools.js";

// AI-powered tools (require GEMINI_API_KEY)
import { analyzeCodeTool } from "./tools/analyzeCode.js";
import { analyzeArchitectureTool } from "./tools/analyzeArchitecture.js";
import { refactorCodeTool } from "./tools/refactorCode.js";
import { securityScanTool } from "./tools/securityScan.js";
import { semanticSearchTool } from "./tools/semanticSearch.js";
import { explainErrorTool } from "./tools/explainError.js";

const server = new Server(
  { name: "dev-assistant-mcp", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

const tools = [
  // Core
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  summarizeRepoTool,
  searchCodeTool,
  systemInfoTool,
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  // AI-powered
  analyzeCodeTool,
  analyzeArchitectureTool,
  refactorCodeTool,
  securityScanTool,
  semanticSearchTool,
  explainErrorTool,
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => t.definition),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.find((t) => t.definition.name === request.params.name);

  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  return await tool.handler(request.params.arguments || {});
});

async function main() {
  try {
    console.error("Starting Dev Assistant MCP Server v2.0.0...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Dev Assistant MCP Server ready.");
  } catch (error) {
    console.error("Fatal MCP Startup Error:", error);
    process.exit(1);
  }
}

main();
