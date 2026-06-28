# 🤖 Dev Assistant MCP

> A **Model Context Protocol (MCP) server** that gives AI assistants like Claude full developer superpowers — read and write files, search codebases, analyze architecture, scan for secrets, get AI-powered refactoring suggestions, and interact with git, all through natural conversation.

Built with **TypeScript** and the official **Anthropic MCP SDK**. Powered by **Google Gemini 2.0 Flash Lite** for all AI features — optimized for the free tier.

---

## 🎯 What is MCP?

Model Context Protocol (MCP) is an open standard that lets AI assistants connect to external tools and data sources. This server acts as a bridge between Claude and your local development environment. Once connected, Claude can directly interact with your filesystem, codebase, and git history through natural conversation — no copy-pasting, no context switching.

---

## ✨ Tools — All 27

### 🔧 Core Tools (No API Key Required)

| Tool | Inputs | Description |
|---|---|---|
| `system_info` | — | Platform, CPU model & cores, memory (GB + usage %), Node.js version, uptime |
| `read_file` | `path`, `start_line`?, `end_line`? | Read a file with line numbers. Supports reading a specific line range. 500KB size guard. |
| `write_file` | `path`, `content`, `create_if_missing`?, `backup`? | Write or create a file. Auto-creates parent dirs. Saves a `.bak` backup before overwriting. |
| `list_directory` | `path`, `show_hidden`? | List a single folder with file sizes and item counts. Faster than `summarize_repo` for browsing. |
| `summarize_repo` | `path` | Full repo tree (`├──` structure), file-type breakdown, and total size. |
| `search_code` | `path`, `query`, `case_sensitive`?, `use_regex`?, `file_extension`?, `max_results`? | Search with line numbers + 2 lines of context around each match. Supports regex and extension filters. |
| `git_status` | `path` | Staged, unstaged, untracked files. Current branch, ahead/behind remote. |
| `git_diff` | `path`, `file`?, `staged`? | Line-by-line diff. Narrow to a specific file or show staged changes. |
| `git_log` | `path`, `limit`? | Recent commits with short hash, date, author, and message. |

### 🧠 AI-Powered Tools (Requires Gemini API Key)

| Tool | Inputs | Description |
|---|---|---|
| `analyze_code` | `path`, `focus`? | Language-aware code analysis: bugs, performance, security, architecture. Narrow with `focus`. |
| `analyze_architecture` | `path` | Reviews whole-repo architecture using actual file content snippets, not just filenames. |
| `refactor_code` | `path`, `focus`? | Language-aware refactoring suggestions with before/after code examples. |
| `security_scan` | `path` | Regex-based scan for hardcoded secrets, AWS keys, JWTs, DB connection strings, SQL injection, and more. Severity-rated. **No Gemini call — instant and free.** |
| `semantic_search` | `path`, `query`, `top_k`? | Vector embedding search: ranks all files by meaning locally, sends only top results to Gemini. |
| `explain_error` | `error`, `context`?, `language`? | Paste any error or stack trace — get cause, diagnosis, and fix with code examples. |

### 🏗️ Platform & Orchestration Tools

