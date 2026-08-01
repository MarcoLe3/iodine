<p align="center">
  <img src="images/iodine_logo_2-preview.png" alt="Iodine" width="180" />
</p>

<h1 align="center">Iodine — Few Drops of IDE Essentials</h1>

<p align="center">
  An AI-native IDE that turns unfamiliar Git repositories into interactive learning environments.
</p>

## Tutor Mode

**Open any repository.**  
**Turn on Tutor.**  
**The IDE teaches you the project one file at a time.**

Tutor Mode is Iodine's central experience. The AI reads the codebase and presents a numbered walkthrough plan. Each subsequent reply opens exactly one file, highlights the relevant lines, and explains what to look at before waiting for you to continue. It never writes code in this mode, so you can build understanding without losing control.

Every explanation is grounded in the real project—from architecture diagrams down to highlighted source lines.

<img src="https://github.com/user-attachments/assets/55a721c6-8990-407f-a343-bdecbdf42b1e" alt="Iodine IDE demo" width="100%" />

<p align="center">
  More demos on YouTube: <a href="https://www.youtube.com/watch?v=5BlcEDO4Mrg">Demo 1</a> · <a href="https://www.youtube.com/watch?v=SjOQjkT9GJM">Demo 2</a> · <a href="https://youtu.be/M6C0rk1DwNs">Demo 3</a>
</p>

## The problem

Every engineer eventually opens a repository they do not understand.

Maybe it is your first week on a new team. Maybe it is a large open-source project. Maybe it is code you wrote two years ago. You know the feeling: hundreds of files, unfamiliar architecture, incomplete documentation, and no obvious place to begin.

Software engineers can spend weeks onboarding to unfamiliar systems. Documentation drifts, architecture diagrams become outdated, and AI assistants often solve problems without helping developers understand them.

Existing AI coding tools are excellent at generating code. Iodine explores a different approach: **using AI to shorten the path from unfamiliarity to confident contribution**.

Success is measured by whether the user becomes more capable after using Iodine.

Our long-term goal is to turn any Git repository into an interactive learning environment where AI explains architecture, guides exploration, connects documentation to implementation, and helps you make your first meaningful contribution without taking ownership away from you.

## Why Iodine is different

Iodine is organized around the learning journey:

### Understand

- **AI Summary** — Tutorial-style explanations of any file, including its role, APIs, data flow, and gotchas.
- **System View** — Interactive architecture diagrams generated from the actual source code, with nodes linked back to implementation.
- **Architecture highlighting** — Open a file and the corresponding System View node is highlighted automatically.

### Explore

- **Tutor Mode** — A read-only AI guide that walks through an unfamiliar codebase one file at a time, opening files and highlighting the lines worth studying.
- **Visible editor context** — The assistant automatically sees the code currently visible in your editor, so you can ask about what is on screen without copy-pasting.
- **Interactive navigation** — Move between explanations, source files, architecture, and documentation without leaving the IDE.

### Contribute

- **Coding Assistant** — Read, write, search, and modify workspace files with Claude, GPT, or Gemini.
- **Build Assistant** — Generate and run project-specific test, build, and run commands.
- **Git integration** — Review status and diffs, stage changes, discard edits, and commit from the UI.
- **Terminal approval** — Every shell command requires your explicit approval before it runs.

## Screenshots

![Iodine IDE — Editor and Coding Assistant](images/screenshot_1.png)
*Iodine IDE showcasing the main editor interface along with the AI-powered Coding Assistant.*

![Iodine IDE - Tutor Mode](images/screenshot_3.png)
*Tutor Mode guiding the user through the project.*

![Iodine IDE - Preview Mode](images/screenshot_4.png)
*Preview mode showing a live website in action.*

## Built to extend

Iodine includes a complete IDE foundation—editor, terminal, Git integration, workspace management, and AI tooling—allowing contributors to focus on new developer experiences instead of rebuilding the basics.

