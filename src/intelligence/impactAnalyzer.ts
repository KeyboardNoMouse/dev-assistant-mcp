import path from "path";
import type { DependencyGraph, ImpactAnalysisResult, AffectedFile } from "../core/types.js";

/**
 * ImpactAnalyzer — answers "if I change file X, what else is affected?"
 *
 * This is a breadth-first traversal over the graph's `dependedOnBy` edges
 * (the reverse of `dependsOn`): starting from the target file(s), each
 * step finds files that import something already in the affected set.
 * Distance is hop count, so a caller can distinguish "directly imports
 * the changed file" (distance 1) from "imports something that imports
 * it" (distance 2), which matters for triaging how big a change really is.
 *
 * Bounded by maxDepth (default 5) — without a bound, a highly-connected
 * repo's impact radius can spider out to "everything", which isn't a
 * useful answer to "what should I review before merging this." When the
 * bound is hit, `truncated: true` signals there's more graph beyond what's
 * reported, rather than silently presenting a partial result as complete.
 */

const DEFAULT_MAX_DEPTH = 5;

export interface ImpactAnalysisOptions {
  maxDepth?: number;
}

function matchTargetFiles(graph: DependencyGraph, query: string): string[] {
  // Accept an exact relative path, an absolute path under the repo root,
  // or a fuzzy substring match (e.g. "auth" matches "src/auth/login.ts")
  // so the caller doesn't need to know the exact relative path up front.
  const normalizedQuery = query.replace(/\\/g, "/");

  if (graph.nodes.has(normalizedQuery)) return [normalizedQuery];

  const asRelativeFromAbsolute = path.isAbsolute(query)
    ? path.relative(graph.rootPath, query).replace(/\\/g, "/")
    : null;
  if (asRelativeFromAbsolute && graph.nodes.has(asRelativeFromAbsolute)) {
    return [asRelativeFromAbsolute];
  }

  const lowerQuery = normalizedQuery.toLowerCase();
  return [...graph.nodes.keys()].filter((p) => p.toLowerCase().includes(lowerQuery));
}

export function analyzeImpact(
  graph: DependencyGraph,
  query: string,
  options: ImpactAnalysisOptions = {}
): ImpactAnalysisResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const targetFiles = matchTargetFiles(graph, query);

  if (targetFiles.length === 0) {
    return { targetFiles: [], affectedFiles: [], affectedAreas: [], truncated: false };
  }

  const distances = new Map<string, number>();
  for (const t of targetFiles) distances.set(t, 0);

  let frontier = [...targetFiles];
  let depth = 0;
  let truncated = false;

  while (frontier.length > 0 && depth < maxDepth) {
    depth++;
    const nextFrontier: string[] = [];

    for (const filePath of frontier) {
      const node = graph.nodes.get(filePath);
      if (!node) continue;

      for (const dependent of node.dependedOnBy) {
        if (!distances.has(dependent)) {
          distances.set(dependent, depth);
          nextFrontier.push(dependent);
        }
      }
    }

    frontier = nextFrontier;
    if (depth === maxDepth && frontier.length > 0) truncated = true;
  }

  const affectedFiles: AffectedFile[] = [...distances.entries()]
    .filter(([filePath]) => !targetFiles.includes(filePath)) // exclude the targets themselves
    .map(([filePath, distance]) => ({ path: filePath, distance }))
    .sort((a, b) => a.distance - b.distance || a.path.localeCompare(b.path));

  // "Affected areas" = distinct top-level-ish directories among affected
  // files. Crude proxy for "which services/modules" since this codebase
  // has no formal service-boundary concept to query instead.
  const affectedAreas = [...new Set(affectedFiles.map((f) => topLevelArea(f.path)))].sort();

  return { targetFiles, affectedFiles, affectedAreas, truncated };
}

function topLevelArea(relPath: string): string {
  const parts = relPath.split("/");
  // A file directly in the repo root (e.g. "index.ts", no "/" at all) has
  // no containing directory to report.
  if (parts.length === 1) return "(root)";
  // Otherwise the "area" is everything except the filename itself —
  // e.g. "src/runtime/commandRiskAnalyzer.ts" -> "src/runtime",
  // "src/index.ts" -> "src" (NOT "src/index.ts" — the filename is not a directory).
  return parts.slice(0, -1).join("/");
}
