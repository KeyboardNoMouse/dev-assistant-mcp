import type Database from "better-sqlite3";
import type {
  Workflow,
  WorkflowStep,
  WorkflowStatus,
  ValidationResult,
  ValidatorResult,
} from "../core/types.js";
import type {
  WorkflowRepository,
  ExecutionLogEntry,
  MetricsSummary,
} from "./workflowRepository.js";

// ── Row shapes (snake_case, matches schema in migrations/001_init.ts) ───────

interface WorkflowRow {
  id: string;
  goal: string;
  repo_path: string;
  status: string;
  error: string | null;
  created_at: number;
  updated_at: number;
}

interface StepRow {
  id: string;
  workflow_id: string;
  seq: number;
  description: string;
  tool: string;
  args_json: string;
  status: string;
  result_json: string | null;
  error: string | null;
  retry_count: number;
  started_at: number | null;
  finished_at: number | null;
}

interface ValidationResultRow {
  id: number;
  workflow_id: string;
  passed: number;
  summary: string;
  created_at: number;
}

interface ValidatorResultRow {
  id: number;
  validation_result_id: number;
  kind: string;
  passed: number;
  output: string;
  duration_ms: number;
}

function rowToStep(row: StepRow): WorkflowStep {
  return {
    id: row.id,
    description: row.description,
    tool: row.tool,
    args: JSON.parse(row.args_json) as Record<string, unknown>,
    status: row.status as WorkflowStep["status"],
    result: row.result_json ? JSON.parse(row.result_json) : undefined,
    error: row.error ?? undefined,
    retryCount: row.retry_count,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
  };
}

function rowToWorkflow(row: WorkflowRow, steps: WorkflowStep[], validationResult?: ValidationResult): Workflow {
  return {
    id: row.id,
    goal: row.goal,
    repoPath: row.repo_path,
    status: row.status as WorkflowStatus,
    steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    error: row.error ?? undefined,
    validationResult,
  };
}

export class SqliteWorkflowRepository implements WorkflowRepository {
  constructor(private readonly db: Database.Database) {}

  create(workflow: Workflow): void {
    this.db
      .prepare(
        `INSERT INTO workflows (id, goal, repo_path, status, error, created_at, updated_at)
         VALUES (@id, @goal, @repoPath, @status, @error, @createdAt, @updatedAt)`
      )
      .run({
        id: workflow.id,
        goal: workflow.goal,
        repoPath: workflow.repoPath,
        status: workflow.status,
        error: workflow.error ?? null,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      });
  }

  /**
   * Full upsert: workflow row + replace-all on steps.
   * Steps are small in number (3-8 per plan) so delete+reinsert per save()
   * is simpler and safer than diffing, and still cheap.
   */
  save(workflow: Workflow): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO workflows (id, goal, repo_path, status, error, created_at, updated_at)
           VALUES (@id, @goal, @repoPath, @status, @error, @createdAt, @updatedAt)
           ON CONFLICT(id) DO UPDATE SET
             status = excluded.status,
             error = excluded.error,
             updated_at = excluded.updated_at`
        )
        .run({
          id: workflow.id,
          goal: workflow.goal,
          repoPath: workflow.repoPath,
          status: workflow.status,
          error: workflow.error ?? null,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        });

      this.db.prepare(`DELETE FROM workflow_steps WHERE workflow_id = ?`).run(workflow.id);

      const insertStep = this.db.prepare(
        `INSERT INTO workflow_steps
           (id, workflow_id, seq, description, tool, args_json, status, result_json, error, retry_count, started_at, finished_at)
         VALUES (@id, @workflowId, @seq, @description, @tool, @argsJson, @status, @resultJson, @error, @retryCount, @startedAt, @finishedAt)`
      );

      workflow.steps.forEach((step, seq) => {
        insertStep.run({
          id: step.id,
          workflowId: workflow.id,
          seq,
          description: step.description,
          tool: step.tool,
          argsJson: JSON.stringify(step.args ?? {}),
          status: step.status,
          resultJson: step.result ? JSON.stringify(step.result) : null,
          error: step.error ?? null,
          retryCount: step.retryCount,
          startedAt: step.startedAt ?? null,
          finishedAt: step.finishedAt ?? null,
        });
      });
    });

    tx();
  }

  /** Fetch the most recently saved validation result for a workflow, if any. */
  private getLatestValidationResult(workflowId: string): ValidationResult | undefined {
    const resultRow = this.db
      .prepare(
        `SELECT * FROM validation_results WHERE workflow_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(workflowId) as ValidationResultRow | undefined;
    if (!resultRow) return undefined;

    const validatorRows = this.db
      .prepare(`SELECT * FROM validator_results WHERE validation_result_id = ?`)
      .all(resultRow.id) as ValidatorResultRow[];

