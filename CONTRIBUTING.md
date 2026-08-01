# Contributing to Iodine

Iodine — the IDE that teaches you — is built to be forked and extended. This guide covers the project structure, common extension points, local development, AI features, and API reference.

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
│           └── right/        # CodingAssistant, BuildAssistant, SystemView
│
├── server/                   # Express + WebSocket backend — http://localhost:3001
│   └── src/
│       ├── app.ts            # Express app and route registration
│       ├── index.ts           # HTTP/WebSocket server startup
│       ├── state.ts           # Persisted workspace state
│       ├── terminal.ts        # node-pty terminal sessions
│       ├── routes/             # files, agent, AI summary, Git, project, build config
│       └── services/           # AI provider adapters and agent tools
│
├── images/                   # Logo, screenshots, and demo video
├── README.md                 # Product overview and getting started guide
├── CONTRIBUTING.md           # This document
├── SOURCE_CONTROL.md         # Git integration reference
└── DEBUGGING.md              # Debugging notes and known failure modes
```

## Local Development

### Prerequisites

- Node.js 18+
- npm 9+
- At least one AI provider API key

### Install and run

```bash
npm install
npm run dev
```

The client runs at `http://localhost:5173`; the server runs at `http://localhost:3001`.

### Useful commands

```bash
npm run build
npm run typecheck
```

## AI Features

Iodine's AI features are designed to help developers understand and contribute to unfamiliar codebases:

- **Coding Assistant** — A tool-using assistant that can read, search, write, and modify workspace files.
- **Tutor Mode** — A read-only, step-by-step walkthrough that opens files and highlights relevant lines without writing code.
- **AI Summary** — Cached tutorial-style explanations for files and directories.
- **Build Assistant** — Project-aware generation of test, build, and run commands.
- **System View** — Interactive architecture diagrams generated from the source code, with links back to implementation.

Provider and model definitions live in `client/src/providers.ts`; provider adapters and agent tools live under `server/src/services/`.

## Extension Points

### Add a client feature

1. Add or update shared types in `client/src/types/`.
2. Add API wrappers in `client/src/api/` when the feature needs server communication.
3. Put reusable stateful behavior in `client/src/hooks/`.
4. Add UI components under the closest existing `client/src/components/` area.
5. Thread the feature through `WorkbenchLayout` when it needs workspace-level state or coordination.

### Add a server route

1. Create a route module under `server/src/routes/`.
2. Register it in `server/src/app.ts`.
3. Keep workspace-path validation and error handling close to the route boundary.
4. Add or update typed client wrappers for the endpoint.

### Add an AI provider

1. Add provider/model metadata in `client/src/providers.ts`.
2. Implement the provider adapter under `server/src/services/`.
3. Keep tool behavior provider-independent by using the shared agent-tool layer.
4. Update the provider selection UI and documentation.

## Design Principles

- Help users understand before asking them to act.
- Keep Tutor Mode read-only and explicit about what it is showing.
- Ground explanations in files and line ranges from the actual workspace.
- Require explicit approval before running shell commands.
- Prefer shared theme variables over hard-coded colors.
- Keep Iodine easy to fork: use straightforward React, Express, and TypeScript rather than opaque framework abstractions.

## API Reference

The main API areas are:

| Area | Route module |
|------|-------------|
| Files and workspace | `server/src/routes/files.ts` |
| Agent chat | `server/src/routes/agent.ts` |
| AI summaries | `server/src/routes/aiSummary.ts` |
| Build configuration | `server/src/routes/buildConfig.ts` |
| Project metadata | `server/src/routes/project.ts` |
| Git integration | `server/src/routes/git.ts` |

For endpoint payloads and implementation details, inspect the route module and its corresponding client API wrapper.

## Pull Requests

Before opening a pull request:

1. Run `npm run typecheck`.
2. Run `npm run build`.
3. Explain user-facing behavior and any changes to AI prompts or tool permissions.
4. Include screenshots or a short recording for meaningful UI changes.
5. Keep documentation in sync with the implementation.
