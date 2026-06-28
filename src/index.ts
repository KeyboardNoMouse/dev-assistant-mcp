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
import { sandboxStatusTool } from "./tools/sandboxStatus.js";
import { validateRepoTool } from "./tools/validateRepo.js";
import { metricsSnapshotTool } from "./tools/metricsSnapshot.js";
import { impactAnalysisTool } from "./tools/impactAnalysis.js";
import { dependencyGraphTool } from "./tools/dependencyGraph.js";
import { architectureMapTool } from "./tools/architectureMap.js";
import { repoContextTool } from "./tools/repoContext.js";
import { workflowRunTool } from "./orchestration/tools/workflowRun.js";
import { workflowStatusTool } from "./orchestration/tools/workflowStatus.js";
import { workflowAbortTool } from "./orchestration/tools/workflowAbort.js";
import { workflowHistoryTool } from "./orchestration/tools/workflowHistory.js";
import { recoverInterruptedWorkflows } from "./persistence/recovery.js";
import { getSandbox } from "./runtime/sandboxFactory.js";
import { logger } from "./observability/logger.js";
import { metrics } from "./observability/metrics.js";
import { startDashboard, stopDashboard } from "./observability/dashboard/server.js";

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
  // Phases 1-4: Persistence, sandboxing, validation, observability + orchestration
  runCommandTool,
  sandboxStatusTool,
  validateRepoTool,
  metricsSnapshotTool,
  impactAnalysisTool,
  dependencyGraphTool,
  architectureMapTool,
  repoContextTool,
  workflowRunTool,
  workflowStatusTool,
  workflowAbortTool,
  workflowHistoryTool,
] as any[]);

// ── Logging + metrics middleware ────────────────────────────────────────────────
registry
  .before((name, args) => {
    logger.info(`tool_call_started`, { tool: name });
  })
  .after((name, result, durationMs) => {
    metrics.recordToolCall(name, durationMs, !!result.isError);
    if (result.isError) {
      logger.warn(`tool_call_failed`, { tool: name, durationMs });
    } else {
      logger.info(`tool_call_finished`, { tool: name, durationMs });
    }
  });

// ── MCP server ────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "dev-assistant-mcp", version: "3.5.0" },
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
    logger.info("server_starting", { version: "3.5.0", toolCount: registry.size });

    const { recovered, ids } = recoverInterruptedWorkflows();
    if (recovered > 0) {
      logger.warn("workflows_recovered", { count: recovered, ids });
    }

    const { sandbox, warning } = await getSandbox();
    logger.info("sandbox_ready", { kind: sandbox.kind, isolated: !warning });
    if (warning) logger.warn("sandbox_fallback", { message: warning });

    const dashboard = startDashboard();
    if (dashboard) {
      logger.info("dashboard_started", { url: dashboard.url });
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("server_ready", {});
  } catch (error) {
    logger.error("server_startup_failed", { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
}

// Stop the dashboard's HTTP listener cleanly on shutdown — it's a separate
// server from the MCP stdio transport and won't be closed automatically.
function shutdown(signal: string): void {
  logger.info("server_shutting_down", { signal });
  stopDashboard();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main();
