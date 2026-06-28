import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

/**
 * Correlation context — one ID per top-level MCP tool call (or workflow
 * run), automatically inherited by everything that runs inside it via
 * Node's AsyncLocalStorage. This is what lets logger.ts and metrics.ts
 * tag every line/event with a correlationId without every function in
 * the call chain needing an explicit `correlationId` parameter.
 *
 * Workflow steps get a DIFFERENT correlation ID per step execution
 * (not the workflow's own ID) so individual tool calls within a
 * workflow are traceable on their own, while still being linkable back
 * to the workflow via the `workflowId` field carried alongside it.
 */

export interface CorrelationContext {
  correlationId: string;
  workflowId?: string;
  stepId?: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

/** Run `fn` with a fresh correlation context, or inherit the caller's if one is active. */
export function withCorrelation<T>(fn: () => T, overrides: Partial<CorrelationContext> = {}): T {
  const existing = storage.getStore();
  const context: CorrelationContext = {
    correlationId: overrides.correlationId ?? existing?.correlationId ?? randomUUID(),
    workflowId: overrides.workflowId ?? existing?.workflowId,
    stepId: overrides.stepId ?? existing?.stepId,
  };
  return storage.run(context, fn);
}

/** Get the current correlation context, or undefined if called outside any tracked call. */
export function getCorrelation(): CorrelationContext | undefined {
  return storage.getStore();
}
