import type Database from "better-sqlite3";

/**
 * Migration 001 — initial schema.
 *
 * Mirrors core/types.ts exactly:
 *   Workflow        -> workflows
 *   WorkflowStep[]   -> workflow_steps (FK -> workflows.id)
 *   ValidationResult -> validation_results (FK -> workflows.id)
 *   ValidatorResult[] -> validator_results (FK -> validation_results.id)
 *
 * A separate `execution_log` table captures every step transition
 * (not just the latest state) so failure history survives even after
 * a step is retried/repaired and overwritten in `workflow_steps`.
 */
export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id            TEXT PRIMARY KEY,
      goal          TEXT NOT NULL,
      repo_path     TEXT NOT NULL,
      status        TEXT NOT NULL,
      error         TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
    CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at);

    CREATE TABLE IF NOT EXISTS workflow_steps (
      id            TEXT PRIMARY KEY,
      workflow_id   TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      seq           INTEGER NOT NULL,        -- order within the workflow
      description   TEXT NOT NULL,
      tool          TEXT NOT NULL,
      args_json     TEXT NOT NULL,           -- JSON.stringify(step.args)
      status        TEXT NOT NULL,
      result_json   TEXT,                    -- JSON.stringify(step.result)
      error         TEXT,
      retry_count   INTEGER NOT NULL DEFAULT 0,
      started_at    INTEGER,
      finished_at   INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_steps_workflow_id ON workflow_steps(workflow_id);

    CREATE TABLE IF NOT EXISTS validation_results (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id   TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      passed        INTEGER NOT NULL,        -- 0/1
      summary       TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_validation_workflow_id ON validation_results(workflow_id);

    CREATE TABLE IF NOT EXISTS validator_results (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      validation_result_id  INTEGER NOT NULL REFERENCES validation_results(id) ON DELETE CASCADE,
      kind                  TEXT NOT NULL,   -- build | test | lint | deps | runtime
      passed                INTEGER NOT NULL,
      output                TEXT NOT NULL,
      duration_ms           INTEGER NOT NULL
    );

    -- Append-only audit trail: every step attempt, including ones later
    -- overwritten by retry/repair. Used for observability + debugging,
    -- independent of the "current state" tables above.
    CREATE TABLE IF NOT EXISTS execution_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id   TEXT NOT NULL,
      step_id       TEXT,
      tool          TEXT,
      event         TEXT NOT NULL,           -- e.g. step_started, step_failed, step_repaired, step_done
      detail        TEXT,
      correlation_id TEXT,
      created_at    INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_execlog_workflow_id ON execution_log(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_execlog_created_at ON execution_log(created_at);

    CREATE TABLE IF NOT EXISTS schema_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export const version = 1;
