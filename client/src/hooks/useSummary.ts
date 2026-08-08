import { useState, useEffect, useCallback, useRef } from 'react';
import type { OpenFile } from '../types';
import type { Provider } from '../providers';

type EditorView = 'source' | 'preview' | 'summary' | 'conflicts';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

interface UseSummaryOptions {
  activeFile: OpenFile | null;
  workspacePath: string | null;
  provider: Provider;
  model: string;
  editorView: EditorView;
  setEditorView: (view: EditorView) => void;
  summaryRequestPath?: string | null;
  onSummaryHandled?: () => void;
  onSummaryOpen?: () => void;
  onSummaryContentChange?: (content: string) => void;
}

export function useSummary({
  activeFile,
  workspacePath,
  provider,
  model,
  editorView,
  setEditorView,
  summaryRequestPath,
  onSummaryHandled,
  onSummaryOpen,
  onSummaryContentChange,
}: UseSummaryOptions) {
  const [summaryContent,        setSummaryContent]        = useState('');
  const [summaryLoading,        setSummaryLoading]        = useState(false);
  const [summaryError,          setSummaryError]          = useState<string | null>(null);
  const [hasCachedSummary,      setHasCachedSummary]      = useState(false);
  const [cachedSummaryObsolete, setCachedSummaryObsolete] = useState(false);
  const [summaryObsolete,       setSummaryObsolete]       = useState(false);

  // Keep callbacks in refs so handleSwitchToSummary deps stay stable.
  const onSummaryOpenRef    = useRef(onSummaryOpen);
  const onSummaryHandledRef = useRef(onSummaryHandled);
  onSummaryOpenRef.current    = onSummaryOpen;
  onSummaryHandledRef.current = onSummaryHandled;

  /** Convert an absolute path to a workspace-relative path. */
  const toRelPath = (abs: string) => {
    if (!workspacePath) return abs;
    for (const sep of ['/', '\\']) {
      if (abs.startsWith(workspacePath + sep)) return abs.slice(workspacePath.length + 1);
    }
    return abs;
  };

  // Reset all state when the active file changes.
  useEffect(() => {
    setSummaryContent('');
    setSummaryError(null);
    setSummaryLoading(false);
    setHasCachedSummary(false);
    setCachedSummaryObsolete(false);
    setSummaryObsolete(false);
  }, [activeFile?.path]);

  // Probe the cache so the button label ("View Summary" vs "Generate") is accurate
  // before the user opens the summary view. PDFs and images are excluded.
  useEffect(() => {
    if (!activeFile || activeFile.isImage || activeFile.isPdf) return;
    if (!workspacePath && !activeFile.isExternal) return;

    const isExternal = !!activeFile.isExternal;
    const lastSep = Math.max(activeFile.path.lastIndexOf('/'), activeFile.path.lastIndexOf('\\'));
    const wsParam = isExternal
      ? `&workspacePath=${encodeURIComponent(activeFile.path.substring(0, lastSep))}`
      : '';
    const relPath = isExternal
      ? activeFile.path.substring(lastSep + 1)
      : toRelPath(activeFile.path);

    const url = activeFile.isDirectory
      ? `${API_BASE}/api/ai-directory-summary?path=${encodeURIComponent(relPath)}${wsParam}`
      : `${API_BASE}/api/ai-summary?path=${encodeURIComponent(relPath)}${wsParam}`;

    fetch(url)
      .then(r => r.json())
      .then((data: { content: string | null; obsolete?: boolean }) => {
        setHasCachedSummary(!!data.content);
        setCachedSummaryObsolete(!!data.content && data.obsolete === true);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile?.path, workspacePath]);

  // Honor an external request to show the summary view (e.g. from wiki-link navigation).
  useEffect(() => {
    if (!summaryRequestPath || !activeFile) return;
    if (activeFile.path !== summaryRequestPath) return;
    setEditorView('summary');
    onSummaryHandledRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryRequestPath, activeFile?.path]);

  // Notify the parent (outline panel) whenever summary text changes.
  useEffect(() => {
    onSummaryContentChange?.(summaryContent);
  }, [summaryContent, onSummaryContentChange]);

  const handleSwitchToSummary = useCallback(async (skipCache = false) => {
    if (!activeFile || (!workspacePath && !activeFile.isExternal)) return;
    setEditorView('summary');
    onSummaryOpenRef.current?.();

    // Already have content for this session — just show it.
    if (summaryContent && !skipCache) return;

    setSummaryLoading(true);
    setSummaryError(null);

    const isExternal = !!activeFile.isExternal;
    const lastSep = Math.max(activeFile.path.lastIndexOf('/'), activeFile.path.lastIndexOf('\\'));
    const externalWs = isExternal ? activeFile.path.substring(0, lastSep) : null;
    const relPath = isExternal
      ? activeFile.path.substring(lastSep + 1)
      : toRelPath(activeFile.path);
    const isDir = !!activeFile.isDirectory;

    // 1. Check cache (skipped when regenerating).
    if (!skipCache) {
      try {
        const wsParam = isExternal ? `&workspacePath=${encodeURIComponent(externalWs!)}` : '';
        const cacheUrl = isDir
          ? `${API_BASE}/api/ai-directory-summary?path=${encodeURIComponent(relPath)}${wsParam}`
          : `${API_BASE}/api/ai-summary?path=${encodeURIComponent(relPath)}${wsParam}`;
        const resp = await fetch(cacheUrl);
        const data = await resp.json() as { content: string | null; obsolete?: boolean };
        if (data.content) {
          setSummaryContent(data.content);
          setSummaryObsolete(data.obsolete === true);
          setSummaryLoading(false);
          return;
        }
      } catch { /* fall through to generation */ }
    }

    // 2. Stream from LLM via SSE.
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
            else if (line.startsWith('data: '))  dataStr   = line.slice(6).trim();
          }
          if (!dataStr) continue;
          try {
            const payload = JSON.parse(dataStr) as Record<string, unknown>;
            if (eventName === 'text_delta') {
              setSummaryContent(c => c + (payload.text as string));
            } else if (eventName === 'done') {
              setSummaryLoading(false);
              setHasCachedSummary(true);
              setCachedSummaryObsolete(false);
              setSummaryObsolete(false);
            } else if (eventName === 'error') {
              setSummaryError(payload.message as string);
              setSummaryLoading(false);
            }
          } catch { /* skip malformed event */ }
        }
      }
    } catch (e) {
      setSummaryError((e as Error).message);
      setSummaryLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, workspacePath, provider, model, summaryContent]);

  // Auto-trigger generation when the view is summary but content is absent.
  // Covers: initial open, returning to a file after switching tabs, and regenerate.
  useEffect(() => {
    if (editorView === 'summary' && !summaryContent && !summaryLoading && !summaryError) {
      void handleSwitchToSummary();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryContent, summaryLoading, editorView]);

  const handleRegenerateSummary = useCallback(() => {
    setSummaryContent('');
    setSummaryError(null);
    handleSwitchToSummary(true);
  }, [handleSwitchToSummary]);

  return {
    summaryContent,
    summaryLoading,
    summaryError,
    hasCachedSummary,
    cachedSummaryObsolete,
    summaryObsolete,
    handleSwitchToSummary,
    handleRegenerateSummary,
  };
}
