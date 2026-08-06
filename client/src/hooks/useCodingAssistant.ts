import { useState, useRef, useCallback, useEffect } from 'react';
import { UIMessage, UIBlock, HistoryMessage } from '../types';
import type { Provider } from '../providers';
import { fetchOverallDiff } from '../api/files';

function uid() {
  return Math.random().toString(36).slice(2);
}

// Go directly to the Express server for SSE requests rather than through the Vite proxy.
// Vite's dev proxy (http-proxy) closes its connection to the backend shortly after
// forwarding the first SSE chunk — the browser's stream stays open on Vite's side but
// the Express res.on('close') fires, so the agent loop aborts before calling the API.
// Express already has CORS configured for localhost:5173, so cross-origin works fine.
// Non-streaming endpoints (/api/files/*, /api/agent/status) still go through the proxy.
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export function useCodingAssistant(
  provider: Provider,
  model: string,
  onNavigateToLine?: (filePath: string, line: number, endLine?: number, startCol?: number, endCol?: number) => void,
  onWatchTrigger?: () => void,
  onAssistantReply?: (text: string, hadToolUse: boolean) => void,
) {
  const [uiMessages, setUiMessages] = useState<UIMessage[]>([]);
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isWatching, setIsWatching] = useState(false);

  // Keep a ref to the latest callback so sendMessage's useCallback closure
  // never goes stale (onNavigateToLine is not in the dependency array).
  const onNavigateToLineRef = useRef(onNavigateToLine);
  onNavigateToLineRef.current = onNavigateToLine;

  const onWatchTriggerRef = useRef(onWatchTrigger);
  onWatchTriggerRef.current = onWatchTrigger;

  const onAssistantReplyRef = useRef(onAssistantReply);
  onAssistantReplyRef.current = onAssistantReply;

  // Tracks whether any tool was called in the current turn; reset at start of sendMessage.
  const toolUsedInTurnRef = useRef(false);

  // Refs that accumulate text/thought tokens between animation frames.
  // Prevents per-token re-renders when providers like OpenAI stream very fast.
  const textBufRef = useRef('');
  const thoughtBufRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const watchControllerRef = useRef<AbortController | null>(null);

  // Accumulates all text_delta text for the current send (reset at start of sendMessage).
  // Used to capture final text synchronously in the done handler without reading React state.
  const streamingTextRef = useRef('');

  // Holds a context collector installed by the proactive help system.
  // Awaited and prepended (API-side only, not in the UI) on the next user reply.
  const pendingProactiveContextRef = useRef<(() => Promise<string>) | null>(null);

  const injectProactiveMessage = useCallback((message: string, collectContext: () => Promise<string>) => {
    const proactiveMsg: UIMessage = {
      id: uid(),
      role: 'assistant',
      blocks: [{ type: 'text', content: message }],
      isStreaming: false,
    };
    setUiMessages(prev => [...prev, proactiveMsg]);
    pendingProactiveContextRef.current = collectContext;
  }, []);

  const sendApproval = useCallback(async (id: string, approved: boolean) => {
    // Update block status immediately so buttons disappear
    setUiMessages(prev => prev.map(msg => {
      if (msg.role !== 'assistant') return msg;
      return {
        ...msg,
        blocks: msg.blocks.map(b =>
          b.type === 'command-approval' && b.id === id
            ? { ...b, status: (approved ? 'approved' : 'rejected') as 'approved' | 'rejected' }
            : b
        ),
      };
    }));
    try {
      await fetch(`${API_BASE}/api/agent/terminal/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approved }),
      });
    } catch {
      // timeout on server will reject automatically
    }
  }, []);

  const stopExecution = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => () => {
    abortControllerRef.current?.abort();
    watchControllerRef.current?.abort();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Progress Watch ────────────────────────────────────────────────────────────

  // Stream the AI progress-check response as a new assistant message.
  const runProgressCheck = useCallback(async (
    previousReply: string,
    diffs: string[],
    watchController: AbortController,
  ) => {
    const assistantId = uid();
    const assistantMsg: UIMessage = { id: assistantId, role: 'assistant', blocks: [], isStreaming: true };

    setUiMessages(prev => [...prev, assistantMsg]);
    setIsLoading(true);
    onWatchTriggerRef.current?.(); // bell + pulse

    const updateWatchMsg = (updater: (msg: UIMessage & { role: 'assistant' }) => UIMessage) => {
      setUiMessages(prev => prev.map(m =>
        m.id === assistantId && m.role === 'assistant'
          ? updater(m as UIMessage & { role: 'assistant' })
          : m
      ));
    };

    let watchText = '';

    try {
      const response = await fetch(`${API_BASE}/api/proactive/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previousReply, diffSnapshots: diffs, model, provider: provider.id }),
        signal: watchController.signal,
      });

      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const chunks = buf.split('\n\n');
        buf = chunks.pop() ?? '';

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;
          const lines = chunk.split('\n');
          let eventName = '';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
          }
          if (!eventName || !dataStr) continue;

          let payload: Record<string, unknown>;
          try { payload = JSON.parse(dataStr); } catch { continue; }

          if (eventName === 'text_delta') {
            const text = payload.text as string;
            watchText += text;
            updateWatchMsg(msg => {
              const blocks = [...msg.blocks];
              const last = blocks[blocks.length - 1];
              if (last?.type === 'text') {
                blocks[blocks.length - 1] = { ...last, content: last.content + text } as UIBlock;
              } else {
                blocks.push({ type: 'text', content: text } as UIBlock);
              }
              return { ...msg, blocks };
            });
          } else if (eventName === 'done') {
            updateWatchMsg(msg => {
              setHistory(h => [...h, { role: 'assistant', content: watchText }]);
              return { ...msg, isStreaming: false };
            });
          } else if (eventName === 'error') {
            updateWatchMsg(msg => ({
              ...msg,
              isStreaming: false,
              blocks: [...msg.blocks, { type: 'text', content: `Error: ${payload.message as string}` }],
            }));
          }
        }
      }
    } catch {
      // Aborted or network error — remove the placeholder if empty, else mark done.
      setUiMessages(prev => {
        const msg = prev.find(m => m.id === assistantId && m.role === 'assistant') as (UIMessage & { role: 'assistant' }) | undefined;
        if (!msg) return prev;
        const hasContent = msg.blocks.some(b => 'content' in b && typeof (b as { content?: string }).content === 'string' && (b as { content: string }).content.trim().length > 0);
        if (!hasContent) return prev.filter(m => m.id !== assistantId);
        return prev.map(m => m.id === assistantId ? { ...m, isStreaming: false } : m);
      });
    } finally {
      setIsLoading(false);
    }
  }, [model, provider]);

  // Stored in a ref so startProgressWatch (stable deps) always calls the latest version.
  const runProgressCheckRef = useRef(runProgressCheck);
  runProgressCheckRef.current = runProgressCheck;

  // Capture three git diff snapshots at 5, 15, and 30 seconds, then fire the progress check.
  const startProgressWatch = useCallback(async (previousReply: string) => {
    watchControllerRef.current?.abort();
    const controller = new AbortController();
    watchControllerRef.current = controller;
    setIsWatching(true);

    const diffs: string[] = [];
    // Snapshots are taken at 5s, 15s, and 30s after the AI reply.
    // Intervals between captures: 5s → 10s → 15s.
    const INTERVALS = [5_000, 10_000, 15_000];

    try {
      for (const delay of INTERVALS) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, delay);
          const onAbort = () => { clearTimeout(t); reject(new DOMException('watch aborted', 'AbortError')); };
          controller.signal.addEventListener('abort', onAbort, { once: true });
        });
        if (controller.signal.aborted) return;
        try {
          const { diff } = await fetchOverallDiff();
          diffs.push(diff);
        } catch {
          diffs.push('');
        }
      }

      if (controller.signal.aborted) return;

      // Only fire if the user actually made changes
      const hasDiff = diffs.some(d => d.trim().length > 0);
      if (!hasDiff) return;

      await runProgressCheckRef.current(previousReply, diffs, controller);
    } catch {
      // Silently stop on abort or unexpected error
    } finally {
      if (watchControllerRef.current === controller) watchControllerRef.current = null;
      setIsWatching(false);
    }
  }, []); // stable — only reads from refs and setState

  // Stored in a ref so the done handler inside sendMessage can call the latest version.
  const startProgressWatchRef = useRef(startProgressWatch);
  startProgressWatchRef.current = startProgressWatch;

  // Holds the last AI reply text when the watch is armed but waiting for editor activity.
  const armedReplyRef = useRef<string | null>(null);

  // Called when the user types in the editor. If a reply is armed, starts the watch window.
  const notifyEditorActivity = useCallback(() => {
    const reply = armedReplyRef.current;
    if (!reply) return;
    armedReplyRef.current = null;
    void startProgressWatchRef.current(reply);
  }, []); // stable — only reads refs

  // ── sendMessage ───────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string, activeFilePath?: string | null, editorContext?: string | null, contextPaths?: string[], tutorMode?: boolean) => {
    if (!text.trim() || isLoading) return;

    // Cancel any in-progress watch and clear any armed reply before starting a new message.
    armedReplyRef.current = null;
    watchControllerRef.current?.abort();
    setIsWatching(false);
    streamingTextRef.current = '';
    toolUsedInTurnRef.current = false;

    const userMsg: UIMessage = { id: uid(), role: 'user', content: text };
    const assistantId = uid();
    const assistantMsg: UIMessage = { id: assistantId, role: 'assistant', blocks: [], isStreaming: true };

    // Collect proactive context if a signal fired before this message.
    // Injected into the API content only — the UI shows only the user's typed text.
    const collectProactive = pendingProactiveContextRef.current;
    pendingProactiveContextRef.current = null;
    let proactiveContext = '';
    if (collectProactive) {
      try { proactiveContext = await collectProactive(); } catch { /* ignore — context is best-effort */ }
    }

    let apiContent = text;
    if (proactiveContext) {
      apiContent = `**Context at the time of the assistant's proactive message (for reference only — respond conversationally, do not call any tools):**\n${proactiveContext}\n\n---\n${text}`;
    }
    if (contextPaths && contextPaths.length > 0) {
      apiContent += `\n\n---\n**Relevant paths hint** (check these paths first when looking for relevant code):\n${contextPaths.map(p => `- \`${p}\``).join('\n')}`;
    }
    if (editorContext) {
      apiContent += `\n\n---\n**User Visual Context** (currently visible in editor):\n\`\`\`\n${editorContext}\n\`\`\``;
    }
    const newHistory: HistoryMessage[] = [...history, { role: 'user', content: apiContent }];
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setUiMessages(prev => [...prev, userMsg, assistantMsg]);
    setHistory(newHistory);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory, model, provider: provider.id, activeFile: activeFilePath ?? null, tutorMode: tutorMode ?? false }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const updateAssistant = (updater: (msg: UIMessage & { role: 'assistant' }) => UIMessage) => {
        setUiMessages(prev => prev.map(m =>
          m.id === assistantId && m.role === 'assistant'
            ? updater(m as UIMessage & { role: 'assistant' })
            : m
        ));
      };

      // Drain both text/thought buffers into state in one React update.
      // Called either by RAF (at most once per frame) or synchronously before
      // structural events (tool_call, done, etc.) to preserve block ordering.
      const flushBufs = () => {
        rafRef.current = null;
        const txt = textBufRef.current;
        const tht = thoughtBufRef.current;
        textBufRef.current = '';
        thoughtBufRef.current = '';
        if (!txt && !tht) return;
        updateAssistant(msg => {
          const blocks = [...msg.blocks];
          // thoughts always precede answer text, so flush thought first
          for (const [buf, blockType] of [[tht, 'thought'], [txt, 'text']] as [string, 'thought' | 'text'][]) {
            if (!buf) continue;
            const last = blocks[blocks.length - 1];
            if (last?.type === blockType) {
              blocks[blocks.length - 1] = { ...last, content: last.content + buf } as UIBlock;
            } else {
              blocks.push({ type: blockType, content: buf } as UIBlock);
            }
          }
          return { ...msg, blocks };
        });
      };

      // Cancel any pending RAF and flush synchronously — call before every
      // non-text event so that block ordering in the UI stays correct.
      const flushNow = () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        flushBufs();
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;

          const lines = chunk.split('\n');
          let eventName = '';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
          }

          if (!eventName || !dataStr) continue;

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (eventName === 'open_file') {
            const filePath = payload.path as string;
            const line = payload.line as number;
            const endLine = payload.endLine as number | undefined;
            const startCol = payload.startCol as number | undefined;
            const endCol = payload.endCol as number | undefined;
            if (filePath) {
              onNavigateToLineRef.current?.(filePath, line, endLine, startCol, endCol);
            }
          } else if (eventName === 'text_delta') {
            const text = payload.text as string;
            // Buffer for animation-frame batching
            textBufRef.current += text;
            // Also accumulate in streamingTextRef so done handler can capture full text
            streamingTextRef.current += text;
            if (rafRef.current === null) rafRef.current = requestAnimationFrame(flushBufs);
          } else if (eventName === 'thought_delta') {
            thoughtBufRef.current += payload.text as string;
            if (rafRef.current === null) rafRef.current = requestAnimationFrame(flushBufs);
          } else if (eventName === 'tool_call') {
            flushNow();
            toolUsedInTurnRef.current = true;
            const toolBlock: UIBlock = {
              type: 'tool',
              id: payload.id as string,
              name: payload.name as string,
              input: payload.input as Record<string, unknown>,
              pending: true,
            };
            updateAssistant(msg => ({ ...msg, blocks: [...msg.blocks, toolBlock] }));
          } else if (eventName === 'command_approval') {
            flushNow();
            const approvalBlock: UIBlock = {
              type: 'command-approval',
              id: payload.id as string,
              command: payload.command as string,
              reason: payload.reason as string,
              cwd: payload.cwd as string | null,
              longRunning: payload.longRunning as boolean,
              status: 'pending',
              output: '',
            };
            updateAssistant(msg => ({ ...msg, blocks: [...msg.blocks, approvalBlock] }));
          } else if (eventName === 'command_output') {
            const { id, data } = payload as { id: string; stream: string; data: string };
            updateAssistant(msg => ({
              ...msg,
              blocks: msg.blocks.map(b =>
                b.type === 'command-approval' && b.id === id
                  ? { ...b, output: b.output + data }
                  : b
              ),
            }));
          } else if (eventName === 'tool_result') {
            flushNow();
            const toolUseId = payload.tool_use_id as string;
            updateAssistant(msg => ({
              ...msg,
              blocks: msg.blocks.map(b =>
                b.type === 'tool' && b.id === toolUseId
                  ? { ...b, result: payload.preview as string, error: payload.error as boolean, pending: false }
                  : b
              ),
            }));
          } else if (eventName === 'done') {
            flushNow();
            const capturedText = streamingTextRef.current;
            updateAssistant(msg => {
              setHistory(h => [...h, { role: 'assistant', content: capturedText }]);
              return { ...msg, isStreaming: false };
            });
            // Notify expansion hook so it can grow/shrink the right panel.
            onAssistantReplyRef.current?.(capturedText, toolUsedInTurnRef.current);
            // Start 30-second progress watch if the reply had content
            // Arm the watch — it will start when the user next types in the editor.
            if (capturedText.trim()) {
              armedReplyRef.current = capturedText;
            }
          } else if (eventName === 'error') {
            flushNow();
            const errText = payload.message as string;
            updateAssistant(msg => ({
              ...msg,
              isStreaming: false,
              blocks: [...msg.blocks, { type: 'text', content: `Error: ${errText}` }],
            }));
          }
        }
      }
    } catch (err) {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      const bufferedText = textBufRef.current;
      const bufferedThought = thoughtBufRef.current;
      textBufRef.current = '';
      thoughtBufRef.current = '';
      const stopped = controller.signal.aborted;
      const errText = err instanceof Error ? err.message : 'Unknown error';
      setUiMessages(prev => prev.map(m => {
        if (m.id !== assistantId || m.role !== 'assistant') return m;
        const blocks = [...m.blocks];
        for (const [content, type] of [[bufferedThought, 'thought'], [bufferedText, 'text']] as [string, 'thought' | 'text'][]) {
          if (!content) continue;
          const last = blocks[blocks.length - 1];
          if (last?.type === type) blocks[blocks.length - 1] = { ...last, content: last.content + content } as UIBlock;
          else blocks.push({ type, content } as UIBlock);
        }
        if (stopped) {
          blocks.push({ type: 'text', content: '_Execution stopped._' });
        } else {
          blocks.push({ type: 'text', content: `Error: ${errText}` });
        }
        return { ...m, isStreaming: false, blocks };
      }));
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, [history, isLoading, model, provider]);

  const clearMessages = useCallback(() => {
    armedReplyRef.current = null;
    abortControllerRef.current?.abort();
    watchControllerRef.current?.abort();
    setIsWatching(false);
    setUiMessages([]);
    setHistory([]);
  }, []);

  return { uiMessages, isLoading, isWatching, sendMessage, stopExecution, clearMessages, sendApproval, injectProactiveMessage, notifyEditorActivity };
}
