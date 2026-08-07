# Iodine — IDE for Open-source Development — Developer Notes

## Light / Dark Mode

Theme support is client-side and uses shared CSS variables so components do not need separate light and dark implementations.

| File | Role |
|------|------|
| `client/src/hooks/useTheme.ts` | Owns the `light` / `dark` state, reads and writes the `iodine-theme` local-storage preference, falls back to `prefers-color-scheme`, and sets `data-theme` plus `color-scheme` on `<html>`. |
| `client/src/components/layout/WorkbenchLayout.tsx` | Mounts `useTheme()` and passes the current theme and toggle callback to the menu bar. |
| `client/src/components/layout/MenuBar.tsx` | Renders the sun/moon toggle and calls `onToggleTheme`. |
| `client/src/index.css` | Defines the default dark tokens in `:root` and light overrides in `:root[data-theme='light']`. The activity bar, sidebars, editor, tabs, assistant, terminal tray, inputs, previews, canvas, borders, text, icons, and scrollbars consume these variables. |
| `client/src/components/editor/MonacoEditor.tsx` | Selects Monaco's `light` or `vs-dark` theme from `document.documentElement.dataset.theme`. |
| `client/src/components/right/SystemView.tsx` | Applies the matching Monaco theme to the System View JSON editor. |
| `client/src/components/bottom/TerminalSession.tsx` | Builds the xterm theme from CSS variables and observes the root `data-theme` attribute so existing sessions update without reconnecting. |
| `client/src/components/bottom/TerminalPanel.tsx` | Styles the terminal tab strip, active tab, labels, and controls with shared theme variables. |
| `client/src/components/right/CodingAssistant.tsx` | Uses theme variables for assistant cards, command text, and live terminal-command output. |

When adding or changing UI, use the existing `--color-*` variables rather than hard-coded dark colors. Add a semantic token to both `:root` and `:root[data-theme='light']` when no suitable variable exists. Canvas-rendered or third-party widgets such as xterm and Monaco do not automatically inherit CSS colors; explicitly update their theme when `data-theme` changes.

## Editor Tabs

Open files render as tabs in a strip above the editor. The strip supports drag-to-reorder and horizontal scrolling (VS Code-style).

| File | Role |
|------|------|
| `client/src/components/editor/EditorTabs.tsx` | Renders the tab strip. Each tab is `draggable`; `onDragStart` records the source index in `dragIndexRef`, `onDragOver` sets `dragOverIndex` (draws an accent left border as a drop hint), and `onDrop` calls `onTabReorder(fromIndex, toIndex)`. `handleWheel` converts a predominantly-vertical mouse-wheel gesture into horizontal `scrollLeft` when the strip overflows (`overflowX: 'auto'`). Active tabs get an accent top border; dirty files show a dot that swaps to a close button on hover. |
| `client/src/components/layout/EditorArea.tsx` | Accepts the optional `onTabReorder?: (fromIndex, toIndex) => void` prop and threads it (along with `openFiles`, `activeFilePath`, `onTabClick`, `onTabClose`) into `EditorTabs`. |
| `client/src/hooks/useOpenFiles.ts` | `reorderFiles(fromIndex, toIndex)` is the state updater: it bounds-checks the indices then splices the moved entry into its new position in `openFiles`. Exposed from the hook and wired to `EditorArea`'s `onTabReorder` in `WorkbenchLayout`. |

## Editor Menu — Tab Management

The **Editor** menu in the menu bar provides three tab-management actions:

| Action | Description | Implementation |
|--------|-------------|-----------------|
| **Close All Tabs** | Closes all open tabs with a confirmation dialog | `MenuBar.tsx` shows a dialog asking "Are you sure you want to close all N tabs?" |
| **Close Unedited Files** | Closes all tabs that have no unsaved changes (no dirty indicator dot) | `MenuBar.tsx` calls `onCloseUneditedTabs()`, which filters `openFiles` in `useOpenFiles.ts` to retain only files where `isDirty === true` |
| **Sort Tabs by File Structure** | Arranges tabs in the order they appear in the file tree | `MenuBar.tsx` calls `onSortTabsByFileStructure()`, which sorts `openFiles` by workspace-relative path |

These actions are wired in `MenuBar.tsx` via callbacks from `WorkbenchLayout.tsx`:
- `MenuBarProps.onCloseAllTabs` → closes all files
- `MenuBarProps.onCloseUneditedTabs` → closes only unedited files  
- `MenuBarProps.onSortTabsByFileStructure` → reorders tabs by path

The "Close All Tabs" action requires confirmation. "Close Unedited Files" runs immediately with no dialog since it only affects clean files. All three buttons are disabled when no tabs are open.

## Image & PDF Viewers

Binary files (images and PDFs) are displayed in dedicated viewers instead of being loaded into the text editor.

| File | Role |
|------|------|
| `client/src/components/editor/ImageViewer.tsx` | Renders JPEG, PNG, GIF, WebP, SVG and other image formats with zoom controls (`In`, `Out`, `Reset`). Displays the filename in a toolbar. Shows an error message if the image fails to load. |
| `client/src/components/editor/PdfViewer.tsx` | Renders PDF files using an iframe that connects to `GET /api/files/pdf?path=`. Displays the filename in a toolbar. Shows an error message if the PDF fails to load. |
| `client/src/hooks/useOpenFiles.ts` | `isPdfFile(path)` helper detects `.pdf` extensions. When opening a PDF, it's marked with `isPdf: true` and no content is fetched (similar to images). `refreshFile()` skips PDFs since they don't need content updates. |
| `client/src/types/index.ts` | `OpenFile` interface includes optional `isPdf?: boolean` property to indicate PDF files. |
| `client/src/components/layout/EditorArea.tsx` | Checks `activeFile.isImage` or `activeFile.isPdf` and renders the appropriate viewer component. PDFs are excluded from AI summary and preview features (only text files support these). |
| `server/src/routes/files.ts` | `GET /api/files/image?path=` and `GET /api/files/pdf?path=` retrieve files from the workspace using a relative path query parameter. Both endpoints set appropriate MIME types and handle errors. |

**Key behavior:** Images and PDFs do not appear in the editor pane as source code; they render in purpose-built viewers. Neither format supports the AI Summary feature (image and PDF analysis is out of scope). The "Preview" button is also hidden for these file types.

