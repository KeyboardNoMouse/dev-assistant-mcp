import { buildDependencyGraph } from "./dependencyGraphBuilder.js";
import type { DependencyGraph } from "../core/types.js";

/**
 * DependencyGraphEngine — caches the built graph per repo path.
 *
 * Same TTL-cache shape as ContextEngine (context/contextEngine.ts) —
 * graph building means parsing every JS/TS file in the repo, which is
 * real work that shouldn't repeat on every single tool call within a
 * short window. The cache key is the repo's absolute path.
 */

const GRAPH_TTL_MS = 10 * 60 * 1000; // 10 minutes — same window as ContextEngine

interface GraphEntry {
  graph: DependencyGraph;
  cachedAt: number;
}

const graphCache = new Map<string, GraphEntry>();

export class DependencyGraphEngine {
  /**
   * Get (or build and cache) the dependency graph for a repository.
   * Pass force=true to bypass the cache and rebuild immediately —
   * recommended after any write_file/workflow step that could have
   * added/removed/changed imports.
   */
  async getGraph(rootPath: string, force = false): Promise<DependencyGraph> {
    const cached = graphCache.get(rootPath);
    if (!force && cached && Date.now() - cached.cachedAt < GRAPH_TTL_MS) {
      return cached.graph;
    }

    const graph = await buildDependencyGraph(rootPath);
    graphCache.set(rootPath, { graph, cachedAt: Date.now() });
    return graph;
  }

  /** Invalidate the cached graph for a repo. */
  invalidate(rootPath: string): void {
    graphCache.delete(rootPath);
  }
}

/** Global dependency graph engine singleton. */
export const dependencyGraphEngine = new DependencyGraphEngine();
