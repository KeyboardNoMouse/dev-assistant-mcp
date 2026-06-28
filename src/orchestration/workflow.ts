import { randomUUID } from "crypto";
import { planWorkflow } from "./planner.js";
import { executeWorkflow } from "./executor.js";
import { getWorkflowRepository } from "../persistence/repositoryFactory.js";
import { contextEngine } from "../context/contextEngine.js";
import { runValidationPipeline } from "../validation/validationPipeline.js";
import { withCorrelation } from "../observability/correlationContext.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";
import type { Workflow, WorkflowStatus } from "../core/types.js";

/**
 * WorkflowEngine — manages the full lifecycle of developer task workflows.
 *
 * Durable store via WorkflowRepository (SQLite by default — see
 * persistence/repositoryFactory.ts). A small in-memory Map is kept ONLY as
 * a write-through cache holding the live object that executor.ts mutates
 * in place step-by-step during a single run; every mutation is flushed to
 * the repository immediately after, so the cache never holds state the
 * database doesn't also have. A server restart loses the cache (fine —
 * nothing is running anymore) but never loses the persisted history.
 */

const liveWorkflows = new Map<string, Workflow>();

export class WorkflowEngine {
  private get repo() {
    return getWorkflowRepository();
  }

  /**
   * Create, plan, and begin executing a workflow from a natural language goal.
   * Returns the workflow ID immediately — callers poll with getWorkflow().
   */
  async start(goal: string, repoPath: string): Promise<string> {
    const id = randomUUID();
    const now = Date.now();

    const workflow: Workflow = {
      id,
      goal,
      repoPath,
      status: "planning",
      steps: [],
      createdAt: now,
      updatedAt: now,
    };

    liveWorkflows.set(id, workflow);
    this.repo.create(workflow);
    this.repo.logEvent({ workflowId: id, event: "workflow_created", createdAt: now });
    metrics.recordWorkflowStarted();
    logger.info("workflow_started", { workflowId: id, goal });

    // Run the workflow asynchronously — callers use getWorkflow() to poll.
    // Wrapped in withCorrelation so every log line and metric recorded by
    // planWorkflow/executeWorkflow/runValidationPipeline — and every tool
    // call they make through registry.call() — automatically carries this
    // workflow's ID, without any of those functions needing to know about
    // correlation tracking themselves.
    withCorrelation(() => this.runAsync(workflow), { workflowId: id }).catch((err) => {
      workflow.status = "failed";
      workflow.error = err instanceof Error ? err.message : String(err);
      workflow.updatedAt = Date.now();
      this.persist(workflow);
      metrics.recordWorkflowFinished(false);
    });

    return id;
  }

  private persist(workflow: Workflow): void {
    this.repo.save(workflow);
  }

  private async runAsync(workflow: Workflow): Promise<void> {
    // Phase 1: Plan
    try {
      workflow.steps = await planWorkflow(workflow.goal, workflow.repoPath);
      workflow.updatedAt = Date.now();
      this.persist(workflow);
      this.repo.logEvent({
        workflowId: workflow.id,
        event: "workflow_planned",
        detail: `${workflow.steps.length} steps`,
        createdAt: Date.now(),
      });
    } catch (err) {
      workflow.status = "failed";
      workflow.error = `Planning failed: ${err instanceof Error ? err.message : String(err)}`;
      workflow.updatedAt = Date.now();
      this.persist(workflow);
      metrics.recordWorkflowFinished(false);
      logger.warn("workflow_planning_failed", { workflowId: workflow.id, error: workflow.error });
      return;
    }

    // Phase 2: Execute
    await executeWorkflow(workflow, (updated) => {
      // The object is mutated in place — updatedAt tick triggers UI polls
      updated.updatedAt = Date.now();
      this.persist(updated);
    });

    // Phase 3: Validate (only reached if execution didn't already fail/abort)
    if (workflow.status === "validating") {
      try {
        // force=true: workflow steps likely just wrote files; a stale
        // cached context could validate against pre-change build/test commands.
        const context = await contextEngine.getContext(workflow.repoPath, true);
        const validationResult = await runValidationPipeline(context);

        workflow.validationResult = validationResult;
        this.repo.saveValidationResult(workflow.id, validationResult);
        this.repo.logEvent({
          workflowId: workflow.id,
          event: validationResult.passed ? "validation_passed" : "validation_failed",
          detail: validationResult.summary,
          createdAt: Date.now(),
        });

        workflow.status = validationResult.passed ? "done" : "failed";
        if (!validationResult.passed) {
          workflow.error = `Validation failed: ${validationResult.summary}`;
        }
      } catch (err) {
        // A validation pipeline crash should not silently report "done" —
        // surface it as a failure just like any other unexpected error.
        workflow.status = "failed";
        workflow.error = `Validation pipeline error: ${err instanceof Error ? err.message : String(err)}`;
        this.repo.logEvent({
          workflowId: workflow.id,
          event: "validation_error",
          detail: workflow.error,
          createdAt: Date.now(),
        });
      }
      workflow.updatedAt = Date.now();
    }
    this.persist(workflow);
    metrics.recordWorkflowFinished(workflow.status === "done");
    logger.info("workflow_finished", { workflowId: workflow.id, status: workflow.status });
    liveWorkflows.delete(workflow.id);
  }

  /**
   * Look up a workflow. Checks the live in-memory cache first (covers an
   * in-flight workflow mid-mutation between persist() calls), then falls
   * back to the repository — which is the only source for anything from
   * a previous server process.
   */
  getWorkflow(id: string): Workflow | undefined {
    return liveWorkflows.get(id) ?? this.repo.getById(id);
  }

  listWorkflows(): Workflow[] {
    // Persisted state already reflects every live workflow (we persist on
    // every tick), so reading from the repository alone is both simpler
    // and guaranteed consistent — no merge logic needed.
    return this.repo.list({ limit: 200 });
  }

  /**
   * Abort a running workflow. Any in-progress step completes naturally;
   * all subsequent steps are skipped.
   */
  abort(id: string): boolean {
    const workflow = liveWorkflows.get(id) ?? this.repo.getById(id);
    if (!workflow) return false;
    if (!["planning", "running", "validating"].includes(workflow.status)) return false;
    workflow.status = "aborted";
    workflow.updatedAt = Date.now();
    this.persist(workflow);
    this.repo.logEvent({ workflowId: id, event: "workflow_aborted", createdAt: Date.now() });
    return true;
  }

  /** Remove a completed/failed/aborted workflow permanently. */
  remove(id: string): boolean {
    liveWorkflows.delete(id);
    return this.repo.remove(id);
  }
}

/** Global singleton engine. */
export const workflowEngine = new WorkflowEngine();