## AI Summary

The editor pane has a three-way view toggle: **source / preview / summary**.

| File | Role |
|------|------|
| `client/src/components/layout/EditorArea.tsx` | Owns `editorView` state (`'source' \| 'preview' \| 'summary'`). Renders the `🤖 Summary` button for any non-image, non-PDF file when a workspace is open. Streams `text_delta` SSE events from the server and renders partial Markdown progressively. Provides a `↺ Regenerate` button to clear the in-session cache and re-run. Accepts `summaryRequestPath` prop to open in summary view when triggered externally (both files and directories). |
| `client/src/api/files.ts` | `getAiSummary(workspacePath, filePath, isDirectory?)` probes the cache (`GET /api/ai-summary` or `/api/ai-directory-summary`). `generateAiSummary(workspacePath, filePath, provider, model, isDirectory?)` POSTs to the generate endpoint, collects the full SSE stream, and returns `{ content }`. |
| `server/src/routes/aiSummary.ts` | `GET /api/ai-summary?path=` and `GET /api/ai-directory-summary?path=` check the disk cache. `POST /api/ai-summary/generate` and `POST /api/ai-directory-summary/generate` stream LLM-generated summaries, then write to cache. |

**File cache path:** `~/.iodine/<workspace-md5>/<relpath-md5>/<file-content-md5>_ai_summary.md`
**Directory cache path:** `~/.iodine/<workspace-md5>/<relpath-md5>/<dir-contents-md5>_ai_dir_summary.md`
The content hash means the cache auto-invalidates when the file/directory structure changes.

**Directory summary** is accessible via the `+` hover menu on any folder in the file tree ("View/Generate Summary"). Directories open as synthetic tabs with `isDirectory: true`; `WorkbenchLayout` calls `handleDirSummary` which opens the tab and sets `summaryRequestPath`, triggering `EditorArea` to auto-switch to summary view and start generation.

**Provider/model state** is owned by `WorkbenchLayout` and passed down to `RightPanel`, `CodingAssistant`, `SystemView`, and `EditorArea` so all features share the same selection.

## Outline / Table-of-Contents Sidebar Panel

When a file is in **Preview** or **AI Summary** mode the activity bar's third icon (document outline) becomes active and the sidebar automatically switches to the **Outline** panel. The panel lists all headings from the rendered content, indented by level. Clicking a heading scrolls to it; the active heading is bolded and accent-coloured, its ancestors are semi-bold.

| File | Role |
|------|------|
| `client/src/types/index.ts` | `SidebarView` union includes `'outline'` as the third value. |
| `client/src/components/layout/ActivityBar.tsx` | Adds `OutlineIcon` (document SVG) as the 3rd nav item. |
| `client/src/components/sidebar/OutlinePanel.tsx` | Parses Markdown content into `HeadingEntry[]` with `parseHeadings` (regex on `#`-prefixed lines). Renders each heading as a button indented by `(level − minLevel) × 14 + 12` px. Active heading gets `fontWeight: 700`, accent colour, and a `▸` prefix; ancestor headings get `fontWeight: 600`. Shows "No headings found." when the file has no headings. |
| `client/src/components/layout/Sidebar.tsx` | Renders `<OutlinePanel>` when `activeView === 'outline'`. Accepts `outlineContent`, `onOutlineNavigate`, and `activeHeadingId` props. |
| `client/src/components/layout/EditorArea.tsx` | Fires `onEditorViewChange` on view change. Fires `onSummaryContentChange` whenever `summaryContent` updates (each streamed chunk) so the parent can feed it to the outline without duplicating state. `scrollToHeading(id)` picks `summaryRef` or `previewRef` based on current `editorView`, queries for `#<CSS.escape(id)>`, and smooth-scrolls. Both preview and summary `ReactMarkdown` renders use `makeHeadingId` on h1–h6 so ids are present in the DOM. |
| `client/src/components/layout/WorkbenchLayout.tsx` | `handleEditorViewChange` switches sidebar to `'outline'` on both `'preview'` and `'summary'`, reverts to `'explorer'` otherwise. Holds `summaryOutlineContent` state (fed by `onSummaryContentChange`); resets it on file change. `outlineContent` passed to Sidebar is `summaryOutlineContent` in summary view and the source file content in preview view. |

**Slug algorithm (`slugify`):** lowercase → strip inline Markdown punctuation (`*_\`~[]()!`) → strip non-word characters → collapse spaces to `-` → trim. Identical in `OutlinePanel` and `makeHeadingId` so outline entries always map to the correct heading element `id`.

**Auto-switch flow:**
1. User clicks **👁 Preview** or **✨ Summary** → `EditorArea` fires `onEditorViewChange('preview'|'summary')`.
2. `WorkbenchLayout.handleEditorViewChange` sets `activeView = 'outline'` → sidebar switches panels.
3. For summary: `onSummaryContentChange` streams generated text into `summaryOutlineContent` → outline updates live as generation proceeds.
4. User clicks a heading → `handleOutlineNavigate(id)` → `scrollToHeading(id)` → correct container scrolls smoothly.
5. User clicks **⌨ Source** → sidebar reverts to `'explorer'`.

## Source / Preview Scroll Sync

When toggling between the **source** (Monaco) and **preview** (rendered Markdown) views of a `.md` file, the editor preserves the approximate reading position using a scroll-percentage approach.

| File | Role |
|------|------|
| `client/src/components/layout/EditorArea.tsx` | Owns `scrollPercentageRef` (0–1 ratio), `previousViewRef` (last active view), and `previewRef` (DOM ref on the preview `<div>`). `captureScrollPercentage()` snapshots the ratio before a view switch; `restoreScrollPercentage(view)` applies it in the new view using a double-`requestAnimationFrame` to wait for layout. |

**Flow:**
1. User clicks the `👁 Preview` / `⌨ Source` button → `captureScrollPercentage()` is called synchronously, then `setEditorView(...)` queues the React update.
2. A `useEffect` keyed on `[editorView]` detects the change via `previousViewRef` and calls `restoreScrollPercentage(newView)`.
3. The double-RAF pattern (`rAF → restore → rAF → restore`) handles both React's render frame and the browser's layout frame so dimensions are available before scrolling.
4. `onScroll={captureScrollPercentage}` on the preview div keeps the ratio current as the user scrolls, so switching back to source also lands in the right place.
5. On Monaco mount (`onEditorMount`), `restoreScrollPercentage('source')` is called so the position is correct after the editor first renders.
6. When the active file changes, both refs reset to 0 / the new view so each file starts at the top.

