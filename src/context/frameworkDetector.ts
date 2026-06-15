import fs from "fs-extra";
import path from "path";
import type { Framework, RepoContext } from "../core/types.js";

// ── Detection rules ──────────────────────────────────────────────────────────

interface FrameworkRule {
  framework: Framework;
  checks: Array<{
    type: "dep" | "devDep" | "file" | "fileContent";
    value: string;
  }>;
}

const FRAMEWORK_RULES: FrameworkRule[] = [
  { framework: "next", checks: [{ type: "dep", value: "next" }] },
  { framework: "react", checks: [{ type: "dep", value: "react" }] },
  { framework: "vue", checks: [{ type: "dep", value: "vue" }] },
  { framework: "svelte", checks: [{ type: "dep", value: "svelte" }] },
  { framework: "angular", checks: [{ type: "dep", value: "@angular/core" }] },
  { framework: "nestjs", checks: [{ type: "dep", value: "@nestjs/core" }] },
  { framework: "express", checks: [{ type: "dep", value: "express" }] },
  { framework: "fastify", checks: [{ type: "dep", value: "fastify" }] },
  { framework: "koa", checks: [{ type: "dep", value: "koa" }] },
  { framework: "fastapi", checks: [{ type: "file", value: "requirements.txt" }, { type: "fileContent", value: "fastapi" }] },
  { framework: "django", checks: [{ type: "fileContent", value: "django" }] },
  { framework: "flask", checks: [{ type: "fileContent", value: "flask" }] },
  { framework: "spring", checks: [{ type: "file", value: "pom.xml" }] },
  { framework: "gin", checks: [{ type: "file", value: "go.mod" }, { type: "fileContent", value: "gin-gonic/gin" }] },
  { framework: "rails", checks: [{ type: "file", value: "Gemfile" }, { type: "fileContent", value: "rails" }] },
];

// ── Package manager detection ────────────────────────────────────────────────

async function detectPackageManager(rootPath: string): Promise<RepoContext["packageManager"]> {
  if (await fs.pathExists(path.join(rootPath, "pnpm-lock.yaml"))) return "pnpm";
  if (await fs.pathExists(path.join(rootPath, "yarn.lock"))) return "yarn";
  if (await fs.pathExists(path.join(rootPath, "package-lock.json"))) return "npm";
  if (await fs.pathExists(path.join(rootPath, "requirements.txt")) ||
      await fs.pathExists(path.join(rootPath, "pyproject.toml"))) return "pip";
  if (await fs.pathExists(path.join(rootPath, "Cargo.toml"))) return "cargo";
  if (await fs.pathExists(path.join(rootPath, "go.mod"))) return "go";
  return "unknown";
}

// ── Script extraction ────────────────────────────────────────────────────────

interface Scripts {
  buildCommand: string | null;
  testCommand: string | null;
  lintCommand: string | null;
}

async function extractScripts(rootPath: string): Promise<Scripts> {
  const pkgPath = path.join(rootPath, "package.json");
  if (await fs.pathExists(pkgPath)) {
    try {
      const pkg = await fs.readJson(pkgPath);
      const scripts: Record<string, string> = pkg.scripts ?? {};
      return {
        buildCommand: scripts.build ? `npm run build` : null,
        testCommand: scripts.test ? `npm test` : scripts.jest ? `npx jest` : null,
        lintCommand: scripts.lint ? `npm run lint` : null,
      };
    } catch {
      // fall through
    }
  }

  // Python
  if (await fs.pathExists(path.join(rootPath, "pytest.ini")) ||
      await fs.pathExists(path.join(rootPath, "pyproject.toml"))) {
    return { buildCommand: null, testCommand: "pytest", lintCommand: "ruff check ." };
  }

  // Go
  if (await fs.pathExists(path.join(rootPath, "go.mod"))) {
    return { buildCommand: "go build ./...", testCommand: "go test ./...", lintCommand: "golangci-lint run" };
  }

  // Rust
  if (await fs.pathExists(path.join(rootPath, "Cargo.toml"))) {
    return { buildCommand: "cargo build", testCommand: "cargo test", lintCommand: "cargo clippy" };
  }

  return { buildCommand: null, testCommand: null, lintCommand: null };
}

