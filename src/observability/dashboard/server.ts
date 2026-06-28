import http from "http";
import { metrics } from "../metrics.js";
import { getWorkflowRepository } from "../../persistence/repositoryFactory.js";
import { getSandbox } from "../../runtime/sandboxFactory.js";
import { logger } from "../logger.js";
import { DASHBOARD_HTML } from "./dashboardHtml.js";

/**
 * Observability dashboard — a small, separate HTTP server (default port
 * 4477, override with DEV_ASSISTANT_DASHBOARD_PORT) showing active/
 * completed/failed workflows, execution logs, validation results, and
 * metrics.
 *
 * Built on Node's built-in `http` module rather than adding express as a
 * dependency — this is a handful of JSON endpoints and one static page,
 * which doesn't need a web framework. Runs as a SEPARATE listener from
 * the MCP stdio server; the two are independent and either can be
 * disabled without affecting the other (set DEV_ASSISTANT_DASHBOARD=off
 * to skip starting it).
 *
 * Read-only by design: nothing here mutates workflow state.
 */

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(text);
}

async function handleApiRequest(pathname: string, res: http.ServerResponse): Promise<boolean> {
  const repo = getWorkflowRepository();

  if (pathname === "/api/metrics") {
    const live = metrics.getSnapshot();
    const persisted = repo.getMetricsSummary();
    sendJson(res, 200, { live, persisted });
    return true;
  }

  if (pathname === "/api/workflows") {
    const workflows = repo.list({ limit: 100 });
    sendJson(res, 200, { workflows });
    return true;
  }

  const workflowMatch = pathname.match(/^\/api\/workflows\/([^/]+)$/);
  if (workflowMatch) {
    const workflow = repo.getById(workflowMatch[1]);
    if (!workflow) {
      sendJson(res, 404, { error: "Workflow not found" });
      return true;
    }
    const log = repo.getExecutionLog(workflowMatch[1]);
    sendJson(res, 200, { workflow, executionLog: log });
    return true;
  }

  if (pathname === "/api/sandbox") {
    const { sandbox, warning } = await getSandbox();
    sendJson(res, 200, { kind: sandbox.kind, isolated: !warning, warning });
    return true;
  }

  return false;
}

let server: http.Server | null = null;

/**
 * Starts the dashboard's HTTP listener. Returns immediately with the
 * intended port/URL — `http.Server.listen()` binds asynchronously, so a
 * port conflict (EADDRINUSE) surfaces moments later via the 'error'
 * handler below, not as a thrown exception here. In that case this
 * function will have already returned a "success" result. This is a
 * deliberate, accepted tradeoff: the failure is still handled safely
 * (logged, doesn't crash the process, doesn't affect a separately
 * already-running dashboard instance on that port), it's just not
 * reflected in this function's synchronous return value. Treat the
 * dashboard as best-effort observability tooling, not a component
 * whose availability anything else depends on.
 */
export function startDashboard(): { port: number; url: string } | null {
  if ((process.env.DEV_ASSISTANT_DASHBOARD ?? "on").toLowerCase() === "off") {
    return null;
  }

  const port = Number(process.env.DEV_ASSISTANT_DASHBOARD_PORT ?? 4477);

  server = http.createServer((req, res) => {
    const pathname = (req.url ?? "/").split("?")[0];

    if (pathname.startsWith("/api/")) {
      handleApiRequest(pathname, res).then((handled) => {
        if (!handled) sendJson(res, 404, { error: "Not found" });
      }).catch((err) => {
        logger.error("dashboard_request_error", { pathname, error: err instanceof Error ? err.message : String(err) });
        sendJson(res, 500, { error: "Internal error" });
      });
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(DASHBOARD_HTML);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logger.warn("dashboard_port_in_use", { port });
    } else {
      logger.error("dashboard_server_error", { error: err.message });
    }
  });

  server.listen(port);

  return { port, url: `http://localhost:${port}` };
}

export function stopDashboard(): void {
  server?.close();
  server = null;
}