**Key design:** Scroll percentage (not line number) is used because the preview renders Markdown differently from the source — a 30% scroll in source maps to roughly 30% of the rendered output regardless of heading sizes or image heights.

## Build Assistant

The **Build** tab in the right panel provides three sections — **Test**, **Build**, and **Build & Run** — each with an editable command field, an AI **Generate** button, and an **Execute** button. A **Save** button at the bottom persists all three commands to disk and reloads them automatically on the next workspace open. An **Open URL** section at the bottom of the scrollable area lets the user open any URL as an iframe tab in the editor.

| File | Role |
|------|------|
| `client/src/components/right/BuildAssistant.tsx` | UI component. Loads saved config from `GET /api/build-config` on workspace change. Streams AI-generated commands via `POST /api/build-config/generate`. Execute calls `runCommandInTerminal(cmd)` which opens a new terminal tab pre-loaded with the command. Accepts `onOpenUrl?(url)` prop; the "Open URL" section normalises the input (prepends `https://` if no protocol), then calls `onOpenUrl`. |
| `server/src/routes/buildConfig.ts` | `GET /api/build-config` reads `~/.iodine/{md5}/build-config.json`. `PUT /api/build-config` writes it. `POST /api/build-config/generate` probes the workspace for project type (package.json scripts, Makefile targets, Cargo.toml, etc.) and streams a single shell command from the selected LLM. |
| `client/src/components/bottom/TerminalPanel.tsx` | Converted to `forwardRef`. Exposes `TerminalPanelHandle.runCommand(cmd)` which creates a new tab with `ws://localhost:3001/terminal?cwd=…&cmd=…` — the server spawns the shell with `-c cmd` automatically. The tab label shows the command's first token. |
| `client/src/components/bottom/BottomTray.tsx` | Converted to `forwardRef`. Exposes `BottomTrayHandle.runCommand(cmd)` which activates the Terminal tab then delegates to `TerminalPanel`. |
| `client/src/components/layout/WorkbenchLayout.tsx` | Holds `bottomTrayRef` and creates `runCommandInTerminal` callback, threading it to `RightPanel`. Also creates `handleOpenUrl` which calls `openUrl(url)` from `useOpenFiles`. |
| `client/src/components/layout/RightPanel.tsx` | Adds "Build" tab between Coding Assistant and System View. Passes `runCommandInTerminal` and `onOpenUrl` to `BuildAssistant`. |

**Persistence path:** `~/.iodine/{MD5(workspacePath)}/build-config.json`

## URL Iframe Tabs

Any URL can be opened as a tab in the editor area, rendering an `<iframe>` instead of source code. This is useful for viewing local dev servers, documentation, or any web content alongside the code.

| File | Role |
|------|------|
| `client/src/types/index.ts` | `OpenFile` gains `isUrl?: boolean` and `url?: string` fields. |
| `client/src/hooks/useOpenFiles.ts` | `openUrl(url)` creates an `OpenFile` entry with `isUrl: true`, using `__url__:<url>` as the unique path key and the URL's hostname as the display name. No content fetch. `refreshFile` skips URL tabs. Exposed in the hook's return value. |
| `client/src/components/layout/EditorArea.tsx` | After the PDF branch, checks `activeFile.isUrl` and renders `<iframe src={url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups …">`. URL tabs are excluded from the AI summary button, the preview button, and the diff hook. |
| `client/src/components/editor/EditorTabs.tsx` | Renders a 🌐 globe icon before the tab name when `file.isUrl` is true. |

**Tab key:** URL tabs use `__url__:<url>` as their `path` to avoid collisions with real file paths. Opening the same URL twice activates the existing tab rather than creating a duplicate.

## User Visual Context in Coding Assistant

When the user sends a message, the coding assistant automatically appends the currently visible lines (or selected text) from the Monaco editor to the API request as a **User Visual Context** block. The UI displays only the user's typed message; the context is invisible to the user but available to the LLM.

| File | Role |
|------|------|
| `client/src/components/editor/MonacoEditor.tsx` | Accepts `onEditorMount` prop; calls it with the Monaco editor instance once mounted. |
| `client/src/components/layout/EditorArea.tsx` | Stores the editor instance in `monacoEditorRef`. Exposes `getVisibleContext()` on `EditorAreaHandle`, which reads the selection (if non-empty) or the first visible range and returns line-numbered text. |
| `client/src/components/layout/WorkbenchLayout.tsx` | Creates `getEditorContext` callback (`editorAreaRef.current?.getVisibleContext()`) and passes it to `RightPanel`. |
| `client/src/components/layout/RightPanel.tsx` | Threads `getEditorContext` through to `CodingAssistant`. |
| `client/src/components/right/CodingAssistant.tsx` | Calls `getEditorContext()` in `handleSend` and passes the result to `sendMessage`. |
| `client/src/hooks/useCodingAssistant.ts` | `sendMessage` accepts `editorContext?: string \| null`. If present, appends it as a fenced code block under `**User Visual Context**` in the API history entry only (not in the UI message). |

## Coding Assistant Context Chips ("Add to Context")

Files and folders can be pinned to the Coding Assistant via the `+` hover menu in the file tree. Pinned items appear as chips above the chat input and inject a **Relevant paths hint** block into the API message when the user sends, guiding the LLM to those paths first.

| File | Role |
|------|------|
| `client/src/components/sidebar/FileTreeNode.tsx` | "Add to Context" option in the `+` dropdown for every file and directory. Calls `onAddToContext(node)`. |
| `client/src/components/sidebar/FileExplorer.tsx` | Threads `onAddToContext` down to `FileTreeNode`. |
| `client/src/components/layout/Sidebar.tsx` | Threads `onAddToContext` down to `FileExplorer`. |
| `client/src/components/layout/WorkbenchLayout.tsx` | Owns `contextNodes: FileNode[]` state. `handleAddToContext` de-dupes and appends; `handleRemoveContextNode` removes one; `handleClearContextNodes` clears all (called after send). Passes all three to `RightPanel`. |
| `client/src/components/layout/RightPanel.tsx` | Threads `contextNodes`, `onRemoveContextNode`, `onClearContextNodes` to `CodingAssistant`. |
| `client/src/components/right/CodingAssistant.tsx` | Renders chips above the textarea. In `handleSend` converts nodes to workspace-relative paths, clears chips, and passes paths to `sendMessage`. |
| `client/src/hooks/useCodingAssistant.ts` | `sendMessage` accepts `contextPaths?: string[]`. If present, prepends a `**Relevant paths hint**` block to the API content (before User Visual Context). |

