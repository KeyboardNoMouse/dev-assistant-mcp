import { z } from "zod";
import { askGemini } from "../utils/gemini.js";
import { withErrorBoundary } from "../core/errors.js";

const schema = z.object({
  error: z.string().min(1),
  context: z.string().optional(),
  language: z.string().optional(),
});

export const explainErrorTool = {
  definition: {
    name: "explain_error",
    description:
      "Paste an error message or stack trace and get a diagnosis: what caused it, what it means, and how to fix it. Optionally provide surrounding code context.",
    inputSchema: {
      type: "object",
      properties: {
        error: { type: "string", description: "The error message or full stack trace" },
        context: { type: "string", description: "Optional: surrounding code or description of what you were doing" },
        language: { type: "string", description: "Optional: programming language or runtime (e.g. TypeScript, Python)" },
      },
      required: ["error"],
    },
  },

  handler: withErrorBoundary(async (args: unknown) => {
    const { error, context, language } = schema.parse(args);
    const langNote = language ? `Language/Runtime: ${language}\n` : "";
    const contextSection = context
      ? `\nCode context:\n\`\`\`\n${context.slice(0, 3000)}\n\`\`\``
      : "";

    const prompt = `You are a senior developer helping debug an error.
${langNote}
Error:
\`\`\`
${error.slice(0, 4000)}
\`\`\`
${contextSection}

Explain:
1. **What this error means** in plain English
2. **Most likely cause(s)**
3. **How to fix it** — give concrete steps or code examples
4. **How to prevent it** in future

Be concise and practical.`;

    const response = await askGemini(prompt);
    return { content: [{ type: "text", text: response }] };
  }),
};