    return {
      passed: resultRow.passed === 1,
      summary: resultRow.summary,
      validators: validatorRows.map((v) => ({
        kind: v.kind as ValidatorResult["kind"],
        passed: v.passed === 1,
        output: v.output,
        durationMs: v.duration_ms,
      })),
    };
  }

  getById(id: string): Workflow | undefined {
    const row = this.db
      .prepare(`SELECT * FROM workflows WHERE id = ?`)
      .get(id) as WorkflowRow | undefined;
    if (!row) return undefined;

    const stepRows = this.db
      .prepare(`SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY seq ASC`)
      .all(id) as StepRow[];

    return rowToWorkflow(row, stepRows.map(rowToStep), this.getLatestValidationResult(id));
  }

  list(opts?: { status?: WorkflowStatus; limit?: number }): Workflow[] {
    const limit = opts?.limit ?? 100;
    const rows = opts?.status
      ? (this.db
          .prepare(`SELECT * FROM workflows WHERE status = ? ORDER BY created_at DESC LIMIT ?`)
          .all(opts.status, limit) as WorkflowRow[])
      : (this.db
          .prepare(`SELECT * FROM workflows ORDER BY created_at DESC LIMIT ?`)
          .all(limit) as WorkflowRow[]);

    const stepStmt = this.db.prepare(
      `SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY seq ASC`
    );

    // Note: list() intentionally skips validation-result hydration for
    // performance — it's used for overview listings (workflow_status with
    // no id, dashboards) where step-level and validation-level detail
    // isn't shown anyway. Call getById() for the full picture of one workflow.
    return rows.map((row) => {
      const stepRows = stepStmt.all(row.id) as StepRow[];
      return rowToWorkflow(row, stepRows.map(rowToStep));
    });
  }

  saveValidationResult(workflowId: string, result: ValidationResult): void {
    const tx = this.db.transaction(() => {
      const insertResult = this.db.prepare(
        `INSERT INTO validation_results (workflow_id, passed, summary, created_at)
         VALUES (?, ?, ?, ?)`
      );
      const info = insertResult.run(workflowId, result.passed ? 1 : 0, result.summary, Date.now());
      const validationResultId = info.lastInsertRowid;

      const insertValidator = this.db.prepare(
        `INSERT INTO validator_results (validation_result_id, kind, passed, output, duration_ms)
         VALUES (?, ?, ?, ?, ?)`
      );

      for (const v of result.validators) {
        insertValidator.run(validationResultId, v.kind, v.passed ? 1 : 0, v.output, v.durationMs);
      }
    });

    tx();
  }

  logEvent(entry: ExecutionLogEntry): void {
    try {
      this.db
        .prepare(
          `INSERT INTO execution_log (workflow_id, step_id, tool, event, detail, correlation_id, created_at)
           VALUES (@workflowId, @stepId, @tool, @event, @detail, @correlationId, @createdAt)`
        )
        .run({
          workflowId: entry.workflowId,
          stepId: entry.stepId ?? null,
          tool: entry.tool ?? null,
          event: entry.event,
          detail: entry.detail ?? null,
          correlationId: entry.correlationId ?? null,
          createdAt: entry.createdAt,
        });
    } catch (err) {
      // Audit logging must never break the workflow it's observing.
      console.error("[execution_log] failed to write entry:", err);
    }
  }

  getExecutionLog(workflowId: string): ExecutionLogEntry[] {
    const rows = this.db
      .prepare(`SELECT * FROM execution_log WHERE workflow_id = ? ORDER BY created_at ASC`)
      .all(workflowId) as Array<{
      workflow_id: string;
      step_id: string | null;
      tool: string | null;
      event: string;
      detail: string | null;
      correlation_id: string | null;
      created_at: number;
    }>;

    return rows.map((r) => ({
      workflowId: r.workflow_id,
      stepId: r.step_id ?? undefined,
      tool: r.tool ?? undefined,
      event: r.event,
      detail: r.detail ?? undefined,
      correlationId: r.correlation_id ?? undefined,
      createdAt: r.created_at,
    }));
  }

  remove(id: string): boolean {
    const info = this.db.prepare(`DELETE FROM workflows WHERE id = ?`).run(id);
    return info.changes > 0;
  }

  getMetricsSummary(): MetricsSummary {
    const counts = this.db
      .prepare(
        `SELECT status, COUNT(*) as n FROM workflows GROUP BY status`
      )
      .all() as Array<{ status: string; n: number }>;

    const countOf = (statuses: string[]) =>
      counts.filter((c) => statuses.includes(c.status)).reduce((sum, c) => sum + c.n, 0);

    const workflowsStarted = counts.reduce((sum, c) => sum + c.n, 0);
    const workflowsCompleted = countOf(["done"]);
    const workflowsFailed = countOf(["failed"]);
    const workflowsActive = countOf(["planning", "running", "validating"]);

    const avgRow = this.db
      .prepare(
        `SELECT AVG(updated_at - created_at) as avg_ms FROM workflows WHERE status IN ('done','failed')`
      )
      .get() as { avg_ms: number | null };

    const toolRows = this.db
      .prepare(
        `SELECT tool, status, COUNT(*) as n FROM workflow_steps WHERE tool != '' GROUP BY tool, status`
      )
      .all() as Array<{ tool: string; status: string; n: number }>;

    const toolExecutionCounts: Record<string, number> = {};
    const toolFailureCounts: Record<string, number> = {};
    for (const row of toolRows) {
      toolExecutionCounts[row.tool] = (toolExecutionCounts[row.tool] ?? 0) + row.n;
      if (row.status === "failed") {
        toolFailureCounts[row.tool] = (toolFailureCounts[row.tool] ?? 0) + row.n;
      }
    }

    const retryRow = this.db
      .prepare(`SELECT SUM(retry_count) as total FROM workflow_steps`)
      .get() as { total: number | null };

    return {
      workflowsStarted,
      workflowsCompleted,
      workflowsFailed,
      workflowsActive,
      avgDurationMs: avgRow.avg_ms,
      toolExecutionCounts,
      toolFailureCounts,
      totalRetries: retryRow.total ?? 0,
    };
  }
}
