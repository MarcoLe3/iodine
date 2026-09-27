// Pure message-handling logic for the Gemini Live relay.
// No WebSocket, React, or audio APIs here — the hook executes the returned actions.

export type TranscriptEntry = { role: 'user' | 'agent'; text: string };

export interface TurnBuffers {
  userBuf: string;
  agentBuf: string;
}

export interface GeminiMessageDeps {
  ctx: string | null | undefined;
  buildPrompt: (ctx?: string | null) => string;
}

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type GeminiAction =
  | { type: 'send'; payload: unknown }
  | { type: 'setError'; message: string }
  | { type: 'stop' }
  | { type: 'markReady' }
  | { type: 'setSpeakingAgent' }
  | { type: 'playAudio'; base64: string }
  | { type: 'pushTranscript'; entry: TranscriptEntry }
  | { type: 'endAgentSpeaking' }
  | { type: 'runTool'; calls: ToolCall[] };

export interface GeminiMessageResult {
  buffers: TurnBuffers;
  actions: GeminiAction[];
}

export type SpeakingState = 'user' | 'agent' | 'idle';

/** Applied for `endAgentSpeaking`: only clears the agent state, never the user's. */
export function speakingAfterAgentEnds(s: SpeakingState): SpeakingState {
  return s === 'agent' ? 'idle' : s;
}

export const READ_FILE_MAX_LINES = 200;

