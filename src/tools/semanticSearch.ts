import path from "path";
import { z } from "zod";
import { scanRepository } from "../utils/repoScanner.js";
import { readFileCached } from "../utils/fileCache.js";
import { createEmbedding, cosineSimilarity } from "../utils/embeddings.js";
import { askGemini } from "../utils/gemini.js";

const schema = z.object({
  path: z.string().min(1),
  query: z.string().min(1),
  top_k: z.number().int().positive().max(20).default(5),
});

export const semanticSearchTool = {
  definition: {
    name: "semantic_search",
    description:
      "Search a repository by meaning using vector embeddings — finds relevant files based on concepts, not just keywords. Returns the top matching files with similarity scores, then uses AI to explain which are most relevant.",
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

  handler: async (args: unknown) => {
    try {
      const { path: rootPath, query, top_k } = schema.parse(args);

      const files = await scanRepository(rootPath);
      if (files.length === 0) {
        return { content: [{ type: "text", text: "No source files found in repository." }] };
      }

      // Generate query embedding
      const queryEmbedding = await createEmbedding(query);

      // Score all files using embeddings (no file count cap)
      const scored: Array<{ file: string; score: number; preview: string }> = [];

      for (const file of files) {
        let content: string;
        try {
          content = await readFileCached(file);
        } catch {
          continue;
        }

        // Use first 1500 chars as the representative snippet for embedding
        const snippet = content.slice(0, 1500);
        try {
          const fileEmbedding = await createEmbedding(snippet);
          const score = cosineSimilarity(queryEmbedding, fileEmbedding);
          scored.push({ file: path.relative(rootPath, file), score, preview: snippet.slice(0, 300) });
        } catch {
          continue;
        }
      }

      if (scored.length === 0) {
        return { content: [{ type: "text", text: "Could not generate embeddings. Check your GEMINI_API_KEY." }], isError: true };
      }

      // Sort by similarity, take top_k
      scored.sort((a, b) => b.score - a.score);
      const topResults = scored.slice(0, top_k);

      // Build a small prompt for Gemini to explain relevance — much cheaper than dumping all files
      const resultContext = topResults
        .map((r, i) => `${i + 1}. ${r.file} (score: ${r.score.toFixed(3)})\n${r.preview}`)
        .join("\n\n");

      const prompt = `User searched for: "${query}"

These are the top ${top_k} most semantically similar files:

${resultContext}

Briefly explain (2-3 sentences each) why each file is relevant to the query, and rank them by likely usefulness.`;

      const explanation = await askGemini(prompt, false); // don't cache — query-specific

      const header = `🔍 Semantic search: "${query}"\nSearched ${files.length} files, showing top ${topResults.length}\n\n`;
      const rankList = topResults.map((r, i) => `${i + 1}. ${r.file} (similarity: ${(r.score * 100).toFixed(1)}%)`).join("\n");

      return {
        content: [{
          type: "text",
          text: header + rankList + "\n\n" + explanation,
        }],
      };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { content: [{ type: "text", text: `Invalid input: ${error.errors.map(e => e.message).join(", ")}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  },
};
