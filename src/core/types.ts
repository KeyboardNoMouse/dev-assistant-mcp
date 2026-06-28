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

// ── Dependency graph intelligence ───────────────────────────────────────────

export interface DependencyNode {
  /** Path relative to repo root, e.g. "src/auth/login.ts" */
  path: string;
  /** Files this file imports (relative paths, resolved), within the repo. */
  dependsOn: string[];
  /** Files that import this file (the reverse edge — computed once for the whole graph). */
  dependedOnBy: string[];
  /** Real external npm packages imported, e.g. ["react", "zod"] — excludes Node built-ins. */
  externalPackages: string[];
  /** Node built-in modules imported, e.g. ["fs", "path"] — kept separate from externalPackages. */
  builtinModules: string[];
  /** True if this file's imports could not be parsed (unsupported language, or a parse error). */
  unparsed: boolean;
}

export interface DependencyGraph {
  rootPath: string;
  nodes: Map<string, DependencyNode>;
  /** Files present in the repo scan but skipped (binary, unsupported extension, etc.) */
  skippedFiles: string[];
  builtAt: number;
}

export interface ImpactAnalysisResult {
  /** The file(s) the analysis was seeded from. */
  targetFiles: string[];
  /** Files that directly or transitively depend on the target(s) — i.e. would be affected by a change. */
  affectedFiles: AffectedFile[];
  /** Distinct top-level directories among affected files — a rough proxy for "which services/modules". */
  affectedAreas: string[];
  /** True if the BFS hit the configured depth limit before exhausting all paths (graph may be larger than reported). */
  truncated: boolean;
}

export interface AffectedFile {
  path: string;
  /** Number of hops from the target file(s) — 1 = direct dependent, 2 = depends on a direct dependent, etc. */
  distance: number;
}

// ── Validation pipeline ─────────────────────────────────────────────────────

export type ValidatorKind = "build" | "test" | "lint" | "deps" | "runtime";

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
  /** Best-effort detected command to start the app/server, if any. Null means none detected. */
  startCommand: string | null;
  /**
   * Best-effort GUESS at the port a started server would bind to —
   * from a .env PORT default or a framework convention. Null means no
   * guess could be made; callers must not treat null as "no port",
   * only as "unknown".
   */
  expectedPort: number | null;
  entryPoints: string[];
  indexedAt: number;
}

// ── Safe execution ──────────────────────────────────────────────────────────

export type RiskLevel = "safe" | "moderate" | "dangerous" | "blocked";

export interface CommandRisk {
  level: RiskLevel;
  reason: string;
}
