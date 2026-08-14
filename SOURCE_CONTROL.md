# Source Control Integration

Iodine provides three layers of live git integration: a **Source Control panel** (stage, unstage, commit, and discard changes), **file tree status indicators** (showing which files have changed), and **inline editor diff decorations** (showing exactly which lines changed, with expandable deleted-line views).

---

## Source Control Panel

The left sidebar's Source Control view provides a full commit workflow: browse staged and unstaged changes, stage or unstage individual files, discard changes, and commit — all without leaving the IDE.

### Layout

```
┌──────────────────────────────────────────┐
│ SOURCE CONTROL              ⊕ main       │  ← header with branch name
├──────────────────────────────────────────┤
│ Message (Ctrl+Enter to commit)           │  ← commit textarea
│                                          │
│ [Commit]  [Stage All]                    │  ← Commit disabled until staged + message
├──────────────────────────────────────────┤
│ ▾ STAGED CHANGES (2)                     │  ← collapsible, count in parens
│   foo.ts              src/components  M  │  ← hover reveals action icons
│   bar.ts                             A  │
├──────────────────────────────────────────┤
│ ▾ CHANGES (3)                            │
│   baz.ts              src/utils      M  │
│   newfile.ts                         U  │  ← U = untracked
└──────────────────────────────────────────┘
```

Hovering a file row replaces the status badge with two icon buttons:

| Button | Staged section | Changes section |
|--------|---------------|-----------------|
| `↺` | Discard staged version (runs `git restore --staged` then `git restore`) | Discard working tree changes (or delete untracked file) |
| `−` / `+` | Unstage (`git restore --staged`) | Stage (`git add`) |

Discarding always shows a confirmation dialog. For untracked files the dialog warns that the file will be deleted.

### Status Badge Colors

| Code | Label | Color | Meaning |
|------|-------|-------|---------|
| `M` | M | Amber `#e9b44c` | Modified |
| `A` | A | Green `#73c991` | Added (new tracked file) |
| `D` | D | Red `#f44747` | Deleted |
| `R` | R | Blue `#569cd6` | Renamed |
| `??` | U | Green `#73c991` | Untracked |

### How It Works

**Server: `GET /api/git/changes`** (`server/src/routes/files.ts`)

1. Resolves `repoRoot` via `git rev-parse --show-toplevel`.
2. Gets the current branch via `git rev-parse --abbrev-ref HEAD`.
3. Runs `git status --porcelain` and splits lines into `staged` (non-space `X`) and `unstaged` (non-space `Y`). Untracked (`??`) lines go into `unstaged`.
4. Returns absolute paths, repo-relative paths, and single-character status codes.

```json
{
  "branch": "main",
  "staged":   [{ "path": "/abs/…/foo.ts", "relPath": "src/foo.ts", "status": "M" }],
  "unstaged": [{ "path": "/abs/…/bar.ts", "relPath": "src/bar.ts", "status": "??" }]
}
```

**Server: mutation endpoints** (`server/src/routes/files.ts`)

All use `execFileAsync` (no shell injection) and resolve absolute paths from `repoRoot + relPath` before passing to git.

| Method | Path | Git command |
|--------|------|-------------|
| `POST` | `/api/git/stage` | `git add -- <absPath>` |
| `POST` | `/api/git/unstage` | `git restore --staged -- <absPath>` |
| `POST` | `/api/git/stage-all` | `git add -A` |
| `POST` | `/api/git/discard` | `git restore -- <absPath>` (or `fs.unlink` for untracked) |
| `POST` | `/api/git/commit` | `git commit -m <message>` |

All mutation endpoints require `{ relPath }` in the request body (except `stage-all` and `commit`). `discard` also accepts `{ isUntracked: boolean }` to select the delete path.

**Client: `useSourceControl` hook** (`client/src/hooks/useSourceControl.ts`)

Polls `GET /api/git/changes` every 3 seconds and on `window focus`. Returns `{ branch, staged, unstaged, loaded, loading, commitMessage, setCommitMessage, stage, unstage, stageAllChanges, discard, commit }`.

The `loaded` flag distinguishes "not yet fetched" from "no branch" (not a git repo), preventing a flash of the "Not a git repository" message on first load.

**Client: `SourceControlPanel`** (`client/src/components/sidebar/SourceControlPanel.tsx`)

Receives `workspacePath` from `Sidebar`. Renders the commit area and two `ChangeSection` sub-components. File rows use per-row `hovered` state (via `onMouseEnter`/`onMouseLeave`) to toggle between the status badge and action buttons.

### Assistant commit-message composition

The `git_commit_compose` assistant tool accepts a required `message` and populates the Source Control commit textarea. Its server handler emits an SSE event rather than invoking `git commit`; the client opens the sidebar and Source Control view, then applies the proposed message. The user remains in control of the final action and must review the message and click **Commit** (or press Ctrl+Enter) to create the commit.

The assistant system prompt instructs models to use `git_commit_compose` instead of running `git commit`. In Tutor mode, `client/src/hooks/useToolNarration.ts` announces this action with a phrase such as “Let me draft a commit message.”

