import { useRef, useState, useCallback } from 'react';
import { buildLiveMeetingPrompt } from '../prompts/prompt';
import {
  handleGeminiMessage as reduceGeminiMessage,
  speakingAfterAgentEnds,
  formatReadFileOutput,
  formatSearchFilesOutput,
  searchFilePaths,
  pickDiffJump,
  formatDiffJumpOutput,
  formatOpenTabs,
  type DiffJump,
  type EditorTabs,
} from './geminiMessage';
import { fetchFileContent, fetchFileWithPath, fetchFileTree, fetchFileDiff } from '../api/files';

// WebSocket connections bypass the Vite proxy and hit the backend directly.
const WS_BASE = import.meta.env.DEV
  ? 'ws://localhost:3001'
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

const BUFFER_SIZE = 4096;
const GEMINI_INPUT_RATE = 16000;
/** Gemini outputs 24 kHz PCM16. */
const OUTPUT_RATE = 24000;

// ── PCM conversion helpers ──────────────────────────────────────────────────

/** Convert Float32 PCM samples (–1…1) to base64-encoded Int16 PCM. */
function float32ToBase64Pcm16(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Decode base64-encoded Int16 PCM to Float32 samples (–1…1). */
function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

/** Linear-interpolation resample from sourceRate to targetRate. */
function resample(buffer: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate) return buffer;
  const ratio = sourceRate / targetRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, buffer.length - 1);
    const frac = srcIdx - lo;
    result[i] = buffer[lo] * (1 - frac) + buffer[hi] * frac;
  }
  return result;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export interface UseLiveMeetingReturn {
  /** Start a live meeting (Google provider only). Optionally pass prior conversation context. */
  start: (context?: string) => Promise<void>;
  /** Stop the active meeting and clean up all resources. */
  stop: () => void;
  /** Toggle microphone mute on/off. */
  toggleMute: () => void;
  isActive: boolean;
  isMuted: boolean;
  speaking: 'user' | 'agent' | 'idle';
  /** Live AnalyserNode on the Gemini output path — drives the waveform visualisation. */
  analyserNode: AnalyserNode | null;
  /** Live AnalyserNode on the mic input path — drives the bottom glow bar. */
  micAnalyserNode: AnalyserNode | null;
  error: string | null;
}

