# Debugging Notes

## SSE Streaming via Vite Dev Proxy

### Symptom

The Coding Assistant would show a blinking cursor (streaming state) indefinitely after
sending a message. The Anthropic API call was never made, and no text appeared.

### Root Cause 1 — `req.on('close')` fires immediately for POST requests

In Node.js/Express, `req` is an `IncomingMessage` (a Readable stream wrapping the TCP
socket). For a POST request, Express's JSON body parser reads the entire request body
upfront. Once the body is consumed, the `req` stream reaches EOF and is destroyed, which
fires the `'close'` event on `req` — even though the TCP connection (and therefore the
SSE response channel) is still open.

We were using `req.on('close', ...)` to detect client disconnection. This caused
`abortSignal.aborted = true` to be set almost immediately (within ~5ms, the time for the
file read in `loadApiKey()`), aborting the agent loop before any Anthropic API call.

**Fix:** Use `res.on('close', ...)` instead. `res` is a `ServerResponse` (a Writable
stream) and its `'close'` event only fires when the response channel is actually
destroyed — i.e., when the client genuinely closes the SSE connection.

```typescript
// WRONG — fires when request body is consumed, not when client disconnects
req.on('close', () => { abortSignal.aborted = true; });

// CORRECT — fires when the response stream is actually closed
res.on('close', () => { abortSignal.aborted = true; });
```

### Root Cause 2 — Vite proxy closes the backend connection prematurely

Even after fixing the `req/res` confusion above, the Vite dev proxy (based on
`http-proxy`) was closing its connection to the Express backend shortly after the first
SSE chunk was forwarded. The browser's SSE stream stayed open (waiting on Vite), but
Express saw `res.on('close')` fire, so no further writes were made.

The exact mechanism is unclear — it may be an `http-proxy` idle-connection behaviour or
an interaction with Firefox extensions. Symptoms:
- Server saw `res close` milliseconds after sending the ping.
- Browser received the ping but then waited indefinitely (cursor blinking).
- Anthropic API call was never started.

**Fix:** The client makes SSE requests directly to `http://localhost:3001` in development,
bypassing the Vite proxy entirely. Express already has CORS configured for
`localhost:5173`, so cross-origin requests work.

```typescript
// useCodingAssistant.ts
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';
const response = await fetch(`${API_BASE}/api/agent/chat`, { ... });
```

Non-streaming endpoints (status checks, file API) continue to go through the Vite proxy
at `/api/*` without issue.

### Diagnostic approach used

1. Added `console.log` at each server stage (route entry, headers flushed, `runAgentLoop`
   start, stream events, final message).
2. Added `console.log` in the client hook for each raw SSE chunk and parsed event.
3. Added a `GET /api/agent/test-sse` endpoint that sends 5 SSE events on a timer with no
   Anthropic call — used to isolate the SSE pipeline from the AI API call.
4. Added an immediate SSE comment (`': ping\n\n'`) after `flushHeaders()` to verify that
   at least one byte reaches the browser before the connection closes.

These four data points together pinpointed that:
- The ping reached the browser (pipeline works for one chunk).
- The server saw disconnect before the Anthropic call (not an API issue).
- `req.on('close')` was the false-positive disconnect trigger.
- The Vite proxy was separately closing the backend connection.

---

## Workspace State Lost on Server Restart

### Symptom

After successfully opening a workspace and verifying it worked, the Coding Assistant would
show "No workspace open" after a server restart. The left sidebar also lost its file tree.
`tsx watch` restarts the server automatically when any server-side file is edited.

### Root Cause

`rootPath` is a module-level `export let` variable in `server/src/state.ts`. When
`tsx watch` detects a file change and restarts the Node process, all in-memory state
resets. The React client still held the old `workspacePath` in its own state, creating a
split-brain situation: client thought workspace was set, server did not.

Suspicion initially fell on ESM live-binding semantics (does `import { rootPath }` in
another module see the updated value after `setRootPath()` is called?). This was tested
and confirmed to work correctly — `tsx` does handle `export let` as a live binding. The
real issue was process restart, not live bindings.

### Fix

Persist the workspace path to disk in `server/src/state.ts`:

