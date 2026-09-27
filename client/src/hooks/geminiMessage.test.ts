import { describe, expect, it, vi } from 'vitest';
import {
  handleGeminiMessage,
  speakingAfterAgentEnds,
  formatReadFileOutput,
  READ_FILE_MAX_LINES,
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
            tools: [{
              functionDeclarations: [
                expect.objectContaining({ name: 'read_file' }),
                expect.objectContaining({ name: 'open_file' }),
              ],
            }],
          },
        },
      }]);
    });
  });

  describe('toolCall', () => {
    it('emits a runTool action with normalized calls', () => {
      const msg = {
        toolCall: {
          functionCalls: [
            { id: '1', name: 'read_file', args: { path: 'a.ts' } },
            { id: '2', name: 'open_file' },
          ],
        },
      };
      const { actions } = handleGeminiMessage(msg, empty, deps);
      expect(actions).toEqual([{
        type: 'runTool',
        calls: [
          { id: '1', name: 'read_file', args: { path: 'a.ts' } },
          { id: '2', name: 'open_file', args: {} },
        ],
      }]);
    });

    it('drops calls missing id or name, and emits nothing if none remain', () => {
      const msg = { toolCall: { functionCalls: [{ name: 'read_file' }, { id: 'x' }] } };
      expect(handleGeminiMessage(msg, empty, deps).actions).toEqual([]);
    });

    it('leaves buffers untouched', () => {
      const buffers = { userBuf: 'u', agentBuf: 'a' };
      const r = handleGeminiMessage({ toolCall: { functionCalls: [] } }, buffers, deps);
      expect(r.buffers).toBe(buffers);
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

describe('formatReadFileOutput', () => {
  const file = Array.from({ length: 500 }, (_, i) => `line${i + 1}`).join('\n');

  it('numbers lines and caps at READ_FILE_MAX_LINES by default', () => {
    const out = formatReadFileOutput(file).split('\n');
    expect(out[0]).toBe('1: line1');
    expect(out[READ_FILE_MAX_LINES - 1]).toBe(`${READ_FILE_MAX_LINES}: line${READ_FILE_MAX_LINES}`);
    expect(out.at(-1)).toBe(`… (${500 - READ_FILE_MAX_LINES} more lines)`);
  });

  it('respects a requested range', () => {
    expect(formatReadFileOutput(file, 10, 12)).toBe('10: line10\n11: line11\n12: line12\n… (488 more lines)');
  });

  it('clamps an oversized range to the cap', () => {
    const out = formatReadFileOutput(file, 1, 450).split('\n');
    expect(out).toHaveLength(READ_FILE_MAX_LINES + 1);
  });

  it('omits the trailer when the file ends within range', () => {
    expect(formatReadFileOutput('a\nb', 1)).toBe('1: a\n2: b');
  });

  it('ignores invalid start/end values', () => {
    expect(formatReadFileOutput('a\nb', 'x', -3)).toBe('1: a\n2: b');
  });
});