## Right Panel & Provider/Model Display

The right panel contains three tabs: **Coding Assistant**, **Build**, and **System View**. Each tab can use a different LLM provider and model. The **Provider/Model callout** (showing current provider name and model label) appears above all three tabs *except* the Coding Assistant tab, where the provider and model are set directly within the chat UI and displaying them would be redundant.

| File | Role |
|------|------|
| `client/src/components/layout/RightPanel.tsx` | Conditionally renders the Provider/Model info box only when `activeTab !== 'assistant'`. The callout is hidden for the Coding Assistant tab to avoid redundancy. |

## Project Metadata (Download / Import / Clear)

The **Project** menu (visible only when a workspace is open) manages the workspace's `~/.iodine/<workspace-md5>/` cache directory, which holds AI summaries and build config.

| Action | Client | Server |
|--------|--------|--------|
| Download | `downloadProjectMetadata()` in `client/src/api/files.ts` fetches the endpoint, receives a blob, and triggers a browser download via a temporary object URL | `GET /api/project/metadata/download` — spawns `zip -r - .` from the cache dir and pipes stdout to the response as `application/zip` |
| Import | `importProjectMetadata(file)` POSTs the raw `File` object as `application/octet-stream` | `POST /api/project/metadata/import` — uses `express.raw()` to receive the zip body, writes it to a temp file, runs `unzip -o`, then cleans up |
| Clear | `clearProjectMetadata()` sends `DELETE` | `DELETE /api/project/metadata` — calls `fs.rm(cacheDir, { recursive: true, force: true })` |

The server route is in `server/src/routes/project.ts`, registered at `/api/project` in `server/src/app.ts`. The Project menu is in `client/src/components/layout/MenuBar.tsx`; "Clear Metadata" shows a custom confirm dialog before deleting.

## Agent File Editing Tools

The coding assistant has two tools for writing files, each suited to a different use case:

| Tool | When to use | Behaviour |
|------|------------|-----------|
| `edit_file(path, old_string, new_string)` | Modifying an existing file | Reads the file, verifies `old_string` matches **exactly once**, replaces it, writes back. Returns an error if the string is missing or ambiguous — the model then reads the file and retries with more surrounding context. |
| `write_file(path, content)` | Creating a brand-new file | Writes the full content; creates parent directories as needed. |

The system prompt lives in **one place** — `systemPrompt.ts`'s `buildSystemPrompt(activeFile, tutorMode)` — and all three providers call it. It instructs the model to prefer `edit_file` for modifications and reserve `write_file` for new files only (this avoids sending entire large files as output tokens when only a few lines change), and to **fall back to `write_file` (read fully, then rewrite fully) when `edit_file` fails to apply cleanly after a retry or the target block is ambiguous/repeated**.

| File | Role |
|------|------|
| `server/src/services/fileTools.ts` | `edit_file` executor: reads file, counts occurrences of `old_string`, rejects on 0 or >1 matches with an actionable error message, replaces and writes back. Schema registered in `TOOL_SCHEMAS` (auto-picked up by all three provider tool lists). |
| `server/src/services/systemPrompt.ts` | **Single source of truth** for the shared system prompt: workspace/active-file context, the `edit_file`-vs-`write_file` guidance including the ambiguity/failure fallback, and the tutor-mode addendum. Reads `rootPath` directly from state. |
| `server/src/services/anthropicAgent.ts` | Imports and calls `buildSystemPrompt(activeFile, tutorMode)` when no `customSystemPrompt` is supplied. No inline prompt. |
| `server/src/services/geminiAgent.ts` | Same — imports and calls `buildSystemPrompt`. No inline prompt. |
| `server/src/services/openaiAgent.ts` | Same — imports and calls `buildSystemPrompt`. |

**Error messages the model receives:**
- `old_string not found` → model re-reads the file and retries with exact text
- `old_string matches N locations` → model adds more surrounding lines to make the match unique

## Tutor Mode

The **Tutor** toggle in the Coding Assistant (left of the Send button) switches the AI into a read-only guidance mode: it walks through the codebase, points to relevant lines, and tells the user what to change without writing any code itself.

| File | Role |
|------|------|
| `client/src/components/right/CodingAssistant.tsx` | Owns `isTutorMode` state; renders the **Tutor** toggle button; passes `isTutorMode` to `sendMessage` and `onNavigateToLine` to `useCodingAssistant`. |
| `client/src/hooks/useCodingAssistant.ts` | `sendMessage` accepts `tutorMode?: boolean`; includes it in the POST body to `/api/agent/chat`; handles the new `open_file` SSE event by calling `onNavigateToLine(filePath, line, endLine)`. |
| `client/src/components/layout/WorkbenchLayout.tsx` | Creates `handleNavigateToLine` which calls `openFile` then (after 100 ms) `editorAreaRef.current?.navigateToLine`. Threads to `RightPanel`. |
| `client/src/components/layout/RightPanel.tsx` | Accepts and passes `onNavigateToLine` to `CodingAssistant`. |
| `client/src/components/layout/EditorArea.tsx` | `EditorAreaHandle` now exposes `navigateToLine(filePath, line, endLine?)`. Stores pending navigation in `pendingNavigationRef`; applies it immediately when the editor is already active, or in `onEditorMount` when a new file mounts. Uses `editor.revealLineInCenter` + `editor.deltaDecorations` with CSS classes `tutor-line-highlight` / `tutor-line-gutter`. |
| `client/src/index.css` | `.tutor-line-highlight` (blue background tint) and `.tutor-line-gutter` (3 px blue left bar) decoration classes. |
| `server/src/routes/agent.ts` | Extracts `tutorMode` from request body; passes to all three agent loop functions. |
| `server/src/services/anthropicAgent.ts` | Appends `TUTOR_SYSTEM_ADDENDUM` to system prompt when `tutorMode` is true. |
| `server/src/services/openaiAgent.ts` | Same tutor mode addendum applied to `buildSystemPrompt`. |
| `server/src/services/geminiAgent.ts` | Same tutor mode addendum applied to `buildSystemInstruction`. |
| `server/src/services/fileTools.ts` | Adds `open_file` tool schema (path, line, end_line). |
| `server/src/services/agentTools.ts` | Handles `open_file` tool by emitting `open_file` SSE event then returning success; no filesystem writes occur. |