```typescript
const PERSIST_FILE = path.join(os.homedir(), '.iodine', 'workspace');

function loadPersistedPath(): string | null {
  try {
    const saved = fs.readFileSync(PERSIST_FILE, 'utf-8').trim();
    if (saved && fs.existsSync(saved)) return saved;
  } catch { /* no persisted workspace */ }
  return null;
}

export let rootPath: string | null = loadPersistedPath();

export function setRootPath(p: string) {
  rootPath = p;
  try {
    fs.mkdirSync(path.dirname(PERSIST_FILE), { recursive: true });
    fs.writeFileSync(PERSIST_FILE, p, 'utf-8');
  } catch { /* ignore write errors */ }
}
```

On server startup, the workspace is restored from `~/.iodine/workspace` (if the path
still exists on disk). `WorkbenchLayout` also calls `GET /api/workspace` on mount and
hydrates its `workspacePath` state, so the UI stays in sync after a hot restart.

---

## Coding Assistant "No workspace" Warning Not Updating

### Symptom

Even after setting a workspace via the sidebar or Coding Assistant inline input, the
"No workspace open" warning in the Coding Assistant panel persisted.

### Root Cause

The `CodingAssistant` component was fetching workspace status independently from the
server on mount (`GET /api/agent/status` returned `workspace: rootPath`). This gave a
snapshot at mount time, not a live value. Changes made by other parts of the UI (sidebar
`openWorkspace`, menu bar) did not propagate to the Coding Assistant's local state.

### Fix

Remove the workspace fetch from `CodingAssistant`. Instead, thread `workspacePath` as a
prop from `WorkbenchLayout` → `RightPanel` → `CodingAssistant`. Since `WorkbenchLayout`
owns the single source of truth for `workspacePath`, all panels stay in sync
automatically.

```
WorkbenchLayout (owns workspacePath state)
  └── RightPanel (props: workspacePath, onWorkspaceOpen)
        └── CodingAssistant (props: workspacePath, onWorkspaceOpen)
```

The warning condition is simply `!workspacePath` — no server fetch needed.

---

## Agent Tools Defaulting to Server Working Directory

### Symptom

When no workspace was open, asking the Coding Assistant to list files or search code
would silently list/search the server's working directory (`process.cwd()`, typically the
repo root) instead of returning a clear error.

### Root Cause

The tool implementations in `anthropicAgent.ts` had fallback logic:

```typescript
// list_directory
const dirPath = (input.path as string | undefined) || rootPath || '.';

// search_files
const searchPath = (input.path as string | undefined) || rootPath || process.cwd();
```

Claude would get back results from the wrong location with no indication that the
workspace wasn't set, leading to confusing responses.

### Fix

Remove the fallbacks. Return an explicit error when `rootPath` is null:

```typescript
if (name === 'list_directory') {
  const dirPath = (input.path as string | undefined) || rootPath;
  if (!dirPath) return { content: 'No workspace open', preview: 'No workspace open', error: true };
  // ...
}
```

This surfaces the missing-workspace condition clearly to both Claude and the user.

---

## Browser File Picker Cannot Provide Absolute Path

### Symptom

After switching the "Open Project" menu entry to use `<input webkitdirectory>` (OS folder
picker), the server had no way to know the absolute path of the selected folder. The
browser only exposes relative paths like `"myproject/src/index.ts"` via
`file.webkitRelativePath`.

### Root Cause

This is an intentional browser security restriction. The File API and `webkitdirectory`
deliberately withhold the host filesystem path. `showDirectoryPicker()` (File System
Access API) provides the handle but still not the raw absolute path in all environments,
and is not supported in Firefox.

### Fix

Server-side path detection via `POST /api/workspace/find`:

1. Client extracts root folder name from the first `webkitRelativePath` (everything before
   the first `/`).
2. Client sends `POST /api/workspace/find { name: "myproject" }`.
3. Server searches `~/myproject` (direct), then scans all non-hidden subdirectories of `~`
   for `~/*/myproject` (one level deep).
4. If found, returns `{ path: "/absolute/path/to/myproject" }`.
5. Client calls `POST /api/workspace/open` with the resolved path to officially set the
   workspace.
6. If not found, a fallback dialog appears with the folder name pre-filled so the user
   can type the full absolute path.

