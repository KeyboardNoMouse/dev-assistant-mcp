import path from "path";
import { z } from "zod";
import { askGemini } from "../utils/gemini.js";
import { readFileCached } from "../utils/fileCache.js";
import { chunkText } from "../utils/chunkText.js";
import { languageFromExt } from "../utils/languageMap.js";
import { withErrorBoundary } from "../core/errors.js";

const CHUNK_SIZE = 12_000;

const FOCUS_INSTRUCTIONS: Record<string, string> = {
  all: "Cover: cleaner architecture, better performance, improved readability, idiomatic language usage, and better modularization.",
  readability: "Focus on naming, comments, function length, early returns, and making the intent of the code clearer.",
  performance: "Focus on algorithmic improvements, caching, avoiding redundant operations, and memory efficiency.",
  modularity: "Focus on splitting responsibilities, extracting functions/classes, reducing coupling, improving testability.",
  naming: "Focus only on variable, function, class, and file naming — suggest better names with reasoning.",
};

const schema = z.object({
  path: z.string().min(1),
  focus: z.enum(["all", "readability", "performance", "modularity", "naming"]).default("all"),
});

export const refactorCodeTool = {
  definition: {
    name: "refactor_code",
    description:
      "Get AI-powered refactoring suggestions for a source file. Language-aware. Large files are processed in chunks. Use focus to narrow suggestions.",
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

  handler: withErrorBoundary(async (args: unknown) => {
    const { path: filePath, focus } = schema.parse(args);

    const code = await readFileCached(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const language = languageFromExt(ext);
    const chunks = chunkText(code, CHUNK_SIZE);

    const analyzeChunk = async (chunk: string, idx: number): Promise<string> => {
      const chunkNote = chunks.length > 1 ? `\n[Section ${idx + 1}/${chunks.length}]\n` : "";
      const prompt = `You are a senior ${language} engineer.
${chunkNote}
Provide refactoring suggestions for the following ${language} code.
${FOCUS_INSTRUCTIONS[focus]}

Format your response as:
1. A brief summary of this section's issues
2. Numbered refactoring suggestions, each with:
   - What to change
   - Why it's better
   - A short before/after code snippet where helpful

FILE: ${filePath}

\`\`\`${ext}
${chunk}
\`\`\``;
      return askGemini(prompt);
    };

    if (chunks.length === 1) {
      const response = await analyzeChunk(chunks[0], 0);
      return { content: [{ type: "text", text: response }] };
    }

    const chunkResults = await Promise.all(chunks.map((c, i) => analyzeChunk(c, i)));
    const synthPrompt = `You reviewed a ${language} file in ${chunks.length} sections. Synthesize the refactoring suggestions below into a prioritized, de-duplicated list for the whole file:

${chunkResults.map((r, i) => `--- Section ${i + 1} ---\n${r}`).join("\n\n")}`;

    const synthesized = await askGemini(synthPrompt, false);
    return { content: [{ type: "text", text: synthesized }] };
  }),
};
