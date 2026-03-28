import 'dotenv/config';
import express, { Request, Response } from 'express';
import { transcribeAudio } from './stt.js';
import { callLLM, Message } from './llm.js';
import { synthesizeSpeech } from './tts.js';
import './providers/groq.js';
import './providers/claude.js';
import './providers/openai.js';

const app = express();
const PORT = process.env.PORT ?? '3000';
const API_TOKEN = process.env.API_TOKEN ?? '';

app.use(express.raw({ type: '*/*', limit: '10mb' }));

app.post('/api/ask', (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${API_TOKEN}`) {
    console.log(`[${new Date().toISOString()}] POST /api/ask -> 401 Unauthorized`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const groqKey = req.headers['x-groq-key'];
  if (!groqKey || typeof groqKey !== 'string') {
    console.log(`[${new Date().toISOString()}] POST /api/ask -> 400 Missing X-Groq-Key`);
    res.status(400).json({ error: 'Missing X-Groq-Key header' });
    return;
  }

  const llmProvider = (req.headers['x-llm-provider'] as string | undefined) ?? 'groq';
  const llmModel = (req.headers['x-llm-model'] as string | undefined) ?? '';
  const llmKey = (req.headers['x-llm-key'] as string | undefined) ?? groqKey;
  const ttsVoice = (req.headers['x-tts-voice'] as string | undefined) ?? 'austin';
  const maxTurnsHeader = req.headers['x-max-turns'];
  const maxTurns = maxTurnsHeader ? parseInt(maxTurnsHeader as string, 10) : 10;

  let conversation: Message[] = [];
  const conversationHeader = req.headers['x-conversation'];
  if (conversationHeader && typeof conversationHeader === 'string') {
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(conversationHeader, 'base64').toString('utf8'),
      );
      if (Array.isArray(parsed)) {
        conversation = parsed as Message[];
      }
    } catch {
      // invalid conversation header — start fresh
    }
  }

  const audio = req.body as Buffer;
  console.log(`[${new Date().toISOString()}] POST /api/ask provider=${llmProvider} audio=${audio.length}b`);

  transcribeAudio(audio, groqKey)
    .then((question) => {
      console.log(`[${new Date().toISOString()}] STT -> "${question}"`);

      const messages: Message[] = [...conversation, { role: 'user', content: question }];

      return callLLM({ provider: llmProvider, model: llmModel, apiKey: llmKey, messages, maxTurns })
        .then((answer) => {
          console.log(`[${new Date().toISOString()}] LLM -> "${answer.slice(0, 80)}..."`);

          const updatedConversation: Message[] = [
            ...messages,
            { role: 'assistant', content: answer },
          ];

          return synthesizeSpeech(answer, groqKey, ttsVoice).then((opusBuffer) => {
            console.log(`[${new Date().toISOString()}] TTS -> ${opusBuffer.length}b OPUS`);

            res.json({
              audio: opusBuffer.toString('base64'),
              question,
              answer,
              conversation: updatedConversation,
            });
          });
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[${new Date().toISOString()}] LLM/TTS failed: ${message}`);
          res.status(502).json({ error: `Pipeline failed: ${message}` });
        });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${new Date().toISOString()}] STT failed: ${message}`);
      res.status(502).json({ error: `STT failed: ${message}` });
    });
});

app.listen(Number(PORT), () => {
  console.log(`Server listening on port ${PORT}`);
});
