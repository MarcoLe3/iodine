import React, { forwardRef, useImperativeHandle, useState, useEffect, useCallback, useRef } from 'react';
import type { editor as MonacoEditorAPI } from 'monaco-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EditorTabs } from '../editor/EditorTabs';
import { MonacoEditor } from '../editor/MonacoEditor';
import { WelcomeScreen } from '../editor/WelcomeScreen';
import { ImageViewer } from '../editor/ImageViewer';
import { PdfViewer } from '../editor/PdfViewer';
import MergeConflictView from '../editor/MergeConflictView';
import { useFileDiff } from '../../hooks/useFileDiff';
import { hasConflictMarkers } from '../../utils/mergeConflict';
import type { OpenFile } from '../../types';
import type { Provider } from '../../providers';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

type EditorView = 'source' | 'preview' | 'summary' | 'conflicts';

interface EditorAreaProps {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
  onContentChange: (path: string, content: string) => void;
  workspacePath: string | null;
  provider: Provider;
  model: string;
  /** When set to the active file's path, the editor switches to the AI summary view. */
  summaryRequestPath?: string | null;
  /** Called once the summary request has been consumed. */
  onSummaryHandled?: () => void;
  /** Fired on editor scroll — forwarded to MonacoEditor for activity tracking. */
  onActivity?: () => void;
  /** Called whenever the editor view switches between source / preview / summary. */
  onEditorViewChange?: (view: string) => void;
  /** Called whenever the AI summary text changes (streaming or cached load), so the
   *  parent can feed it to the outline panel without duplicating summary state. */
  onSummaryContentChange?: (content: string) => void;
  /** Called as the user scrolls preview/summary, reporting the heading currently at the top. */
  onActiveHeadingChange?: (id: string | null) => void;
  /** Called when a relative markdown link points to a file not yet open — should open it as a tab. */
  onOpenFile?: (path: string) => void;
  /** Called when a markdown link navigates to another .md file — parent should set previewRequestPath. */
  onPreviewRequest?: (path: string) => void;
  /** Called when a wiki-link target has a cached AI summary — parent should set summaryRequestPath. */
  onSummaryRequest?: (path: string) => void;
  /** When set to a file path, switches that file to preview once it becomes active. */
  previewRequestPath?: string | null;
  /** Called once the preview request has been consumed. */
  onPreviewHandled?: () => void;
  /** Called whenever the user opens the AI summary view (generate or view cached). */
  onSummaryOpen?: () => void;
  /** Whether the navigation stack has a previous entry to go back to. */
  canGoBack?: boolean;
  /** Whether the navigation stack has a forward entry. */
  canGoForward?: boolean;
  /** Navigate back in the file history stack. */
  onGoBack?: () => void;
  /** Navigate forward in the file history stack. */
  onGoForward?: () => void;
}

export interface EditorAreaHandle {
  save: () => void;
  getVisibleContext: () => string | null;
  navigateToLine: (filePath: string, line: number, endLine?: number, startCol?: number, endCol?: number) => void;
  scrollToHeading: (id: string) => void;
}

