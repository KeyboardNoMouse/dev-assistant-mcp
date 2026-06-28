import { getCorrelation } from "./correlationContext.js";

/**
 * Structured logger.
 *
 * Writes one JSON object per line to stderr (NEVER stdout — stdout is the
 * MCP stdio transport channel; writing logs there would corrupt the
 * protocol stream, which is exactly why every existing console.error
 * call in this codebase already targets stderr, not stdout. This logger
 * preserves that constraint while adding structure).
 *
 * Each line automatically includes the active correlation/workflow/step
 * IDs from correlationContext.ts when present, so logs from concurrent
 * tool calls or workflow steps can be filtered/grouped without manual
 * tagging at each call site.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  const ctx = getCorrelation();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
    ...(ctx?.workflowId ? { workflowId: ctx.workflowId } : {}),
    ...(ctx?.stepId ? { stepId: ctx.stepId } : {}),
    ...fields,
  };
  process.stderr.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
