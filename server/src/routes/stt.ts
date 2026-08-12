import { Router, Request, Response } from 'express';
import OpenAI, { toFile } from 'openai';
import { GoogleGenAI } from '@google/genai';
import { loadOpenAIKey } from '../services/openaiAgent';
import { loadGeminiKey } from '../services/geminiAgent';

const router = Router();

router.post('/stt/transcribe', async (req: Request, res: Response) => {
  const { audioBase64, mimeType, provider } = req.body as {
    audioBase64: string;
    mimeType: string;
    provider: string;
  };

  if (!audioBase64) return res.status(400).json({ error: 'No audio provided' });

  try {
    if (provider === 'openai') {
      const apiKey = await loadOpenAIKey();
      const client = new OpenAI({ apiKey });

      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      const file = await toFile(audioBuffer, `recording.${ext}`, { type: mimeType });

      const transcription = await client.audio.transcriptions.create({
        model: 'whisper-1',
        file,
      });

      return res.json({ text: transcription.text });

    } else if (provider === 'google') {
      const apiKey = await loadGeminiKey();
      const ai = new GoogleGenAI({ apiKey });

      const result = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{
          parts: [
            { text: 'Transcribe this audio exactly as spoken. Return only the transcription, no commentary.' },
            { inlineData: { mimeType, data: audioBase64 } },
          ],
        }],
      });

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
      return res.json({ text });

    } else {
      return res.status(400).json({ error: `Provider '${provider}' does not support transcription` });
    }
  } catch (err) {
    console.error('[STT/Transcribe]', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
