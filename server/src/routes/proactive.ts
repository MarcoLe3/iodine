import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { loadApiKey } from '../services/anthropicAgent';
import { loadOpenAIKey } from '../services/openaiAgent';
import { loadGeminiKey } from '../services/geminiAgent';

const router = Router();

const REPHRASE_SYSTEM =
  'Rephrase this brief proactive developer assistant message. ' +
  'Make it sound natural and conversational. Keep it to 1-2 short sentences. ' +
  'Return only the rephrased message — no quotes, no explanation.';

router.post('/proactive/rephrase', async (req, res) => {
  const { message, provider, model } = req.body as {
    message: string;
    provider: string;
    model: string;
  };

  try {
    let rephrased = message;

    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey: await loadApiKey() });
      const response = await client.messages.create({
        model,
        max_tokens: 120,
        system: REPHRASE_SYSTEM,
        messages: [{ role: 'user', content: message }],
      });
      const block = response.content[0];
      if (block?.type === 'text') rephrased = block.text.trim();

    } else if (provider === 'openai') {
      const client = new OpenAI({ apiKey: await loadOpenAIKey() });
      const response = await client.chat.completions.create({
        model,
        max_tokens: 120,
        messages: [
          { role: 'system', content: REPHRASE_SYSTEM },
          { role: 'user', content: message },
        ],
      });
      rephrased = response.choices[0]?.message?.content?.trim() ?? message;

    } else if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: await loadGeminiKey() });
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: message }] }],
        config: { systemInstruction: REPHRASE_SYSTEM },
      });
      rephrased = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? message;
    }

    res.json({ rephrased });
  } catch {
    // Degrade gracefully — return the original canned message.
    res.json({ rephrased: message });
  }
});

export default router;
