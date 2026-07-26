import 'dotenv/config';
import { writeFileSync } from 'fs';
import express, { Request, Response } from 'express';
import { transcribeAudio } from './stt';
import { callLLM, type Message } from './llm';
import { synthesizeSpeech, estimateMp3DurationSeconds } from './tts';
import { truncateForTts } from './utils';
import { makeRequestId, trace, saveInput, saveOutput } from './logger';
import './providers/groq';
import './providers/claude';
import './providers/openai';

const app = express();
const PORT = process.env.PORT ?? '3000';
const API_TOKEN = process.env.API_TOKEN ?? '';

app.use(express.json({ limit: '10mb' }));

interface RequestBody {
  audio: string;
  groqKey: string;
  llmProvider?: string;
  llmModel?: string;
  llmKey?: string;
  ttsVoice?: string;
  maxTurns?: number;
  conversation?: Message[];
}

app.get('/', (_req: Request, res: Response) => {
  res.send('Server running!');
});

app.post('/api/ask', (req: Request, res: Response) => {
  const reqDate = new Date();
  const reqId = makeRequestId(reqDate);
  trace(reqDate, reqId, `POST /api/ask content-type=${req.headers['content-type']} body-keys=${Object.keys(req.body ?? {}).join(',')}`);

  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${API_TOKEN}`) {
    trace(reqDate, reqId, 'Unauthorized - invalid or missing API token', 'warn');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as RequestBody;
  if (!body.audio) {
    trace(reqDate, reqId, 'Bad request - missing audio field', 'warn');
    res.status(400).json({ error: 'Missing audio field' });
    return;
  }
  if (!body.groqKey) {
    trace(reqDate, reqId, 'Bad request - missing groqKey', 'warn');
    res.status(400).json({ error: 'Missing groqKey' });
    return;
  }

  const audio = Buffer.from(body.audio, 'base64');
  try { writeFileSync('/tmp/debug_audio.bin', audio); } catch (_) { /* ignore */ }
  saveInput(reqDate, reqId, audio);

  const llmProvider = body.llmProvider ?? 'groq';
  const llmModel = body.llmModel ?? '';
  const llmKey = body.llmKey ?? body.groqKey;
  const ttsVoice = body.ttsVoice ?? 'daniel';
  const maxTurns = body.maxTurns ?? 10;
  const conversation: Message[] = body.conversation ?? [];

  trace(reqDate, reqId, `provider=${llmProvider} audio=${audio.length}b groqKey=${body.groqKey.slice(0, 8)}...${body.groqKey.slice(-4)}`);

  transcribeAudio(audio, body.groqKey)
    .then((question) => {
      trace(reqDate, reqId, `STT -> "${question}"`);

      const messages: Message[] = [...conversation, { role: 'user', content: question }];

      return callLLM({ provider: llmProvider, model: llmModel, apiKey: llmKey, messages, maxTurns })
        .then((answer) => {
          trace(reqDate, reqId, `LLM -> "${answer.slice(0, 80)}..."`);

          const updatedConversation: Message[] = [
            ...messages,
            { role: 'assistant', content: answer },
          ];

          const ttsText = truncateForTts(answer);
          if (ttsText !== answer) {
            trace(reqDate, reqId, `TTS truncated: ${answer.split(/\s+/).length} -> ${ttsText.split(/\s+/).length} words`);
          }
          const ttsInput = `[friendly] ${ttsText}`;
          return synthesizeSpeech(ttsInput, body.groqKey, ttsVoice).then((mp3Buffer) => {
            trace(reqDate, reqId, `TTS -> ${mp3Buffer.length}b MP3`);
            try { writeFileSync('/tmp/debug_tts_output.bin', mp3Buffer); } catch (_) { /* ignore */ }
            saveOutput(reqDate, reqId, mp3Buffer);
            trace(reqDate, reqId, `Question: "${question}" | Answer: "${answer}"`);
            res.json({
              audio: mp3Buffer.toString('base64'),
              audioSeconds: estimateMp3DurationSeconds(mp3Buffer),
              question,
              answer,
              conversation: updatedConversation,
            });
          });
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          trace(reqDate, reqId, `LLM/TTS failed: ${message}`, 'error');
          res.status(502).json({ error: `Pipeline failed: ${message}` });
        });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      trace(reqDate, reqId, `STT failed: ${message}`, 'error');
      res.status(502).json({ error: `STT failed: ${message}` });
    });
});

app.listen(Number(PORT), () => {
  console.log(`Server listening on port ${PORT}`);
});