export function useLiveMeeting(
  provider: string,
  onTranscriptReady?: (transcript: string) => void,
  navigateToFile?: (path: string, line?: number) => void,
  getEditorTabs?: () => EditorTabs,
): UseLiveMeetingReturn {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [speaking, setSpeaking] = useState<'user' | 'agent' | 'idle'>('idle');
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [micAnalyserNode, setMicAnalyserNode] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup — all torn down in stop()
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Mute ref mirrors React state so the ScriptProcessor callback can read it
  // without re-registering on every state change.
  const isMutedRef = useRef(false);

  // Set to true once Gemini confirms the session is ready for audio.
  const readyRef = useRef(false);

  // Prior conversation context passed to start() — injected as systemInstruction on relay-ready.
  const contextRef = useRef<string | undefined>(undefined);

  // ── Transcript accumulation ───────────────────────────────────────────────
  const transcriptRef    = useRef<{ role: 'user' | 'agent'; text: string }[]>([]);
  const userTurnBufRef   = useRef('');
  const agentTurnBufRef  = useRef('');
  const onTranscriptRef  = useRef(onTranscriptReady);
  onTranscriptRef.current = onTranscriptReady;

  // Current provider — updated on every render so start() always reads the latest.
  const providerRef = useRef(provider);
  providerRef.current = provider;

  // Stable ref for the navigate callback so the message handler doesn't need to re-register.
  const navigateToFileRef = useRef(navigateToFile);
  navigateToFileRef.current = navigateToFile;
  const getEditorTabsRef = useRef(getEditorTabs);
  getEditorTabsRef.current = getEditorTabs;

  // ── Agent audio playback queue ──────────────────────────────────────────

  const playQueueRef      = useRef<Float32Array[]>([]);
  const isPlayingRef      = useRef(false);
  // The chunk currently playing, so a barge-in can cut it off mid-chunk.
  const currentSrcRef     = useRef<AudioBufferSourceNode | null>(null);
  // Analyser tapped on the Gemini playback path — drives the waveform visualisation.
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);

  const enqueueAndPlay = useCallback((samples: Float32Array) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    playQueueRef.current.push(samples);
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;

    const playNext = () => {
      const chunk = playQueueRef.current.shift();
      if (!chunk || !audioCtxRef.current) {
        isPlayingRef.current = false;
        currentSrcRef.current = null;
        return;
      }
      const c = audioCtxRef.current;
      const buf = c.createBuffer(1, chunk.length, c.sampleRate);
      buf.copyToChannel(chunk as Float32Array<ArrayBuffer>, 0);
      const src = c.createBufferSource();
      src.buffer = buf;
      // Route through output analyser so the waveform reflects Gemini's voice.
      const outAnalyser = outputAnalyserRef.current;
      if (outAnalyser) {
        src.connect(outAnalyser);
      } else {
        src.connect(c.destination);
      }
      src.onended = () => {
        // A stopped source still fires onended — ignore it if we've moved on.
        if (currentSrcRef.current !== src) return;
        playNext();
      };
      currentSrcRef.current = src;
      src.start();
    };
    playNext();
  }, []);

  /** Barge-in: cut off the current chunk and drop everything still queued. */
  const stopPlayback = useCallback(() => {
    playQueueRef.current = [];
    const src = currentSrcRef.current;
    currentSrcRef.current = null;
    isPlayingRef.current = false;
    if (src) {
      try { src.stop(); } catch { /* already stopped */ }
    }
  }, []);

  // ── Stop / cleanup ────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* already gone */ }
      wsRef.current = null;
    }
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch { /* ignore */ }
      processorRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* ignore */ }
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    // Fire transcript callback before clearing state.
    // Pass just the formatted lines — the caller adds the header and/or summary.
    const lines = transcriptRef.current;
    if (lines.length > 0) {
      const formatted = lines
        .map(e => `**${e.role === 'user' ? 'You' : 'Assistant'}:** ${e.text.trim()}`)
        .join('\n\n');
      onTranscriptRef.current?.(formatted);
    }
    transcriptRef.current   = [];
    userTurnBufRef.current  = '';
    agentTurnBufRef.current = '';

    playQueueRef.current = [];
    isPlayingRef.current = false;
    readyRef.current = false;
    contextRef.current = undefined;
    outputAnalyserRef.current = null;
    setIsActive(false);
    setIsMuted(false);
    isMutedRef.current = false;
    setSpeaking('idle');
    setAnalyserNode(null);
    setMicAnalyserNode(null);
  }, []);

  // ── Start ─────────────────────────────────────────────────────────────────

  const start = useCallback(async (context?: string) => {
    // Prevent double-start
    if (wsRef.current) return;
    setError(null);
    contextRef.current = context;

    try {
      // 1. Exchange server-side API key for session credentials
      const res = await fetch('/api/meeting/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((body as { error?: string }).error ?? 'Failed to create meeting session');
      }

      // 2. Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 3. AudioContext at output rate (24 kHz) — input is resampled before sending
      const audioCtx = new AudioContext({ sampleRate: OUTPUT_RATE });
      audioCtxRef.current = audioCtx;
      const actualRate = audioCtx.sampleRate;

      // 4. Audio graph
      //    Gemini playback: bufferSource ──► outputAnalyser ──► destination
      //    Mic capture:     source ──► micAnalyser (read-only tap)
      //                     source ──► scriptProcessor (PCM; output silenced)
      const outputAnalyser = audioCtx.createAnalyser();
      outputAnalyser.fftSize = 2048; // time-domain buffer for smooth waveform
      outputAnalyser.connect(audioCtx.destination);
      outputAnalyserRef.current = outputAnalyser;
      setAnalyserNode(outputAnalyser);

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Mic analyser: read-only tap for the bottom glow bar (no destination connection needed).
      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 512;
      source.connect(micAnalyser);
      setMicAnalyserNode(micAnalyser);

      const processor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      // ScriptProcessor must be connected to destination for onaudioprocess to fire.
      // We silence the output buffer in the callback to prevent mic feedback.
      processor.connect(audioCtx.destination);

      // 5. Open WebSocket relay to Gemini Live
      const ws = new WebSocket(`${WS_BASE}/meeting/relay`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const raw = typeof event.data === 'string'
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer);
          const msg = JSON.parse(raw);
          handleGeminiMessage(msg, ws);
        } catch { /* ignore malformed frames */ }
      };

      ws.onerror = () => {
        setError('Meeting connection error');
        stop();
      };

      ws.onclose = () => {
        // Only auto-stop if WE didn't initiate the close (stop() nulls wsRef first)
        if (wsRef.current === ws) stop();
      };

      // 6. Stream mic audio to Gemini
      processor.onaudioprocess = (e) => {
        // Silence output to prevent speaker feedback
        e.outputBuffer.getChannelData(0).fill(0);

        if (isMutedRef.current || !readyRef.current) return;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const rawSamples = e.inputBuffer.getChannelData(0);
        const samples = actualRate !== GEMINI_INPUT_RATE
          ? resample(rawSamples, actualRate, GEMINI_INPUT_RATE)
          : rawSamples;
        const b64 = float32ToBase64Pcm16(samples);

        ws.send(JSON.stringify({
          realtimeInput: {
            audio: { mimeType: `audio/pcm;rate=${GEMINI_INPUT_RATE}`, data: b64 },
          },
        }));
      };

      setIsActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      stop();
    }
  }, [stop, enqueueAndPlay]);

  // ── Gemini message handler ─────────────────────────────────────────────────

  // Decision logic lives in ./geminiMessage (pure + unit-tested); this just executes the actions.
  function handleGeminiMessage(msg: Record<string, unknown>, ws: WebSocket) {
    const { buffers, actions } = reduceGeminiMessage(
      msg,
      { userBuf: userTurnBufRef.current, agentBuf: agentTurnBufRef.current },
      {
        ctx: contextRef.current,
        buildPrompt: buildLiveMeetingPrompt,
        // Only needed for the setup message; read from the workbench at that moment.
        tabs: msg.type === 'relay-ready' && getEditorTabsRef.current
          ? formatOpenTabs(getEditorTabsRef.current())
          : undefined,
      },
    );
    userTurnBufRef.current = buffers.userBuf;
    agentTurnBufRef.current = buffers.agentBuf;

    for (const action of actions) {
      switch (action.type) {
        case 'send':             ws.send(JSON.stringify(action.payload)); break;
        case 'setError':         setError(action.message); break;
        case 'stop':             stop(); break;
        case 'markReady':        readyRef.current = true; break;
        case 'setSpeakingAgent': setSpeaking('agent'); break;
        case 'playAudio':        enqueueAndPlay(base64Pcm16ToFloat32(action.base64)); break;
        case 'pushTranscript':   transcriptRef.current.push(action.entry); break;
        case 'endAgentSpeaking': setSpeaking(speakingAfterAgentEnds); break;
        case 'stopPlayback':     stopPlayback(); setSpeaking('user'); break;
        case 'runTool': {
          // Execute tool calls asynchronously then send results back over the same WS.
          const { calls } = action;
          void (async () => {
            const responses: {
              id: string;
              name: string;
              response: { output: string } | { error: string };
            }[] = [];
            for (const call of calls) {
              try {
                let output: string;
                if (call.name === 'search_files') {
                  const query = call.args.query;
                  if (typeof query !== 'string' || !query.trim()) {
                    throw new Error('Missing required "query" argument.');
                  }
                  const tree = await fetchFileTree();
                  output = formatSearchFilesOutput(query, searchFilePaths(tree, query));
                  responses.push({ id: call.id, name: call.name, response: { output } });
                  continue;
                }
                const path = call.args.path;
                if (typeof path !== 'string' || !path.trim()) {
                  throw new Error('Missing required "path" argument.');
                }
                if (call.name === 'read_file') {
                  const content = await fetchFileContent(path);
                  output = formatReadFileOutput(content, call.args.start_line, call.args.end_line);
                } else if (call.name === 'open_file') {
                  const navigate = navigateToFileRef.current;
                  if (!navigate) throw new Error('Editor navigation is not available in this session.');
                  // Fail hard if the file can't be loaded — never report a fake success.
                  // Use the server-resolved absolute path so the editor and fetch agree.
                  const { path: absPath, content } = await fetchFileWithPath(path);
                  const line = typeof call.args.line === 'number' ? call.args.line : undefined;
                  let jump: DiffJump | undefined;
                  if (line === undefined) {
                    // No explicit line: jump to the main uncommitted change, skipping imports.
                    // A diff failure (untracked file, not a git repo) must not fail the open.
                    try {
                      jump = pickDiffJump((await fetchFileDiff(absPath)).hunks, content);
                    } catch { /* open at top */ }
                  }
                  navigate(absPath, line ?? jump?.line);
                  output = jump
                    ? formatDiffJumpOutput(jump)
                    : `Opened${line ? ` at line ${line}` : ''}.`;
                } else {
                  throw new Error(`Unknown tool: ${call.name}`);
                }
                responses.push({ id: call.id, name: call.name, response: { output } });
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                responses.push({
                  id: call.id,
                  name: call.name,
                  response: { error: `FAILED: ${message} Do not retry; tell the user it failed.` },
                });
              }
            }
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                toolResponse: {
                  functionResponses: responses,
                },
              }));
            }
          })();
          break;
        }
      }
    }
  }

  // ── Mute toggle ───────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    setIsMuted(m => {
      isMutedRef.current = !m;
      return !m;
    });
  }, []);

  return { start, stop, toggleMute, isActive, isMuted, speaking, analyserNode, micAnalyserNode, error };
}
