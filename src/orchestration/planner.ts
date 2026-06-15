import { askGemini } from "../utils/gemini.js";
import { contextEngine } from "../context/contextEngine.js";
import type { WorkflowStep } from "../core/types.js";
import { randomUUID } from "crypto";

/**
 * TaskPlanner — converts a natural language goal into a concrete step graph.
 *
 * Each step maps to a specific MCP tool call with pre-filled arguments.
 * The planner uses repository context so it can make informed choices
 * (e.g., use `npm test` vs `pytest` based on the detected language).
 */

const AVAILABLE_TOOLS = `
- read_file(path): Read a file's contents
- write_file(path, content): Write content to a file (with .bak backup)
- list_directory(path): List directory contents
- search_code(path, query): Search for text/patterns in codebase
- git_status(path): Show current git status
- git_diff(path): Show uncommitted changes
- analyze_code(path, focus?): AI analysis of a file (focus: bugs/security/performance/architecture)
- analyze_architecture(path): AI review of whole repo architecture
- refactor_code(path, focus?): AI refactoring suggestions
- security_scan(path): Scan for secrets and vulnerabilities
- semantic_search(path, query): Find files by meaning
- run_command(command, cwd?, allow_moderate?): Run a shell command safely
- summarize_repo(path): Show repository tree and stats
`.trim();

const STEP_SCHEMA = `
Respond ONLY with a JSON array. No markdown, no preamble. Each element:
{
  "description": "one-sentence human description of this step",
  "tool": "exact_tool_name",
  "args": { "param": "value" }
}
`;

export async function planWorkflow(
  goal: string,
  repoPath: string
): Promise<WorkflowStep[]> {
  const contextSummary = await contextEngine.summarize(repoPath);

  const prompt = `You are an expert software engineering assistant planning how to accomplish a development task.

REPOSITORY CONTEXT:
${contextSummary}
Repository path: ${repoPath}

AVAILABLE TOOLS:
${AVAILABLE_TOOLS}

TASK:
${goal}

Create a concrete, ordered plan of tool calls to accomplish this task. 
Rules:
- Use the actual repository path (${repoPath}) in path arguments
- Prefer reading/understanding before writing
- If code will be changed, include a validation step (run_command with build or test)
- Keep the plan focused — 3 to 8 steps maximum
- If the goal requires information you don't have yet, plan a read/search step first
- For run_command, use the correct commands for this repo's language/framework

${STEP_SCHEMA}`;

  const raw = await askGemini(prompt, false, "gemini-2.0-flash-lite");

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();

  let parsed: Array<{ description: string; tool: string; args: Record<string, unknown> }>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Planner returned unparseable JSON:\n${raw.slice(0, 500)}`);
  }

  if (!Array.isArray(parsed)) throw new Error("Planner response is not an array");

  return parsed.map((step) => ({
    id: randomUUID(),
    description: String(step.description ?? "Step"),
    tool: String(step.tool ?? ""),
    args: (step.args ?? {}) as Record<string, unknown>,
    status: "pending",
    retryCount: 0,
  }));
}
