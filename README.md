# dev-assistant-mcp

A **Model Context Protocol (MCP) server** that gives AI assistants (like Claude) powerful tools to read, search, and analyze your local codebase — including AI-powered code analysis, architecture review, security scanning, refactoring suggestions, and semantic search via Google Gemini.

---

## Features

| Tool | Description |
|---|---|
| `system_info` | Returns platform, CPU cores, memory, and uptime info |
| `read_file` | Read the contents of any file by path |
| `search_code` | Search across `.ts`, `.js`, `.tsx`, `.jsx`, `.py`, `.json`, `.md` files for a text query |
| `summarize_repo` | List all files in a repository (excluding `node_modules`, `.git`, `dist`) |
| `analyze_code` | Send a source file to **Google Gemini** for deep analysis — bugs, quality, security, improvements |
| `analyze_architecture` | AI-powered analysis of your entire repo's architecture and design patterns |
| `security_scan` | Scan your repository for hardcoded secrets, exposed API keys, and security risks |
| `refactor_code` | Get AI-powered refactoring suggestions for any source file |
| `semantic_search` | Search your codebase by meaning using natural language — not just exact text matches |

---

## Prerequisites

- Node.js 18+
- A [Google AI Studio](https://aistudio.google.com/) API key (required for AI-powered tools)

---

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/KeyboardNoMouse/dev-assistant-mcp.git
cd dev-assistant-mcp

# 2. Install dependencies
npm install

# 3. Configure environment
cp env.example .env
# Edit .env and add your GEMINI_API_KEY

# 4. Build
npm run build

# 5. Start the server
npm start
```

---

## Development

```bash
# Run in dev mode with ts-node (no build step needed)
npm run dev
```

---

## Project Structure

```
dev-assistant-mcp/
├── src/
│   ├── index.ts                  # MCP server entry point
│   ├── tools/
│   │   ├── systemInfo.ts         # system_info tool
│   │   ├── readFile.ts           # read_file tool
│   │   ├── searchCode.ts         # search_code tool
│   │   ├── summarizeRepo.ts      # summarize_repo tool
│   │   ├── analyzeCode.ts        # analyze_code tool (Gemini)
│   │   ├── analyzeArchitecture.ts # analyze_architecture tool (Gemini)
│   │   ├── securityScan.ts       # security_scan tool (Gemini)
│   │   ├── refactorCode.ts       # refactor_code tool (Gemini)
│   │   └── semanticSearch.ts     # semantic_search tool (Gemini)
│   └── utils/
│       ├── gemini.ts             # Shared Gemini API client
│       ├── embeddings.ts         # Vector embeddings for semantic search
│       ├── chunkText.ts          # Splits large files for AI processing
│       └── repoScanner.ts        # Shared repo file walking logic
├── dist/                         # Compiled output (after npm run build)
├── env.example
├── package.json
└── tsconfig.json
```

---

## Connecting to Claude

Add the server to your Claude Desktop config file (`claude_desktop_config.json`):

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

Once connected, Claude can use all 9 tools directly in conversation.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes (for AI tools) | Your Google Gemini API key from [aistudio.google.com](https://aistudio.google.com) |

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Run with `ts-node` in development mode |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server from `dist/` |

---

## License

MIT
