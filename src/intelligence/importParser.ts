import ts from "typescript";
import path from "path";
import fs from "fs-extra";
import { builtinModules } from "module";

/**
 * importParser — extracts module-level import relationships from a
 * single source file.
 *
 * Uses the real TypeScript compiler API (ts.createSourceFile) rather
 * than regex. This matters: a regex like /import .* from ['"](.+)['"]/
 * matches text inside comments and string literals, misses dynamic
 * import()/require() calls, and breaks on multi-line import statements.
 * The AST parser gets all of this right because it's the same parser
 * TypeScript itself uses — see the worked comparison in this phase's
 * design notes. ts.createSourceFile with `setParentNodes: true` works
 * on plain .js/.jsx too, not just .ts — TypeScript's parser is a
 * superset grammar, so this single function covers both.
 *
 * Only resolves RELATIVE imports ('./foo', '../bar') into graph edges.
 * Bare specifiers are split into two further categories:
 *   - Node built-in modules ('fs', 'path', 'node:crypto') — checked
 *     against Node's own authoritative `module.builtinModules` list,
 *     not a hand-maintained guess.
 *   - Real external npm packages ('react', '@scope/pkg') — these are
 *     what a person actually means by "what does this repo depend on";
 *     conflating them with built-ins would be misleading.
 * Neither becomes a graph edge — they're not part of this repo's
 * internal dependency graph — but both are recorded as useful context
 * rather than silently dropped.
 */

export interface ParsedImports {
  /** Relative imports/requires, NOT YET resolved to actual file paths (resolution happens in dependencyGraphBuilder.ts, which knows about the full file set and extension/index resolution rules). */
  relativeSpecifiers: string[];
  /** Real external npm packages, e.g. "react", "@modelcontextprotocol/sdk" */
  externalPackages: string[];
  /** Node built-in modules, e.g. "fs", "path", "crypto" — kept separate from externalPackages */
  builtinModules: string[];
}

const BUILTIN_MODULE_SET = new Set(builtinModules);

function isBuiltinSpecifier(specifier: string): boolean {
  const withoutNodePrefix = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
  return BUILTIN_MODULE_SET.has(withoutNodePrefix);
}

const JS_TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export function canParseImports(filePath: string): boolean {
  return JS_TS_EXTENSIONS.has(path.extname(filePath));
}

export async function parseImports(filePath: string): Promise<ParsedImports> {
  const relativeSpecifiers: string[] = [];
  const externalPackages: string[] = [];
  const builtins: string[] = [];

  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    return { relativeSpecifiers, externalPackages, builtinModules: builtins };
  }

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      path.basename(filePath),
      content,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      path.extname(filePath) === ".tsx" || path.extname(filePath) === ".jsx"
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS
    );
  } catch {
    // Malformed/unparseable file — return empty rather than throw,
    // so one bad file doesn't take down a whole-repo graph build.
    return { relativeSpecifiers, externalPackages, builtinModules: builtins };
  }

  const record = (specifier: string) => {
    if (specifier.startsWith(".") || specifier.startsWith("/")) {
      relativeSpecifiers.push(specifier);
    } else if (isBuiltinSpecifier(specifier)) {
      builtins.push(specifier.startsWith("node:") ? specifier.slice(5) : specifier);
    } else {
      // Normalize scoped packages to their package root: "@scope/pkg/sub" -> "@scope/pkg"
      const parts = specifier.split("/");
      const pkgName = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
      externalPackages.push(pkgName);
    }
  };

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      record(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      // export ... from './x' — a re-export is still a real dependency edge
      record(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if ((isRequire || isDynamicImport) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        record((node.arguments[0] as ts.StringLiteral).text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    relativeSpecifiers: [...new Set(relativeSpecifiers)],
    externalPackages: [...new Set(externalPackages)],
    builtinModules: [...new Set(builtins)],
  };
}
