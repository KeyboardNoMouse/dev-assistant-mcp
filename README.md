# dev-assistant-mcp

A **Model Context Protocol (MCP) server** that gives AI assistants (like Claude) powerful tools to read, search, and analyze your local codebase — including AI-powered code analysis via Google Gemini.

## Features

| Tool | Description |
|---|---|
| `read_file` | Read the contents of any file by path |
| `summarize_repo` | List all files in a repository (excluding `node_modules`, `.git`, `dist`) |
| `search_code` | Search across `.ts`, `.js`, `.tsx`, `.jsx`, `.py`, `.json`, `.md` files for a text query |
| `system_info` | Return platform, CPU, memory, and uptime info |
| `analyze_code` | Send a source file to **Google Gemini 2.0 Flash** for deep analysis — bugs, quality, security, improvements |

## Prerequisites

- Node.js 18+
- A [Google AI Studio](https://aistudio.google.com/) API key (for `analyze_code`)

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/your-username/dev-assistant-mcp.git
cd dev-assistant-mcp

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 4. Build
npm run build

# 5. Start the server
npm start
```

## Development

```bash
# Run in dev mode with ts-node (no build step needed)
npm run dev
```

## Project Structure

```
dev-assistant-mcp/
├── src/
│   ├── index.ts          # MCP server entry point
│   └── tools/
│       ├── readFile.ts   # read_file tool
│       ├── summarizeRepo.ts  # summarize_repo tool
│       ├── searchCode.ts # search_code tool
│       ├── systemInfo.ts # system_info tool
│       └── analyzeCode.ts # analyze_code tool (Gemini)
├── dist/                 # Compiled output (after npm run build)
├── .env.example
├── package.json
└── tsconfig.json
```

## Connecting to Claude (or other MCP clients)

Add the server to your MCP client config. For example in Claude Desktop's `claude_desktop_config.json`:

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

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes (for `analyze_code`) | Your Google Gemini API key |

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Run with `ts-node` in development mode |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server from `dist/` |

## License

MIT