**open_file SSE event payload:** `{ path: string, line: number, endLine: number }` — sent before the tool result so the client can navigate while the agent loop continues.

**Tutor protocol (enforced by system prompt):**
1. Turn 1 — AI reads files silently, presents a numbered plan, asks "Ready to start?"
2. Turn 2+ — on each user reply, opens exactly ONE file, highlights the relevant lines, explains, then stops.
Never more than one `open_file` call per response turn.

## File Explorer Auto-Expand

When a file becomes active in the editor (opened by click, Tutor Mode navigation, or any other means), the file explorer automatically expands all ancestor folders so the file is visible in the tree.

| File | Role |
|------|------|
| `client/src/components/layout/WorkbenchLayout.tsx` | Passes `activeFilePath` directly as the `expandToPath` prop to `Sidebar` — no separate state needed. |
| `client/src/components/layout/Sidebar.tsx` | Threads `expandToPath` through to `FileExplorer`. |
| `client/src/components/sidebar/FileExplorer.tsx` | A `useEffect` keyed on `[expandToPath, tree]` (not `expandedPaths`) splits the path into segments and calls `toggleExpand(parentPath, true)` for each ancestor. `expandedPaths` is intentionally absent from the deps so the effect does not re-run when the user manually collapses a folder. |
| `client/src/hooks/useFileTree.ts` | `toggleExpand(nodePath, forceExpand?)` — when `forceExpand` is `true` the node is always added to `expandedPaths` regardless of its current state, preventing accidental re-collapse. |

**Key design:** Passing `activeFilePath` as `expandToPath` means every tab switch triggers a one-way expand (never collapse). The `forceExpand` flag in `toggleExpand` ensures the expand effect is idempotent and cannot fight user-initiated collapses.

## System View — Reverse Lookup (File Explorer → Diagram)

When a system graph is loaded, **clicking any file or folder in the file explorer** automatically finds the best-matching node or edge in the diagram, selects it, and (if the user is not on the Coding Assistant tab) switches the right panel to System View and zooms to centre on the match.

Match priority for `lookupByPath(path)` (file/folder):
1. A file ref's resolved absolute path **exactly equals** the clicked path → score 2
2. A file ref's resolved path **starts with** the clicked path (folder contains the file) → score 1

Match priority for `lookupByPosition(absoluteFilePath, line)` (line-level, available for future use):
1. The line falls **within** a file ref's `line`–`endLine` range → score 3
2. The line is **within 2 lines** of a ref's `line` → score 2
3. The file path matches a ref but no line info is available → score 1

| File | Role |
|------|------|
| `client/src/components/sidebar/FileTreeNode.tsx` | `handleClick` calls `onNodeSelect?.(node)` for both file clicks and folder toggle clicks, threading the selected node up the component tree. Also passes `onNodeSelect` recursively to child `FileTreeNode` renders so nested files work. |
| `client/src/components/sidebar/FileExplorer.tsx` | Accepts `onNodeSelect` and threads it to each top-level `FileTreeNode`. |
| `client/src/components/layout/Sidebar.tsx` | Threads `onNodeSelect` to `FileExplorer`. |
| `client/src/components/layout/WorkbenchLayout.tsx` | Holds `rightPanelRef`. `handleNodeSelect(node)` calls `rightPanelRef.current?.lookupByPath(node.path)`. Passed to `Sidebar` as `onNodeSelect`. |
| `client/src/components/layout/RightPanel.tsx` | `RightPanelHandle.lookupByPath` first checks `hasGraph()` — if no graph is loaded the call is a no-op. Otherwise calls `systemViewRef.current.lookupByPath(path)` and switches to System View **only when `activeTab !== 'assistant'`** so the Coding Assistant is never yanked away. `activeTab` is included in `useImperativeHandle` deps to prevent stale closures. |
| `client/src/components/right/SystemView.tsx` | `SystemViewHandle` exposes `hasGraph(): boolean`, `lookupByPath(path): boolean`, and `lookupByPosition(absoluteFilePath, line): boolean`. `lookupByPath` iterates all node and edge file refs, resolves each to an absolute path, scores the match, and on the best match calls `setSelected` + `setPan`/`setScale(1.2)` to centre the view. |

**Key design:** `hasGraph()` lets `RightPanel` distinguish "no graph loaded" (call is skipped entirely) from "graph loaded but no specific match found" (tab still switches so the user can see the diagram). The Coding Assistant tab guard means exploratory file clicks never disrupt an active chat session.

## System View — Node/Edge Click → File References