function isPreviewable(path: string) {
  return path.endsWith('.md') || path.endsWith('.html');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[*_`~[\]()!]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function makeHeadingId(children: React.ReactNode): string {
  const extract = (n: React.ReactNode): string => {
    if (!n) return '';
    if (typeof n === 'string') return n;
    if (Array.isArray(n)) return n.map(extract).join('');
    if (typeof n === 'object' && 'props' in (n as object))
      return extract((n as React.ReactElement).props.children);
    return '';
  };
  return slugify(extract(children));
}

/** Resolve a relative markdown link path against the active file's directory.
 *  Normalises backslashes to forward slashes first so Windows paths work. */
function resolveWorkspacePath(relativePath: string, activeFilePath: string): string {
  // Normalise to forward slashes for uniform processing.
  const normActive = activeFilePath.replace(/\\/g, '/');
  const normRel    = relativePath.replace(/\\/g, '/');
  const dir = normActive.substring(0, normActive.lastIndexOf('/'));
  const parts = `${dir}/${normRel}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  // Re-attach the root prefix ('/' on Unix, 'C:/' on Windows).
  const root = normActive.match(/^([A-Za-z]:[/\\]|\/)/)?.[0] ?? '';
  const sep = root.endsWith('/') ? '' : '/';
  return root + sep + resolved.join('/');
}

/** Resolve a potentially relative image src to an API URL that the server can serve. */
function resolveImageSrc(src: string, activeFilePath: string | null): string {
  if (/^https?:\/\//.test(src) || src.startsWith('data:')) return src;
  if (!activeFilePath) return src;
  return `http://localhost:3001/api/files/image?path=${encodeURIComponent(resolveWorkspacePath(src, activeFilePath))}`;
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.03em',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  userSelect: 'none',
  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
};

export const EditorArea = forwardRef<EditorAreaHandle, EditorAreaProps>(
  function EditorArea({ openFiles, activeFilePath, onTabClick, onTabClose, onTabReorder, onContentChange, workspacePath, provider, model, summaryRequestPath, onSummaryHandled, onActivity, onEditorViewChange, onSummaryContentChange, onActiveHeadingChange, onOpenFile, onPreviewRequest, previewRequestPath, onPreviewHandled, onSummaryRequest, onSummaryOpen, canGoBack, canGoForward, onGoBack, onGoForward }, ref) {
    const activeFile = openFiles.find(f => f.path === activeFilePath) ?? null;
    const { diff: diffData, refreshDiff } = useFileDiff(
      (activeFile?.isImage || activeFile?.isUrl || activeFile?.isExternal) ? null : (activeFile?.path ?? null),
      activeFile?.content ?? '',
    );
    const monacoEditorRef = useRef<MonacoEditorAPI.IStandaloneCodeEditor | null>(null);
    const scrollPercentageRef = useRef(0);
    const previousViewRef = useRef<EditorView>('source');
    const previewRef = useRef<HTMLDivElement | null>(null);
    const summaryRef = useRef<HTMLDivElement | null>(null);
    // Suppresses scroll-based heading tracking briefly after a programmatic scrollToHeading
    // so the outline doesn't jerk through intermediate positions during smooth scroll.
    const suppressTrackingUntilRef = useRef(0);

    const [editorView,       setEditorView]       = useState<EditorView>('source');
    const [summaryContent,   setSummaryContent]   = useState('');
    const [summaryLoading,   setSummaryLoading]   = useState(false);
    const [summaryError,     setSummaryError]     = useState<string | null>(null);
    const [hasCachedSummary, setHasCachedSummary] = useState(false);

    // Pending navigation request: open a file at a line and highlight a range.
    // Stored in a ref so it can be applied when the Monaco editor mounts for the target file.
    const pendingNavigationRef = useRef<{ filePath: string; line: number; endLine: number; startCol?: number; endCol?: number } | null>(null);
    const decorationIdsRef = useRef<string[]>([]);
    // Remembers the last editor view per file path so navigating back restores it.
    const viewByPathRef = useRef<Map<string, EditorView>>(new Map());
    // Remembers the scroll position (0–1 ratio) per file path.
    const scrollByPathRef = useRef<Map<string, number>>(new Map());

    // Reset view & summary when switching files.
    // Restores the last view the user was in for this file (unless it was 'conflicts').
    // Directories always go straight to summary view.
    useEffect(() => {
      const saved = activeFile?.path ? viewByPathRef.current.get(activeFile.path) : undefined;
      const view: EditorView = (() => {
        if (activeFile?.isDirectory) return 'summary';
        if (!saved || saved === 'conflicts') return 'source';
        if (saved === 'preview' && !isPreviewable(activeFile?.path ?? '')) return 'source';
        return saved;
      })();
      setEditorView(view);
      setSummaryContent('');
      setSummaryError(null);
      setSummaryLoading(false);
      setHasCachedSummary(false);
      // Restore the saved scroll position for this file (0 if first visit).
      scrollPercentageRef.current = activeFile?.path
        ? (scrollByPathRef.current.get(activeFile.path) ?? 0)
        : 0;
      previousViewRef.current = view;
      // Preview and summary have no onMount hook like Monaco's onEditorMount, so
      // restoreScrollPercentage must be called here. The double-rAF inside it waits
      // for React to render the new file content before applying scrollTop.
      // Source view is handled by onEditorMount — no call needed here.
      if (view === 'preview' || view === 'summary') {
        restoreScrollPercentage(view);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFile?.path]);

    // Persist the current view per file so navigating back restores it.
    useEffect(() => {
      if (activeFile?.path) viewByPathRef.current.set(activeFile.path, editorView);
    }, [editorView, activeFile?.path]);

    // Probe cache whenever the active file/dir changes so the button label is accurate
    // PDFs and images are excluded from AI summary
    useEffect(() => {
      if (!activeFile || activeFile.isImage || activeFile.isPdf) return;
      if (!workspacePath && !activeFile.isExternal) return;
      const isExternal = !!activeFile.isExternal;
      const lastSep = Math.max(activeFile.path.lastIndexOf('/'), activeFile.path.lastIndexOf('\\'));
      const externalWs = isExternal
        ? activeFile.path.substring(0, lastSep)
        : null;
      const relPath = isExternal
        ? activeFile.path.substring(lastSep + 1)
        :(activeFile.path.startsWith(workspacePath! + '/')
            ? activeFile.path.slice(workspacePath!.length + 1)
            : activeFile.path);
      const wsParam = isExternal ? `&workspacePath=${encodeURIComponent(externalWs!)}` : '';
      const url = activeFile.isDirectory
        ? `${API_BASE}/api/ai-directory-summary?path=${encodeURIComponent(relPath)}${wsParam}`
        : `${API_BASE}/api/ai-summary?path=${encodeURIComponent(relPath)}${wsParam}`;
      fetch(url)
        .then(r => r.json())
        .then((data: { content: string | null }) => setHasCachedSummary(!!data.content))
        .catch(() => {});
    }, [activeFile?.path, workspacePath]);

    // Honor an external request to show the AI summary for the active file.
    // Switching the view to 'summary' with empty content triggers the
    // generation/cache-load effect below.
    useEffect(() => {
      if (!summaryRequestPath || !activeFile) return;
      if (activeFile.path !== summaryRequestPath) return;
      setEditorView('summary');
      onSummaryHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [summaryRequestPath, activeFile?.path]);

    // Honor an external request to show the preview for the active file (e.g. markdown wiki navigation).
    // Runs after the file-switch reset effect so it reliably overrides 'source'.
    useEffect(() => {
      if (!previewRequestPath || !activeFile) return;
      if (activeFile.path !== previewRequestPath) return;
      if (isPreviewable(activeFile.path)) setEditorView('preview');
      onPreviewHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewRequestPath, activeFile?.path]);

    /** Apply a stored navigation request to the given Monaco editor instance. */
    const applyNavigation = useCallback((editor: MonacoEditorAPI.IStandaloneCodeEditor, line: number, endLine: number, startCol?: number, endCol?: number) => {
      const model = editor.getModel();
      if (!model) return;
      editor.revealLineInCenter(line);
      const hasColRange = startCol != null && endCol != null;
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [{
        range: {
          startLineNumber: line,
          startColumn: hasColRange ? startCol : 1,
          endLineNumber: endLine,
          endColumn: hasColRange ? endCol : model.getLineMaxColumn(endLine),
        },
        options: {
          isWholeLine: !hasColRange,
          className: 'tutor-line-highlight',
          linesDecorationsClassName: 'tutor-line-gutter',
        },
      }]);
    }, []);

    /** Capture the current scroll position as a 0–1 ratio before switching views,
     *  and persist it to scrollByPathRef so navigation back restores the same spot. */
    const captureScrollPercentage = useCallback(() => {
      const editor = monacoEditorRef.current;
      if (editor && editorView === 'source') {
        const scrollable = editor.getScrollHeight() - editor.getLayoutInfo().height;
        const pct = scrollable > 0 ? editor.getScrollTop() / scrollable : 0;
        scrollPercentageRef.current = pct;
        if (activeFile?.path) scrollByPathRef.current.set(activeFile.path, pct);
        return;
      }
      const el = previewRef.current;
      if (el && editorView === 'preview') {
        const scrollable = el.scrollHeight - el.clientHeight;
        const pct = scrollable > 0 ? el.scrollTop / scrollable : 0;
        scrollPercentageRef.current = pct;
        if (activeFile?.path) scrollByPathRef.current.set(activeFile.path, pct);
      }
    }, [editorView, activeFile?.path]);

    /** Walk heading elements in the container and report which one is at the top of the viewport.
     *  Deduplicates ids the same way parseHeadings does (append -N for Nth duplicate). */
    const trackActiveHeading = useCallback((container: HTMLDivElement) => {
      if (!onActiveHeadingChange) return;
      if (Date.now() < suppressTrackingUntilRef.current) return;
      const containerTop = container.getBoundingClientRect().top;
      const threshold = containerTop + 60;
      const headings = container.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]');
      let activeId: string | null = null;
      const seen = new Map<string, number>();
      for (const h of headings) {
        const base = h.id;
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        const uniqueId = n === 0 ? base : `${base}-${n}`;
        if (h.getBoundingClientRect().top <= threshold) activeId = uniqueId;
        else break;
      }
      onActiveHeadingChange(activeId);
    }, [onActiveHeadingChange]);

    /** Restore the captured scroll position in the newly visible view. */
    const restoreScrollPercentage = useCallback((view: EditorView) => {
      const percentage = scrollPercentageRef.current;
      const restore = () => {
        if (view === 'source') {
          const editor = monacoEditorRef.current;
          if (!editor) return false;
          const scrollable = editor.getScrollHeight() - editor.getLayoutInfo().height;
          editor.setScrollTop(Math.max(0, scrollable * percentage));
          return true;
        }
        if (view === 'preview') {
          const el = previewRef.current;
          if (!el) return false;
          const scrollable = el.scrollHeight - el.clientHeight;
          el.scrollTop = Math.max(0, scrollable * percentage);
          return true;
        }
        if (view === 'summary') {
          const el = summaryRef.current;
          if (!el) return false;
          const scrollable = el.scrollHeight - el.clientHeight;
          el.scrollTop = Math.max(0, scrollable * percentage);
          return true;
        }
        return true;
      };
      // Two frames: first lets React render the new view, second waits for layout.
      requestAnimationFrame(() => { restore(); requestAnimationFrame(restore); });
    }, []);

    // Restore scroll whenever the view changes (source ↔ preview).
    useEffect(() => {
      const previous = previousViewRef.current;
      if (editorView !== previous) {
        previousViewRef.current = editorView;
        restoreScrollPercentage(editorView);
      }
    }, [editorView, restoreScrollPercentage]);

    // Notify parent when the editor view changes.
    useEffect(() => {
      onEditorViewChange?.(editorView);
    }, [editorView, onEditorViewChange]);

    // Notify parent whenever summary text changes so it can drive the outline panel.
    useEffect(() => {
      onSummaryContentChange?.(summaryContent);
    }, [summaryContent, onSummaryContentChange]);

    useImperativeHandle(ref, () => ({
      save: () => {},
      navigateToLine: (filePath: string, line: number, endLine?: number, startCol?: number, endCol?: number) => {
        const resolvedEndLine = endLine ?? line;
        pendingNavigationRef.current = { filePath, line, endLine: resolvedEndLine, startCol, endCol };
        // If the target file is already active and Monaco is mounted, apply immediately
        if (monacoEditorRef.current && activeFilePath === filePath) {
          applyNavigation(monacoEditorRef.current, line, resolvedEndLine, startCol, endCol);
          pendingNavigationRef.current = null;
        }
      },
      scrollToHeading: (id: string) => {
        const container = editorView === 'summary' ? summaryRef.current : previewRef.current;
        if (!container) return;
        suppressTrackingUntilRef.current = Date.now() + 1200;
        // Walk headings with the same dedup logic as parseHeadings to find the right element.
        const headings = container.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]');
        const seen = new Map<string, number>();
        let target: HTMLElement | null = null;
        for (const h of headings) {
          const base = h.id;
          const n = seen.get(base) ?? 0;
          seen.set(base, n + 1);
          const uniqueId = n === 0 ? base : `${base}-${n}`;
          if (uniqueId === id) { target = h; break; }
        }
        if (!target) return;
        const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
        container.scrollTo({ top: offset - 16, behavior: 'smooth' });
      },
      getVisibleContext: () => {
        const editor = monacoEditorRef.current;
        if (!editor) return null;
        const model = editor.getModel();
        if (!model) return null;
        const fileName = activeFile?.name ?? '';

        // Prefer selected text
        const selection = editor.getSelection();
        if (selection && !selection.isEmpty()) {
          const startLine = selection.startLineNumber;
          const endLine = selection.endLineNumber;
          const lines: string[] = [];
          for (let i = startLine; i <= endLine; i++) {
            lines.push(`${i}: ${model.getLineContent(i)}`);
          }
          return `File: ${fileName} (selected lines ${startLine}-${endLine})\n${lines.join('\n')}`;
        }

        // Fall back to visible range
        const ranges = editor.getVisibleRanges();
        if (!ranges.length) return null;
        const range = ranges[0];
        const startLine = range.startLineNumber;
        const endLine = range.endLineNumber;
        const lines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
          lines.push(`${i}: ${model.getLineContent(i)}`);
        }
        return `File: ${fileName} (visible lines ${startLine}-${endLine})\n${lines.join('\n')}`;
      },
    }), [applyNavigation, activeFilePath, activeFile, editorView]);

    const showPreviewButton = !!activeFile && !activeFile.isImage && !activeFile.isPdf && !activeFile.isDirectory && !activeFile.isUrl && isPreviewable(activeFile.path);
    const showSummaryButton = !!activeFile && !activeFile.isImage && !activeFile.isPdf && !activeFile.isDirectory && !activeFile.isUrl && (!!workspacePath || !!activeFile.isExternal) && !activeFile.path.endsWith('.md');
    const showConflictsButton = !!activeFile && !activeFile.isImage && !activeFile.isPdf && !activeFile.isUrl && !activeFile.isDirectory && !activeFile.isExternal && hasConflictMarkers(activeFile.content ?? '');

    /** Convert an absolute file path to a workspace-relative path. */
    const toRelPath = (abs: string) => {
      if (!workspacePath) return abs;
      for (const sep of ['/', '\\']) {
        if (abs.startsWith(workspacePath + sep)) return abs.slice(workspacePath.length + 1);
      }
      return abs;
    };

    /**
     * Wiki-style navigation: open absPath as a tab, then — if in preview/summary context —
     * prefer showing a cached AI summary, fall back to preview for .md files.
     */
    const wikiNavigate = useCallback(async (absPath: string) => {
      const existing = openFiles.find(f => f.path === absPath);
      if (existing) onTabClick(existing.path);
      else onOpenFile?.(absPath);

      // Check server cache for an AI summary
      const relPath = workspacePath && absPath.startsWith(workspacePath + '/')
        ? absPath.slice(workspacePath.length + 1)
        : absPath;
      try {
        const resp = await fetch(`${API_BASE}/api/ai-summary?path=${encodeURIComponent(relPath)}`);
        const data = await resp.json() as { content: string | null };
        if (data.content) {
          onSummaryRequest?.(absPath);
          return;
        }
      } catch { /* fall through */ }
      // No cached summary — preview markdown files
      if (/\.(md|markdown)$/i.test(absPath)) onPreviewRequest?.(absPath);
    }, [openFiles, onTabClick, onOpenFile, workspacePath, onSummaryRequest, onPreviewRequest]);

    /**
     * Inline-code component for ReactMarkdown.
     * If the text looks like a relative file path (no spaces, contains /, e.g. "client/src/App.tsx")
     * it renders as a clickable link with dotted underline, opening via wikiNavigate.
     * Block code (className="language-xxx") is passed through unchanged.
     */
    const inlineCodeComponent = useCallback(
      ({ children, className, ...props }: React.ComponentPropsWithoutRef<'code'>) => {
        const text = String(children);
        const isBlock = !!className;
        // Path heuristic: no spaces, at least one /, only path-safe chars, not a URL
        const isPath = !isBlock
          && /^(?:[a-zA-Z0-9_@.\-]+\/)+[a-zA-Z0-9_@.\-]+$/.test(text)
          && activeFile != null;
        if (isPath) {
          const absPath = resolveWorkspacePath(text, activeFile!.path);
          return (
            <code
              {...props}
              style={{ cursor: 'pointer', textDecorationLine: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}
              title={`Open ${text}`}
              onClick={() => { wikiNavigate(absPath); }}
            >
              {children}
            </code>
          );
        }
        return <code {...props} className={className}>{children}</code>;
      },
      [activeFile, wikiNavigate],
    );

    const handleSwitchToSummary = useCallback(async (skipCache = false) => {
      if (!activeFile || (!workspacePath && !activeFile.isExternal)) return;
      setEditorView('summary');
      onSummaryOpen?.();

      // If we already have content for this session, just show it
      if (summaryContent && !skipCache) return;

      setSummaryLoading(true);
      setSummaryError(null);

      // For external files, use the file's directory as the workspace root
      const isExternal = !!activeFile.isExternal;
      const lastSep = Math.max(activeFile.path.lastIndexOf('/'), activeFile.path.lastIndexOf('\\'));
      const externalWs = isExternal
        ? activeFile.path.substring(0, lastSep)
        : null;
      const relPath = isExternal
        ? activeFile.path.substring(lastSep + 1)
        :toRelPath(activeFile.path);
      const isDir = !!activeFile.isDirectory;

      // 1. Check cache (skipped when regenerating)
      if (!skipCache) {
        try {
          const wsParam = isExternal ? `&workspacePath=${encodeURIComponent(externalWs!)}` : '';
          const cacheUrl = isDir
            ? `${API_BASE}/api/ai-directory-summary?path=${encodeURIComponent(relPath)}${wsParam}`
            : `${API_BASE}/api/ai-summary?path=${encodeURIComponent(relPath)}${wsParam}`;
          const resp = await fetch(cacheUrl);
          const data = await resp.json() as { content: string | null };
          if (data.content) {
            setSummaryContent(data.content);
            setSummaryLoading(false);
            return;
          }
        } catch { /* fall through to generation */ }
      }

      // 2. Generate via SSE
      try {
        const generateUrl = isDir
          ? `${API_BASE}/api/ai-directory-summary/generate`
          : `${API_BASE}/api/ai-summary/generate`;
        const generateBody = isDir
          ? JSON.stringify({ dirPath: relPath, provider: provider.id, model, ...(isExternal ? { workspacePath: externalWs } : {}) })
          : JSON.stringify({ filePath: relPath, provider: provider.id, model, ...(isExternal ? { workspacePath: externalWs } : {}) });
        const resp = await fetch(generateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: generateBody,
        });

        if (!resp.ok || !resp.body) {
          setSummaryError('Failed to start generation');
          setSummaryLoading(false);
          return;
        }

        const reader  = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            let eventName = '', dataStr = '';
            for (const line of part.split('\n')) {
              if (line.startsWith('event: ')) eventName = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataStr  = line.slice(6).trim();
            }
            if (!dataStr) continue;
            try {
              const payload = JSON.parse(dataStr) as Record<string, unknown>;
              if (eventName === 'text_delta') {
                setSummaryContent(c => c + (payload.text as string));
              } else if (eventName === 'done') {
                setSummaryLoading(false);
                setHasCachedSummary(true);
              } else if (eventName === 'error') {
                setSummaryError(payload.message as string);
                setSummaryLoading(false);
              }
            } catch { /* skip malformed */ }
          }
        }
      } catch (e) {
        setSummaryError((e as Error).message);
        setSummaryLoading(false);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFile, workspacePath, provider, model, summaryContent]);

    const handleRegenerateSummary = useCallback(() => {
      setSummaryContent('');
      setSummaryError(null);
      handleSwitchToSummary(true); // skip cache, force fresh generation
    }, [handleSwitchToSummary]);

    // Re-trigger generation after clearing content (for regenerate)
    useEffect(() => {
      if (editorView === 'summary' && !summaryContent && !summaryLoading && !summaryError) {
        handleSwitchToSummary();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [summaryContent, summaryLoading, editorView]);

    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--color-bg-editor)',
          minWidth: 0,
        }}
      >
        <EditorTabs
          openFiles={openFiles}
          activeFilePath={activeFilePath}
          onTabClick={onTabClick}
          onTabClose={onTabClose}
          onTabReorder={onTabReorder}
        />

        {/* ── Breadcrumb ── */}
        {activeFile && (() => {
          let segments: string[];
          if (activeFile.isUrl) {
            segments = [activeFile.url ?? activeFile.name];
          } else {
            const displayPath = workspacePath && activeFile.path.startsWith(workspacePath + '/')
              ? activeFile.path.slice(workspacePath.length + 1)
              : activeFile.path;
            segments = displayPath.split('/').filter(Boolean);
          }
          return (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              height: 24,
              flexShrink: 0,
              background: 'var(--color-bg-editor)',
              borderBottom: '1px solid var(--color-border)',
            }}>
              {/* Scrollable path segments */}
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px 0 12px',
                overflowX: 'auto',
                overflowY: 'hidden',
                scrollbarWidth: 'none',
                whiteSpace: 'nowrap',
                gap: 4,
                fontSize: 12,
                fontFamily: "'Cascadia Code', 'Fira Code', Menlo, monospace",
                minWidth: 0,
              }}>
                {segments.map((seg, i) => {
                  const isLast = i === segments.length - 1;
                  return (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {i > 0 && (
                        <span style={{ color: 'var(--color-text-secondary)', opacity: 0.4, userSelect: 'none' }}>›</span>
                      )}
                      <span style={{
                        color: isLast ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        fontWeight: isLast ? 500 : 400,
                      }}>
                        {seg}
                      </span>
                    </span>
                  );
                })}
              </div>
              {/* Back / forward navigation pills */}
              <div style={{ display: 'flex', gap: 3, paddingRight: 8, flexShrink: 0 }}>
                {([
                  { dir: 'back', label: '←', title: 'Go back', enabled: !!canGoBack, handler: onGoBack },
                  { dir: 'fwd',  label: '→', title: 'Go forward', enabled: !!canGoForward, handler: onGoForward },
                ] as const).map(({ dir, label, title, enabled, handler }) => (
                  <button
                    key={dir}
                    disabled={!enabled}
                    onClick={handler}
                    title={title}
                    style={{
                      background: enabled ? 'var(--color-accent, #0e639c)22' : 'none',
                      border: `1px solid ${enabled ? 'var(--color-accent, #0e639c)' : 'var(--color-border)'}`,
                      borderRadius: 10,
                      color: enabled ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      opacity: enabled ? 1 : 0.28,
                      cursor: enabled ? 'pointer' : 'default',
                      fontSize: 12,
                      fontWeight: enabled ? 700 : 400,
                      padding: '0 9px',
                      height: 17,
                      lineHeight: '15px',
                      userSelect: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>

          {/* ── Floating button group (bottom-right) ── */}
          {(showPreviewButton || showSummaryButton || showConflictsButton) && (
            <div style={{
              position: 'absolute', bottom: 20, right: 20, zIndex: 10,
              display: 'flex', gap: 6,
            }}>
              {/* Merge conflict resolver toggle */}
              {showConflictsButton && (
                <button
                  onClick={() => setEditorView(v => v === 'conflicts' ? 'source' : 'conflicts')}
                  title={editorView === 'conflicts' ? 'Back to source' : 'Resolve merge conflicts'}
                  style={{ ...btnStyle, background: editorView === 'conflicts' ? '#007acc' : '#6f4e37' }}
                >
                  {editorView === 'conflicts' ? '⌨ Source' : '⚠ Conflicts'}
                </button>
              )}

              {/* Preview toggle — only for .md / .html */}
              {showPreviewButton && editorView !== 'summary' && editorView !== 'conflicts' && (
                <button
                  onClick={() => { captureScrollPercentage(); setEditorView(v => v === 'preview' ? 'source' : 'preview'); }}
                  title={editorView === 'preview' ? 'Switch to source' : 'Switch to preview'}
                  style={{ ...btnStyle, background: editorView === 'preview' ? '#007acc' : '#3a3d41' }}
                >
                  {editorView === 'preview' ? '⌨ Source' : '👁 Preview'}
                </button>
              )}

              {/* AI Summary toggle */}
              {showSummaryButton && editorView !== 'conflicts' && (
                <button
                  onClick={() => editorView === 'summary'
                    ? setEditorView('source')
                    : handleSwitchToSummary()}
                  title={editorView === 'summary' ? 'Back to source' : hasCachedSummary ? 'View cached summary' : 'Generate AI summary'}
                  style={{ ...btnStyle, background: editorView === 'summary' ? '#007acc' : '#3a3d41' }}
                >
                  {editorView === 'summary' ? '⌨ Source' : hasCachedSummary ? '📖 View Summary' : '✨ Generate Summary'}
                </button>
              )}
            </div>
          )}

          {/* ── Content area ── */}
          {activeFile ? (
            activeFile.isImage ? (
              <ImageViewer path={activeFile.path} name={activeFile.name} />

            ) : activeFile.isPdf ? (
              <PdfViewer path={activeFile.path} name={activeFile.name} />

            ) : activeFile.isUrl ? (
              <iframe
                src={activeFile.url}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={activeFile.name}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              />

            ) : editorView === 'summary' ? (
              /* AI Summary view */
              <div
                ref={summaryRef}
                onScroll={e => {
                  trackActiveHeading(e.currentTarget);
                  const el = e.currentTarget;
                  const scrollable = el.scrollHeight - el.clientHeight;
                  const pct = scrollable > 0 ? el.scrollTop / scrollable : 0;
                  scrollPercentageRef.current = pct;
                  if (activeFile?.path) scrollByPathRef.current.set(activeFile.path, pct);
                }}
                className="md-preview"
                style={{
                  height: '100%', overflow: 'auto',
                  padding: '24px 32px',
                  color: 'var(--color-text-primary)',
                  fontSize: 14, lineHeight: 1.7,
                  boxSizing: 'border-box',
                }}
              >
                {/* Header row */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 16, gap: 8,
                }}>
                  <span style={{
                    fontSize: 11, color: 'var(--color-text-secondary)',
                    fontFamily: 'monospace',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {activeFile.isDirectory && <span style={{ fontSize: 13 }}>📁</span>}
                    {toRelPath(activeFile.path)}
                    {activeFile.isDirectory && <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'sans-serif', fontStyle: 'italic' }}> — directory summary</span>}
                  </span>
                  {!summaryLoading && (summaryContent || summaryError) && (
                    <button
                      onClick={handleRegenerateSummary}
                      title="Regenerate summary"
                      style={{
                        background: 'none', border: '1px solid var(--color-border)',
                        borderRadius: 4, color: 'var(--color-text-secondary)',
                        fontSize: 11, padding: '2px 8px', cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      ↺ Regenerate
                    </button>
                  )}
                </div>

                {/* Spinner */}
                {summaryLoading && !summaryContent && (
                  <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', fontSize: 13 }}>
                    Generating summary…
                  </div>
                )}

                {/* Error */}
                {summaryError && (
                  <div style={{
                    padding: '8px 12px', background: '#f487710a',
                    color: '#f48771', borderRadius: 4, fontSize: 12, marginBottom: 12,
                  }}>
                    {summaryError}
                  </div>
                )}

                {/* Streaming / cached markdown */}
                {summaryContent && (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code: inlineCodeComponent,
                      h1: ({ children, ...p }) => <h1 id={makeHeadingId(children)} {...p}>{children}</h1>,
                      h2: ({ children, ...p }) => <h2 id={makeHeadingId(children)} {...p}>{children}</h2>,
                      h3: ({ children, ...p }) => <h3 id={makeHeadingId(children)} {...p}>{children}</h3>,
                      h4: ({ children, ...p }) => <h4 id={makeHeadingId(children)} {...p}>{children}</h4>,
                      h5: ({ children, ...p }) => <h5 id={makeHeadingId(children)} {...p}>{children}</h5>,
                      h6: ({ children, ...p }) => <h6 id={makeHeadingId(children)} {...p}>{children}</h6>,
                    }}
                  >
                    {summaryContent}
                  </ReactMarkdown>
                )}
              </div>

            ) : editorView === 'preview' && isPreviewable(activeFile.path) ? (
              /* Markdown / HTML preview */
              activeFile.path.endsWith('.md') ? (
                <div
                  ref={previewRef}
                  onScroll={e => { captureScrollPercentage(); trackActiveHeading(e.currentTarget); }}
                  className="md-preview"
                  style={{
                    height: '100%', overflow: 'auto',
                    padding: '24px 32px',
                    color: 'var(--color-text-primary)',
                    fontSize: 14, lineHeight: 1.7,
                    boxSizing: 'border-box',
                  }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a({ href, children, ...props }) {
                        const target = href ?? '';
                        const isHash = target.startsWith('#');
                        const isExternal = /^(https?:|mailto:)/i.test(target);
                        const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
                          if (isExternal) {
                            event.preventDefault();
                            window.open(target, '_blank', 'noopener,noreferrer');
                            return;
                          }
                          if (isHash || !activeFile.path) return;
                          event.preventDefault();
                          const [pathPart, hash] = target.split('#', 2);
                          const absPath = resolveWorkspacePath(pathPart, activeFile.path);
                          const isWiki = editorView === 'preview' || editorView === 'summary';
                          if (isWiki) {
                            void wikiNavigate(absPath);
                          } else {
                            const targetFile = openFiles.find(f => f.path === absPath);
                            if (targetFile) onTabClick(targetFile.path);
                            else onOpenFile?.(absPath);
                          }
                          if (hash) {
                            window.setTimeout(() => {
                              const heading = document.getElementById(hash);
                              heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 0);
                          }
                        };
                        return <a href={href} onClick={handleClick} {...props}>{children}</a>;
                      },
                      code: inlineCodeComponent,
                      img({ src, alt, ...props }) {
                        const resolvedSrc = resolveImageSrc(src ?? '', activeFile.path);
                        return <img src={resolvedSrc} alt={alt ?? ''} {...props} style={{ maxWidth: '100%' }} />;
                      },
                      h1: ({ children, ...p }) => <h1 id={makeHeadingId(children)} {...p}>{children}</h1>,
                      h2: ({ children, ...p }) => <h2 id={makeHeadingId(children)} {...p}>{children}</h2>,
                      h3: ({ children, ...p }) => <h3 id={makeHeadingId(children)} {...p}>{children}</h3>,
                      h4: ({ children, ...p }) => <h4 id={makeHeadingId(children)} {...p}>{children}</h4>,
                      h5: ({ children, ...p }) => <h5 id={makeHeadingId(children)} {...p}>{children}</h5>,
                      h6: ({ children, ...p }) => <h6 id={makeHeadingId(children)} {...p}>{children}</h6>,
                    }}
                  >
                    {activeFile.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <iframe
                  srcDoc={activeFile.content}
                  sandbox="allow-scripts"
                  style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                  title="HTML preview"
                />
              )

            ) : editorView === 'conflicts' ? (
              /* Merge conflict resolver */
              <div style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'var(--color-bg-editor)' }}>
                <MergeConflictView
                  conflictContent={activeFile.content ?? ''}
                  filePath={activeFile.path}
                  language={activeFile.language ?? 'plaintext'}
                  theme={document.documentElement.dataset.theme === 'light' ? 'light' : 'vs-dark'}
                  onSaved={(resolved) => {
                    onContentChange(activeFile.path, resolved);
                    setEditorView('source');
                  }}
                  onClose={() => setEditorView('source')}
                />
              </div>

            ) : activeFile.isDirectory ? null : (
              /* Monaco source editor */
              <MonacoEditor
                key={activeFile.path}
                file={activeFile}
                onContentChange={onContentChange}
                diffData={diffData}
                onActivity={onActivity}
                onEditorMount={editor => {
                  monacoEditorRef.current = editor;
                  // Track Monaco scroll continuously so the position is saved
                  // to scrollByPathRef before this editor instance unmounts.
                  const filePath = activeFile.path;
                  editor.onDidScrollChange(() => {
                    const scrollable = editor.getScrollHeight() - editor.getLayoutInfo().height;
                    const pct = scrollable > 0 ? editor.getScrollTop() / scrollable : 0;
                    scrollPercentageRef.current = pct;
                    scrollByPathRef.current.set(filePath, pct);
                  });
                  // Apply any pending navigation for this file
                  const nav = pendingNavigationRef.current;
                  if (nav && nav.filePath === activeFile.path) {
                    pendingNavigationRef.current = null;
                    applyNavigation(editor, nav.line, nav.endLine, nav.startCol, nav.endCol);
                  }
                  restoreScrollPercentage('source');
                }}
                onAfterRevert={() => {
                  // Monaco's onChange fires synchronously from executeEdits, so
                  // content state updates in the same microtask batch. A short
                  // delay lets React flush before we read contentRef in refreshDiff.
                  setTimeout(refreshDiff, 50);
                }}
              />
            )
          ) : (
            <WelcomeScreen />
          )}
        </div>
      </div>
    );
  }
);
