#  Dev Assistant MCP

> An **Agentic Developer Runtime Infrastructure** built on the Model Context Protocol — giving Claude the ability to understand repositories, orchestrate multi-step engineering tasks, execute commands safely, and validate results autonomously.

Built with **TypeScript** and the official **Anthropic MCP SDK**. Powered by **Google Gemini 2.0 Flash Lite**.

---

##  What's New in v3.0.0

v3 is a major architectural upgrade. The system evolved from a flat list of 15 independent tools into a layered agentic runtime:

| | v2 | v3 |
|---|---|---|
| Tools | 15, flat list | 20, plugin registry |
| Execution | Single tool calls | Multi-step workflow orchestration |
| Repo awareness | Per-call scanning | Cached context engine |
| Error handling | 15 independent try/catch blocks | Unified `withErrorBoundary()` |
| Shell execution | ❌ | ✅ Risk-scored `run_command` |
| Framework detection | ❌ | ✅ 15 frameworks across 6 languages |
| Large file support | Manual slicing | Proper chunking + synthesis |
| Gemini client | axios (custom) | Official `@google/generative-ai` SDK |
| Cache key | 32-bit hash (collision-prone) | SHA-256 |
| File cache | Unbounded | LRU with 500-entry cap |

---

##  What is MCP?

Model Context Protocol (MCP) is an open standard that lets AI assistants connect to external tools and data sources. This server acts as a bridge between Claude and your local development environment. Once connected, Claude can directly interact with your filesystem, codebase, git history, and shell — through natural conversation.

---

##  Tools — All 20

###  Core Tools (No API Key Required)

| Tool | Description |
|---|---|
| `system_info` | Platform, CPU, memory, Node.js version |
| `read_file` | Read a file with optional line range. 500KB guard. |
| `write_file` | Write/create a file. Auto-creates dirs. `.bak` backup before overwrite. |
| `list_directory` | List a folder with file sizes and item counts |
| `summarize_repo` | Full repo tree with file-type breakdown |
| `search_code` | Regex/text search with line numbers and context |
| `git_status` | Staged, unstaged, untracked files + branch info |
| `git_diff` | Line-by-line diff, optionally scoped to a file |
| `git_log` | Recent commits with hash, date, author, message |
| `run_command` | **NEW** — Safe shell execution with risk scoring (npm, git, tsc, pytest, docker, etc.) |
| `repo_context` | **NEW** — Detect language, frameworks, package manager, test/build/lint commands |

###  AI-Powered Tools (Requires Gemini API Key)

| Tool | Description |
|---|---|
| `analyze_code` | Language-aware analysis: bugs, performance, security, architecture. Chunks large files. |
| `analyze_architecture` | Whole-repo architecture review using file content snippets |
| `refactor_code` | Refactoring suggestions with before/after examples. Chunks large files. |
| `security_scan` | Hardcoded secrets, AWS keys, JWTs, DB strings, SQL injection. Severity-rated. |
| `semantic_search` | Vector embedding search — finds files by meaning, not just keywords |
| `explain_error` | Paste any error or stack trace — get cause, diagnosis, and fix |

###  Orchestration Tools (NEW — Requires Gemini API Key)

| Tool | Description |
|---|---|
| `workflow_run` | Start a multi-step agentic workflow from a natural language goal |
| `workflow_status` | Check progress of a running workflow — full step-by-step detail |
| `workflow_abort` | Stop a running workflow gracefully |

---

##  How Workflow Orchestration Works

```
User goal (natural language)
        ↓
  Context engine
  (repo language, frameworks, commands)
        ↓
  Task planner (Gemini)
  (goal → ordered step graph)
        ↓
  Step executor
  (runs each tool call, retries on failure, AI-assisted repair)
        ↓
  Validation
        ↓
  Done ✅  or  Rollback ↩️
```

Example:

```
workflow_run: "Find security vulnerabilities in the auth module and summarize them"
repo_path: "/path/to/project"
```

The system will automatically: detect the repo's language and structure → plan the right sequence of tool calls → execute them → return a consolidated result.

---

##  Getting Started

### 1. Clone