Clicking a node or edge in the System View graph highlights it and opens a bottom drawer listing the source files associated with that element. Clicking a file entry navigates the editor to the specified line (same mechanism as Tutor Mode's `open_file`).

| File | Role |
|------|------|
| `client/src/api/files.ts` | `GraphFileRef` interface (`path`, `line?`, `endLine?`, `label?`). `GraphNode` and `GraphEdge` both gain an optional `files?: GraphFileRef[]` field. |
| `client/src/components/right/SystemView.tsx` | `Selected` type (`{ type: 'node'; id }` or `{ type: 'edge'; idx }`). Tracks `selected` state. `nodePressRef` / `panPressRef` refs record mouse-down position to distinguish a click (< 5 px movement) from a drag. `EdgeSvg` adds a transparent `strokeWidth={12}` hit-area path with `onMouseDown={stopPropagation}` + `onClick` to toggle edge selection; a selection highlight path (accent colour, opacity 0.35) renders behind the main path. `NodeSvg` adds a selection ring rect (accent stroke, opacity 0.8) when `isSelected`. File-references drawer renders below the SVG as a flex sibling; shows the item label, a close button, and scrollable clickable file rows. |
| `client/src/components/layout/RightPanel.tsx` | Passes `onNavigateToLine` to `SystemView` (already present in `RightPanelProps`, now threaded through). |
| `client/src/components/layout/WorkbenchLayout.tsx` | `handleNavigateToLine` (used for Tutor Mode) also serves the System View drawer — no changes needed. |
| `server/src/routes/agent.ts` | Updated `graphSystemPrompt` to instruct the AI to populate `files` arrays on nodes and edges with workspace-relative paths and line ranges from files it actually read. |

**File reference path resolution:** If `f.path` starts with `/` it is used as-is; otherwise `workspacePath + '/' + f.path` is prepended so the navigator receives an absolute path.

**Click-vs-drag:** A `Math.hypot` check at `mouseUp` ensures moves of ≥ 5 CSS pixels are treated as drags, not clicks. The SVG `onMouseLeave` fires `handleMouseUp` (which also clears refs) so stale press refs are never left behind.

## Terminal (PTY) Lifecycle & Cleanup

Each terminal tab opens a WebSocket to `ws://localhost:3001/terminal?cwd=…&cmd=…`. The server uses **node-pty** to spawn a pseudo-terminal (PTY) for the requested shell. Robust cleanup is critical because `tsx watch` kills and restarts the Node process on every file save, which would otherwise orphan PTY children and leak OS file descriptors until `posix_spawnp` starts failing.

| File | Role |
|------|------|
| `server/src/terminal.ts` | All active PTY instances are tracked in a module-level `activePtys: Set`. SIGTERM, SIGINT, and `process.exit` handlers call `killAllPtys()` (sends SIGKILL) so `tsx watch` restarts fully clean up open shells. Spawn uses `spawnWithRetry`: on failure it waits 250 ms and retries once to handle transient `EAGAIN` errors. `MAX_TERMINALS = 20` cap prevents runaway resource use. PTY instances are removed from the set in both `ptyProc.onExit` and `ws.on('close')` to stay accurate regardless of which side closes first. |

**Key failure mode:** `posix_spawnp failed` from node-pty is an OS-level `EAGAIN` or similar, most often triggered by accumulated file descriptors from pty processes that were not killed when the dev server restarted. The fix is the SIGTERM/SIGINT handler — when `tsx watch` sends SIGTERM before relaunching, all PTY children are killed before the process exits.

**Shell selection:** `process.env.SHELL` → `/bin/zsh` → `/bin/bash` → `/bin/sh`, with `existsSync` validation at each step.

## System View — Active File Chip

When a System View graph is loaded, switching editor tabs automatically highlights the matching architecture node in the diagram *and* surfaces a `◎ NodeName` chip at the top of the Coding Assistant input area. Clicking the chip switches to System View and pans to the selected node.

**Flow:**
```
activeFilePath changes (editor tab switch)
  → WorkbenchLayout useEffect → rightPanelRef.current?.syncActiveFile(path)
  → RightPanel.syncActiveFile → systemViewRef.current?.selectByPath(path)
      → scores file refs, selects best match, returns node name (or null)
  → WorkbenchLayout sets activeSystemNode state
  → activeSystemNode threaded to RightPanel → CodingAssistant
  → chip renders above textarea when activeSystemNode is non-null
  → user clicks chip → onOpenNode(activeSystemNode)
      → RightPanel.handleOpenNode:
          flushSync(() => setActiveTab('system'))   ← synchronous tab switch
          systemViewRef.current?.focusSelected()    ← pans with live dimensions
```

| File | Role |
|------|------|
| `client/src/components/right/SystemView.tsx` | `SystemViewHandle.selectByPath` returns `string \| null` (matched node/edge name) so callers know which node matched. `handleGenerate` returns `SystemGraph \| null` (used internally). |
| `client/src/components/layout/RightPanel.tsx` | `syncActiveFile` returns `string \| null` (forwarded from `selectByPath`). `handleOpenNode` uses `flushSync` + `focusSelected`. `activeSystemNode` prop is threaded to `CodingAssistant`. |
| `client/src/components/layout/WorkbenchLayout.tsx` | `activeSystemNode: string \| null` state is updated by `syncActiveFile`'s return value on every `activeFilePath` change. Passed to `RightPanel`. |
| `client/src/components/right/CodingAssistant.tsx` | Accepts `onOpenNode` and `activeSystemNode` props. Shows a `◎ NodeName` chip above the textarea when `activeSystemNode` is non-null. |

**Key design decisions:**
- **Two-step select+focus:** `selectByPath` (no DOM reads, safe while SVG is `display:none`) + `focusSelected` (reads live `clientWidth`/`clientHeight` after `flushSync` makes the tab visible). Avoids the zero-dimension bug from panning a hidden SVG.
- `activeSystemNode` flows through component props so the chip appears without touching the message history.

## Proactive Help System

The proactive help system monitors user activity and automatically offers assistance when it detects the user is churning — taking many actions but producing little diff output. It is designed to be modular: new signal types can be registered alongside the existing one without touching the hook.

### Architecture

```
WorkbenchLayout
  ├── useProactiveHelp()         ← generic signal runner hook
  │     ├── 1-min check interval  (fetches git diff, evaluates signals)
  │     └── 1-sec display ticker  (updates ProactiveStatus for status bar)
  ├── createIdleChurnSignal()    ← specific signal factory
  └── onTrigger callback
        ├── POST /api/proactive/rephrase  ← out-of-band LLM rephrase
        ├── playBell()                    ← Web Audio API tone
        ├── rightPanelRef.triggerPulse()  ← yellow border animation
        └── rightPanelRef.injectProactiveMessage()
              └── useCodingAssistant.injectProactiveMessage()
                    ├── appends assistant message to UI
                    └── stores collectContext for next user reply
```

### Files

| File | Role |
|------|------|
| `client/src/hooks/useProactiveHelp.ts` | Generic hook. Runs a `setInterval` at `checkIntervalMs` (default 1 min). Each tick drains `actionCountRef`, fetches overall git diff, computes `diffLineDelta`, calls `shouldFire` on each registered signal. Enforces a global `cooldownMs` (default 2 min) between any two triggers. Returns `ProactiveStatus` for the debug status bar. |
| `client/src/services/proactiveSignals.ts` | `createIdleChurnSignal` factory. Implements `ProactiveSignal` with `shouldFire`, `describe` (forward-looking reason), `collectContext` (active file + git diff), and 6 canned message variants. |
| `client/src/components/layout/WorkbenchLayout.tsx` | Wires the signal, `onTrigger` callback, `playBell`, and proactive status into the layout. Passes `recordAction` as `onMessageSent` to `RightPanel`. |
| `client/src/components/layout/RightPanel.tsx` | Exposes `triggerPulse()` and `stopPulse()` on `RightPanelHandle`. Manages the looping `proactive-pulse` CSS animation via direct DOM class manipulation (remove → `offsetWidth` reflow → add). Auto-stops after 10 s or on first chat keystroke (`onUserTyping`). |
| `client/src/components/right/CodingAssistant.tsx` | Calls `onUserTyping()` on textarea change (stops pulse). Calls `onMessageSent()` on send (counts as an action). |
| `client/src/hooks/useCodingAssistant.ts` | `injectProactiveMessage` appends the AI message to the UI and stores `collectContext`. On the next `sendMessage`, awaits `collectContext`, prepends the result as `**Context at the time of the assistant's proactive message (for reference only — respond conversationally, do not call any tools):**` to the API payload only (not shown in UI). |
| `client/src/components/layout/StatusBar.tsx` | Thin 22 px bar below `BottomTray`. Shows live `Actions`, `Next` countdown, and forward-looking `Next check: YES / NO · quiet / NO · progress / NO · cooldown`. Only rendered when a workspace is open. |
| `client/src/index.css` | `@keyframes proactive-pulse` — inset yellow `box-shadow`, 2 s `ease-in-out infinite`. |
| `server/src/routes/proactive.ts` | `POST /api/proactive/rephrase` — non-streaming, single-turn LLM call to rephrase a canned message. Falls back to the original on any error. |

### Signal Interface

```ts
interface ProactiveSignal {
  readonly type: string;
  shouldFire(snapshot: SignalSnapshot): boolean;
  describe?(snapshot: SignalSnapshot): { fires: boolean; reason: string | null };
  collectContext(): Promise<string>;
  readonly messages: readonly string[];
}

interface SignalSnapshot {
  actionCount: number;   // actions since last check (drained atomically)
  diffLineDelta: number; // change in git diff line count vs previous check
}
```

Add new signals by implementing this interface and registering them in `WorkbenchLayout`'s `useProactiveHelp` call alongside `idleChurnSignal`.

### IdleChurn Signal — Detection Logic

```
fires when:  actionCount >= 30  AND  |diffLineDelta| < max(3, actionCount × 0.15)
```

- `actionCount >= 30` — user must be meaningfully active (not idle)
- `|diffLineDelta| < threshold` — activity is not producing output (churning)
- `diffLineDelta` is the change in total **git diff output line count** (includes headers and context lines) between two consecutive checks, not raw code lines

**What counts as an action:** editor content edits, editor scroll (throttled to one event per 3 s), tab switches, and chat messages sent.

**Status bar reasons:**
- `NO · quiet` — `actionCount < 30`
- `NO · progress` — diff growing proportionally to activity
- `NO · cooldown` — within 2-minute cooldown window

### Out-of-Band Rephrase

Before injecting the canned message, `WorkbenchLayout.onTrigger` awaits `POST /api/proactive/rephrase` with the canned message, current provider, and model. The server makes a minimal non-streaming LLM call to rephrase it naturally. On any error the original canned message is used unchanged. This call is completely outside the conversation history.

### Pulse Animation

`triggerPulse()` uses the browser's canonical animation-restart pattern:
```ts
el.classList.remove('proactive-pulse');
void el.offsetWidth;  // force reflow — browser registers removal
el.classList.add('proactive-pulse');
```
React state is not involved. The animation loops at 2 s until `stopPulse()` is called, the user types in the chat textarea, or the 10-second auto-stop fires.

### Debug Status Bar

Visible whenever a workspace is open. Forward-looking: evaluates `shouldFire` against the current live action count and the last check's `diffLineDelta` to show what the next check would do — not what the previous check did. The `describe()` method on each signal provides the human-readable reason.

## Progress Watch

After the AI replies, the assistant arms a **progress watch** that fires once the user starts typing in the editor. The watch captures three git diff snapshots, then streams a follow-up message reviewing what changed — calling out any nits, syntax issues, or next steps.

### Flow

```
AI reply done (done SSE event)
  → armedReplyRef.current = capturedText   (silent — no timer yet)

User presses a key in the Monaco editor
  → WorkbenchLayout.onContentChange
  → rightPanelRef.notifyEditorActivity()
  → codingAssistantRef.notifyEditorActivity()
  → useCodingAssistant: armedReplyRef consumed → startProgressWatch(reply)
      → setIsWatching(true)  ← "Assistant is actively watching your progress" banner
      → sleep 4s  → fetchOverallDiff → snapshot[0]
      → sleep 6s  → fetchOverallDiff → snapshot[1]
      → sleep 10s → fetchOverallDiff → snapshot[2]
      → if any snapshot has content: runProgressCheck(reply, snapshots, controller)
            → POST /api/proactive/watch (streaming SSE)
            → onWatchTrigger() → playBell() + triggerPulse()
            → new streaming assistant message appended to chat + history
```

### Key design decisions

- **Armed, not eager**: the timer only starts on the first editor keypress after the AI reply. If the user never types, the watch never fires.
- **Cancelled on new send**: `armedReplyRef.current = null` and watch controller aborted at the start of `sendMessage` and `clearMessages`.
- **Only fires on real edits**: `onContentChange` (not `onActivity`) is used as the trigger — pure navigation/scrolls don't arm the watch.
- **Only fires with diffs**: the progress check is skipped if all three snapshots are empty (user typed but nothing was saved / no git changes).
- **Snapshot times**: 4 s, 10 s, 20 s after first editor keypress (sleep intervals: 4 s → 6 s → 10 s).

### Files

| File | Role |
|------|------|
| `client/src/hooks/useCodingAssistant.ts` | `armedReplyRef` stores the last AI reply text. `notifyEditorActivity()` consumes it and calls `startProgressWatch`. `startProgressWatch` manages the `AbortController`, sleep intervals, and diff captures. `runProgressCheck` streams `POST /api/proactive/watch` as a new assistant message. |
| `client/src/components/right/CodingAssistant.tsx` | `CodingAssistantHandle` exposes `notifyEditorActivity`. Shows yellow "Assistant is actively watching your progress" banner + glowing dot when `isWatching`. |
| `client/src/components/layout/RightPanel.tsx` | `RightPanelHandle.notifyEditorActivity` delegates to `codingAssistantRef`. |
| `client/src/components/layout/WorkbenchLayout.tsx` | Calls `rightPanelRef.current?.notifyEditorActivity()` inside `onContentChange`. Passes `onWatchTrigger` (bell + pulse) to `RightPanel`. |
| `server/src/routes/proactive.ts` | `POST /api/proactive/watch` — streaming SSE, no tools. System prompt instructs the model to surface nits (syntax errors, typos, off-by-ones) and acknowledge progress. Snapshot labels include actual capture times (4 s, 10 s, 20 s). |

## Merge Conflict Resolver

Files containing git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) show an **⚠ Conflicts** button in the editor's floating button group. Clicking it opens a three-pane resolver as an absolute overlay (the Monaco editor stays mounted underneath, preserving AI visual context).

