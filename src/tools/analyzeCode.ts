import path from "path";
import { z } from "zod";
import { askGemini } from "../utils/gemini.js";
import { readFileCached } from "../utils/fileCache.js";
import { chunkText } from "../utils/chunkText.js";
import { languageFromExt } from "../utils/languageMap.js";
import { withErrorBoundary } from "../core/errors.js";

const CHUNK_SIZE = 12_000;

const schema = z.object({
  path: z.string().min(1),
  focus: z.enum(["all", "bugs", "performance", "security", "architecture"]).default("all"),
});

const FOCUS_INSTRUCTIONS: Record<string, string> = {
  all: "1. Purpose and overview\n2. Bugs or logic errors\n3. Performance issues\n4. Security vulnerabilities\n5. Architecture quality\n6. Concrete improvement suggestions",
  bugs: "Focus exclusively on bugs, logic errors, edge cases, and incorrect behavior. List each with the line number if identifiable.",
  performance: "Focus exclusively on performance bottlenecks, inefficient algorithms, unnecessary re-renders, N+1 queries, memory leaks.",
  security: "Focus exclusively on security vulnerabilities: injection risks, improper auth, insecure data handling, exposed secrets, OWASP Top 10.",
  architecture: "Focus exclusively on architecture: separation of concerns, coupling, cohesion, SOLID principles, modularity, testability.",
};

export const analyzeCodeTool = {
  definition: {
    name: "analyze_code",
    description:
      "AI-powered analysis of a source file. Detects bugs, performance issues, security vulnerabilities, and architecture quality. Large files are analyzed in chunks. Use the 'focus' param to narrow the analysis.",
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

  handler: withErrorBoundary(async (args: unknown) => {
    const { path: filePath, focus } = schema.parse(args);

    const code = await readFileCached(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const language = languageFromExt(ext);

    const chunks = chunkText(code, CHUNK_SIZE);
    const isMultiChunk = chunks.length > 1;

    const analyzeChunk = async (chunk: string, idx: number): Promise<string> => {
      const chunkNote = isMultiChunk ? `\n[Chunk ${idx + 1}/${chunks.length} of file — focus on this section only]\n` : "";
      const prompt = `You are a senior ${language} engineer doing a code review.

Language: ${language}
File: ${filePath}${chunkNote}
${FOCUS_INSTRUCTIONS[focus]}

Be specific — reference line numbers or function names where possible.
Keep response concise and actionable.

CODE:
\`\`\`${ext}
${chunk}
\`\`\``;
      return askGemini(prompt);
    };

    if (!isMultiChunk) {
      const response = await analyzeChunk(chunks[0], 0);
      return { content: [{ type: "text", text: response }] };
    }

    // Multi-chunk: analyze each, then synthesize
    const chunkResults = await Promise.all(chunks.map((c, i) => analyzeChunk(c, i)));
    const synthPrompt = `You are a senior ${language} engineer. You analyzed a large file in ${chunks.length} chunks. Here are the per-chunk findings:

${chunkResults.map((r, i) => `--- Chunk ${i + 1} ---\n${r}`).join("\n\n")}

Synthesize the above into a single, de-duplicated analysis. Prioritize the most important issues across the whole file.`;

    const synthesized = await askGemini(synthPrompt, false);
    const header = `ℹ️  File analyzed in ${chunks.length} chunks (${(code.length / 1024).toFixed(1)} KB total)\n\n`;
    return { content: [{ type: "text", text: header + synthesized }] };
  }),
};
