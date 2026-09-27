import { describe, expect, it, vi } from 'vitest';
import {
  handleGeminiMessage,
  speakingAfterAgentEnds,
  GEMINI_LIVE_MODEL,
  GEMINI_VOICE,
  type TurnBuffers,
} from './geminiMessage';

const empty: TurnBuffers = { userBuf: '', agentBuf: '' };
const deps = { ctx: 'some context', buildPrompt: (c?: string | null) => `PROMPT:${c}` };

describe('handleGeminiMessage', () => {
  describe('relay error', () => {
    it('sets the relay message as error and stops', () => {
      const { actions } = handleGeminiMessage({ type: 'error', message: 'no key' }, empty, deps);
      expect(actions).toEqual([{ type: 'setError', message: 'no key' }, { type: 'stop' }]);
    });

    it('falls back to a default error message', () => {
      const { actions } = handleGeminiMessage({ type: 'error' }, empty, deps);
      expect(actions[0]).toEqual({ type: 'setError', message: 'Meeting relay error' });
    });
  });

  describe('relay-ready', () => {
    it('sends the setup payload built from ctx', () => {
      const buildPrompt = vi.fn(() => 'PROMPT');
      const { actions } = handleGeminiMessage({ type: 'relay-ready' }, empty, { ctx: 'c', buildPrompt });

      expect(buildPrompt).toHaveBeenCalledWith('c');
      expect(actions).toEqual([{
        type: 'send',
        payload: {
          setup: {
            model: GEMINI_LIVE_MODEL,
            systemInstruction: { parts: [{ text: 'PROMPT' }] },
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        },
      }]);
    });
  });

  describe('setupComplete', () => {
    it('marks ready and sends the silent "hi" trigger', () => {
      const { actions } = handleGeminiMessage({ setupComplete: {} }, empty, deps);
      expect(actions).toEqual([
        { type: 'markReady' },
        {
          type: 'send',
          payload: { clientContent: { turns: [{ role: 'user', parts: [{ text: 'hi' }] }], turnComplete: true } },
        },
      ]);
    });
  });

  describe('modelTurn audio', () => {
    it('plays only parts with inline data', () => {
      const msg = {
        serverContent: {
          modelTurn: { parts: [{ inlineData: { data: 'AAA' } }, {}, { inlineData: {} }, { inlineData: { data: 'BBB' } }] },
        },
      };
      const { actions } = handleGeminiMessage(msg, empty, deps);
      expect(actions).toEqual([
        { type: 'setSpeakingAgent' },
        { type: 'playAudio', base64: 'AAA' },
        { type: 'setSpeakingAgent' },
        { type: 'playAudio', base64: 'BBB' },
      ]);
    });

    it('does nothing for missing serverContent or empty parts', () => {
      expect(handleGeminiMessage({}, empty, deps).actions).toEqual([]);
      expect(handleGeminiMessage({ serverContent: { modelTurn: { parts: [] } } }, empty, deps).actions).toEqual([]);
    });
  });

  describe('transcription buffering', () => {
    it('accumulates input and output text across messages without emitting', () => {
      let buffers = empty;
      for (const [inp, out] of [['Hel', 'Hi '], ['lo', 'there']]) {
        const r = handleGeminiMessage(
          { serverContent: { inputTranscription: { text: inp }, outputTranscription: { text: out } } },
          buffers,
          deps,
        );
        expect(r.actions).toEqual([]);
        buffers = r.buffers;
      }
      expect(buffers).toEqual({ userBuf: 'Hello', agentBuf: 'Hi there' });
    });

    it('does not mutate the input buffers', () => {
      const input = { userBuf: 'a', agentBuf: 'b' };
      handleGeminiMessage({ serverContent: { inputTranscription: { text: 'x' } } }, input, deps);
      expect(input).toEqual({ userBuf: 'a', agentBuf: 'b' });
    });
  });

  describe('turnComplete', () => {
    it('flushes trimmed buffers in user-then-agent order and ends agent speaking', () => {
      const { actions, buffers } = handleGeminiMessage(
        { serverContent: { turnComplete: true } },
        { userBuf: '  hello ', agentBuf: ' hi there  ' },
        deps,
      );
      expect(actions).toEqual([
        { type: 'pushTranscript', entry: { role: 'user', text: 'hello' } },
        { type: 'pushTranscript', entry: { role: 'agent', text: 'hi there' } },
        { type: 'endAgentSpeaking' },
      ]);
      expect(buffers).toEqual(empty);
    });

    it('skips empty or whitespace-only buffers', () => {
      const { actions } = handleGeminiMessage(
        { serverContent: { turnComplete: true } },
        { userBuf: '   ', agentBuf: '' },
        deps,
      );
      expect(actions).toEqual([{ type: 'endAgentSpeaking' }]);
    });

    it('includes text arriving in the same message as turnComplete', () => {
      const { actions } = handleGeminiMessage(
        { serverContent: { outputTranscription: { text: 'bye' }, turnComplete: true } },
        { userBuf: '', agentBuf: 'good' },
        deps,
      );
      expect(actions[0]).toEqual({ type: 'pushTranscript', entry: { role: 'agent', text: 'goodbye' } });
    });
  });
});

describe('speakingAfterAgentEnds', () => {
  it('resets agent to idle', () => {
    expect(speakingAfterAgentEnds('agent')).toBe('idle');
  });

  it('does not clear the user speaking state', () => {
    expect(speakingAfterAgentEnds('user')).toBe('user');
  });

  it('leaves idle as idle', () => {
    expect(speakingAfterAgentEnds('idle')).toBe('idle');
  });
});