| Tool | Inputs | Description |
|---|---|---|
| `run_command` | `command`, `cwd`?, `timeout_ms`?, `allow_moderate`?, `allow_network`?, `bypass_sandbox`? | Risk-assessed, sandboxed shell execution. See [Sandboxed Execution](#-sandboxed-execution). |
| `sandbox_status` | `refresh`? | Check whether Docker sandboxing is active or the server has fallen back to direct execution. |
| `validate_repo` | `path`, `checks`?, `timeout_ms`?, `allow_network`? | Run build/test/lint/runtime validation on demand. See [Validation Pipeline](#-validation-pipeline). |
| `metrics_snapshot` | — | Live tool-call and workflow metrics for this server session. See [Observability Platform](#-observability-platform). |
| `repo_context` | `path` | Detected language, frameworks, build/test/lint/start commands, entry points. |
| `workflow_run` | `goal`, `path` | Plan and execute a multi-step task from a natural-language goal. Returns immediately with a workflow ID. |
| `workflow_status` | `id`?, `list`? | Poll a workflow's steps, status, and validation results — or list recent workflows. |
| `workflow_abort` | `id` | Abort a running workflow; in-progress step finishes, remaining steps are skipped. |
| `workflow_history` | `id`?, `metrics`? | Full execution log for one workflow (including overwritten retries/repairs), or all-time aggregate metrics. |
| `impact_analysis` | `path`, `target`, `max_depth`?, `force_rebuild`? | "If I change this file, what's affected?" — real parsed-graph traversal, not a guess. See [Dependency Graph Intelligence](#-dependency-graph-intelligence). |
| `dependency_graph` | `path`, `file`?, `force_rebuild`? | Exact import edges for one file, or a repo-wide parse-coverage overview. |
| `architecture_map` | `path`, `force_rebuild`? | Deterministic structural facts: module fan-in/fan-out, most-depended-on files, circular dependencies. |

---

## ⚡ Token Efficiency

AI calls are kept lean on purpose — this server is designed to work well on the **Gemini free tier**:

- **Gemini response cache** — 5-minute in-memory cache. Repeated calls on the same unchanged file cost zero tokens.
- **File read cache** — All tools share a file cache keyed by path + modified time. Each file is read from disk only once per session.
- **Embedding-based semantic search** — Cosine similarity runs entirely locally. Gemini only sees the top-k results, not the entire codebase.
- **`focus` param** on `analyze_code` and `refactor_code` — Send a smaller, targeted prompt instead of always requesting a full review.
- **`security_scan`** — Completely local regex scan. No Gemini call at all.
- **`analyzeArchitecture`** — Controlled token budget: 400 chars × 30 files max, regardless of actual file sizes.

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/KeyboardNoMouse/dev-assistant-mcp.git
cd dev-assistant-mcp
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp env.example .env
```

Open `.env` and add your Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Get a free API key at [aistudio.google.com](https://aistudio.google.com) → **API Keys** → **Create**.

> **Note:** The 9 core tools work with no API key at all. Only the 6 AI-powered tools require one.

### 4. Build

```bash
npm run build
```

### 5. Start

```bash
npm start
```

---

## 🔌 Connecting to Claude

### Claude Desktop

Add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dev-assistant": {
      "command": "node",
      "args": ["/absolute/path/to/dev-assistant-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop after saving.

### Claude.ai (Web)

1. Go to **Settings → Integrations**
2. Add a new MCP server
3. Point it to your running server

---

## 💬 Example Usage

Once connected, you can ask Claude things like:

```
"Read lines 40–80 of src/auth/middleware.ts"
"Show me what files I've changed since my last commit"
"Search for all usages of useEffect across .tsx files"
"Analyze src/db/queries.ts focusing on security"
"Scan my whole project for hardcoded secrets"
"Suggest readability improvements for src/utils/parser.ts"
"Find where authentication and session handling is in my codebase"
"Show me the git diff for src/index.ts"
"Explain this error: TypeError: Cannot read properties of undefined (reading 'map')"
"Write the refactored version of this file back to disk"
```

---

## 🗂️ Project Structure

```
dev-assistant-mcp/
├── src/
│   ├── index.ts                      # MCP server entry — registers all tools, runs startup recovery
│   ├── core/                         # Shared types, tool registry, error handling
│   ├── context/                      # Repository context engine (language/framework/build detection)
│   ├── orchestration/                # Workflow planner, executor, lifecycle engine
│   │   └── tools/                    # workflow_run, workflow_status, workflow_abort, workflow_history
│   ├── persistence/                  # SQLite-backed durable workflow storage (see below)
│   │   ├── db.ts                     # Connection + migration runner
│   │   ├── migrations/               # Versioned schema migrations
│   │   ├── workflowRepository.ts     # Storage-agnostic repository interface
│   │   ├── sqliteWorkflowRepository.ts # SQLite implementation
│   │   ├── repositoryFactory.ts      # Single swap-point for future Postgres migration
│   │   └── recovery.ts               # Reconciles interrupted workflows on startup
│   ├── runtime/                      # Sandboxed command execution (see below)
│   │   ├── executionSandbox.ts       # Storage-agnostic-style interface (mirrors WorkflowRepository pattern)
│   │   ├── dockerSandbox.ts          # Per-command ephemeral Docker container with resource limits
│   │   ├── localSandbox.ts           # Direct host execution — fallback when Docker is unavailable
│   │   ├── sandboxFactory.ts         # Picks Docker if available, else falls back with a visible warning
│   │   └── commandRiskAnalyzer.ts    # Shared risk scoring (safe/moderate/dangerous/blocked)
│   ├── validation/                   # Build/test/lint/runtime validation pipeline (see below)
│   │   ├── validator.ts              # Shared Validator interface
│   │   ├── validationPipeline.ts     # Orchestrates all validators sequentially, builds ValidationResult
│   │   ├── formatCommandOutput.ts    # Shared output formatting for command-based validators
│   │   └── validators/
│   │       ├── buildValidator.ts     # Runs the detected build command
│   │       ├── testValidator.ts      # Runs the detected test command
│   │       ├── lintValidator.ts      # Runs the detected lint command
│   │       └── runtimeValidator.ts   # Starts the app, checks it doesn't crash, best-effort port probe
│   ├── observability/                # Structured logging, metrics, dashboard (see below)
│   │   ├── correlationContext.ts     # AsyncLocalStorage-based request/workflow/step tracing
│   │   ├── logger.ts                 # Structured JSON logging to stderr
│   │   ├── metrics.ts                # In-process live counters (tool calls, retries, repairs)
│   │   └── dashboard/
│   │       ├── server.ts             # Built-in http server, separate from the MCP stdio transport
│   │       └── dashboardHtml.ts      # Single-page dashboard UI (vanilla JS, polls the JSON API)
│   ├── intelligence/                 # Dependency graph, impact analysis, architecture mapping (see below)
│   │   ├── importParser.ts           # Real AST-based import extraction (TypeScript compiler API, not regex)
│   │   ├── dependencyGraphBuilder.ts # Scans repo, parses + resolves imports, computes reverse edges
│   │   ├── dependencyGraphEngine.ts  # TTL-cached wrapper, same pattern as ContextEngine
│   │   ├── impactAnalyzer.ts         # BFS over reverse edges — "what's affected if I change this?"
│   │   └── architectureMapGenerator.ts # Module fan-in/fan-out, most-depended-on files, cycle detection
│   ├── tools/
│   │   ├── readFile.ts               # read_file
│   │   ├── writeFile.ts              # write_file
│   │   ├── listDirectory.ts          # list_directory
│   │   ├── summarizeRepo.ts          # summarize_repo
│   │   ├── searchCode.ts             # search_code
│   │   ├── systemInfo.ts             # system_info
│   │   ├── gitTools.ts               # git_status, git_diff, git_log
│   │   ├── runCommand.ts             # run_command (risk-assessed, sandboxed execution)
│   │   ├── sandboxStatus.ts          # sandbox_status
│   │   ├── validateRepo.ts           # validate_repo
│   │   ├── metricsSnapshot.ts        # metrics_snapshot
│   │   ├── impactAnalysis.ts         # impact_analysis
│   │   ├── dependencyGraph.ts        # dependency_graph
│   │   ├── architectureMap.ts        # architecture_map
│   │   ├── repoContext.ts            # repo_context
│   │   ├── analyzeCode.ts            # analyze_code
│   │   ├── analyzeArchitecture.ts    # analyze_architecture
│   │   ├── refactorCode.ts           # refactor_code
│   │   ├── securityScan.ts           # security_scan
│   │   ├── semanticSearch.ts         # semantic_search
│   │   └── explainError.ts           # explain_error
│   └── utils/
│       ├── gemini.ts                 # Gemini API client with response cache
│       ├── embeddings.ts             # Vector embeddings + cosine similarity
│       ├── fileCache.ts              # File read cache (path + mtime keyed)
│       ├── chunkText.ts              # Splits large text at newline boundaries
│       └── repoScanner.ts            # Repo file walker (18 languages supported)
├── data/                              # SQLite database file (gitignored, created on first run)
├── dist/                             # Compiled JavaScript output
├── env.example                       # Environment variable template
├── package.json
└── tsconfig.json
```

---

## 💾 Persistent Workflow Storage

Workflows, their steps, validation results, and a full execution audit log are persisted to a local SQLite database (`data/dev-assistant.db` by default — override with `DEV_ASSISTANT_DB_PATH`).

- **Survives restarts.** A workflow's status, every step's result, retries, and errors are written to disk after every transition — not just held in memory.
- **Startup recovery.** If the server is killed or crashes mid-workflow, the next startup marks any in-flight workflows as `failed` with a clear "interrupted" message rather than silently losing them or unsafely re-running steps. Their step history up to the point of interruption stays intact and queryable.
- **Storage-agnostic by design.** Orchestration code depends only on the `WorkflowRepository` interface (`src/persistence/workflowRepository.ts`). The current implementation is SQLite via `better-sqlite3`; moving to Postgres later means writing one new class and changing one line in `repositoryFactory.ts` — no changes to the workflow engine itself.
- **New tool: `workflow_history`** — inspect a workflow's full execution log (including retries and AI-repair attempts that were later overwritten), or pass `metrics=true` for an aggregate summary across every workflow ever run (completion rate, average duration, per-tool failure counts, total retries).

---

## 🛡️ Sandboxed Execution

`run_command` (and every workflow step that calls it) runs inside an isolated, disposable Docker container by default — not directly on your machine.

- **Per-command containers.** Each call gets a fresh container (`docker run --rm`), so unrelated commands or workflow steps never share state, and a hung process can't strand future runs.
- **Resource limits enforced.** 1024MB memory, 1 CPU, a 256-process limit (fork-bomb guard), `--cap-drop ALL`, and `--security-opt no-new-privileges` by default.
- **Network disabled by default.** Most build/test/lint commands don't need internet access. Pass `allow_network: true` to `run_command` for the rare case that does (e.g. `npm install`).
- **Graceful fallback, never a silent downgrade.** If Docker isn't running, the server automatically falls back to direct host execution — but every response carries a visible `⚠️ Docker is not available...` warning so you always know whether a command was actually isolated. Risk assessment (see below) still applies either way.
- **New tool: `sandbox_status`** — check which backend is active right now (`docker (node:20-bookworm-slim)` or `local (unsandboxed)`) without running a throwaway command. Pass `refresh=true` to re-check after starting Docker Desktop.
- **Command risk scoring is unchanged in behavior, just relocated.** The same blocked/dangerous/moderate/safe classification that previously lived inline in `runCommand.ts` now lives in `src/runtime/commandRiskAnalyzer.ts`, shared across the platform so future tools score risk identically rather than each maintaining their own copy.
- **Escape hatch:** `bypass_sandbox: true` on `run_command` forces direct host execution even when Docker is available — useful for commands that need something a container can't easily provide (e.g. interacting with a host-only service). Use sparingly; it forfeits isolation.

By default the sandbox image is `node:20-bookworm-slim` (override with `DEV_ASSISTANT_SANDBOX_IMAGE`). It has a shell and coreutils for any language's read-only commands, but non-Node toolchains (cargo, go, etc.) inside the sandbox would need a custom image — out of scope for this pass.

---

## ✅ Validation Pipeline

Every workflow that completes execution is automatically validated before being marked `done` — completion is now `Goal → Plan → Execute → Validate → Done`, not `Goal → Execute → Done`. A workflow whose code doesn't build, whose tests fail, or whose server crashes on startup is marked `failed`, not `done`, even if every individual step succeeded.

- **Four checks, run sequentially**: build → test → lint → runtime. Each stage only runs if every prior stage passed or didn't apply — there's no point running tests against code that doesn't build.
- **Auto-skipped, not auto-failed.** A repo with no linter configured doesn't fail the lint check — that check is simply absent from the result. A workflow for a repo with no build/test/lint/start commands at all passes validation trivially (nothing to validate isn't a failure).
- **Runs sandboxed**, same Docker-or-fallback path as `run_command` and Phase 2.
- **Build / test / lint** run the exact command the context engine already detects per framework (`npm run build`, `pytest`, `golangci-lint run`, etc.) — see `repo_context`.
- **Runtime check is necessarily best-effort.** There's no universal way to know in advance how long "started successfully" should take to prove, so it probes for a bounded window (8s default) and treats "still running when time's up" as success. Port checking is an explicit, clearly-labeled *guess* — read from a `.env` `PORT=` default or a framework convention (Next.js → 3000, Django → 8000, etc.) — and a wrong guess is reported as "skipped," never as a false failure.
- **New tool: `validate_repo`** — run the pipeline on demand, independent of any workflow. Pass `checks: ["build"]` to limit which validators run.
- **Persisted** (see Phase 1) — `workflow_status` shows the full validation breakdown (which checks passed/failed and why) for any workflow, even after a server restart.

---

## 📈 Observability Platform

A small HTTP dashboard starts automatically alongside the MCP server (default `http://localhost:4477`, printed at startup) showing live and all-time metrics, every workflow, and execution logs — auto-refreshing every 5 seconds. Set `DEV_ASSISTANT_DASHBOARD=off` to disable it, or `DEV_ASSISTANT_DASHBOARD_PORT` to change the port.

- **Structured logging.** Every log line is a single JSON object (timestamp, level, message, plus context) written to stderr — never stdout, which is reserved for the MCP protocol stream itself. Replaces the previous plain-text `console.error` calls.
- **Correlation IDs, for real tracing.** Every tool call gets a correlation ID automatically (via `AsyncLocalStorage` — no function in the call chain needs to know about it or pass it explicitly). A workflow's ID is attached to every step inside it, and each step additionally gets its own step ID layered on top — so a single tool call nested three levels deep inside a workflow is traceable back to exactly which workflow and which step it belongs to, just by reading the log line.
- **Two metrics views, on purpose:**
  - **Live** (`metrics.ts`) — every tool call ever made this process lifetime, including ones outside any workflow. Resets on restart; doesn't need database durability for "how many times has `read_file` been called since I started the server."
  - **Persisted** (Phase 1's `getMetricsSummary()`) — workflow-scoped counts that survive a restart: total workflows started/completed/failed, average duration, per-tool failure counts across all of history.
- **New tool: `metrics_snapshot`** — the live view, directly in chat, for whenever opening a browser tab is more friction than it's worth.
- **Read-only dashboard API** (`/api/metrics`, `/api/workflows`, `/api/workflows/:id`, `/api/sandbox`) — nothing on the dashboard can mutate state; it's pure observability.
- Built on Node's built-in `http` module rather than adding a web framework dependency — this is a handful of JSON endpoints and one static page, which doesn't warrant one. Runs as a completely separate listener from the MCP stdio transport; either can fail independently without affecting the other.

---

## 🕸️ Dependency Graph Intelligence

Answers questions like *"if I modify the auth module, what's affected?"* with a real, parsed import graph — not an AI's best guess from skimming file contents.

- **Real parsing, not regex.** Imports are extracted with the actual TypeScript compiler API (`ts.createSourceFile`), the same parser TypeScript itself uses. This correctly handles multi-line imports, dynamic `import()`, CommonJS `require()`, and re-exports (`export ... from`) — and correctly ignores `import`-like text sitting inside a comment or a string literal, which a regex-based extractor would get wrong.
- **New tool: `impact_analysis`** — give it a file (exact path, absolute path, or a substring like `"auth"`) and it does a breadth-first traversal of the reverse-dependency graph, returning every file that depends on it directly or transitively, grouped by hop distance, plus which directories ("areas") are touched. This is the direct implementation of the brief's worked example.
- **New tool: `dependency_graph`** — raw exploration: a repo-wide overview, or exactly what one file imports and exactly what imports it back.
- **New tool: `architecture_map`** — deterministic structural facts derived from the graph: which directories depend on which, the most-depended-on files (real fan-in counts — a genuine signal for "review carefully before changing this"), and circular dependency detection via DFS cycle finding. This is intentionally different from the existing `analyze_architecture` tool, which is an LLM's qualitative opinion from sampled file snippets — everything in `architecture_map` is a counted, verifiable fact, not a guess.
- **Scope, stated honestly:** only JS/TS/JSX/TSX/MJS/CJS files are actually parsed for imports — other languages appear in the graph as nodes with `unparsed: true` rather than being silently dropped, but their real import relationships are genuinely unknown to this tool. Path resolution handles TypeScript's convention of writing `.js` extensions in source files that import `.ts` files, and resolves `index.*` files for directory imports — but does not read `tsconfig.json` path aliases (e.g. `@/foo`); an aliased import that doesn't resolve to a file on disk is recorded but not linked as a graph edge, rather than guessed at.
- **Cached** with the same 10-minute TTL pattern as `ContextEngine` — pass `force_rebuild: true` after making changes that affect imports.

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | For AI tools only | Free key from [aistudio.google.com](https://aistudio.google.com) |
| `DEV_ASSISTANT_DB_PATH` | No | Override the SQLite database location. Defaults to `./data/dev-assistant.db` |
| `DEV_ASSISTANT_SANDBOX_IMAGE` | No | Override the Docker image used for sandboxed execution. Defaults to `node:20-bookworm-slim` |
| `DEV_ASSISTANT_DASHBOARD` | No | Set to `off` to disable the observability dashboard server. Defaults to `on` |
| `DEV_ASSISTANT_DASHBOARD_PORT` | No | Override the dashboard's HTTP port. Defaults to `4477` |

---

## 📜 Scripts

| Script | Description |
|---|---|
| `npm run dev` | Run in development mode with `ts-node` (no build step) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server from `dist/` |

---

## 🛠️ Tech Stack

- **TypeScript** — fully typed throughout, Zod input validation on all tools. Also used at runtime (not just for the build) — the dependency graph's import parser is built on the real TypeScript compiler API (`ts.createSourceFile`).
- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)** — official Anthropic MCP SDK
- **Google Gemini API** (`gemini-2.0-flash-lite`) — powers all AI tools, free tier friendly
- **better-sqlite3** — synchronous, embedded SQLite for durable workflow persistence (WAL mode)
- **Docker** (optional, auto-detected) — sandboxed command execution; falls back to direct host execution with a warning if not running
- **simple-git** — native git integration
- **zod** — runtime input validation
- **fs-extra** — enhanced file system operations
- **glob** — file pattern matching
- **dotenv** — environment variable management

---

## 🔒 Security Notes

- Never commit your `.env` file — it's already in `.gitignore`
- Use `env.example` as a safe template to share
- `security_scan` uses regex patterns that look for actual secret *values*, not just variable names — reducing false positives from comments and README examples
- Secret values are **redacted** in scan output

---

## 🤝 Contributing

Contributions are welcome! Some ideas for future tools:

- `run_command` — execute shell commands (npm test, tsc, pytest) with an allowlist
- `find_dependencies` — parse package.json / requirements.txt and flag outdated or vulnerable packages
- `generate_code` — describe a function or module and generate + write it directly

Feel free to open an issue or submit a pull request.

---

## 📄 License

MIT — free to use, modify, and distribute.

---

## 👨‍💻 Author

Built by [@KeyboardNoMouse](https://github.com/KeyboardNoMouse)
