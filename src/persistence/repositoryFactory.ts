import { getDb } from "./db.js";
import { SqliteWorkflowRepository } from "./sqliteWorkflowRepository.js";
import type { WorkflowRepository } from "./workflowRepository.js";

/**
 * repositoryFactory — the ONLY place that knows about SQLite.
 *
 * To move to Postgres later:
 *   1. Write PostgresWorkflowRepository implements WorkflowRepository
 *   2. Change the `new SqliteWorkflowRepository(...)` line below
 * Nothing in orchestration/ or persistence/recovery.ts needs to change,
 * since both depend on the WorkflowRepository interface only.
 */
let repository: WorkflowRepository | null = null;

export function getWorkflowRepository(): WorkflowRepository {
  if (!repository) {
    repository = new SqliteWorkflowRepository(getDb());
  }
  return repository;
}
