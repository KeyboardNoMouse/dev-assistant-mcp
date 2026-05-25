import path from "path";
import { z } from "zod";
import { askGemini } from "../utils/gemini.js";
import { readFileCached } from "../utils/fileCache.js";
import { chunkText } from "../utils/chunkText.js";

const MAX_CHARS = 12000;

const LANGUAGE_MAP: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript/React", js: "JavaScript", jsx: "JavaScript/React",
  py: "Python", java: "Java", go: "Go", rs: "Rust", rb: "Ruby",
  cs: "C#", php: "PHP", sh: "Shell/Bash",
};

const schema = z.object({
  path: z.string().min(1),
  focus: z.enum(["all", "bugs", "performance", "security", "architecture"]).default("all"),
});

export const analyzeCodeTool = {
  definition: {
    name: "analyze_code",
    description:
      "AI-powered analysis of a source file. Detects bugs, performance issues, security vulnerabilities, and architecture quality. Use the 'focus' param to narrow the analysis.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the source code file to analyze" },
        focus: {
          type: "string",
          enum: ["all", "bugs", "performance", "security", "architecture"],
          description: "What to focus on. Default: all",
        },
      },
      required: ["path"],
    },
  },

  handler: async (args: unknown) => {
    try {
      const { path: filePath, focus } = schema.parse(args);

      const code = await readFileCached(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const language = LANGUAGE_MAP[ext] || ext.toUpperCase() || "unknown";

      const focusInstructions: Record<string, string> = {
        all: "1. Purpose and overview\n2. Bugs or logic errors\n3. Performance issues\n4. Security vulnerabilities\n5. Architecture quality\n6. Concrete improvement suggestions",
        bugs: "Focus exclusively on bugs, logic errors, edge cases, and incorrect behavior. List each with the line number if identifiable.",
        performance: "Focus exclusively on performance bottlenecks, inefficient algorithms, unnecessary re-renders, N+1 queries, memory leaks.",
        security: "Focus exclusively on security vulnerabilities: injection risks, improper auth, insecure data handling, exposed secrets, OWASP Top 10.",
        architecture: "Focus exclusively on architecture: separation of concerns, coupling, cohesion, SOLID principles, modularity, testability.",
      };

      const trimmedCode = code.length > MAX_CHARS ? code.slice(0, MAX_CHARS) + "\n... [truncated]" : code;
      const truncationNote = code.length > MAX_CHARS
        ? `\n⚠️ File was truncated to ${MAX_CHARS} chars (actual size: ${code.length} chars). Use start_line/end_line with read_file to inspect specific sections.\n`
        : "";

      const prompt = `You are a senior ${language} engineer doing a code review.

Language: ${language}
File: ${filePath}
${truncationNote}
Analyze the following code. ${focusInstructions[focus]}

Be specific — reference line numbers or function names where possible.
Keep response concise and actionable.

CODE:
\`\`\`${ext}
${trimmedCode}
\`\`\``;

      const response = await askGemini(prompt);

      return { content: [{ type: "text", text: response }] };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { content: [{ type: "text", text: `Invalid input: ${error.errors.map(e => e.message).join(", ")}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  },
};
