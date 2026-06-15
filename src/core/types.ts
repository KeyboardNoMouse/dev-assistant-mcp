/**
 * Core shared types for the Agentic Developer Runtime.
 * All layers import from here — never from each other's internals.
 */

// ── MCP tool shape ──────────────────────────────────────────────────────────

export interface MCPContent {
  type: "text";
  text: string;
}

export interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export type ToolHandler = (args: unknown) => Promise<MCPToolResult>;

export interface ToolPlugin {
  definition: {
    name: string;
    description: string;
    inputSchema: object;
  };
  handler: ToolHandler;
}

// ── Workflow / orchestration ────────────────────────────────────────────────

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped" | "rolled_back";

export interface WorkflowStep {
  id: string;
  description: string;
  tool: string;
  args: Record<string, unknown>;
  status: StepStatus;
  result?: MCPToolResult;
  error?: string;
  retryCount: number;
  startedAt?: number;
  finishedAt?: number;
}

export type WorkflowStatus = "planning" | "running" | "validating" | "done" | "failed" | "aborted";

export interface Workflow {
  id: string;
  goal: string;
  repoPath: string;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
  validationResult?: ValidationResult;
  error?: string;
}

// ── Validation pipeline ─────────────────────────────────────────────────────

export type ValidatorKind = "build" | "test" | "lint" | "deps";

export interface ValidatorResult {
  kind: ValidatorKind;
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface ValidationResult {
  passed: boolean;
  validators: ValidatorResult[];
  summary: string;
}

// ── Context engine ──────────────────────────────────────────────────────────

export type Framework =
  | "react" | "next" | "vue" | "svelte" | "angular"
  | "express" | "fastify" | "nestjs" | "koa"
  | "fastapi" | "django" | "flask"
  | "spring" | "gin" | "rails"
  | "unknown";

export interface RepoContext {
  rootPath: string;
  language: string;
  frameworks: Framework[];
  packageManager: "npm" | "yarn" | "pnpm" | "pip" | "cargo" | "go" | "unknown";
  hasTests: boolean;
  testFramework: string | null;
  hasLinter: boolean;
  hasBuild: boolean;
  buildCommand: string | null;
  testCommand: string | null;
  lintCommand: string | null;
  entryPoints: string[];
  indexedAt: number;
}

// ── Safe execution ──────────────────────────────────────────────────────────

export type RiskLevel = "safe" | "moderate" | "dangerous" | "blocked";

export interface CommandRisk {
  level: RiskLevel;
  reason: string;
}
