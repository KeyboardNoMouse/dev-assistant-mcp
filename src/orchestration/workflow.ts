import { randomUUID } from "crypto";
import { planWorkflow } from "./planner.js";
import { executeWorkflow } from "./executor.js";
import type { Workflow, WorkflowStatus } from "../core/types.js";

/**
 * WorkflowEngine — manages the full lifecycle of developer task workflows.
 *
 * In-memory store keyed by workflow ID.
 * Phase 3 will migrate this to SQLite for persistence across restarts.
 */

const workflows = new Map<string, Workflow>();

export class WorkflowEngine {
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

    workflows.set(id, workflow);

    // Run the workflow asynchronously — callers use getWorkflow() to poll
    this.runAsync(workflow).catch((err) => {
      workflow.status = "failed";
      workflow.error = err instanceof Error ? err.message : String(err);
      workflow.updatedAt = Date.now();
    });

    return id;
  }

  private async runAsync(workflow: Workflow): Promise<void> {
    // Phase 1: Plan
    try {
      workflow.steps = await planWorkflow(workflow.goal, workflow.repoPath);
      workflow.updatedAt = Date.now();
    } catch (err) {
      workflow.status = "failed";
      workflow.error = `Planning failed: ${err instanceof Error ? err.message : String(err)}`;
      workflow.updatedAt = Date.now();
      return;
    }

    // Phase 2: Execute
    await executeWorkflow(workflow, (updated) => {
      // The object is mutated in place — updatedAt tick triggers UI polls
      updated.updatedAt = Date.now();
    });

    // Phase 3: Mark done or failed
    if (workflow.status === "validating") {
      workflow.status = "done";
      workflow.updatedAt = Date.now();
    }
  }

  getWorkflow(id: string): Workflow | undefined {
    return workflows.get(id);
  }

  listWorkflows(): Workflow[] {
    return Array.from(workflows.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Abort a running workflow. Any in-progress step completes naturally;
   * all subsequent steps are skipped.
   */
  abort(id: string): boolean {
    const workflow = workflows.get(id);
    if (!workflow) return false;
    if (!["planning", "running", "validating"].includes(workflow.status)) return false;
    workflow.status = "aborted";
    workflow.updatedAt = Date.now();
    return true;
  }

  /** Remove a completed/failed/aborted workflow from memory. */
  remove(id: string): boolean {
    return workflows.delete(id);
  }
}

/** Global singleton engine. */
export const workflowEngine = new WorkflowEngine();