// ── Primary language detection ───────────────────────────────────────────────

async function detectLanguage(rootPath: string): Promise<string> {
  if (await fs.pathExists(path.join(rootPath, "tsconfig.json"))) return "TypeScript";
  if (await fs.pathExists(path.join(rootPath, "package.json"))) return "JavaScript";
  if (await fs.pathExists(path.join(rootPath, "requirements.txt")) ||
      await fs.pathExists(path.join(rootPath, "pyproject.toml"))) return "Python";
  if (await fs.pathExists(path.join(rootPath, "go.mod"))) return "Go";
  if (await fs.pathExists(path.join(rootPath, "Cargo.toml"))) return "Rust";
  if (await fs.pathExists(path.join(rootPath, "pom.xml"))) return "Java";
  if (await fs.pathExists(path.join(rootPath, "Gemfile"))) return "Ruby";
  return "Unknown";
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function detectFrameworks(rootPath: string): Promise<Framework[]> {
  let packageJson: Record<string, unknown> = {};
  let requirementsTxt = "";

  try {
    packageJson = await fs.readJson(path.join(rootPath, "package.json"));
  } catch { /* no package.json */ }

  try {
    requirementsTxt = await fs.readFile(path.join(rootPath, "requirements.txt"), "utf-8");
  } catch { /* no requirements.txt */ }

  const allDeps = {
    ...((packageJson.dependencies as Record<string, unknown>) ?? {}),
    ...((packageJson.devDependencies as Record<string, unknown>) ?? {}),
  };

  const detected: Framework[] = [];

  for (const rule of FRAMEWORK_RULES) {
    let matched = false;
    for (const check of rule.checks) {
      if (check.type === "dep" && allDeps[check.value]) { matched = true; break; }
      if (check.type === "devDep" && allDeps[check.value]) { matched = true; break; }
      if (check.type === "file" && await fs.pathExists(path.join(rootPath, check.value))) { matched = true; break; }
      if (check.type === "fileContent" && requirementsTxt.toLowerCase().includes(check.value.toLowerCase())) {
        matched = true; break;
      }
    }
    if (matched && !detected.includes(rule.framework)) detected.push(rule.framework);
  }

  return detected;
}

export async function buildRepoContext(rootPath: string): Promise<RepoContext> {
  const [language, frameworks, packageManager, scripts] = await Promise.all([
    detectLanguage(rootPath),
    detectFrameworks(rootPath),
    detectPackageManager(rootPath),
    extractScripts(rootPath),
  ]);

  const hasTests = scripts.testCommand !== null;
  const hasLinter = scripts.lintCommand !== null;
  const hasBuild = scripts.buildCommand !== null;

  // Detect test framework
  let testFramework: string | null = null;
  try {
    const pkg = await fs.readJson(path.join(rootPath, "package.json"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (allDeps.jest) testFramework = "jest";
    else if (allDeps.vitest) testFramework = "vitest";
    else if (allDeps.mocha) testFramework = "mocha";
  } catch { /* no package.json */ }
  if (!testFramework && await fs.pathExists(path.join(rootPath, "pytest.ini"))) testFramework = "pytest";

  // Simple entry point detection
  const entryPoints: string[] = [];
  const candidates = ["src/index.ts", "src/index.js", "src/main.ts", "src/main.js", "index.ts", "index.js", "main.py", "app.py", "main.go"];
  for (const c of candidates) {
    if (await fs.pathExists(path.join(rootPath, c))) entryPoints.push(c);
  }

  return {
    rootPath,
    language,
    frameworks,
    packageManager,
    hasTests,
    testFramework,
    hasLinter,
    hasBuild,
    buildCommand: scripts.buildCommand,
    testCommand: scripts.testCommand,
    lintCommand: scripts.lintCommand,
    entryPoints,
    indexedAt: Date.now(),
  };
}