The one-level-deep scan of `~` (step 3) covers the common convention of grouping projects
under a single directory (e.g. `~/wses/`, `~/code/`, `~/work/`) without requiring the
user to configure anything.

---

## `git_commit_compose` Message Lost When SCM Panel Is Closed

### Symptom

The `git_commit_compose` tool reported success and switched the sidebar to Source Control,
but the commit message editor remained empty. Retrying after the SCM view was already open
could work, making the failure appear intermittent.

### Root Cause

The `iodine:git-commit-compose` browser event was handled by `SourceControlPanel`. That
panel is conditionally mounted only while the SCM view is active. If the tool dispatched
the event while another sidebar view was active, there was no listener to receive it. The
subsequent view switch mounted the panel too late because browser events are not replayed.

### Fix

`WorkbenchLayout` is the single, always-mounted listener for
`iodine:git-commit-compose`. It stores the event's message in `pendingCommitMessage` and
switches the sidebar to the SCM view. The value flows into `SourceControlPanel` as a prop;
a `useEffect` applies it with `sc.setCommitMessage(...)` after the panel mounts or the prop
changes, then clears the pending value through a callback.

```text
git_commit_compose event
  → WorkbenchLayout stores pendingCommitMessage and opens SCM
  → SourceControlPanel mounts with the pending message
  → useEffect calls sc.setCommitMessage(message)
  → pendingCommitMessage is cleared
```

Keep listeners for events that can trigger a conditional view in an ancestor that remains
mounted. Do not move this listener back into `SourceControlPanel`, or the mount-timing race
will return. Clearing the pending state is also required so the message is not re-applied
on a later render or SCM remount.

---

## OpenAI Streaming Stutter

### Symptom

When using an OpenAI model the Coding Assistant text would visibly stutter — words
appeared in rapid individual bursts with noticeable jank, whereas Anthropic responses
streamed smoothly.

### Root Cause

OpenAI's chat completions streaming API emits **one token per SSE event**. The previous
SSE reader called `setUiMessages` (a React state setter) for every event, which caused
a full React re-render — including a complete ReactMarkdown re-parse of the growing text
string — for every single token. At 50–80 tokens/s this produced 50–80 renders per
second, each one doing O(n) markdown parsing work that grows with response length.

Anthropic's SDK batches tokens internally before surfacing them through its streaming
iterator, so it naturally emits larger chunks and triggers fewer renders; the problem was
less visible there.

### Fix

Buffer `text_delta` (and `thought_delta`) payloads in React refs instead of updating
state immediately. A single `requestAnimationFrame` is scheduled to drain both buffers
into state — at most once per ~16 ms (~60 fps) regardless of token rate:

```typescript
// useCodingAssistant.ts (hook level)
const textBufRef = useRef('');
const thoughtBufRef = useRef('');
const rafRef = useRef<number | null>(null);

// Inside sendMessage:
const flushBufs = () => {
  rafRef.current = null;
  const txt = textBufRef.current;
  const tht = thoughtBufRef.current;
  textBufRef.current = '';
  thoughtBufRef.current = '';
  if (!txt && !tht) return;
  updateAssistant(msg => {
    const blocks = [...msg.blocks];
    for (const [buf, blockType] of [[tht, 'thought'], [txt, 'text']]) {
      if (!buf) continue;
      const last = blocks[blocks.length - 1];
      if (last?.type === blockType) {
        blocks[blocks.length - 1] = { ...last, content: last.content + buf };
      } else {
        blocks.push({ type: blockType, content: buf });
      }
    }
    return { ...msg, blocks };
  });
};

// text_delta handler:
textBufRef.current += payload.text;
if (rafRef.current === null) rafRef.current = requestAnimationFrame(flushBufs);
```

For a 500-token response streaming at 80 tok/s this reduces React renders from ~500
down to ~30 (capped at 60 fps), eliminating the stutter entirely.

**Ordering safety:** Every structurally significant event (`tool_call`, `tool_result`,
`command_approval`, `done`, `error`) calls `flushNow()` before processing — which cancels
the pending RAF and synchronously drains the buffers — so block ordering in the UI is
always correct even when structural events arrive immediately after text.

---