---

## File Tree Status Indicators

Files in the explorer are styled to reflect their git index and working tree state.

| State | Appearance | Meaning |
|---|---|---|
| Modified, not staged | **Bold** | Working tree has changes not yet `git add`-ed |
| Staged | Underlined | File is in the index (`git add`-ed) |
| Staged + further modified | **Bold + underlined** | Staged, but additional working tree changes on top |
| Clean | Normal | No changes relative to HEAD |

Untracked (`??`) files are not highlighted — only already-tracked files.

### How It Works

**Server: `GET /api/git/status`** (`server/src/routes/files.ts`)

1. Runs `git rev-parse --show-toplevel` to find the true repo root (handles workspaces that are subdirectories of a larger repo).
2. Runs `git status --porcelain` for compact machine-readable output.
3. Parses each line — column 1 (`X`) is the index state, column 2 (`Y`) is the working tree state. A non-space, non-`?` character means that side has changes. Rename lines use the destination path.
4. Returns absolute paths mapped to `'staged'`, `'unstaged'`, or `'both'`. Returns `{ status: {} }` if the workspace is not a git repo.

```json
{
  "status": {
    "/abs/path/to/file.ts": "unstaged",
    "/abs/path/to/other.ts": "staged",
    "/abs/path/to/third.ts": "both"
  }
}
```

**Client: `useGitStatus` hook** (`client/src/hooks/useGitStatus.ts`)

Polls `GET /api/git/status` every 3 seconds and on `window focus`. Returns a `Record<string, GitFileStatus>` keyed by absolute path. Resets to `{}` when no workspace is open.

**Client: rendering** (`FileTreeNode.tsx`)

`gitStatus` is threaded from `FileExplorer` → `FileTreeNode` and recursively to all children. Each node looks up its path in the map and applies inline styles:

| Value | `fontWeight` | `textDecoration` |
|---|---|---|
| `'unstaged'` | `bold` | — |
| `'staged'` | — | `underline` |
| `'both'` | `bold` | `underline` |

---

## Inline Editor Diff Decorations

When a file is open in the Monaco editor, changed lines are decorated in real time based on `git diff HEAD`.

### Visual Key

| Decoration | Gutter | Line background | Meaning |
|---|---|---|---|
| Added | Green bar (`#2ea043`) | Green tint | Lines exist in the working tree but not in HEAD |
| Modified | Yellow bar (`#e9b44c`) | Yellow tint | Lines exist in both, with different content |
| Deleted | Red `▸` glyph | — | Lines were removed; the glyph marks where they used to be |

Clicking **any** marker opens the diff dialog (see below). All three types also appear as colored marks in the scrollbar **overview ruler**.

### The Hunk Model

A change is represented as a **hunk**, not as per-line flags:

```ts
type DiffHunk = {
  startLine: number;        // 1-based, in the working copy
  lineCount: number;        // 0 for a pure deletion
  originalLines: string[];  // [] for a pure addition
  type: 'added' | 'modified' | 'deleted';
};
```

Read it as *"the working-copy range `[startLine, startLine + lineCount)` replaces `originalLines`."* The `type` is derived from which side is empty.

This matters because the two sides of a hunk **need not be the same length**. An earlier design bucketed changes per line — pairing the first `min(m, p)` lines of a mixed block as "modified" and spilling the remainder into separate "added"/"deleted" entries. That cannot represent an unbalanced edit: collapsing two lines into one produced a `modified` entry *and* a `deleted` entry anchored to the same line, which meant two competing gutter glyphs on one line, a preview that showed only half the change, and two reverts that each restored only part of it. Keeping both sides of a hunk together makes one marker, one preview and one revert describe the whole change.

### Diff Dialog

Clicking any gutter marker opens `client/src/components/editor/DiffHunkDialog.tsx`:

