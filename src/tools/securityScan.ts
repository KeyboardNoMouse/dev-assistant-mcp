import path from "path";
import { z } from "zod";
import { scanRepository } from "../utils/repoScanner.js";
import { readFileCached } from "../utils/fileCache.js";
import { withErrorBoundary } from "../core/errors.js";

const schema = z.object({ path: z.string().min(1) });

const SECURITY_PATTERNS: Array<{ label: string; regex: RegExp; severity: "HIGH" | "MEDIUM" | "LOW" }> = [
  { label: "Hardcoded API key", regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"` + "`" + `][a-zA-Z0-9\-_]{16,}['"` + "`" + `]/gi, severity: "HIGH" },
  { label: "Hardcoded password", regex: /(?:password|passwd|pwd)\s*[:=]\s*['"` + "`" + `][^'"` + "`" + `\s]{6,}['"` + "`" + `]/gi, severity: "HIGH" },
  { label: "Hardcoded secret/token", regex: /(?:secret|token|auth[_-]?token|access[_-]?token)\s*[:=]\s*['"` + "`" + `][a-zA-Z0-9\-_\.]{16,}['"` + "`" + `]/gi, severity: "HIGH" },
  { label: "Hardcoded private key", regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE KEY-----/gi, severity: "HIGH" },
  { label: "AWS Access Key ID", regex: /AKIA[0-9A-Z]{16}/g, severity: "HIGH" },
  { label: "AWS Secret Access Key", regex: /aws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*['"` + "`" + `][a-zA-Z0-9/+=]{40}['"` + "`" + `]/gi, severity: "HIGH" },
  { label: "JWT token literal", regex: /eyJ[a-zA-Z0-9\-_]+\.eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/g, severity: "HIGH" },
  { label: "Database connection string with credentials", regex: /(?:mongodb|postgres|mysql|redis|mssql):\/\/[^:]+:[^@\s]+@/gi, severity: "HIGH" },
  { label: "Suspicious env fallback", regex: /process\.env\.\w+\s*\|\|\s*['"` + "`" + `][a-zA-Z0-9]{8,}['"` + "`" + `]/g, severity: "MEDIUM" },
  { label: "eval() usage", regex: /\beval\s*\(/g, severity: "MEDIUM" },
  { label: "dangerouslySetInnerHTML", regex: /dangerouslySetInnerHTML/g, severity: "MEDIUM" },
  { label: "SQL string concatenation (possible injection)", regex: /(?:SELECT|INSERT|UPDATE|DELETE)\s+.*\+\s*(?:req\.|params\.|query\.|\w+Id)/gi, severity: "MEDIUM" },
  { label: "TODO/FIXME security note", regex: /\/\/\s*(?:TODO|FIXME|HACK|XXX|SECURITY).*(?:auth|password|key|secret|token)/gi, severity: "LOW" },
];

const SKIP_FILENAMES = [".env.example", "env.example", ".env.template", "README.md"];

export const securityScanTool = {
  definition: {
    name: "security_scan",
    description:
      "Scan a repository for hardcoded secrets, API keys, passwords, JWTs, AWS credentials, dangerous code patterns, and SQL injection risks. Reports severity level and line numbers.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Path to the repository root to scan" } },
      required: ["path"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { path: rootPath } = schema.parse(args);
    const files = await scanRepository(rootPath);
    const findings: Array<{ severity: string; file: string; line: number; label: string; preview: string }> = [];

    for (const file of files) {
      if (SKIP_FILENAMES.includes(path.basename(file))) continue;
      let content: string;
      try { content = await readFileCached(file); } catch { continue; }

      const lines = content.split("\n");
      for (const { label, regex, severity } of SECURITY_PATTERNS) {
        for (let i = 0; i < lines.length; i++) {
          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            const preview = lines[i].trim().slice(0, 100).replace(/(['"` + "`" + `])[a-zA-Z0-9\-_\.\\/+=]{8,}(['"` + "`" + `])/g, "$1[REDACTED]$2");
            findings.push({ severity, file: path.relative(rootPath, file), line: i + 1, label, preview });
          }
        }
      }
    }

    if (findings.length === 0) {
      return { content: [{ type: "text", text: `✅ No security issues found across ${files.length} files.` }] };
    }

    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    findings.sort((a, b) => order[a.severity as keyof typeof order] - order[b.severity as keyof typeof order]);

    const high = findings.filter((f) => f.severity === "HIGH");
    const medium = findings.filter((f) => f.severity === "MEDIUM");
    const low = findings.filter((f) => f.severity === "LOW");

    const formatGroup = (label: string, items: typeof findings) =>
      items.length === 0
        ? ""
        : `\n${label} (${items.length})\n` +
          items.map((f) => `  • ${f.label}\n    File: ${f.file}:${f.line}\n    ${f.preview}`).join("\n\n");

    const summary =
      `🔍 Security Scan: ${findings.length} issue${findings.length !== 1 ? "s" : ""} found in ${files.length} files\n` +
      `   HIGH: ${high.length} | MEDIUM: ${medium.length} | LOW: ${low.length}` +
      formatGroup("\n🔴 HIGH", high) +
      formatGroup("\n🟡 MEDIUM", medium) +
      formatGroup("\n🔵 LOW", low);

    return { content: [{ type: "text", text: summary }] };
  }),
};
