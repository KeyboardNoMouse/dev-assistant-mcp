import { registry } from "../core/registry.js";
import type { Workflow, WorkflowStep, MCPToolResult } from "../core/types.js";
import { askGemini } from "../utils/gemini.js";
import { getWorkflowRepository } from "../persistence/repositoryFactory.js";
import { withCorrelation } from "../observability/correlationContext.js";
import { metrics } from "../observability/metrics.js";
import { logger } from "../observability/logger.js";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ask Gemini to suggest a corrected set of args given a failed step + error.
 * Returns null if it can't suggest a fix (caller should give up or skip).
 */
async function suggestRepair(
  step: WorkflowStep,
  error: string
): Promise<Record<string, unknown> | null> {
  const prompt = `A workflow step failed. Suggest corrected tool arguments.

Tool: ${step.tool}
Original args: ${JSON.stringify(step.args, null, 2)}
Error: ${error}

Rules:
- Return ONLY a JSON object of corrected args — no markdown, no explanation
- If there is no reasonable fix, return: {"__unfixable__": true}
- Common fixes: correct a file path, adjust a command, fix a parameter name`;

  try {
    const raw = await askGemini(prompt, false);
    const cleaned = raw.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.__unfixable__) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Execute a single step against the tool registry, with retry + AI repair.
 * Mutates step.status, step.result, step.retryCount, step.error in place.
 */
async function executeStep(step: WorkflowStep, workflowId: string): Promise<void> {
  step.status = "running";
  step.startedAt = Date.now();
  const repo = getWorkflowRepository();
  repo.logEvent({
    workflowId,
    stepId: step.id,
    tool: step.tool,
    event: "step_started",
    detail: step.description,
    createdAt: Date.now(),
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Step-scoped correlation: this tool call's logs/metrics are tagged
      // with both the workflow ID (inherited from workflow.ts's outer
      // withCorrelation) and this specific step's ID, so a single step's
      // tool invocation is traceable on its own within a multi-step workflow.
      const result: MCPToolResult = await withCorrelation(
        () => registry.call(step.tool, step.args),
        { stepId: step.id }
      );

      if (result.isError) {
        const errorText = result.content.map((c) => c.text).join("\n");
        if (attempt < MAX_RETRIES) {
          step.retryCount++;
          metrics.recordRetry();
          repo.logEvent({
            workflowId,
            stepId: step.id,
            tool: step.tool,
            event: "step_failed_retrying",
            detail: errorText.slice(0, 500),
            createdAt: Date.now(),
          });
          const repairedArgs = await suggestRepair(step, errorText);
          metrics.recordRepairAttempt(!!repairedArgs);
          if (repairedArgs) {
            step.args = repairedArgs;
            repo.logEvent({
              workflowId,
              stepId: step.id,
              tool: step.tool,
              event: "step_repaired",
              detail: `New args: ${JSON.stringify(repairedArgs).slice(0, 300)}`,
              createdAt: Date.now(),
            });
            await sleep(RETRY_DELAY_MS);
            continue;
          }
        }
        step.status = "failed";
        step.error = errorText;
        step.result = result;
        step.finishedAt = Date.now();
        repo.logEvent({
          workflowId,
          stepId: step.id,
          tool: step.tool,
          event: "step_failed",
          detail: errorText.slice(0, 500),
          createdAt: Date.now(),
        });
        logger.warn("workflow_step_failed", { workflowId, stepId: step.id, tool: step.tool });
        return;
      }

      step.status = "done";
      step.result = result;
      step.finishedAt = Date.now();
      repo.logEvent({
        workflowId,
        stepId: step.id,
        tool: step.tool,
        event: "step_done",
        createdAt: Date.now(),
      });
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        step.retryCount++;
        metrics.recordRetry();
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      step.status = "failed";
      step.error = message;
      step.finishedAt = Date.now();
      repo.logEvent({
        workflowId,
        stepId: step.id,
        tool: step.tool,
        event: "step_failed",
        detail: message.slice(0, 500),
        createdAt: Date.now(),
      });
      logger.warn("workflow_step_failed", { workflowId, stepId: step.id, tool: step.tool, error: message });
      return;
    }
  }
}

/**
 * Execute all steps in a workflow sequentially.
 * Stops at first failed step (fail-fast) — the workflow engine decides rollback.
 * Fires the optional onStepUpdate callback after each step transition.
 */
export async function executeWorkflow(
  workflow: Workflow,
  onStepUpdate?: (workflow: Workflow) => void
): Promise<Workflow> {
  workflow.status = "running";

  for (const step of workflow.steps) {
    // status can be changed externally to "aborted" via workflowEngine.abort()
    if ((workflow.status as string) === "aborted") {
      step.status = "skipped";
      continue;
    }

    await executeStep(step, workflow.id);
    workflow.updatedAt = Date.now();
    onStepUpdate?.(workflow);

    if (step.status === "failed") {
      workflow.status = "failed";
      workflow.error = `Step failed: "${step.description}"\n${step.error ?? ""}`;
      return workflow;
    }
  }

  workflow.status = "validating";
  return workflow;
}
