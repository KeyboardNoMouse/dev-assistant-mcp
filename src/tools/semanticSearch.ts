import path from "path";
import { z } from "zod";
import { scanRepository } from "../utils/repoScanner.js";
import { readFileCached } from "../utils/fileCache.js";
import { createEmbedding, cosineSimilarity } from "../utils/embeddings.js";
import { askGemini } from "../utils/gemini.js";
import { withErrorBoundary } from "../core/errors.js";
import { ToolError } from "../core/errors.js";

const schema = z.object({
  path: z.string().min(1),
  query: z.string().min(1),
  top_k: z.number().int().positive().max(20).default(5),
});

export const semanticSearchTool = {
  definition: {
    name: "semantic_search",
    description:
      "Search a repository by meaning using vector embeddings — finds relevant files based on concepts, not just keywords. Returns top matching files with similarity scores.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the repository root" },
        query: { type: "string", description: "Natural language search query" },
        top_k: { type: "number", description: "Number of top results to return (default: 5, max: 20)" },
      },
      required: ["path", "query"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { path: rootPath, query, top_k } = schema.parse(args);

    const files = await scanRepository(rootPath);
    if (files.length === 0) {
      return { content: [{ type: "text", text: "No source files found in repository." }] };
    }

    const queryEmbedding = await createEmbedding(query);
    if (!queryEmbedding.length) throw new ToolError("Could not generate query embedding. Check your GEMINI_API_KEY.");

    const scored: Array<{ file: string; score: number; preview: string }> = [];

    for (const file of files) {
      let content: string;
      try { content = await readFileCached(file); } catch { continue; }

      const snippet = content.slice(0, 1500);
      try {
        const fileEmbedding = await createEmbedding(snippet);
        const score = cosineSimilarity(queryEmbedding, fileEmbedding);
        scored.push({ file: path.relative(rootPath, file), score, preview: snippet.slice(0, 300) });
      } catch {
        continue;
      }
    }

    if (scored.length === 0) throw new ToolError("Could not generate embeddings. Check your GEMINI_API_KEY.");

    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, top_k);

    const resultContext = topResults
      .map((r, i) => `${i + 1}. ${r.file} (score: ${r.score.toFixed(3)})\n${r.preview}`)
      .join("\n\n");

    const prompt = `User searched for: "${query}"

These are the top ${top_k} most semantically similar files:

${resultContext}

Briefly explain (2-3 sentences each) why each file is relevant to the query, and rank them by likely usefulness.`;

    const explanation = await askGemini(prompt, false);
    const header = `🔍 Semantic search: "${query}"\nSearched ${files.length} files, showing top ${topResults.length}\n\n`;
    const rankList = topResults.map((r, i) => `${i + 1}. ${r.file} (similarity: ${(r.score * 100).toFixed(1)}%)`).join("\n");

    return { content: [{ type: "text", text: header + rankList + "\n\n" + explanation }] };
  }),
};
