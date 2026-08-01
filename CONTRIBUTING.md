# Contributing to Iodine

Iodine is built to be forked and extended. This guide covers the project structure, common extension points, local development, AI features, and API reference.

## Project Structure

```
iodine/
├── package.json              # Root: npm workspaces + concurrently dev script
├── tsconfig.base.json        # Shared TypeScript config
│
├── client/                   # React + TypeScript frontend (Vite) — http://localhost:5173
│   └── src/
│       ├── App.tsx           # Renders WorkbenchLayout
│       ├── providers.ts      # AI provider + model definitions
│       ├── types/            # Shared types: FileNode, OpenFile, UIMessage, etc.
│       ├── api/              # Typed fetch wrappers for file/workspace endpoints
│       ├── hooks/            # useFileTree, useOpenFiles, useGitStatus, useCodingAssistant, …
│       └── components/
│           ├── layout/       # WorkbenchLayout, MenuBar, ActivityBar, Sidebar, EditorArea, RightPanel
│           ├── sidebar/      # FileExplorer, FileTreeNode, SourceControlPanel
│           ├── editor/       # EditorTabs, MonacoEditor, WelcomeScreen
│           ├── bottom/        # BottomTray, TerminalPanel, TerminalSession
│           └── right/         # CodingAssistant, BuildAssistant, SystemView
│
└── server/                   # Node.js + Express backend — http://localhost:3001
    └── src/
        ├── app.ts            # Express app factory (CORS, JSON, routes)
        ├── state.ts          # Shared mutable state and persisted workspace path
        ├── terminal.ts       # WebSocket terminal manager
        ├── routes/            # Files, Git, agent, summary, and build endpoints
        └── services/          # Filesystem tools and provider-specific AI agents
```

## Forking Guide

The three most common extension points:

**Add a right-panel tab** (for example, a database browser, diff viewer, or docs panel)
1. Create your component in `client/src/components/right/MyPanel.tsx`.
2. Add it to the tab strip and content switch in `client/src/components/layout/RightPanel.tsx`.

**Add an API route**
1. Create `server/src/routes/myroute.ts` with an Express `Router`.
2. Register it in `server/src/app.ts` with `app.use('/api', myRouter)`.

**Add a sidebar view**
1. Add its view ID to the `SidebarView` union in `client/src/types/index.ts`.
2. Add an icon and entry to `NAV_ITEMS` in `client/src/components/layout/ActivityBar.tsx`.
3. Render it in the `activeView` switch in `client/src/components/layout/Sidebar.tsx`.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- At least one AI provider API key

### Installation & Running

```bash
# Install all dependencies (client + server)
npm install

# Start both client and server in development mode
npm run dev
```

- **Client** (React + Vite): http://localhost:5173
- **Server** (Express): http://localhost:3001

Once running, open a project via **File → Open Project** or click **Open Folder** in the left sidebar.

> **Note — Open Project search scope:** The browser's directory picker only gives the app the folder name, not the full path. The server resolves the name by searching your home directory up to 3 levels deep. If your project lives outside your home directory, or is nested more than 3 levels deep, use **Open Folder** and type the absolute path directly.

### Other Scripts

```bash
npm run build      # Build both client and server for production
npm run typecheck  # Run TypeScript type checks across the monorepo
```

## AI Summary 📖

AI Summary is a tutor and walking encyclopedia embedded directly in the editor. Click **🤖 Summary** on any open file to get a tutorial-style Markdown document covering its overview, technology context, architecture role, public interface, data flow, patterns, and gotchas.

Summaries are cached at:

```
~/.iodine/<workspace-hash>/<file-path-hash>/<file-content-hash>_ai_summary.md
```

The file-content hash is the cache key: unchanged files open instantly, while edits trigger a new summary. Use **↺ Regenerate** to discard the cached version.

## Build Assistant 🔨

The **Build** tab provides editable commands for **Test**, **Build**, and **Build & Run**. Click **✨ Generate** to have the AI inspect project signals such as `package.json`, `Makefile`, `Cargo.toml`, `go.mod`, or `pyproject.toml`, then click **▶ Execute** to run the command in a new terminal tab.

Commands are saved to `~/.iodine/<workspace-hash>/build-config.json` and restored when you reopen the workspace.

## Coding Assistant

The Coding Assistant is an AI coding partner. Describe a feature, bug fix, or refactor in plain language; it can read, write, search, and run commands in your workspace. Terminal commands always require explicit approval.

Select a provider and model from the dropdowns.

### Supported Providers & API Keys

| Provider | API Key Location | Models |
|----------|-----------------|--------|
| **Anthropic** | `~/.anthropic/api_key` or `ANTHROPIC_API_KEY` env var | Claude Sonnet 4.6 / 4.5 / 3.7 |
| **OpenAI** | `OPENAI_TOKEN` env var | GPT-4o, GPT-4o mini, o3, o4-mini |
| **Google** | `GEMINI_API_KEY` env var | Gemini 2.5 Flash / Pro, 2.0 Flash |

> If Claude Code is installed, its Anthropic key is reused automatically.

The UI shows a warning when the selected provider key is not configured. Click **?** in the panel header for setup instructions.

### AI Tools

All providers share the same tool layer:

| Tool | Description |
|------|-------------|
| `read_file` | Read a file from the workspace |
| `write_file` | Write or create a file in the workspace |
| `list_directory` | Browse the directory tree (depth 3) |
| `search_files` | Grep-like text search across workspace files |
| `run_terminal_command` | Propose a shell command, wait for approval, then stream its output |
| `open_file` | *(Tutor Mode only)* Open a file and highlight a line range in the editor |

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/workspace/open` | Set workspace root `{ path }` |
| `POST` | `/api/workspace/close` | Clear workspace root |
| `GET` | `/api/workspace` | Get current workspace root |
| `POST` | `/api/workspace/find` | Search for a directory by name |
| `GET` | `/api/files/tree` | Full directory tree from workspace root |
| `GET` | `/api/files/content?path=` | Read a file's text content |
| `PUT` | `/api/files/content` | Write a file `{ path, content }` |
| `GET` | `/api/git/status` | Git status badges for the file tree |
| `GET` | `/api/git/diff?path=` | Unified diff for editor decorations |
| `GET` | `/api/git/changes` | Full staged/unstaged change list |
| `POST` | `/api/git/stage` | Stage a file `{ relPath }` |
| `POST` | `/api/git/unstage` | Unstage a file `{ relPath }` |
| `POST` | `/api/git/stage-all` | Stage all changes |
| `POST` | `/api/git/discard` | Discard changes `{ relPath, isUntracked }` |
| `POST` | `/api/files/create` | Create a file or directory |
| `POST` | `/api/files/rename` | Rename a file or directory |
| `POST` | `/api/git/commit` | Commit staged changes `{ message }` |
| `GET` | `/api/agent/status` | Per-provider API key status |
| `POST` | `/api/agent/chat` | SSE stream: AI chat with tool use |
| `POST` | `/api/agent/terminal/approval` | Approve or reject a pending terminal command |
| `GET` | `/api/system-graph` | Load saved architecture graph |
| `PUT` | `/api/system-graph` | Save architecture graph |
| `POST` | `/api/system-graph/generate` | SSE stream: agentic graph generation |
| `GET` | `/api/ai-summary?path=` | Return a cached AI summary |
| `POST` | `/api/ai-summary/generate` | SSE stream: generate and cache a summary |
| `GET` | `/api/build-config` | Return saved build commands |
| `PUT` | `/api/build-config` | Save build commands |
| `POST` | `/api/build-config/generate` | SSE stream: generate a shell command |
```
