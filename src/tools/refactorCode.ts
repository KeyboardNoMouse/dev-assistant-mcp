import path from "path";
import { z } from "zod";
import { askGemini } from "../utils/gemini.js";
import { readFileCached } from "../utils/fileCache.js";

const MAX_CHARS = 12000;

const LANGUAGE_MAP: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript/React", js: "JavaScript", jsx: "JavaScript/React",
  py: "Python", java: "Java", go: "Go", rs: "Rust", rb: "Ruby",
  cs: "C#", php: "PHP", sh: "Shell/Bash",
};

const schema = z.object({
  path: z.string().min(1),
  focus: z.enum(["all", "readability", "performance", "modularity", "naming"]).default("all"),
});

export const refactorCodeTool = {
  definition: {
    name: "refactor_code",
    description:
      "Get AI-powered refactoring suggestions for a source file. Language-aware: tailors suggestions to the actual language of the file. Use focus to narrow suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the source code file to refactor" },
        focus: {
          type: "string",
          enum: ["all", "readability", "performance", "modularity", "naming"],
          description: "Refactoring focus area. Default: all",
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
      const language = LANGUAGE_MAP[ext] || ext.toUpperCase() || "code";

      const focusInstructions: Record<string, string> = {
        all: "Cover: cleaner architecture, better performance, improved readability, idiomatic language usage, and better modularization.",
        readability: "Focus on naming, comments, function length, early returns, and making the intent of the code clearer.",
        performance: "Focus on algorithmic improvements, caching, avoiding redundant operations, and memory efficiency.",
        modularity: "Focus on splitting responsibilities, extracting functions/classes, reducing coupling, improving testability.",
        naming: "Focus only on variable, function, class, and file naming — suggest better names with reasoning.",
      };

      const trimmedCode = code.length > MAX_CHARS ? code.slice(0, MAX_CHARS) + "\n... [truncated]" : code;

      const prompt = `You are a senior ${language} engineer.

Provide refactoring suggestions for the following ${language} file.
${focusInstructions[focus]}

Format your response as:
1. A brief summary of the current code's issues
2. Numbered refactoring suggestions, each with:
   - What to change
   - Why it's better
   - A short before/after code snippet where helpful

Keep suggestions practical and prioritized by impact.

FILE: ${filePath}

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
