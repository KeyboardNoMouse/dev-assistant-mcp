import type { DependencyGraph } from "../core/types.js";

/**
 * ArchitectureMapGenerator — a deterministic, parsed-fact structural
 * summary of the codebase, distinct from analyze_architecture (which is
 * an LLM's qualitative opinion from skimmed file snippets).
 *
 * Everything here is a fact derived directly from the parsed import
 * graph: fan-in/fan-out counts, which files are most depended-upon
 * (a real signal of "central" or "risky to change" files), which
 * directories exist and how interconnected they are, and whether there
 * are circular dependencies — something an LLM glancing at file
 * contents has no reliable way to detect, but a graph traversal does
 * exactly and completely.
 */

export interface ModuleSummary {
  directory: string;
  fileCount: number;
  /** Distinct directories this module's files import from. */
  dependsOnModules: string[];
  /** Distinct directories that import from this module. */
  dependedOnByModules: string[];
}

export interface HighFanInFile {
  path: string;
  dependedOnByCount: number;
}

export interface CircularDependency {
  /** The cycle as a sequence of file paths, where the last implicitly depends back on the first. */
  cycle: string[];
}

export interface ArchitectureMap {
  totalFiles: number;
  parsedFiles: number;
  unparsedFiles: number;
  modules: ModuleSummary[];
  mostDependedOn: HighFanInFile[];
  circularDependencies: CircularDependency[];
  externalPackagesUsed: string[];
  builtinModulesUsed: string[];
}

function moduleOf(relPath: string): string {
  const parts = relPath.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
}

export function generateArchitectureMap(graph: DependencyGraph, topN = 10): ArchitectureMap {
  const moduleMap = new Map<string, { files: Set<string>; dependsOn: Set<string>; dependedOnBy: Set<string> }>();
  const externalPackages = new Set<string>();
  const builtinModules = new Set<string>();
  let unparsedFiles = 0;

  for (const node of graph.nodes.values()) {
    if (node.unparsed) unparsedFiles++;
    for (const pkg of node.externalPackages) externalPackages.add(pkg);
    for (const mod of node.builtinModules) builtinModules.add(mod);

    const mod = moduleOf(node.path);
    if (!moduleMap.has(mod)) moduleMap.set(mod, { files: new Set(), dependsOn: new Set(), dependedOnBy: new Set() });
    moduleMap.get(mod)!.files.add(node.path);

    for (const dep of node.dependsOn) {
      const depMod = moduleOf(dep);
      if (depMod !== mod) moduleMap.get(mod)!.dependsOn.add(depMod);
    }
    for (const dependent of node.dependedOnBy) {
      const dependentMod = moduleOf(dependent);
      if (dependentMod !== mod) moduleMap.get(mod)!.dependedOnBy.add(dependentMod);
    }
  }

  const modules: ModuleSummary[] = [...moduleMap.entries()]
    .map(([directory, data]) => ({
      directory,
      fileCount: data.files.size,
      dependsOnModules: [...data.dependsOn].sort(),
      dependedOnByModules: [...data.dependedOnBy].sort(),
    }))
    .sort((a, b) => b.fileCount - a.fileCount);

  const mostDependedOn: HighFanInFile[] = [...graph.nodes.values()]
    .map((n) => ({ path: n.path, dependedOnByCount: n.dependedOnBy.length }))
    .filter((f) => f.dependedOnByCount > 0)
    .sort((a, b) => b.dependedOnByCount - a.dependedOnByCount)
    .slice(0, topN);

  const circularDependencies = findCycles(graph);

  return {
    totalFiles: graph.nodes.size,
    parsedFiles: graph.nodes.size - unparsedFiles,
    unparsedFiles,
    modules,
    mostDependedOn,
    circularDependencies,
    externalPackagesUsed: [...externalPackages].sort(),
    builtinModulesUsed: [...builtinModules].sort(),
  };
}

/**
 * Standard DFS cycle detection (white/gray/black coloring) over the
 * dependsOn edges. Caps at MAX_CYCLES to avoid an enormous report on a
 * pathologically tangled repo — the first N cycles found are still
 * genuine, actionable findings; reporting all of them when there are
 * hundreds wouldn't add value over reporting a representative sample.
 */
function findCycles(graph: DependencyGraph): CircularDependency[] {
  const MAX_CYCLES = 25;
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const cycles: CircularDependency[] = [];
  const stack: string[] = [];

  for (const path of graph.nodes.keys()) color.set(path, WHITE);

  function dfs(nodePath: string): void {
    if (cycles.length >= MAX_CYCLES) return;
    color.set(nodePath, GRAY);
    stack.push(nodePath);

    const node = graph.nodes.get(nodePath);
    if (node) {
      for (const dep of node.dependsOn) {
        if (cycles.length >= MAX_CYCLES) break;
        const depColor = color.get(dep);
        if (depColor === GRAY) {
          // Found a cycle — extract just the cyclic portion of the stack.
          const cycleStart = stack.indexOf(dep);
          if (cycleStart !== -1) {
            cycles.push({ cycle: stack.slice(cycleStart) });
          }
        } else if (depColor === WHITE) {
          dfs(dep);
        }
      }
    }

    stack.pop();
    color.set(nodePath, BLACK);
  }

  for (const nodePath of graph.nodes.keys()) {
    if (cycles.length >= MAX_CYCLES) break;
    if (color.get(nodePath) === WHITE) dfs(nodePath);
  }

  return cycles;
}
