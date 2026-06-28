import path from "path";
import fs from "fs-extra";
import { scanRepository } from "../utils/repoScanner.js";
import { parseImports, canParseImports } from "./importParser.js";
import type { DependencyGraph, DependencyNode } from "../core/types.js";

/**
 * DependencyGraphBuilder — builds a real, parsed dependency graph for a
 * repository: which files import which other files, and (the reverse,
 * computed once after parsing) which files are imported by which.
 *
 * Scope and honesty about limits:
 * - Only JS/TS/JSX/TSX/MJS/CJS imports are actually parsed (importParser.ts
 *   uses the real TypeScript compiler API). Files in other languages are
 *   recorded in the graph as nodes with `unparsed: true` and empty edges —
 *   they're not silently dropped from the node list, but their actual
 *   import relationships are genuinely unknown to this tool, and the
 *   graph says so rather than reporting zero dependencies as if that
 *   were a parsed fact.
 * - Path resolution mimics Node's CommonJS/ESM resolution closely enough
 *   for typical repos: tries the specifier as written, then strips a
 *   trailing .js/.jsx/.mjs/.cjs (handling TypeScript's convention of
 *   writing "./foo.js" in source files that import "./foo.ts" — the
 *   specifier names the COMPILED output's extension, not the source
 *   file's actual one) and retries with each of .ts/.tsx/.js/.jsx/.mjs/.cjs
 *   appended, then as a directory with an index.* file. It does NOT read
 *   tsconfig.json path aliases (e.g. "@/foo") — an aliased import that
 *   doesn't resolve to a real file on disk becomes an unresolved edge,
 *   recorded but not linked to a node.
 */

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

// TypeScript's ESM convention: source .ts files write import specifiers
// ending in .js (e.g. import "./foo.js") because that's the extension the
// COMPILED output will have — but the actual source file on disk is
// "./foo.ts", not "./foo.js". Stripping a JS-family extension before
// resolution (and trying the TS-source extensions first) is required for
// resolution to work on a TypeScript repo's own source tree, which is
// the overwhelmingly common case this tool will be pointed at.
const JS_FAMILY_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs"];

function stripJsExtension(specifier: string): string {
  for (const ext of JS_FAMILY_EXTENSIONS) {
    if (specifier.endsWith(ext)) return specifier.slice(0, -ext.length);
  }
  return specifier;
}

async function resolveRelativeImport(fromFile: string, specifier: string): Promise<string | null> {
  const baseDir = path.dirname(fromFile);
  const candidatePath = path.resolve(baseDir, specifier);

  // 1. Exact match (specifier already includes an extension that's
  //    actually present on disk — e.g. a repo with real compiled .js files)
  if (await fs.pathExists(candidatePath)) {
    const stat = await fs.stat(candidatePath);
    if (stat.isFile()) return candidatePath;
  }

  // 2. Strip a JS-family extension and retry resolution from the bare
  //    specifier — handles the TS-writes-.js-extensions convention.
  const bareSpecifier = stripJsExtension(specifier);
  const bareCandidatePath = path.resolve(baseDir, bareSpecifier);

  // 3. Try appending each known source extension to the bare path
  for (const ext of RESOLVE_EXTENSIONS) {
    const withExt = bareCandidatePath + ext;
    if (await fs.pathExists(withExt)) return withExt;
  }

  // 4. Try as a directory with an index file
  for (const ext of RESOLVE_EXTENSIONS) {
    const indexPath = path.join(bareCandidatePath, `index${ext}`);
    if (await fs.pathExists(indexPath)) return indexPath;
  }

  return null; // genuinely unresolved — alias, missing file, or non-JS target
}

export async function buildDependencyGraph(repoPath: string): Promise<DependencyGraph> {
  const absoluteRoot = path.resolve(repoPath);
  const allFiles = await scanRepository(absoluteRoot);

  const nodes = new Map<string, DependencyNode>();
  const skippedFiles: string[] = [];

  // Pass 1: parse each file's own imports, resolve relative ones to real files.
  for (const absFile of allFiles) {
    const relFile = path.relative(absoluteRoot, absFile);

    if (!canParseImports(absFile)) {
      // Still a node in the graph — just one whose edges are honestly unknown.
      nodes.set(relFile, {
        path: relFile,
        dependsOn: [],
        dependedOnBy: [],
        externalPackages: [],
        builtinModules: [],
        unparsed: true,
      });
      continue;
    }

    const parsed = await parseImports(absFile);
    const resolvedDeps: string[] = [];

    for (const specifier of parsed.relativeSpecifiers) {
      const resolved = await resolveRelativeImport(absFile, specifier);
      if (resolved) {
        resolvedDeps.push(path.relative(absoluteRoot, resolved));
      }
      // Unresolved relative imports (aliases, missing files) are silently
      // excluded from dependsOn rather than recorded as broken edges —
      // false edges would corrupt impact analysis worse than missing ones.
    }

    nodes.set(relFile, {
      path: relFile,
      dependsOn: [...new Set(resolvedDeps)],
      dependedOnBy: [], // filled in pass 2
      externalPackages: parsed.externalPackages,
      builtinModules: parsed.builtinModules,
      unparsed: false,
    });
  }

  // Pass 2: compute reverse edges now that every node exists.
  for (const node of nodes.values()) {
    for (const depPath of node.dependsOn) {
      const depNode = nodes.get(depPath);
      if (depNode) depNode.dependedOnBy.push(node.path);
    }
  }

  return {
    rootPath: absoluteRoot,
    nodes,
    skippedFiles,
    builtAt: Date.now(),
  };
}
