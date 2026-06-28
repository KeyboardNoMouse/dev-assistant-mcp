import type { Workflow, ValidationResult } from "../core/types.js";

/**
 * WorkflowRepository — storage-agnostic contract for workflow persistence.
 *
 * The orchestration layer (workflow.ts, executor.ts) depends ONLY on this
 * interface, never on SqliteWorkflowRepository directly. Swapping SQLite
 * for Postgres later means writing one new class that implements this
 * interface and changing a single line in repositoryFactory.ts — nothing
 * in orchestration/ changes.
 */
export interface WorkflowRepository {
  /** Insert a new workflow (status="planning", no steps yet). */
  create(workflow: Workflow): void;

  /** Full upsert of a workflow and all its current steps. Called after every state transition. */
  save(workflow: Workflow): void;

  /** Fetch a single workflow with its steps, or undefined if not found. */
  getById(id: string): Workflow | undefined;

  /** List workflows, most recent first. Optionally filter by status. */
  list(opts?: { status?: Workflow["status"]; limit?: number }): Workflow[];

  /** Persist a validation result (and its sub-validator results) against a workflow. */
  saveValidationResult(workflowId: string, result: ValidationResult): void;

  /** Append one execution-log row. Fire-and-forget audit trail, never throws. */
  logEvent(entry: ExecutionLogEntry): void;

  /** Read back the execution log for a workflow, oldest first. */
  getExecutionLog(workflowId: string): ExecutionLogEntry[];

  /** Remove a workflow and all related rows (steps, validation, log). */
  remove(id: string): boolean;

  /** Aggregate counts used by the observability dashboard. */
  getMetricsSummary(): MetricsSummary;
}

export interface ExecutionLogEntry {
  workflowId: string;
  stepId?: string;
  tool?: string;
  event: string; // "step_started" | "step_failed" | "step_repaired" | "step_done" | "workflow_*" etc.
  detail?: string;
  correlationId?: string;
  createdAt: number;
}

export interface MetricsSummary {
  workflowsStarted: number;
  workflowsCompleted: number;
  workflowsFailed: number;
  workflowsActive: number;
  avgDurationMs: number | null;
  toolExecutionCounts: Record<string, number>;
  toolFailureCounts: Record<string, number>;
  totalRetries: number;
}
