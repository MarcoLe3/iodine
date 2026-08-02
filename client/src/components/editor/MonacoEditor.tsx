import { useRef, useEffect, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditorAPI } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';
import type { OpenFile } from '../../types';
import type { DiffData } from '../../hooks/useFileDiff';
import type { DiffHunk } from '../../api/files';
import { DiffHunkDialog } from './DiffHunkDialog';

interface MonacoEditorProps {
  file: OpenFile;
  onContentChange: (path: string, content: string) => void;
  diffData?: DiffData | null;
  onEditorMount?: (editor: MonacoEditorAPI.IStandaloneCodeEditor) => void;
  onAfterRevert?: () => void;
}

type DialogState = { hunk: DiffHunk; currents: string[] };

// ── Hunk helpers ──────────────────────────────────────────────────────────────

/**
 * The gutter line(s) a hunk's marker occupies. A deleted hunk owns no
 * working-copy lines, so its marker is anchored to the line it used to follow
 * (or line 1 when the deletion was at the top of the file).
 */
function markerRange(hunk: DiffHunk): [number, number] {
  if (hunk.lineCount === 0) {
    const anchor = hunk.startLine === 0 ? 1 : hunk.startLine;
    return [anchor, anchor];
  }
  return [hunk.startLine, hunk.startLine + hunk.lineCount - 1];
}

/** Reads the hunk's current working-copy text, or [] for a pure deletion. */
function readCurrentLines(model: MonacoEditorAPI.ITextModel, hunk: DiffHunk): string[] | null {
  if (hunk.lineCount === 0) return [];
  if (hunk.startLine + hunk.lineCount - 1 > model.getLineCount()) return null;
  const out: string[] = [];
  for (let n = hunk.startLine; n < hunk.startLine + hunk.lineCount; n++) out.push(model.getLineContent(n));
  return out;
}

/**
 * Restores a hunk's committed text, replacing the whole hunk in one edit so an
 * unbalanced change (2 lines → 1) is restored completely rather than half-way.
 * Uses executeEdits so the revert stays on the undo stack.
 */