| File | Role |
|------|------|
| `client/src/utils/mergeConflict.ts` | Pure utilities: `hasConflictMarkers` (detection), `extractBranchNames` (reads branch names from `<<<<<<< name` / `>>>>>>> name` lines), `buildOursVersion` / `buildTheirsVersion` (produce the full file with every conflict resolved to one side), `conflictResultKey` (localStorage key). |
| `client/src/components/editor/MergeConflictView.tsx` | Three-pane layout rendered in a full-height flex column. **OURS** (left, teal `#4ec9b0`) and **THEIRS** (right, blue `#569cd6`) panes are read-only Monaco editors showing the full file with all conflicts resolved to each respective side. **RESULT** (center) is a `DiffEditor` with `renderSideBySide: false` (inline mode); `original` is `oursContent` so diffs highlight what the user has changed from the ours baseline. Branch names from the markers label each pane header. In-progress edits auto-persist to `localStorage` (keyed by `conflictResultKey(filePath)`) on every keystroke; the entry is removed on a successful save. |
| `client/src/components/layout/EditorArea.tsx` | `EditorView` union includes `'conflicts'`. `showConflictsButton` is computed from `hasConflictMarkers(activeFile.content ?? '')`. Button toggles between `'source'` and `'conflicts'`; it is hidden for images, PDFs, URL tabs, and directories. The overlay div uses `position: absolute; inset: 0; zIndex: 5` so it sits above Monaco without unmounting it. The existing `useEffect` keyed on `activeFile.path` resets `editorView` to `'source'` on tab switch. |

