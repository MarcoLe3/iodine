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

  // Tool call — the AI wants to call read_file or open_file
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