function revertHunk(editor: MonacoEditorAPI.IStandaloneCodeEditor, hunk: DiffHunk): void {
  const model = editor.getModel();
  if (!model) return;
  const { startLine, lineCount, originalLines } = hunk;
  const text = originalLines.join('\n');

  // Pure deletion → re-insert the removed lines after startLine.
  if (lineCount === 0) {
    if (startLine === 0) {
      editor.executeEdits('revert-hunk', [{
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
        text: text + '\n',
      }]);
    } else {
      const col = model.getLineMaxColumn(startLine);
      editor.executeEdits('revert-hunk', [{
        range: { startLineNumber: startLine, startColumn: col, endLineNumber: startLine, endColumn: col },
        text: '\n' + text,
      }]);
    }
    return;
  }

  const endLine = startLine + lineCount - 1;

  // Pure addition → remove the lines, taking a newline with them so no blank
  // line is left behind.
  if (originalLines.length === 0) {
    const total = model.getLineCount();
    let range;
    if (endLine < total) {
      range = { startLineNumber: startLine, startColumn: 1, endLineNumber: endLine + 1, endColumn: 1 };
    } else if (startLine > 1) {
      range = {
        startLineNumber: startLine - 1,
        startColumn: model.getLineMaxColumn(startLine - 1),
        endLineNumber: endLine,
        endColumn: model.getLineMaxColumn(endLine),
      };
    } else {
      range = { startLineNumber: 1, startColumn: 1, endLineNumber: endLine, endColumn: model.getLineMaxColumn(endLine) };
    }
    editor.executeEdits('revert-hunk', [{ range, text: '' }]);
    return;
  }

  // Modified → swap the whole range for the committed text.
  editor.executeEdits('revert-hunk', [{
    range: { startLineNumber: startLine, startColumn: 1, endLineNumber: endLine, endColumn: model.getLineMaxColumn(endLine) },
    text,
  }]);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MonacoEditor({ file, onContentChange, diffData, onEditorMount, onAfterRevert }: MonacoEditorProps) {
  const editorRef = useRef<MonacoEditorAPI.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const diffDataRef = useRef<DiffData | null>(diffData ?? null);
  const onAfterRevertRef = useRef(onAfterRevert);
  onAfterRevertRef.current = onAfterRevert;
  const [mounted, setMounted] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  // Keep diffDataRef in sync so the click handler always has the latest data
  useEffect(() => { diffDataRef.current = diffData ?? null; }, [diffData]);

  // Close any open dialog when the file changes
  useEffect(() => { setDialog(null); }, [file.path]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    onEditorMount?.(editor);

    editor.onMouseDown(e => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const lineNumber = e.target.position?.lineNumber;
      if (lineNumber == null || !diffDataRef.current) return;

      const hunk = diffDataRef.current.hunks.find(h => {
        const [from, to] = markerRange(h);
        return lineNumber >= from && lineNumber <= to;
      });
      if (!hunk) return;

      const model = editor.getModel();
      if (!model) return;
      const currents = readCurrentLines(model, hunk);
      if (currents === null) return;

      setDialog({ hunk, currents });
    });

    setMounted(true);
  };

  // Revert the change previewed in the dialog. Guards against the buffer having
  // moved on (further edits, or a diff refresh that made the hunk stale) while
  // the dialog was open, so we never clobber newer edits.
  const handleRevert = () => {
    const state = dialog;
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!state || !editor || !model) { setDialog(null); return; }

    const live = readCurrentLines(model, state.hunk);
    const stillMatches =
      live !== null &&
      live.length === state.currents.length &&
      live.every((text, i) => text === state.currents[i]);

    if (stillMatches) {
      revertHunk(editor, state.hunk);
      onAfterRevertRef.current?.();
    }
    setDialog(null);
  };

  // Apply/update decorations whenever diff data changes
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !mounted) return;

    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
    if (!diffData) return;

    const newDecorations: MonacoEditorAPI.IModelDeltaDecoration[] = [];

    for (const hunk of diffData.hunks) {
      const [from, to] = markerRange(hunk);

      if (hunk.type === 'deleted') {
        newDecorations.push({
          range: new monaco.Range(from, 1, from, 1),
          options: {
            glyphMarginClassName: 'git-deleted-glyph',
            glyphMarginHoverMessage: { value: 'Click to view and restore the deleted lines' },
            overviewRuler: { color: '#f44747', position: monaco.editor.OverviewRulerLane.Left },
          },
        });
        continue;
      }

      const isAdded = hunk.type === 'added';
      newDecorations.push({
        range: new monaco.Range(from, 1, to, 1),
        options: {
          isWholeLine: true,
          className: isAdded ? 'git-added-line' : 'git-modified-line',
          glyphMarginClassName: isAdded ? 'git-added-glyph' : 'git-modified-glyph',
          glyphMarginHoverMessage: { value: 'Click to view and revert this change' },
          overviewRuler: {
            color: isAdded ? '#2ea043' : '#e9b44c',
            position: monaco.editor.OverviewRulerLane.Left,
          },
        },
      });
    }

    decorationIdsRef.current = editor.deltaDecorations([], newDecorations);
  }, [diffData, mounted]);

  return (
    <>
      <Editor
        height="100%"
        theme={document.documentElement.dataset.theme === 'light' ? 'light' : 'vs-dark'}
        language={file.language}
        value={file.content}
        onChange={value => onContentChange(file.path, value ?? '')}
        onMount={handleMount}
        options={{
          fontSize: 14,
          fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, 'Courier New', monospace",
          fontLigatures: true,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          renderWhitespace: 'selection',
          tabSize: 2,
          automaticLayout: true,
          smoothScrolling: true,
          cursorSmoothCaretAnimation: 'on',
          lineNumbers: 'on',
          glyphMargin: true,
          folding: true,
          renderLineHighlight: 'line',
          bracketPairColorization: { enabled: true },
          padding: { top: 8 },
        }}
      />
      {dialog && (
        <DiffHunkDialog
          hunk={dialog.hunk}
          currents={dialog.currents}
          onRevert={handleRevert}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
