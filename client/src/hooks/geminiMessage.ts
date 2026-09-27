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

export type GeminiAction =
  | { type: 'send'; payload: unknown }
  | { type: 'setError'; message: string }
  | { type: 'stop' }
  | { type: 'markReady' }
  | { type: 'setSpeakingAgent' }
  | { type: 'playAudio'; base64: string }
  | { type: 'pushTranscript'; entry: TranscriptEntry }
  | { type: 'endAgentSpeaking' };

export interface GeminiMessageResult {
  buffers: TurnBuffers;
  actions: GeminiAction[];
}

export type SpeakingState = 'user' | 'agent' | 'idle';

/** Applied for `endAgentSpeaking`: only clears the agent state, never the user's. */
export function speakingAfterAgentEnds(s: SpeakingState): SpeakingState {
  return s === 'agent' ? 'idle' : s;
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