**Save flow:** `DiffEditor.onMount` wires the modified editor's `onDidChangeModelContent` to update `resultContent` state. Clicking **Save** calls `putFileContent(filePath, resultContent)`, removes the localStorage draft, then calls `onSaved(resolved)` which propagates the resolved content back through `onContentChange` and switches the view to `'source'`. Clicking **⌨ Source** without saving calls `onClose()` which just sets `editorView` back to `'source'`, leaving the conflicted file unchanged on disk.

## External File Open

Any file outside the current workspace can be opened from **File > Open File…** with full editor support (Monaco, save, Markdown preview, AI summary, merge conflict resolver).

| File | Role |
|------|------|
| `server/src/services/fileSystem.ts` | `readExternalFile(path)` / `writeExternalFile(path, content)` — no `validatePath` call, accept any absolute path. |
| `server/src/routes/files.ts` | `GET /api/files/external?path=` and `PUT /api/files/external` serve external reads/writes. |
| `server/src/routes/aiSummary.ts` | `GET /api/ai-summary` and `POST /api/ai-summary/generate` accept an optional `workspacePath` override so external files can be summarised using their parent directory as the effective workspace root. |
| `client/src/types/index.ts` | `OpenFile` gains `isExternal?: boolean`. |
| `client/src/api/files.ts` | `fetchExternalFileContent` / `putExternalFileContent` / `searchFiles(query, workspaceOnly?)`. |
| `client/src/hooks/useOpenFiles.ts` | `openExternalFile(absolutePath)` — creates an `OpenFile` with `isExternal: true`. `saveFile` routes external files to `putExternalFileContent`. `refreshFile` and the dirty-check skip external files. |
| `client/src/components/layout/EditorArea.tsx` | Git diff is skipped for external files. AI summary uses `path.dirname(absolutePath)` as `workspacePath` when `activeFile.isExternal`. |

## File Search (Quick Open)

Two search modes share the same dialog UI and server endpoint:

| Trigger | Mode | Scope |
|---------|------|-------|
| **File > Open File…** | external | Workspace (if open) + home dir (depth 0, hidden files included) + common dirs (`Desktop`, `Documents`, …) |
| **Search workspace… button** or **⌘P / Ctrl+P** | workspace | Open workspace root only |

**Server** (`POST /api/files/search`): accepts `{ query, workspaceOnly? }`. Internally uses typed `SearchRoot[]` entries with per-root `maxDepth` and `includeHidden` flags. Home dir is added at `maxDepth: 0` with `includeHidden: true` so dotfiles (`.bashrc`, `.zshrc`) are found without recursing into all of `~`. Skips `node_modules`, `.git`, `dist`, `build` and other noise dirs. Windows: adds `OneDrive`, `OneDrive - Personal`, `OneDrive - Business` under home when `process.platform === 'win32'`.

**Client** (`client/src/components/layout/MenuBar.tsx`):
- `openFileMode: 'workspace' | 'external'` state gates which callback (`onOpenWorkspaceFile` vs `onOpenExternalFile`) is used and which `workspaceOnly` value is sent to the server.
- Dialog is VS Code Quick Open-style: floats near the top, single search input, results render in-place as a scrollable list. Each result shows the **filename** (bold) above the **directory path** (monospace, muted). Arrow keys navigate; Enter opens highlighted result; Escape closes.
- Workspace search button (centered in menu bar, visible only when a project is open) sets mode to `'workspace'` and opens the dialog. `Cmd/Ctrl+P` also triggers workspace search.
- Opening via **File > Open File…** always forces mode to `'external'` regardless of previous state.
- `onOpenWorkspaceFile` in `WorkbenchLayout` constructs a `FileNode` and calls `openFile` so workspace files are treated as regular workspace files (saves route through the workspace API; no `isExternal` flag).

## Implementation Notes

For the full project architecture, APIs, and feature details, inspect the relevant source files and `README.md`. Keep this document concise to preserve context-window space.
