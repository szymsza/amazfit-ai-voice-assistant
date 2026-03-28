import 'dotenv/config';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { transcribeAudio } from './stt';
import { callLLM, type Message } from './llm';
import { synthesizeSpeech } from './tts';
import './providers/groq';
import './providers/claude';
import './providers/openai';

const app = express();
const PORT = process.env.PORT ?? '3000';
const API_TOKEN = process.env.API_TOKEN ?? '';

const upload = multer({ storage: multer.memoryStorage() });

interface RequestConfig {
  groqKey: string;
  llmProvider?: string;
  llmModel?: string;
  llmKey?: string;
  ttsVoice?: string;
  maxTurns?: number;
  conversation?: Message[];
}

app.post(
  '/api/ask',
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'config', maxCount: 1 }]),
  (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer ${API_TOKEN}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const files = req.files as Record<string, Express.Multer.File[]>;
    const audioFile = files['audio']?.[0];
    if (!audioFile) {
      res.status(400).json({ error: 'Missing audio field' });
      return;
    }

    let config: RequestConfig;
    try {
      config = JSON.parse(req.body.config ?? '{}') as RequestConfig;
    } catch {
      res.status(400).json({ error: 'Invalid config JSON' });
      return;
    }

    if (!config.groqKey) {
      res.status(400).json({ error: 'Missing groqKey in config' });
      return;
    }

    const llmProvider = config.llmProvider ?? 'groq';
    const llmModel = config.llmModel ?? '';
    const llmKey = config.llmKey ?? config.groqKey;
    const ttsVoice = config.ttsVoice ?? 'austin';
    const maxTurns = config.maxTurns ?? 10;
    const conversation: Message[] = config.conversation ?? [];
    const audio = audioFile.buffer;

    console.log(`[${new Date().toISOString()}] POST /api/ask provider=${llmProvider} audio=${audio.length}b`);

    transcribeAudio(audio, config.groqKey)
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

            return synthesizeSpeech(answer, config.groqKey, ttsVoice).then((opusBuffer) => {
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
  },
);

app.listen(Number(PORT), () => {
  console.log(`Server listening on port ${PORT}`);
});
