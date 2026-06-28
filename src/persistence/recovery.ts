import { getWorkflowRepository } from "./repositoryFactory.js";
import type { Workflow } from "../core/types.js";

/**
 * Recovery — runs once at server startup.
 *
 * A workflow can be on disk in "planning", "running", or "validating" status
 * for exactly one reason: the process died (crash, kill, restart) while it
 * was mid-flight. There is no in-memory executor left to finish it, and we
 * have no way to know whether the last step it recorded actually completed
 * on the filesystem/git side before the process died.
 *
 * Policy: mark these as "failed" with a clear "interrupted" error, rather
 * than silently resuming (which risks re-running a step that already
 * mutated the filesystem) or silently dropping them (which defeats the
 * point of persistence). The workflow's full step history — what ran,
 * what didn't — remains intact and queryable afterward.
 *
 * Resumable workflows are a deliberate non-goal for this phase: resuming
 * safely requires idempotency guarantees per-tool that don't exist yet
 * (e.g. write_file is not idempotent-safe to blindly re-run mid-step).
 */
export function recoverInterruptedWorkflows(): { recovered: number; ids: string[] } {
  const repo = getWorkflowRepository();
  const inFlight: Workflow[] = [
    ...repo.list({ status: "planning" }),
    ...repo.list({ status: "running" }),
    ...repo.list({ status: "validating" }),
  ];

  const ids: string[] = [];

  for (const workflow of inFlight) {
    workflow.status = "failed";
    workflow.error =
      "Interrupted: the server restarted while this workflow was in progress. " +
      "Steps marked 'done' below completed; review before retrying manually.";
    workflow.updatedAt = Date.now();

    // Any step still "running" at the moment of the crash never got a result —
    // mark it failed too, rather than leaving a misleading "running" status forever.
    for (const step of workflow.steps) {
      if (step.status === "running") {
        step.status = "failed";
        step.error = "Interrupted by server restart before completion.";
        step.finishedAt = Date.now();
      } else if (step.status === "pending") {
        step.status = "skipped";
      }
    }

    repo.save(workflow);
    repo.logEvent({
      workflowId: workflow.id,
      event: "workflow_interrupted",
      detail: "Marked failed during startup recovery after server restart.",
      createdAt: Date.now(),
    });

    ids.push(workflow.id);
  }

  return { recovered: ids.length, ids };
}
