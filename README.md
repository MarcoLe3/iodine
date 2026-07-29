<p align="center">
  <img src="images/iodine_logo_2-preview.png" alt="Iodine" width="180" />
</p>

<h1 align="center">Iodine — Few Drops of IDE Essentials</h1>

<p align="center">
  <a href="https://paypal.me/hwshin">Support me on PayPal</a>
</p>

<img src="https://github.com/user-attachments/assets/55a721c6-8990-407f-a343-bdecbdf42b1e" alt="Iodine IDE demo" width="100%" />

<p align="center">
  More demos on YouTube: <a href="https://www.youtube.com/watch?v=5BlcEDO4Mrg">Demo 1</a> · <a href="https://www.youtube.com/watch?v=SjOQjkT9GJM">Demo 2</a> · <a href="https://youtu.be/M6C0rk1DwNs">Demo 3</a>
</p>

## About

Most AI coding tools take a text editor and add a chat panel. Iodine asks a different question: **what would a development environment look like if you designed it from scratch, knowing AI exists?**

The answer turns out to be more intuitive than what we have today.

Open a file — the architecture diagram highlights the node that implements it, automatically. Ask the Coding Assistant a question — it already sees what's on your screen, no copy-paste needed. Hit **Generate** on System View — the AI reads your actual source files and builds a diagram where every node links back to the exact lines that define it. Toggle Tutor Mode — the AI walks through the codebase with you, opening files and highlighting lines, without touching anything. Open any file cold — AI Summary teaches you what it does, how it fits in, and what to watch out for.

None of these are chatbot features. They're a different way of working — one where the environment understands the code alongside you, rather than waiting to be asked.

The IDE shell (Monaco editor, file explorer, git, terminal, tabs) is solid and familiar. But it's the scaffold, not the product.

### What this unlocks

- **Architecture that follows the cursor** — switch files and System View selects the matching node. The diagram isn't documentation that drifts; it's generated from what's actually on disk.
- **An AI that sees what you see** — the assistant automatically gets the lines currently visible in your editor as context, so you can say "what does this do?" and point at the screen.
- **A real agent, not a chatbot** — the Coding Assistant reads files, writes code, searches the workspace, runs terminal commands (with your explicit approval), checks the build output, and continues from there.
- **Learning built into the environment** — Tutor Mode and AI Summary make any unfamiliar codebase approachable without interrupting whoever wrote it.
- **You stay in control** — every terminal command surfaces an approval card with the exact command and reason before anything runs.

### Built to be forked

The stack is React + Express + TypeScript with no framework magic. Change the layout, add panels, wire new backend capabilities — you own the IDE, not just an extension sandbox. Iodine has reached the point where its own repository is its own development environment: open it in Iodine, ask the assistant to add a feature, and it reads the files, writes the change, and runs the build without you leaving the tab.

## Screenshots

![Iodine IDE — Editor and Coding Assistant](images/screenshot_1.png)
*Iodine IDE showcasing the main editor interface along with the AI-powered Coding Assistant.*

![Iodine IDE - Tutorial Mode](images/screenshot_3.png)
*Tutor mode guiding the user where to edit.*

![Iodine IDE - Preview Mode](images/screenshot_4.png)
*Preview mode showing live website in action.*

## Features

