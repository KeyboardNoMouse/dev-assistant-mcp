import { buildRepoContext } from "./frameworkDetector.js";
import type { RepoContext } from "../core/types.js";

/**
 * ContextEngine — the single source of truth for repository awareness.
 *
 * Caches context per repo path with TTL-based invalidation.
 * The orchestration planner queries this before decomposing any task.
 */

const CONTEXT_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface ContextEntry {
  context: RepoContext;
  cachedAt: number;
}

const contextCache = new Map<string, ContextEntry>();

export class ContextEngine {
  /**
   * Get (or build and cache) context for a repository.
   * Pass force=true to bypass the cache and re-index immediately.
   */
  async getContext(rootPath: string, force = false): Promise<RepoContext> {
    const cached = contextCache.get(rootPath);
    if (!force && cached && Date.now() - cached.cachedAt < CONTEXT_TTL_MS) {
      return cached.context;
    }

    const context = await buildRepoContext(rootPath);
    contextCache.set(rootPath, { context, cachedAt: Date.now() });
    return context;
  }

  /** Invalidate cached context for a repo (e.g., after write_file changes package.json). */
  invalidate(rootPath: string): void {
    contextCache.delete(rootPath);
  }

  /** Build a concise text summary for injection into planner prompts. */
  async summarize(rootPath: string): Promise<string> {
    const ctx = await this.getContext(rootPath);

    const lines = [
      `Language: ${ctx.language}`,
      `Frameworks: ${ctx.frameworks.length > 0 ? ctx.frameworks.join(", ") : "none detected"}`,
      `Package manager: ${ctx.packageManager}`,
      `Entry points: ${ctx.entryPoints.length > 0 ? ctx.entryPoints.join(", ") : "unknown"}`,
      `Build: ${ctx.hasBuild ? ctx.buildCommand : "none"}`,
      `Tests: ${ctx.hasTests ? `${ctx.testFramework ?? "unknown"} — ${ctx.testCommand}` : "none"}`,
      `Linter: ${ctx.hasLinter ? ctx.lintCommand : "none"}`,
    ];

    return lines.join("\n");
  }
}

/** Global context engine singleton. */
export const contextEngine = new ContextEngine();