- Two stacked blocks — a red "before" block rendering `originalLines`, and a green "after" block rendering the hunk's current text (snapshotted from the Monaco model at click time). A pure addition has an empty before-block; a pure deletion has an empty after-block.
- When the two sides have the **same** line count, each row is word-diffed with `diffWordsWithSpace` from the [`diff`](https://www.npmjs.com/package/diff) package, so only the changed words are tinted — showing the exact area modified rather than just "this line changed". When the counts differ there is no meaningful per-line pairing, so each side renders plainly and the block tint alone carries the meaning (the same thing GitHub does).
- **Revert** replaces the hunk's whole range with `originalLines` in a single `executeEdits` call, so the change is restored atomically and stays on the undo stack. **Cancel**, the backdrop, or **Escape** close without changing anything.
- The snapshot is taken once, when the dialog opens. If the buffer no longer matches it by the time Revert is clicked (further edits, or a diff refresh that made the hunk stale), Revert is a no-op and the dialog just closes — it never overwrites newer edits.

### How It Works

**Server: `GET /api/git/diff?path=`** (`server/src/routes/files.ts`)

Runs `git diff HEAD -- <file>` via `execFile` (no shell injection risk). The response is parsed by `parseDiff()`:

- Each hunk header (`@@`) sets the current new-file line counter and marks the parser as inside a hunk. Everything before the first `@@` is header noise and is skipped on that flag — matching on `--- `/`+++ ` prefixes instead would misread a removed line whose own content starts with `--`.
- Each contiguous block of `−`/`+` lines becomes **one** hunk:
  - Only `+` lines → `type: 'added'`, `originalLines: []`
  - Only `−` lines → `type: 'deleted'`, `lineCount: 0`, anchored to the line the removed text followed (`0` at the top of the file)
  - Mixed `−` and `+` → `type: 'modified'`, carrying **all** removed lines and **all** added lines, whatever their counts

```json
{
  "hunks": [
    { "startLine": 5,  "lineCount": 2, "originalLines": [],                    "type": "added" },
    { "startLine": 12, "lineCount": 1, "originalLines": ["old a", "old b"],    "type": "modified" },
    { "startLine": 8,  "lineCount": 0, "originalLines": ["removed line"],      "type": "deleted" }
  ]
}
```

Returns `{ hunks: [] }` if the file is untracked, clean, or git is unavailable.

**Server: `POST /api/git/diff`**

Diffs in-memory editor content against HEAD without requiring a save. Fetches the committed blob with `git show HEAD:./<relPath>`, writes both sides to temp files, and runs `git diff --no-index`. The `./` prefix is load-bearing: `HEAD:<path>` resolves against the **repo root**, whereas `HEAD:./<path>` resolves against `cwd` — which is what makes this work when the open workspace is a subdirectory of the repo rather than its root.

**Client: `useFileDiff` hook** (`client/src/hooks/useFileDiff.ts`)

Fetches `GET /api/git/diff` for the currently active file path. Polls every 3 seconds and on `window focus`. Returns `DiffData | null`.

**Client: `MonacoEditor`** (`client/src/components/editor/MonacoEditor.tsx`)

Decorations are applied via the Monaco `deltaDecorations` API after the editor mounts. Key implementation details:

- `onMount` captures the editor and monaco instances in refs and fires a state flag (`mounted`) to trigger the decoration effect.
- A `diffDataRef` ref keeps the glyph-click handler pointing at the latest diff data without re-subscribing. The handler only ever *sets* dialog state — it is registered once at mount, so reading that state inside it would capture a stale closure.
- `markerRange(hunk)` gives the gutter line(s) a hunk owns: its working-copy range, or — for a deletion, which owns no lines — the single line it was anchored to. One hunk yields exactly one decoration, so glyphs can never compete for the same line.
- Glyph clicks are detected via `editor.onMouseDown` checking `MouseTargetType.GUTTER_GLYPH_MARGIN`, then matched to a hunk through `markerRange`.
- The hunk's current text is snapshotted with `readCurrentLines()` at click time and passed to `DiffHunkDialog` alongside the hunk itself.
- `revertHunk()` is the single revert path for all three types: re-insert for a deletion, remove-with-newline for an addition, replace-range otherwise.

**CSS** (`client/src/index.css`)

`.git-added-glyph`, `.git-modified-glyph`, `.git-deleted-glyph` — gutter bar/icon styles. `.git-added-line`, `.git-modified-line` — 12% opacity background tints.

---

## Polling Summary

All three features share the same refresh strategy:

| Trigger | SCM panel | Status indicators | Diff decorations |
|---|---|---|---|
| Interval | Every 3 s | Every 3 s | Every 3 s |
| Window focus | Yes | Yes | Yes |
| Workspace change | Yes (hook re-runs) | Yes (hook re-runs) | Yes (file path changes) |
| File switch | — | — | Yes (hook re-runs on new path) |

---

## Extending

### Add more file tree states (e.g. untracked files)

1. Extend `GitFileStatus` in `client/src/api/files.ts` and `client/src/hooks/useGitStatus.ts`.
2. Update the porcelain parser in `server/src/routes/files.ts` (`/git/status` route, detect `??` lines).
3. Add a style branch in `FileTreeNode.tsx`.

### Add more diff decoration types (e.g. conflict markers)

1. Extend `DiffHunk['type']` in `server/src/routes/files.ts` and `client/src/api/files.ts` (keep the two in sync — there is no shared types package).
2. Update `parseDiff()` on the server to emit the new type.
3. Add a branch in the decoration `useEffect` inside `MonacoEditor.tsx`, and in `markerRange()` if the new type does not occupy a plain working-copy line range.
4. Handle it in `revertHunk()` and in `DiffHunkDialog`'s `title()`.
5. Add CSS classes in `index.css`.

### Add more SCM actions (e.g. push, pull, stash)

1. Add a new endpoint in `server/src/routes/files.ts` using `execFileAsync('git', [...])`.
2. Add a typed wrapper in `client/src/api/files.ts`.
3. Expose the action from `useSourceControl` and wire it to a button in `SourceControlPanel.tsx`.
