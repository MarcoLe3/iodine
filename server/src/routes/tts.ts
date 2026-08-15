import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { loadOpenAIKey } from '../services/openaiAgent';
import { loadGeminiKey } from '../services/geminiAgent';

const router = Router();

const NARRATION_PROMPT =
  'Condense the following into ONE spoken sentence — two at most. ' +
  'Preserve the first brief conversational pleasantry if present, such as “Great!”, “No problem.”, or “Of course.”, but do not add one. ' +
  'Then state the single most important point directly. ' +
  'Cut all code, lists, caveats, and filler. No summary phrase. ' +
  'Just the spoken takeaway.';

function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitDepth = 16): Buffer {
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);                                     // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28);
  header.writeUInt16LE(channels * (bitDepth / 8), 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

router.post('/tts/verbally', async (req: Request, res: Response) => {
  const { text, provider, model } = req.body as {
    text: string;
    provider: string;
    model: string;
  };

  if (!text?.trim()) return res.status(400).json({ error: 'No text provided' });

  try {
    if (provider === 'openai') {
      const apiKey = await loadOpenAIKey();
      const client = new OpenAI({ apiKey });

      // Step 1: condense into slide-deck narration
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: NARRATION_PROMPT },
          { role: 'user', content: text },
        ],
        max_completion_tokens: 60,
      });
      const narration = completion.choices[0]?.message?.content?.trim() || text.slice(0, 1000);

      // Step 2: speak with tts-1-hd
      const speech = await client.audio.speech.create({
        model: 'tts-1-hd',
        voice: 'nova',
        input: narration,
      });

      res.set('Content-Type', 'audio/mpeg');
      return res.send(Buffer.from(await speech.arrayBuffer()));

    } else if (provider === 'google') {
      const apiKey = await loadGeminiKey();
      const ai = new GoogleGenAI({ apiKey });

      // Step 1: condense with the user's chat model
      const condensed = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text }] }],
        config: { systemInstruction: NARRATION_PROMPT },
      });
      const narration = condensed.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text.slice(0, 1000);

      // Step 2: speak with Gemini TTS
      const audioResp = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: narration }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
          },
        } as Record<string, unknown>,
      });

      const inlineData = audioResp.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData?.data) return res.status(500).json({ error: 'No audio returned from Gemini TTS' });

      const pcm = Buffer.from(inlineData.data, 'base64');
      res.set('Content-Type', 'audio/wav');
      return res.send(pcmToWav(pcm));

    } else {
      return res.status(400).json({ error: `Provider '${provider}' does not support Verbally` });
    }
  } catch (err) {
    console.error('[TTS/Verbally]', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// Direct TTS — no condensation step (used for tutor-mode tool narrations).
router.post('/tts/speak', async (req: Request, res: Response) => {
  const { text, provider } = req.body as { text: string; provider: string };

  if (!text?.trim()) return res.status(400).json({ error: 'No text provided' });

  try {
    if (provider === 'openai') {
      const apiKey = await loadOpenAIKey();
      const client = new OpenAI({ apiKey });
      const speech = await client.audio.speech.create({
        model: 'tts-1-hd',
        voice: 'nova',
        input: text,
      });
      res.set('Content-Type', 'audio/mpeg');
      return res.send(Buffer.from(await speech.arrayBuffer()));

    } else if (provider === 'google') {
      const apiKey = await loadGeminiKey();
      const ai = new GoogleGenAI({ apiKey });
      const audioResp = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
          },
        } as Record<string, unknown>,
      });

      const inlineData = audioResp.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData?.data) return res.status(500).json({ error: 'No audio returned from Gemini TTS' });

      const pcm = Buffer.from(inlineData.data, 'base64');
      res.set('Content-Type', 'audio/wav');
      return res.send(pcmToWav(pcm));

    } else {
      return res.status(400).json({ error: `Provider '${provider}' does not support TTS narration` });
    }
  } catch (err) {
    console.error('[TTS/Speak]', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