## Server Crash on Open Project — EACCES permission denied (scandir)

### Symptom

Opening or switching a workspace would fail with the MenuBar fallback dialog "Could not
locate X automatically. Enter the absolute path:" even for projects that had previously
been found automatically. The server process exited with:

```
Error: EACCES: permission denied, scandir '/Users/.../Documents/Library'
    at Object.readdirSync (node:fs:1504:3)
    at walkDir (.../server/src/routes/aiSummary.ts:...)
```

### Root Cause

`walkDir` in `server/src/routes/aiSummary.ts` used `fs.readdirSync` without any error
handling. On macOS, `~/Documents/Library` is a system-protected symlink that is not
readable by user processes. When a directory AI summary request caused `walkDir` to
descend into `~/Documents`, it hit this entry, threw an uncaught `EACCES`, and crashed
the entire Express server. With the server down, every subsequent API call — including
`POST /api/workspace/find` — failed with a network error, which the MenuBar caught and
treated as "workspace not found", showing the fallback dialog.

### Fix

Wrap the `readdirSync` call in a try/catch and return `[]` for any unreadable directory,
allowing the walk to skip over permission-denied entries and continue normally:

```typescript
// server/src/routes/aiSummary.ts — walkDir
function walkDir(root: string, base: string = root): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return []; // skip unreadable directories (e.g. permission denied)
  }
  // ...
}
```

---

## Terminal `posix_spawnp failed`

Three separate root causes produced this error, each fixed independently.

### Root Cause 1 — Invalid `cwd` (missing directory)

`terminal.ts` computed the working directory as:

```typescript
const cwd = cwdParam || rootPath || os.homedir();
```

If the `cwd` URL param (sent by `TerminalPanel` from `workspacePath`) referenced a
directory that no longer existed on disk — for example after switching workspaces, deleting
a folder, or an external rename — the value passed to `pty.spawn()` was an invalid path.

`node-pty` passes the `cwd` directly to `posix_spawnp(3)`. POSIX specifies that if the
working directory cannot be accessed, `posix_spawnp` returns `ENOENT`, which node-pty
surfaces as `Error: posix_spawnp failed` with no further detail.

The shell binary itself was irrelevant — the error occurs before the shell is even
loaded, during the fork/chdir phase.

**Fix:** Validate each `cwd` candidate with `existsSync` before using it, falling through
to the next candidate if unavailable:

```typescript
// server/src/terminal.ts
const cwdCandidates = [cwdParam, rootPath, os.homedir()].filter(Boolean) as string[];
const cwd = cwdCandidates.find(c => existsSync(c)) ?? os.homedir();
```

Also made the WebSocket URL in `TerminalPanel.tsx` dynamic (protocol + host derived from
`window.location`) instead of hardcoded to `ws://localhost:3001`, so terminals work
correctly in production builds served from non-localhost origins.

### Root Cause 2 — Orphaned PTY children from `tsx watch` restarts

`tsx watch` monitors server source files and sends SIGTERM to the Node process on each
file save, then immediately relaunches. When the server process exited without explicitly
killing its `node-pty` children, those child processes stayed alive and kept their
pseudoterminal file descriptors open. After several file-save/restart cycles, the
accumulated leaked fds caused the OS to return `EAGAIN` (too many open files) when
`posix_spawnp` tried to fork a new PTY — surfaced as `posix_spawnp failed`.

**Fix:** Track all active PTY instances in a module-level `Set` and register
`SIGTERM`/`SIGINT`/`exit` handlers to SIGKILL them all before the process exits:

```typescript
const activePtys = new Set<ReturnType<typeof pty.spawn>>();

function killAllPtys() {
  for (const p of activePtys) {
    try { p.kill('SIGKILL'); } catch { /* already gone */ }
  }
  activePtys.clear();
}

process.once('SIGTERM', () => { killAllPtys(); process.exit(0); });
process.once('SIGINT',  () => { killAllPtys(); process.exit(0); });
process.on('exit',      () => { killAllPtys(); });
```

PTY instances are also removed from the set in both `ptyProc.onExit` and `ws.on('close')`
so the set stays accurate regardless of which side closes first.

### Root Cause 3 — Transient `EAGAIN` on spawn (race with restarting server)