```bash
git clone https://github.com/KeyboardNoMouse/dev-assistant-mcp.git
cd dev-assistant-mcp
```

### 2. Install & build

```bash
npm install
npm run build
```

### 3. Environment variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Get a free key at [aistudio.google.com](https://aistudio.google.com) → **API Keys** → **Create**.

> The 11 core tools work with no API key. Only the 9 AI/orchestration tools require one.

---

##  Connecting to Claude Desktop

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dev-assistant-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/dev-assistant-mcp/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

---

##  Example Usage

```
"Use repo_context on /path/to/my/project"
"Run workflow_run: Add input validation to all Express routes"
"Analyze src/auth/middleware.ts focusing on security"
"Scan the whole project for hardcoded secrets"
"Run the test suite with run_command: npm test"
"Find where authentication logic lives using semantic_search"
"Explain this error: TypeError: Cannot read properties of undefined"
"Check workflow_status to see what the agent is doing"
```

---

##  Project Structure

```
dev-assistant-mcp/
├── src/
│   ├── index.ts                          # MCP server — plugin registry, middleware
│   ├── core/
│   │   ├── types.ts                      # Shared interfaces (Workflow, RepoContext, etc.)
│   │   ├── errors.ts                     # Unified error handling + withErrorBoundary()
│   │   └── registry.ts                   # ToolRegistry — plugin system with middleware hooks
│   ├── tools/                            # All 20 MCP tools
│   │   ├── runCommand.ts                 # Safe shell execution with risk scoring
│   │   ├── repoContext.ts                # Repository intelligence tool
│   │   └── [15 other tools...]
│   ├── orchestration/
│   │   ├── planner.ts                    # Goal → step graph (Gemini-backed)
│   │   ├── executor.ts                   # Step runner with retry + AI repair
│   │   ├── workflow.ts                   # Workflow state machine
│   │   └── tools/                        # workflow_run, workflow_status, workflow_abort
│   ├── context/
│   │   ├── frameworkDetector.ts          # Detects 15 frameworks across 6 languages
│   │   └── contextEngine.ts             # Cached repo context API
│   └── utils/
│       ├── gemini.ts                     # Official SDK client, SHA-256 cache, multi-model
│       ├── embeddings.ts                 # Vector embeddings + cosine similarity
│       ├── fileCache.ts                  # LRU file cache (500 entries, 500KB cap)
│       ├── chunkText.ts                  # Text chunker for large file analysis
│       ├── languageMap.ts               # Shared extension → language name map
│       └── repoScanner.ts               # Repo file walker (18 languages, .bak excluded)
├── dist/                                 # Compiled output (git-ignored)
├── .env                                  # Your API key (git-ignored)
└── package.json
```

---

##  Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | For AI + orchestration tools | Free key from [aistudio.google.com](https://aistudio.google.com) |

---

##  Scripts

| Script | Description |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run dev` | Run with ts-node (no build step) |
| `npm run typecheck` | Type-check without emitting |

---

##  Tech Stack

- **TypeScript** — strict mode, fully typed
- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)** — official Anthropic MCP SDK
- **@google/generative-ai** — official Gemini SDK (replaces axios in v3)
- **zod** — runtime input validation on all tools
- **simple-git** — git integration
- **fs-extra** — enhanced filesystem operations
- **glob** — file pattern matching
- **dotenv** — environment variable loading

---

##  Security

- `.env` is git-ignored — never committed
- `run_command` has a built-in risk scorer: blocked patterns (rm -rf /, curl | bash, etc.), a safelist of known-safe prefixes, and a `allow_moderate` gate for everything else
- `security_scan` redacts secret values in output
- Workflow steps are fail-fast — a failed step stops execution before further changes

---

##  Roadmap

- **Phase 2** — Validation pipeline: build verification, test runner, lint checker wired into workflows
- **Phase 3** — Safe execution runtime: Docker sandboxing, permission boundaries, rollback engine
- **Phase 4** — Developer dashboard: WebSocket-based live workflow progress UI

---

##  License

MIT

---

##  Author

Built by [@KeyboardNoMouse](https://github.com/KeyboardNoMouse)
