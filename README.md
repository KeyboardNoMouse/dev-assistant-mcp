# 🤖 Dev Assistant MCP

A **Model Context Protocol (MCP) server** that supercharges AI assistants like Claude with powerful developer tools — giving them the ability to read files, search codebases, analyze architecture, scan for security risks, suggest refactors, and semantically search your code using Google Gemini AI.

Built with TypeScript and the official Anthropic MCP SDK.

---

## 🎯 What is MCP?

Model Context Protocol (MCP) is an open standard that lets AI assistants connect to external tools and data sources. This server acts as a bridge between Claude and your local development environment — once connected, Claude can directly interact with your filesystem and codebase through natural conversation.

---

## ✨ Tools

### 🔧 Core Tools (No AI Required)

| Tool | Input | Description |
|---|---|---|
| `system_info` | None | Returns your system's platform, CPU cores, total/free memory, and uptime |
| `read_file` | `path` | Reads and returns the full contents of any file |
| `search_code` | `path`, `query` | Searches `.ts`, `.js`, `.tsx`, `.jsx`, `.py`, `.json`, `.md` files for exact text matches |
| `summarize_repo` | `path` | Lists the full file and folder structure of a repository |

### 🧠 AI-Powered Tools (Requires Gemini API Key)

| Tool | Input | Description |
|---|---|---|
| `analyze_code` | `path` | Sends a source file to Gemini for deep analysis — bugs, code quality, security issues, and improvement suggestions |
| `analyze_architecture` | `path` | Analyzes your entire repo's structure and explains the architecture style, design quality, scalability, and weaknesses |
| `security_scan` | `path` | Scans your repository for hardcoded secrets, API keys, tokens, passwords, and other security risks |
| `refactor_code` | `path` | Gets AI-powered refactoring suggestions for cleaner architecture, better performance, readability, and TypeScript best practices |
| `semantic_search` | `path`, `query` | Search your codebase using natural language — finds relevant files by meaning, not just exact text |

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

Get a free API key at [aistudio.google.com](https://aistudio.google.com) → API Keys → Create.

> **Note:** The core tools (`system_info`, `read_file`, `search_code`, `summarize_repo`) work without a Gemini key. Only the AI-powered tools require it.

### 4. Build the project

```bash
npm run build
```

### 5. Start the server

```bash
npm start
```

---

## 🔌 Connecting to Claude

### Claude Desktop

Add the following to your Claude Desktop config file:

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

Restart Claude Desktop after saving the config.

### Claude.ai (Web)

1. Go to **Settings → Integrations**
2. Add a new MCP server
3. Point it to your running server

Once connected, Claude will have access to all 9 tools and can use them directly in conversation.

---

## 💬 Example Usage

Once connected, you can ask Claude things like:

- *"Read the file at `/my-project/src/app.ts`"*
- *"Summarize the structure of my project at `/my-project`"*
- *"Search for all usages of `useState` in `/my-project`"*
- *"Analyze the architecture of my repo at `/my-project`"*
- *"Scan `/my-project` for any hardcoded secrets or API keys"*
- *"Suggest refactoring improvements for `/my-project/src/utils/db.ts`"*
- *"Search my codebase at `/my-project` for where authentication is handled"*

---

## 🗂️ Project Structure

```
dev-assistant-mcp/
├── src/
│   ├── index.ts                    # MCP server entry point — registers all tools
│   ├── tools/
│   │   ├── systemInfo.ts           # system_info — OS, CPU, memory stats
│   │   ├── readFile.ts             # read_file — read any file by path
│   │   ├── searchCode.ts           # search_code — exact text search across files
│   │   ├── summarizeRepo.ts        # summarize_repo — full repo file tree
│   │   ├── analyzeCode.ts          # analyze_code — Gemini code analysis
│   │   ├── analyzeArchitecture.ts  # analyze_architecture — Gemini architecture review
│   │   ├── securityScan.ts         # security_scan — hardcoded secrets detection
│   │   ├── refactorCode.ts         # refactor_code — Gemini refactoring suggestions
│   │   └── semanticSearch.ts       # semantic_search — natural language code search
│   └── utils/
│       ├── gemini.ts               # Shared Gemini API client (gemini-2.0-flash-lite)
│       ├── embeddings.ts           # Vector embeddings for semantic search
│       ├── chunkText.ts            # Splits large files into chunks for AI processing
│       └── repoScanner.ts          # Shared repo file walker (excludes node_modules, .git, dist)
├── dist/                           # Compiled JavaScript output
├── env.example                     # Template for environment variables
├── package.json
└── tsconfig.json
```

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | For AI tools | Your Google Gemini API key from [aistudio.google.com](https://aistudio.google.com) |

---

## 📜 Scripts

| Script | Description |
|---|---|
| `npm run dev` | Run in development mode with `ts-node` (no build step) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server from `dist/` |

---

## 🛠️ Tech Stack

- **TypeScript** — fully typed throughout
- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)** — official Anthropic MCP SDK
- **Google Gemini API** (`gemini-2.0-flash-lite`) — powers all AI tools
- **fs-extra** — enhanced file system operations
- **glob** — file pattern matching for code search
- **axios** — HTTP client for Gemini API calls
- **dotenv** — environment variable management

---

## 🔒 Security Notes

- Never commit your `.env` file — it's already in `.gitignore`
- Use `env.example` as a safe template to share
- The `security_scan` tool itself can detect accidentally hardcoded secrets in your projects

---

## 🤝 Contributing

Contributions are welcome! Ideas for new tools:

- `write_file` — write or create files
- `run_command` — execute shell commands safely
- `git_status` / `git_diff` — git integration
- `explain_error` — paste an error and get an AI explanation

Feel free to open an issue or submit a pull request.

---

## 📄 License

MIT — free to use, modify, and distribute.

---

## 👨‍💻 Author

Built by [@KeyboardNoMouse](https://github.com/KeyboardNoMouse)
