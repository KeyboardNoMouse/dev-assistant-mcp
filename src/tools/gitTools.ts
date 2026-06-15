import { z } from "zod";
import { simpleGit } from "simple-git";

const statusSchema = z.object({ path: z.string().min(1) });
const diffSchema = z.object({
  path: z.string().min(1),
  file: z.string().optional(),
  staged: z.boolean().default(false),
});
const logSchema = z.object({
  path: z.string().min(1),
  limit: z.number().int().positive().max(50).default(10),
});

// --- git_status ---
export const gitStatusTool = {
  definition: {
    name: "git_status",
    description: "Show the working tree status of a git repository: staged, unstaged, and untracked files.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the git repository root" },
      },
      required: ["path"],
    },
  },

  handler: async (args: unknown) => {
    try {
      const { path: repoPath } = statusSchema.parse(args);
      const git = simpleGit(repoPath);

      const status = await git.status();
      const branch = status.current ?? "unknown";

      const sections: string[] = [];

      if (status.staged.length > 0) {
        sections.push(`✅ Staged (${status.staged.length}):\n${status.staged.map((f: string) => `  + ${f}`).join("\n")}`);
      }
      if (status.modified.length > 0) {
        sections.push(`📝 Modified (${status.modified.length}):\n${status.modified.map((f: string) => `  ~ ${f}`).join("\n")}`);
      }
      if (status.deleted.length > 0) {
        sections.push(`🗑️  Deleted (${status.deleted.length}):\n${status.deleted.map((f: string) => `  - ${f}`).join("\n")}`);
      }
      if (status.not_added.length > 0) {
        sections.push(`❓ Untracked (${status.not_added.length}):\n${status.not_added.map((f: string) => `  ? ${f}`).join("\n")}`);
      }

      const ahead = status.ahead > 0 ? ` ↑${status.ahead}` : "";
      const behind = status.behind > 0 ? ` ↓${status.behind}` : "";
      const header = `Branch: ${branch}${ahead}${behind}\n`;

      return {
        content: [{
          type: "text",
          text: sections.length > 0
            ? header + "\n" + sections.join("\n\n")
            : header + "\n✨ Working tree is clean",
        }],
      };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { content: [{ type: "text", text: `Invalid input: ${error.errors.map(e => e.message).join(", ")}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Git error: ${error.message}` }], isError: true };
    }
  },
};

// --- git_diff ---
export const gitDiffTool = {
  definition: {
    name: "git_diff",
    description: "Show git diff for the working tree or a specific file. Use staged=true to see staged (indexed) changes.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the git repository root" },
        file: { type: "string", description: "Specific file to diff (optional — omit for all changed files)" },
        staged: { type: "boolean", description: "Show staged (indexed) diff. Default: false (shows unstaged)" },
      },
      required: ["path"],
    },
  },

  handler: async (args: unknown) => {
    try {
      const { path: repoPath, file, staged } = diffSchema.parse(args);
      const git = simpleGit(repoPath);

      const diffArgs: string[] = staged ? ["--staged"] : [];
      if (file) diffArgs.push("--", file);

      const diff = await git.diff(diffArgs);

      if (!diff.trim()) {
        return { content: [{ type: "text", text: "No differences found." }] };
      }

      // Cap output at ~8000 chars
      const capped = diff.length > 8000 ? diff.slice(0, 8000) + "\n... [diff truncated — use file param to narrow scope]" : diff;

      return { content: [{ type: "text", text: "```diff\n" + capped + "\n```" }] };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { content: [{ type: "text", text: `Invalid input: ${error.errors.map(e => e.message).join(", ")}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Git error: ${error.message}` }], isError: true };
    }
  },
};

// --- git_log ---
export const gitLogTool = {
  definition: {
    name: "git_log",
    description: "Show recent git commit history with author, date, and message.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the git repository root" },
        limit: { type: "number", description: "Number of commits to show (default: 10, max: 50)" },
      },
      required: ["path"],
    },
  },

  handler: async (args: unknown) => {
    try {
      const { path: repoPath, limit } = logSchema.parse(args);
      const git = simpleGit(repoPath);

      const log = await git.log({ maxCount: limit });

      if (!log.all.length) {
        return { content: [{ type: "text", text: "No commits found." }] };
      }

      const lines = log.all.map((c: any, i: number) => {
        const date = new Date(c.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        return `${i + 1}. ${c.hash.slice(0, 7)} — ${date} — ${c.author_name}\n   ${c.message}`;
      });

      return {
        content: [{ type: "text", text: `Recent ${log.all.length} commits:\n\n${lines.join("\n\n")}` }],
      };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { content: [{ type: "text", text: `Invalid input: ${error.errors.map(e => e.message).join(", ")}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Git error: ${error.message}` }], isError: true };
    }
  },
};
