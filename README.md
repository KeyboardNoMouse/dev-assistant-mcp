# 🤖 Dev Assistant MCP

> A **Model Context Protocol (MCP) server** that gives AI assistants like Claude full developer superpowers — read and write files, search codebases, analyze architecture, scan for secrets, get AI-powered refactoring suggestions, and interact with git, all through natural conversation.

Built with **TypeScript** and the official **Anthropic MCP SDK**. Powered by **Google Gemini 2.0 Flash Lite** for all AI features — optimized for the free tier.

---

## 🎯 What is MCP?

Model Context Protocol (MCP) is an open standard that lets AI assistants connect to external tools and data sources. This server acts as a bridge between Claude and your local development environment. Once connected, Claude can directly interact with your filesystem, codebase, and git history through natural conversation — no copy-pasting, no context switching.

---

## ✨ Tools — All 15

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
│   ├── index.ts                      # MCP server entry — registers all 15 tools
│   ├── tools/
│   │   ├── readFile.ts               # read_file
│   │   ├── writeFile.ts              # write_file
│   │   ├── listDirectory.ts          # list_directory
│   │   ├── summarizeRepo.ts          # summarize_repo
│   │   ├── searchCode.ts             # search_code
│   │   ├── systemInfo.ts             # system_info
│   │   ├── gitTools.ts               # git_status, git_diff, git_log
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
├── dist/                             # Compiled JavaScript output
├── env.example                       # Environment variable template
├── package.json
└── tsconfig.json
```

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | For AI tools only | Free key from [aistudio.google.com](https://aistudio.google.com) |

---

## 📜 Scripts

| Script | Description |
|---|---|
| `npm run dev` | Run in development mode with `ts-node` (no build step) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server from `dist/` |

---

## 🛠️ Tech Stack

- **TypeScript** — fully typed throughout, Zod input validation on all tools
- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)** — official Anthropic MCP SDK
- **Google Gemini API** (`gemini-2.0-flash-lite`) — powers all AI tools, free tier friendly
- **simple-git** — native git integration
- **zod** — runtime input validation
- **fs-extra** — enhanced file system operations
- **glob** — file pattern matching
- **axios** — HTTP client for Gemini API
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
