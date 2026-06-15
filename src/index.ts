import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { registry } from "./core/registry.js";

// ── Core tools (no AI required) ──────────────────────────────────────────────
import { readFileTool } from "./tools/readFile.js";
import { writeFileTool } from "./tools/writeFile.js";
import { listDirectoryTool } from "./tools/listDirectory.js";
import { summarizeRepoTool } from "./tools/summarizeRepo.js";
import { searchCodeTool } from "./tools/searchCode.js";
import { systemInfoTool } from "./tools/systemInfo.js";
import { gitStatusTool, gitDiffTool, gitLogTool } from "./tools/gitTools.js";

// ── AI-powered tools (require GEMINI_API_KEY) ────────────────────────────────
import { analyzeCodeTool } from "./tools/analyzeCode.js";
import { analyzeArchitectureTool } from "./tools/analyzeArchitecture.js";
import { refactorCodeTool } from "./tools/refactorCode.js";
import { securityScanTool } from "./tools/securityScan.js";
import { semanticSearchTool } from "./tools/semanticSearch.js";
import { explainErrorTool } from "./tools/explainError.js";

// ── Phase 1: New capabilities ────────────────────────────────────────────────
import { runCommandTool } from "./tools/runCommand.js";
import { repoContextTool } from "./tools/repoContext.js";
import { workflowRunTool } from "./orchestration/tools/workflowRun.js";
import { workflowStatusTool } from "./orchestration/tools/workflowStatus.js";
import { workflowAbortTool } from "./orchestration/tools/workflowAbort.js";

// ── Register all tools ───────────────────────────────────────────────────────
registry.registerMany([
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
  // Phase 1: Execution + orchestration
  runCommandTool,
  repoContextTool,
  workflowRunTool,
  workflowStatusTool,
  workflowAbortTool,
] as any[]);

// ── Logging middleware ────────────────────────────────────────────────────────
registry
  .before((name, _args) => {
    console.error(`[${new Date().toISOString()}] → ${name}`);
  })
  .after((name, result) => {
    const status = result.isError ? "ERROR" : "OK";
    console.error(`[${new Date().toISOString()}] ← ${name} [${status}]`);
  });

// ── MCP server ────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "dev-assistant-mcp", version: "3.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: registry.listDefinitions(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await registry.call(request.params.name, request.params.arguments ?? {});
  // Cast to SDK-expected shape — content items are compatible at runtime
  return result as any;
});

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
  try {
    console.error(`Starting Dev Assistant MCP Server v3.0.0 — ${registry.size} tools registered`);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Dev Assistant MCP Server ready.");
  } catch (error) {
    console.error("Fatal MCP Startup Error:", error);
    process.exit(1);
  }
}

main();