/** Formats file content for the read_file tool, capped at READ_FILE_MAX_LINES lines. */
export function formatReadFileOutput(content: string, startLine?: unknown, endLine?: unknown): string {
  const lines = content.split('\n');
  const start = typeof startLine === 'number' && startLine >= 1 ? Math.floor(startLine) : 1;
  const maxEnd = start + READ_FILE_MAX_LINES - 1;
  const requestedEnd = typeof endLine === 'number' && endLine >= start ? Math.floor(endLine) : maxEnd;
  const end = Math.min(requestedEnd, maxEnd);
  let output = lines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`).join('\n');
  if (lines.length > end) output += `\n… (${lines.length - end} more lines)`;
  return output;
}

export const SEARCH_FILES_MAX_RESULTS = 10;

/** Minimal tree shape used by searchFilePaths (matches FileNode from ../types). */
export interface SearchTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: SearchTreeNode[] | null;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Finds files whose workspace-relative path matches a (possibly spoken) name.
 * Every whitespace-separated query token must appear in the normalized path,
 * so "gemini message" matches "client/src/hooks/geminiMessage.ts".
 * Returns relative paths, best matches first.
 */
export function searchFilePaths(tree: SearchTreeNode, query: string): string[] {
  const tokens = query.split(/\s+/).map(normalize).filter(Boolean);
  if (!tokens.length) return [];
  const root = tree.path.replace(/[\\/]+$/, '');
  const whole = tokens.join('');

  const hits: { rel: string; score: number }[] = [];
  const walk = (node: SearchTreeNode) => {
    if (node.type === 'file') {
      const rel = node.path.startsWith(root) ? node.path.slice(root.length).replace(/^[\\/]+/, '') : node.path;
      const normPath = normalize(rel);
      if (tokens.every(t => normPath.includes(t))) {
        const base = normalize(node.name);
        const stem = normalize(node.name.replace(/\.[^.]+$/, ''));
        const score = stem === whole || base === whole ? 0 : base.includes(whole) ? 1 : 2;
        hits.push({ rel, score });
      }
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);

  return hits
    .sort((a, b) => a.score - b.score || a.rel.length - b.rel.length || a.rel.localeCompare(b.rel))
    .map(h => h.rel);
}

/** Formats search_files output; tells the agent to ask the user when ambiguous. */
export function formatSearchFilesOutput(query: string, matches: string[]): string {
  if (!matches.length) {
    return `No files matched "${query}". Tell the user and ask them for a different name.`;
  }
  if (matches.length === 1) {
    return `1 match: ${matches[0]}\nConfirm with the user before opening it.`;
  }
  const shown = matches.slice(0, SEARCH_FILES_MAX_RESULTS);
  const extra = matches.length - shown.length;
  return [
    `${matches.length} matches for "${query}" — ambiguous. Offer them one at a time and ask the user which one to open, pausing after each for a yes or no. Do not pick one yourself.`,
    ...shown,
    ...(extra > 0 ? [`… (${extra} more — ask the user to be more specific)`] : []),
  ].join('\n');
}

export const GEMINI_LIVE_MODEL = 'models/gemini-3.8-live';
export const GEMINI_VOICE = 'Aoede';

type ServerContent = {
  modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
  inputTranscription?: { text?: string };
  outputTranscription?: { text?: string };
  turnComplete?: boolean;
};

export function handleGeminiMessage(
  msg: Record<string, unknown>,
  buffers: TurnBuffers,
  deps: GeminiMessageDeps,
): GeminiMessageResult {
  // Relay error (e.g. missing API key)
  if (msg.type === 'error') {
    return {
      buffers,
      actions: [
        { type: 'setError', message: (msg.message as string) ?? 'Meeting relay error' },
        { type: 'stop' },
      ],
    };
  }

  // Relay ready — send the Gemini Live setup message
  if (msg.type === 'relay-ready') {
    return {
      buffers,
      actions: [{
        type: 'send',
        payload: {
          setup: {
            model: GEMINI_LIVE_MODEL,
            systemInstruction: { parts: [{ text: deps.buildPrompt(deps.ctx) }] },
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            tools: [{
              functionDeclarations: [
                {
                  name: 'read_file',
                  description: 'Read a file from the workspace. Use to answer specific questions about code. Always announce what you are about to read before calling this.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      path: { type: 'STRING', description: 'Workspace-relative path, e.g. src/index.ts' },
                      start_line: { type: 'INTEGER', description: 'First line to read (1-indexed, optional)' },
                      end_line: { type: 'INTEGER', description: 'Last line to read (1-indexed, max 200 lines from start_line, optional)' },
                    },
                    required: ['path'],
                  },
                },
                {
                  name: 'open_file',
                  description: 'Open a file in the editor and optionally jump to a specific line. Use when you want the user to see a particular piece of code. Always say which file you are opening.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      path: { type: 'STRING', description: 'Workspace-relative path' },
                      line: { type: 'INTEGER', description: 'Line number to highlight (optional)' },
                    },
                    required: ['path'],
                  },
                },
                {
                  name: 'search_files',
                  description: 'Find files by name when you do not know the exact workspace path. Returns matching workspace-relative paths. If several match, ask the user which one before opening.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      query: { type: 'STRING', description: 'File name or words from it, e.g. "gemini message" or "files.ts"' },
                    },
                    required: ['query'],
                  },
                },
              ],
            }],
          },
        },
      }],
    };
  }

  // Setup complete — mark ready and send a silent trigger so Gemini opens with its intro.
  if ('setupComplete' in msg) {
    return {
      buffers,
      actions: [
        { type: 'markReady' },
        {
          type: 'send',
          payload: {
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: 'hi' }] }],
              turnComplete: true,
            },
          },
        },
      ],
    };
  }

  // Tool call — the AI wants to call search_files, read_file, or open_file
  if (msg.toolCall) {
    type FunctionCall = { id?: string; name?: string; args?: Record<string, unknown> };
    const raw = (msg.toolCall as { functionCalls?: FunctionCall[] }).functionCalls ?? [];
    const calls: ToolCall[] = raw
      .filter((c): c is Required<FunctionCall> => !!(c.id && c.name))
      .map(c => ({ id: c.id, name: c.name, args: c.args ?? {} }));
    return { buffers, actions: calls.length ? [{ type: 'runTool', calls }] : [] };
  }

  const actions: GeminiAction[] = [];
  let { userBuf, agentBuf } = buffers;
  const serverContent = msg.serverContent as ServerContent | undefined;

  // Agent audio
  for (const part of serverContent?.modelTurn?.parts ?? []) {
    if (part.inlineData?.data) {
      actions.push({ type: 'setSpeakingAgent' });
      actions.push({ type: 'playAudio', base64: part.inlineData.data });
    }
  }

  // Accumulate transcription text per turn
  if (serverContent?.inputTranscription?.text) userBuf += serverContent.inputTranscription.text;
  if (serverContent?.outputTranscription?.text) agentBuf += serverContent.outputTranscription.text;

  // Flush completed turn buffers into the transcript
  if (serverContent?.turnComplete) {
    if (userBuf.trim()) {
      actions.push({ type: 'pushTranscript', entry: { role: 'user', text: userBuf.trim() } });
      userBuf = '';
    }
    if (agentBuf.trim()) {
      actions.push({ type: 'pushTranscript', entry: { role: 'agent', text: agentBuf.trim() } });
      agentBuf = '';
    }
    actions.push({ type: 'endAgentSpeaking' });
  }

  return { buffers: { userBuf, agentBuf }, actions };
}