Even with the SIGTERM handler in place, there is a brief window during `tsx watch`
restarts where the old process's fds are not yet fully released and the new process
tries to spawn a PTY. This produces a transient `posix_spawnp failed` if the user opens
a terminal tab immediately after a file-save reload.

**Fix:** Wrap the `pty.spawn()` call in a retry helper that waits 250 ms and tries once
more on any spawn error:

```typescript
async function spawnWithRetry(shell, args, opts) {
  try {
    return pty.spawn(shell, args, opts);
  } catch {
    await new Promise(r => setTimeout(r, 250));
    return pty.spawn(shell, args, opts);
  }
}
```

A `MAX_TERMINALS = 20` cap was also added: if 20 PTYs are already open the WebSocket is
rejected immediately with a human-readable message, preventing runaway resource use.

---

## File Explorer Auto-Expand Not Working

### Symptom

Switching to a file in the editor did not expand or reveal it in the file explorer sidebar, even though an `expandToPath` prop existed on `FileExplorer`.

### Root Cause 1 — Dead state, never updated

`WorkbenchLayout` had:

```typescript
const [expandToPath, setExpandToPath] = useState<string | null>(null);
```

This state was passed to `<Sidebar expandToPath={expandToPath} />` but was never set anywhere, so the file explorer always received `null`.

### Fix 1

Remove the state and pass `activeFilePath` directly:

```tsx
<Sidebar expandToPath={activeFilePath} ... />
```

### Root Cause 2 — Auto-expand effect fought manual user collapses

The `useEffect` in `FileExplorer` that expands parent directories had `expandedPaths` in its dependency array:

```typescript
useEffect(() => {
  // ...
  parentsToExpand.forEach(parentPath => {
    if (!expandedPaths.has(parentPath)) toggleExpand(parentPath);
  });
}, [expandToPath, tree, expandedPaths, toggleExpand]); // ← expandedPaths triggers re-run
```

Every call to `toggleExpand` changed `expandedPaths`, which re-triggered the effect. More importantly, if the user manually collapsed a parent folder, the effect would immediately re-expand it on the next state update.

### Fix 2

Remove `expandedPaths` from the dependency array and add a `forceExpand` flag to `toggleExpand` so it only opens (never toggles closed):

```typescript
// useFileTree.ts
const toggleExpand = useCallback((nodePath: string, forceExpand?: boolean) => {
  setExpandedPaths(prev => {
    const next = new Set(prev);
    if (forceExpand) {
      next.add(nodePath);
    } else if (next.has(nodePath)) {
      next.delete(nodePath);
    } else {
      next.add(nodePath);
    }
    return next;
  });
}, []);

// FileExplorer.tsx — auto-expand effect
useEffect(() => {
  if (!expandToPath || !tree) return;
  const pathParts = expandToPath.split('/');
  for (let i = 1; i < pathParts.length - 1; i++) {
    const parentPath = pathParts.slice(0, i + 1).join('/');
    toggleExpand(parentPath, true /* forceExpand */);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [expandToPath, tree]); // expandedPaths intentionally excluded
```

### Root Cause 3 — Stale `setExpandToPath` reference after state removal

After removing the `expandToPath` state, a `setExpandToPath(filePath)` call left inside `handleNavigateToLine` (in `WorkbenchLayout`) caused a runtime error:

```
Error: setExpandToPath is not defined
```

### Fix 3

Delete the leftover `setExpandToPath(filePath)` call. The expansion is now driven automatically by `activeFilePath` changing (via `openFile`), so no explicit setter call is needed.

---

## Tutor Mode `open_file` Tool Not Navigating Editor

### Symptom

The AI called `open_file` and the tool block appeared in the UI, but the editor did not switch to the file or highlight the lines.

### Root Cause — Stale closure capturing `undefined` callback

`useCodingAssistant` receives `onNavigateToLine` as a hook parameter and uses it inside `sendMessage`. `sendMessage` is wrapped in `useCallback` with the dependency array `[history, isLoading, model, provider]` — `onNavigateToLine` was not listed. React therefore created the callback once (on first render, when `onNavigateToLine` was still `undefined`) and never recreated it:

```typescript
// onNavigateToLine is undefined at first render — captured and frozen forever
const sendMessage = useCallback(async (...) => {
  // ...
  if (filePath && onNavigateToLine) {  // always false
    onNavigateToLine(filePath, line, endLine);
  }
}, [history, isLoading, model, provider]); // missing onNavigateToLine
```

### Fix

Mirror the callback into a ref that is updated on every render, then read from the ref inside `sendMessage`:

```typescript
const onNavigateToLineRef = useRef(onNavigateToLine);
onNavigateToLineRef.current = onNavigateToLine; // always current

// Inside sendMessage's open_file handler:
onNavigateToLineRef.current?.(filePath, line, endLine);
```

This is the same pattern used for `filePathRef`/`contentRef` in `useFileDiff.ts` — stable callbacks that always read the latest value without being in the `useCallback` dependency array.

---

## Proactive Reply Triggers Agent Tool Execution

### Symptom

Replying to a proactive "do you need help" message caused the Coding Assistant to immediately run `search_files` or similar tools, then stop with an execution error instead of responding conversationally.

### Root Cause

When the user replies to a proactive message, `useCodingAssistant.sendMessage` awaits the stored `collectContext()` and prepends the result to the API payload. The context block included the raw output of `git diff` (up to 150 lines). The agent interpreted the diff as a signal that it should investigate the codebase using tools before responding.

### Fix

Added an explicit instruction to the context framing:

```ts
apiContent = `**Context at the time of the assistant's proactive message ` +
  `(for reference only — respond conversationally, do not call any tools):**\n` +
  `${proactiveContext}\n\n---\n${text}`;
```

The parenthetical is read by the LLM and suppresses tool-use behaviour for that turn.

---

## Blank Screen After Adding Proactive Help Wiring

### Symptom

The entire workbench rendered as a blank screen after adding the proactive help hooks to `WorkbenchLayout`.

### Root Cause

The proactive help block was inserted above the `useOpenFiles()` call but referenced `activeFilePath` — a value destructured from `useOpenFiles()` — before it was declared:

```ts
// BUG: placed before useOpenFiles()
const activeFilePathRef = useRef(activeFilePath); // TS2448: used before declaration
activeFilePathRef.current = activeFilePath;        // TS2448: used before declaration

