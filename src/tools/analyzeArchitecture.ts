import path from "path";
import { z } from "zod";
import { scanRepository } from "../utils/repoScanner.js";
import { readFileCached } from "../utils/fileCache.js";
import { askGemini } from "../utils/gemini.js";
import { withErrorBoundary } from "../core/errors.js";

const MAX_FILES_SAMPLED = 30;
const SNIPPET_CHARS = 400;

const schema = z.object({ path: z.string().min(1) });

export const analyzeArchitectureTool = {
  definition: {
    name: "analyze_architecture",
    description:
      "Analyze the architecture of a repository using AI. Samples file contents to give meaningful analysis of architecture style, design quality, scalability, and weaknesses.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Path to the repository root" } },
      required: ["path"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { path: rootPath } = schema.parse(args);
    const allFiles = await scanRepository(rootPath);
    const relPaths = allFiles.map((f) => path.relative(rootPath, f));

    const priority = allFiles.filter((f) =>
      path.basename(f).toLowerCase().match(/^(index|main|app|server|router|config|types|schema)\./)
    );
    const others = allFiles.filter((f) => !priority.includes(f));
    const toSample = [...priority, ...others].slice(0, MAX_FILES_SAMPLED);

    const snippets: string[] = [];
    for (const file of toSample) {
      try {
        const content = await readFileCached(file);
        snippets.push(`--- ${path.relative(rootPath, file)} ---\n${content.slice(0, SNIPPET_CHARS)}`);
      } catch {
        continue;
      }
    }

    const prompt = `You are a senior software architect reviewing a codebase.

Repository: ${path.basename(rootPath)}
Total files: ${allFiles.length}

Full file tree:
${relPaths.join("\n")}

Content snippets from ${snippets.length} key files (first ${SNIPPET_CHARS} chars each):
${snippets.join("\n\n")}

Provide a thorough architectural review covering:
1. **Architecture style** — MVC, layered, microservices, monolithic, etc.
2. **Folder structure quality** — is it logical, consistent, easy to navigate?
3. **Separation of concerns** — are responsibilities well-divided?
4. **Design patterns detected** — what patterns are in use?
5. **Scalability** — how well would this grow with more features or traffic?
6. **Weaknesses** — what are the most significant architectural problems?
7. **Concrete recommendations** — specific, prioritized improvements

Be specific and reference actual files/folders from the tree above.`;

    const response = await askGemini(prompt);
    return { content: [{ type: "text", text: response }] };
  }),
};