- 🖥️ **VS Code-like IDE shell** — Activity bar, file explorer sidebar, Monaco-powered code editor, and resizable panels
- 📑 **Editor tabs** — Open files appear as tabs above the editor. **Drag any tab left or right to reorder** it, and when tabs overflow the strip you can scroll horizontally (drag the scrollbar or use the mouse wheel — vertical wheel scrolling is translated into horizontal movement). Hover a tab to reveal its close button; a dot marks unsaved changes.
- 📁 **File & folder management** — Hover any folder to reveal a **+** button (New File / New Folder); double-click any name to rename it inline; hover any item to reveal a trash icon to delete it. All three operations error out if the target name already exists.
- 🤖 **AI Coding Assistant** — Your coding partner in the right panel: streaming chat with full tool use (read, write, search files, run terminal commands) backed by Claude, GPT, or Gemini. Describe what you want, and it figures out the edits.
- 🎓 **Tutor Mode** — Toggle **Tutor** in the Coding Assistant to switch the AI into a read-only guide. Turn 1: it reads the codebase silently and presents a numbered walk-through plan. Each subsequent reply opens exactly one file in the editor, highlights the relevant lines, and explains what to look at — then waits. The AI never writes code in this mode.
- 👁️ **User Visual Context** — The Coding Assistant automatically appends the lines currently visible in the Monaco editor (or your active selection) to every message, so the AI always knows what you're looking at without you having to paste code.
- 📖 **AI Summary** — A tutor and walking encyclopedia baked into the editor. Click **🤖 Summary** on any open file and get a comprehensive, tutorial-style explanation — framework history, architecture role, API breakdown, data flow diagrams, and gotchas. Summaries are cached locally (keyed to the file's content hash) so repeat opens are instant and token costs stay flat as the codebase grows.
- 🔨 **Build Assistant** — One-click test, build, and run. Click **✨ Generate** and the AI inspects your project (package.json scripts, Makefile targets, Cargo.toml, go.mod, etc.) and fills in the right command. Hit **▶ Execute** to open a dedicated terminal tab and run it instantly. Commands are saved per-workspace and restored automatically. The **Open URL** section lets you open any URL as an iframe tab in the editor.
- 🌿 **Source Control panel** — View Git status, stage/unstage files, discard changes, and commit — all from the UI
- 📂 **File preview** — Render `.md` (with GitHub Flavored Markdown) and `.html` files inline; view images and PDFs in dedicated viewers directly in the editor tab
- 🌐 **URL iframe tabs** — Type any URL in the Build tab's "Open URL" field and open it as a browser tab inside the editor, useful for viewing local dev servers or documentation alongside the code
- 💾 **Workspace persistence** — The last opened folder is remembered across server restarts; use **File → Close Project** to clear it and return to the clean-slate welcome screen
- 🖥️ **Integrated terminal** — A resizable bottom tray with a real pseudo-terminal (xterm.js + node-pty) running your shell at the workspace root. Open multiple sessions with **+**, close any with **✕**.
- 🗺️ **System View** — Interactive SVG graph editor for system architecture diagrams. Hit **⚡ Generate** and the AI explores your workspace with file tools, reads key files, and builds a graph from what it actually finds — no prompt needed. Nodes are draggable; pan and zoom with mouse. Diagram data is auto-saved to `~/.iodine/<workspace-hash>/system-graph.json`.

## System View 📈

Think of System View as "interactive documentation" that stays in-sync with the real code that is on disk.

What you will find on the screen:

| Area | Purpose |
|------|---------|
| Toolbar (top-left) | – **⚡ Generate** &nbsp;Run the AI agent and let it discover components, pages, APIs, databases, queues, etc.<br>– **＋ Node** &nbsp;Add a blank node manually.<br>– **🔗 Link** &nbsp;Draw an edge between two selected nodes.<br>– **🗑️ Delete** &nbsp;Remove selected nodes / edges. |
| Canvas | Interactive SVG/HTML layer powered by D3.  Nodes are draggable, selectable, and have smart snapping for edges.  Mouse-wheel to zoom, right-drag to pan. |
| Inspector (right sidebar) | Edit the selected node: label, kind (UI, API, DB, Cache, Worker, External), colour, and arbitrary key-value metadata (e.g. URL, repo link, tech).  For edges you can choose request type (REST/gRPC/Event) and latency. |
| Mini-map (bottom-right) | Bird’s-eye overview that shows where you are when zoomed in. |

Additional capabilities:

* 🧠 **AI-assisted updates** – After the initial generate you can re-run the agent and it will reconcile manual edits with new discoveries instead of overwriting everything.
* 💾 **Auto-save** – Every change is persisted to `~/.iodine/<workspace-hash>/system-graph.json` so the diagram re-appears exactly as you left it.
* 📤 **Export** – Click the download icon to export the canvas as PNG or SVG for slide decks or wikis.
* 🔒 **Isolated storage** – Because the JSON file lives in your home folder (outside the repo), it will **not** be committed to source control unless you copy it in manually. This keeps private architecture details out of pull requests by default.

> The goal is to remove the drift between architecture docs and reality.  Your diagram is always only one click away from reflecting the true state of the repository.

## Use Cases

* **Fork as an IDE** — All the hard parts (editor, file tree, git, terminal, AI) are already wired up. Add your own panels, tools, and workflows on top.
* **AI-assisted development tools** — Use the built-in agent infrastructure to build specialised coding assistants for your team or domain.
* **Learning / teaching** — A real, readable codebase showing how to integrate Monaco, xterm.js, git, and AI providers in a single app.
* **Internal developer tools** — Run it locally as a web IDE for any project, or deploy it for your team.

## How It Works

1. Open a local project folder via **File → Open Project** (searches `~` up to 3 levels deep by folder name).
2. Browse and edit files in the Monaco-powered editor. Git status, diffs, and per-hunk revert appear automatically.
3. Open any file and click **🤖 Summary** to get an AI-generated tutorial explaining the file — cached locally so the second open is instant.
4. Use the **Coding Assistant** tab to chat with an AI that can read, write, search, and run commands in your workspace. The AI automatically sees your currently visible editor lines as context.
5. Toggle **Tutor** in the Coding Assistant to enter Tutor Mode — the AI walks you through the codebase one file at a time, highlighting relevant lines, without making any changes.
6. Switch to the **Build** tab, click **✨ Generate** next to Test / Build / Build & Run, and the AI fills in the right command for your project. Click **▶ Execute** to run it in a new terminal tab. Use the **Open URL** field to open any URL (e.g. your dev server) as an iframe tab in the editor.
7. Switch to the **System View** tab and click **⚡ Generate** — the AI reads your actual files and builds an interactive architecture graph.
8. Use the integrated terminal to run commands directly in your workspace.

## Editor Tabs 📑

Every file you open gets a tab in the strip above the editor. The tab strip behaves like the one in VS Code:

- **Drag to reorder** — grab any tab and drag it left or right to change its position. Dropping it triggers `onTabReorder`, which is wired to `reorderFiles` in the `useOpenFiles` hook so the underlying `openFiles` order updates too.
- **Horizontal scrolling** — when more tabs are open than fit on screen, the strip scrolls horizontally. Drag the thin scrollbar, or use the mouse wheel: a vertical wheel gesture is translated into horizontal scrolling as long as there's overflow.
- **Active + dirty indicators** — the active tab is highlighted with an accent top border; files with unsaved edits show a dot that turns into a close button on hover.

The relevant pieces live in `client/src/components/editor/EditorTabs.tsx` (rendering, drag handlers, wheel-to-scroll), `client/src/components/layout/EditorArea.tsx` (passes the `onTabReorder` prop through), and `client/src/hooks/useOpenFiles.ts` (the `reorderFiles` state updater).

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
│           ├── editor/       # EditorTabs (draggable/scrollable tab strip), MonacoEditor, WelcomeScreen
│           ├── bottom/       # BottomTray, TerminalPanel, TerminalSession (xterm.js)
│           └── right/        # CodingAssistant, BuildAssistant, SystemView
│
└── server/                   # Node.js + Express backend — http://localhost:3001
    └── src/
        ├── app.ts            # Express app factory (CORS, JSON, routes)
        ├── state.ts          # Shared mutable state: rootPath (persisted to ~/.iodine/workspace)
        ├── terminal.ts       # WebSocket terminal manager — node-pty sessions on ws://localhost:3001/terminal
        ├── routes/
        │   ├── files.ts      # File system + workspace + git endpoints
        │   ├── agent.ts      # POST /api/agent/chat, POST /api/system-graph/generate (SSE), GET /api/agent/status
        │   ├── aiSummary.ts  # GET+POST /api/ai-summary — file summary cache + generation
        │   └── buildConfig.ts# GET+PUT /api/build-config, POST /api/build-config/generate
        └── services/
            ├── fileSystem.ts     # Pure FS operations + path traversal guard
            ├── fileTools.ts      # Shared tool schemas + executeTool() for all agents
            ├── anthropicAgent.ts # Agentic loop using @anthropic-ai/sdk
            ├── openaiAgent.ts    # Agentic loop using openai SDK
            └── geminiAgent.ts    # Agentic loop using @google/genai SDK
```

## Forking Guide

The three most common extension points:

**Add a right-panel tab** (e.g. a database browser, a diff viewer, a docs panel)
1. Create your component in `client/src/components/right/MyPanel.tsx`
2. Add it to the tab strip and content switch in `client/src/components/layout/RightPanel.tsx`

**Add an API route** (e.g. a new backend capability)
1. Create `server/src/routes/myroute.ts` with an Express `Router`
2. Register it in `server/src/app.ts` with `app.use('/api', myRouter)`

**Add a sidebar view** (e.g. a search panel, a bookmarks panel)
1. Add your new view id to the `SidebarView` union in `client/src/types/index.ts`
2. Add an icon + entry to `NAV_ITEMS` in `client/src/components/layout/ActivityBar.tsx`
3. Render your panel in the `activeView` switch in `client/src/components/layout/Sidebar.tsx`

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- At least one AI provider API key (see [Coding Assistant](#coding-assistant) below)

### Installation & Running

```bash
# Install all dependencies (client + server)
npm install

# Start both client and server in development mode
npm run dev
```

- **Client** (React + Vite): http://localhost:5173
- **Server** (Express): http://localhost:3001

Once running, open a project via **File → Open Project** in the menu bar or click **Open Folder** in the left sidebar.

> **Note — Open Project search scope:** The browser's directory picker only gives the app the folder *name*, not the full path. The server resolves the name by searching your home directory up to **3 levels deep** (i.e. `~/name`, `~/*/name`, `~/*/*/name`). If your project lives outside your home directory, or is nested more than 3 levels deep, use the sidebar **Open Folder** button and type the absolute path directly.

### Other Scripts

```bash
npm run build      # Build both client and server for production
npm run typecheck  # Run TypeScript type checks across the monorepo
```

## AI Summary 📖

AI Summary is a **tutor and walking encyclopedia** embedded directly in the editor. Where the Coding Assistant is a coding *partner* you converse with, AI Summary is a reference you *consult* — it teaches you about a file rather than acting on it.

Click **🤖 Summary** on any open file to get a tutorial-style Markdown document covering:

- **Overview** — what the file does and why it exists
- **Technology context** — brief history of any framework involved, comparable alternatives, and trade-off notes
- **Architecture & role** — how the file fits into the broader system, with ASCII diagrams where helpful
- **API / public interface** — every exported function, class, or HTTP route documented with signature, purpose, parameters, and a realistic example
- **Data flow** — how data enters and exits the module, visualised as an ASCII diagram
- **Key patterns & gotchas** — non-obvious behaviour, edge cases, and performance notes

### Persistent cache

Summaries are cached at:

```
~/.iodine/<workspace-hash>/<file-path-hash>/<file-content-hash>_ai_summary.md
```

The **file-content hash** is the cache key. This means:
- Repeat opens of an unchanged file are **instant** — no API call, no token spend.
- Edit the file and the old summary is silently superseded; a new one is generated on next open.
- Token costs stay flat as the codebase grows. You pay once per file version, not once per session.

Use the **↺ Regenerate** button in the summary header to discard the cached version and request a fresh one.

## Build Assistant 🔨

The **Build** tab in the right panel gives you one-click access to the three commands you run most — **Test**, **Build**, and **Build & Run**.

### How it works

Each section has:
- An editable command field — type or paste any shell command you like
- **✨ Generate** — the AI probes your workspace for project type signals (package.json scripts, Makefile targets, Cargo.toml, go.mod, pyproject.toml, etc.) and streams back the right command. No prompt needed.
- **▶ Execute** — opens a new terminal tab in the bottom tray and runs the command inside it. The tab is labelled with the command so you can keep multiple runs open side by side.

**Save** persists all three commands to `~/.iodine/<workspace-hash>/build-config.json`. They reload automatically the next time you open the same workspace.

### Supported project types

| Signal | Detected as |
|--------|-------------|
| `package.json` | npm/yarn/pnpm — scripts are read and preferred |
| `Cargo.toml` | Rust — `cargo test`, `cargo build`, `cargo run` |
| `go.mod` | Go — `go test ./...`, `go build`, `go run .` |
| `pyproject.toml` / `requirements.txt` | Python — `pytest`, etc. |
| `Makefile` | Make — available targets are listed for the AI |
| `CMakeLists.txt` | C/C++ cmake |
| `pom.xml` / `build.gradle` | Java/Kotlin Maven or Gradle |

## Coding Assistant

The Coding Assistant (right panel) is your **AI coding partner**. Describe what you want in plain language — add a feature, fix a bug, refactor a module — and the AI figures out the edits, writes the code, and can run build or test commands to verify the result. It has full read/write access to your workspace and asks for explicit approval before running any shell command.

Select a provider and model from the dropdowns, then chat naturally.

### Supported Providers & API Keys

| Provider | API Key Location | Models |
|----------|-----------------|--------|
| **Anthropic** | `~/.anthropic/api_key` or `ANTHROPIC_API_KEY` env var | Claude Sonnet 4.6 / 4.5 / 3.7 |
| **OpenAI** | `OPENAI_TOKEN` env var | GPT-4o, GPT-4o mini, o3, o4-mini |
| **Google** | `GEMINI_API_KEY` env var | Gemini 2.5 Flash / Pro, 2.0 Flash |

> If Claude Code is installed, its Anthropic key is reused automatically.

The UI shows a warning banner when the selected provider's key is not configured. Click **?** in the panel header for setup instructions.

### AI Tools

All three providers share the same tool layer and can perform:

| Tool | Description |
|------|-------------|
| `read_file` | Read a file from the workspace |
| `write_file` | Write (or create) a file in the workspace |
| `list_directory` | Browse the directory tree (depth 3) |
| `search_files` | Grep-like text search across workspace files |
| `run_terminal_command` | Propose a shell command — pauses for your approval, then runs it and streams stdout/stderr live into the chat |
| `open_file` | *(Tutor Mode only)* Open a file in the editor and highlight a line range — used by the AI to guide you through the codebase one file at a time |

When the AI wants to run a terminal command, it presents an approval card with the exact command, the reason it needs it, and whether it's expected to keep running (e.g. a dev server). Click **Approve** to execute or **Reject** to decline — the AI cannot run anything without your explicit confirmation. Output streams live into the chat, and the result (exit code, captured output, detected localhost URLs) is fed back to the model so it can interpret and continue.

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/workspace/open` | Set workspace root `{ path }` |
| `POST` | `/api/workspace/close` | Clear workspace root and delete persisted path |
| `GET` | `/api/workspace` | Get current workspace root |
| `POST` | `/api/workspace/find` | Search for a directory by name `{ name }` — scans `~/name`, `~/*/name`, `~/*/*/name` (skips `node_modules`, `.git`, etc.) |
| `GET` | `/api/files/tree` | Full directory tree from workspace root |
| `GET` | `/api/files/content?path=` | Read a file's text content |
| `PUT` | `/api/files/content` | Write a file `{ path, content }` |
| `GET` | `/api/git/status` | Git status badges for the file tree |
| `GET` | `/api/git/diff?path=` | Unified diff for editor decorations |
| `GET` | `/api/git/changes` | Full staged/unstaged change list for SCM panel |
| `POST` | `/api/git/stage` | Stage a file `{ relPath }` |
| `POST` | `/api/git/unstage` | Unstage a file `{ relPath }` |
| `POST` | `/api/git/stage-all` | Stage all changes |
| `POST` | `/api/git/discard` | Discard changes `{ relPath, isUntracked }` |
| `POST` | `/api/files/create` | Create a file or directory `{ path, type: 'file'\|'directory' }` — 409 if already exists |
| `POST` | `/api/files/rename` | Rename a file or directory `{ oldPath, newName }` — 409 if target name already exists |
| `POST` | `/api/git/commit` | Commit staged changes `{ message }` |
| `GET` | `/api/agent/status` | Per-provider API key status |
| `POST` | `/api/agent/chat` | SSE stream: AI chat with tool use |
| `POST` | `/api/agent/terminal/approval` | Approve or reject a pending terminal command `{ id, approved }` |
| `GET` | `/api/system-graph` | Load saved architecture graph for current workspace |
| `PUT` | `/api/system-graph` | Save architecture graph for current workspace |
| `POST` | `/api/system-graph/generate` | SSE stream: agentic graph generation (reads workspace) |
| `GET` | `/api/ai-summary?path=` | Return cached AI summary for the file at `path` (or `null` if not cached) |
| `POST` | `/api/ai-summary/generate` | SSE stream: generate tutorial-style summary, cache on completion |
| `GET` | `/api/build-config` | Return saved build commands `{ test, build, run }` for current workspace |
| `PUT` | `/api/build-config` | Save build commands `{ test, build, run }` for current workspace |
| `POST` | `/api/build-config/generate` | SSE stream: AI-generated shell command for `{ type: 'test'\|'build'\|'run' }` |