// ... later ...
const { activeFilePath, ... } = useOpenFiles();   // declared here
```

TypeScript emitted `TS2448: Block-scoped variable 'activeFilePath' used before its declaration`. Vite still bundled the file (treating it as a warning at build time), but the runtime reference to an uninitialised `let` binding threw a `ReferenceError`, crashing the component tree before anything rendered.

### Fix

Move the entire proactive help block (refs, `useMemo`, `useProactiveHelp`) to after the `useOpenFiles()` destructure so `activeFilePath` is in scope.

---

## System View Active-File Chip — Node Not Highlighted After Tab Switch

### Symptom

Clicking the `◎ NodeName` chip in the Coding Assistant input area switched the right
panel to System View, but no node was visually selected or centred in the diagram.

### Root Cause — `clientWidth` is 0 when the SVG is hidden

`SystemView` is always mounted (to preserve state) but hidden with `display: none` when
not the active tab. A hidden element returns `clientWidth === 0`.

The chip click called `handleOpenNode` in `RightPanel`, which set the tab and then
immediately tried to pan the SVG. If the pan ran before the DOM updated:

```typescript
const viewW = svgRef.current?.clientWidth ?? 900;  // 0 ?? 900  →  0  (not 900!)
// setPan becomes: { x: -node.x * 1.2, y: -node.y * 1.2 }
// → node panned off-screen to top-left corner
```

`??` only substitutes for `null`/`undefined`, not `0`.

### Fix — Two-step select + focus with `flushSync`

Split the operation into two methods on `SystemViewHandle`:

- **`selectByPath(path)`** — updates `selected` state, reads no DOM dimensions, safe
  to call while SVG is hidden.
- **`focusSelected()`** — reads live `clientWidth`/`clientHeight` and pans. Only called
  after the tab is visible.

`RightPanel.handleOpenNode` uses `flushSync` to commit the tab switch synchronously
before reading dimensions:

```typescript
const handleOpenNode = useCallback(() => {
  flushSync(() => setActiveTab('system'));   // DOM updated synchronously
  systemViewRef.current?.focusSelected();   // clientWidth is now non-zero
}, []);
```

**Zero-guard the dimension fallback** (`SystemView.tsx`):

```typescript
const svgEl = svgRef.current;
const cx = svgEl && svgEl.clientWidth  > 0 ? svgEl.clientWidth  / 2 : 450;
const cy = svgEl && svgEl.clientHeight > 0 ? svgEl.clientHeight / 2 : 320;
```

The passive sync path (`syncActiveFile` → `selectByPath`) never reads dimensions,
so it is safe to call at any time including while the SVG is hidden.

---

## AI Assistant Agent Loop Stops After `edit_file` (Dogfooding Scenario)

### Symptom

When asking the Coding Assistant to edit a TypeScript source file, the agent loop stops immediately after the `edit_file` tool completes — no further text or tool calls appear, and the response ends as if finished. Editing markdown files does not trigger this.

### Root Cause

The server runs with `tsx watch src/index.ts`. When any TypeScript file imported by the server (anything under `server/src/`) is modified on disk, `tsx watch` restarts the Node process. This kills the active SSE connection for the ongoing agent loop. The client's `reader.read()` resolves with `done: true`, the stream handler exits, and `isLoading` is set to `false` — identical to a normal response end.

Markdown files are fine because `tsx watch` only restarts on changes to files it imports (TypeScript/JavaScript). `.md` files are never imported.

This only manifests in the **dogfooding scenario**: using iodine to edit iodine's own server source files while running `npm run dev` on the same project.

### Files involved

| File | Role |
|------|------|
| `server/package.json` | `"dev": "tsx watch src/index.ts"` — the watcher |
| `server/src/routes/agent.ts` | `res.on('close', () => { abortSignal.aborted = true; })` — abort on connection close |
| `server/src/services/anthropicAgent.ts` | Agent loop checks `abortSignal.aborted` and returns early |
| `client/src/hooks/useCodingAssistant.ts` | SSE reader exits on `done: true`; no reconnect logic |

### Workarounds

1. **Run the built server** — `npm run build && node server/dist/index.js` — no hot reload, agent edits no longer restart the server.
2. **Batch edits into one turn** — if the agent must touch multiple server files, ask it to do them all at once so the tsx restart happens at the end rather than mid-turn.
3. **Use Claude Code CLI for server-side edits** — the CLI runs outside the iodine process so server restarts do not affect it.

---

## Monaco Cursor Jumps to the Last Line While Typing

### Symptom

While typing in the Monaco editor, the cursor intermittently jumps to the final line of
the file. The jump coincides with background file refreshes or diff polling rather than
with a specific keystroke.

### Root Cause

The editor was rendered as a controlled component:

```tsx
<Editor value={file.content} />
```

External sources such as `useFileDiff`, `refreshFile`, and diff polling can update
`file.content`. When `@monaco-editor/react` sees that the prop value differs from the
current model value, it replaces the model's full range using `pushEditOperations`.
Because that replacement supplies no cursor-state computer, Monaco places the cursor at
the end of the replaced range—the last line.

Local editor changes already flow through `onChange` → `onContentChange` → application
state. Passing those changes back through the controlled `value` prop unnecessarily
re-applies the editor's own content and exposes this cursor-reset behavior.

### Fix

Use Monaco in uncontrolled mode with `defaultValue`, then handle true external content
changes through the editor ref. Before applying an external update, capture the current
selections and scroll position; restore them after updating the model. Do not push a
state update back into Monaco when it originated from Monaco's own `onChange` callback.

When switching files, ensure the correct content is loaded explicitly (or use a stable
model URI per file), because later changes to `defaultValue` do not update an existing
model. External refreshes must also avoid overwriting newer unsaved local edits.

### Regression checks

- Type continuously while file and diff polling run.
- Modify the active file externally and verify cursor, selections, and scroll are kept.
- Switch rapidly between files and verify each model has the correct content.
- Confirm stale watcher responses cannot overwrite newer local edits.
- Verify undo/redo and multi-cursor selections after an external update.
- Handle deletion or rename of the active file without recreating the wrong model.