The project is built to be forked. Change the layout, add panels, wire new backend capabilities, or build specialized developer tools on top of a familiar foundation. The stack is React + Express + TypeScript with no framework magic.

## Features

- 🖥️ **VS Code-like IDE** — Activity bar, file explorer, Monaco-powered editor, tabs, and resizable panels
- 📑 **Editor tabs** — Drag tabs to reorder them, scroll when they overflow, and track unsaved changes
- 📁 **File and folder management** — Create, rename, and delete files and folders from the explorer
- 🤖 **AI Coding Assistant** — Streaming chat with tool use backed by Claude, GPT, or Gemini
- 🎓 **Tutor Mode** — Read-only, step-by-step codebase walkthrough with file opening and line highlighting
- 👁️ **User Visual Context** — Automatically includes visible editor lines or the active selection in AI context
- 📖 **AI Summary** — Cached, tutorial-style explanations for files and their place in the system
- 🔨 **Build Assistant** — AI-generated test, build, and run commands with integrated terminal execution
- 🌿 **Source Control** — Git status, staging, unstaging, discard, diffs, and commits from the UI
- 📂 **File preview** — Render Markdown and HTML, and view images and PDFs inline
- 🌐 **URL iframe tabs** — Open local development servers and documentation alongside your code
- 💾 **Workspace persistence** — Restore the last opened project across server restarts
- 🖥️ **Integrated terminal** — Multiple resizable xterm.js sessions backed by node-pty
- 🗺️ **System View** — Generate, edit, save, and export interactive architecture diagrams

## System View 📈

System View is interactive documentation generated from the code that is actually on disk.

- **Generate** — The AI explores the workspace and discovers components, pages, APIs, databases, queues, and more.
- **Navigate** — Nodes link back to source locations, and opening a file highlights its matching node.
- **Edit** — Drag, pan, zoom, add, link, delete, and inspect nodes and edges.
- **Reconcile** — Re-run generation to reconcile manual edits with new discoveries.
- **Persist** — Changes are saved to `~/.iodine/<workspace-hash>/system-graph.json` outside the repository by default.
- **Export** — Download the canvas as PNG or SVG for slide decks and wikis.

## Use Cases

- **Understand an unfamiliar codebase** — Learn architecture and implementation one guided step at a time.
- **Fork as an IDE** — Add panels, tools, and workflows on top of an existing editor, Git, terminal, and AI foundation.
- **Build AI-assisted developer tools** — Use the built-in agent infrastructure for specialized assistants.
- **Learn or teach** — Explore a readable example integrating Monaco, xterm.js, Git, and multiple AI providers.
- **Build internal developer tools** — Run Iodine locally as a web IDE for any project or deploy it for a team.

## How It Works

1. Open a local project folder via **File → Open Project** or **Open Folder**.
2. Browse and edit files in the Monaco-powered editor with Git status and diffs.
3. Open a file and click **🤖 Summary** for a cached AI-generated tutorial.
4. Use the **Coding Assistant** to ask questions or make changes with workspace tools.
5. Toggle **Tutor** to walk through the codebase one file at a time without making changes.
6. Use the **Build** tab to generate and execute project-specific commands in a terminal.
7. Open **System View** and click **⚡ Generate** to build an interactive architecture graph.
8. Use the integrated terminal to run commands directly in your workspace.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Code editor | Monaco Editor (`@monaco-editor/react`) |
| Terminal | xterm.js (`@xterm/xterm` + `@xterm/addon-fit`), node-pty |
| Markdown preview | `react-markdown` + `remark-gfm` |
| AI providers | Anthropic Claude, OpenAI GPT, Google Gemini |
| Backend | Node.js, Express 4, TypeScript, `ws` (WebSocket) |
| Dev runner | `tsx watch` (server), Vite HMR (client) |
| Monorepo | npm workspaces + `concurrently` |

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
- At least one AI provider API key (see [Coding Assistant](#coding-assistant))

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