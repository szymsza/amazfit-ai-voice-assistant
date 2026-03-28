import 'dotenv/config';
import { writeFileSync } from 'fs';
import express, { Request, Response } from 'express';
import { transcribeAudio } from './stt';
import { callLLM, type Message } from './llm';
import { synthesizeSpeech } from './tts';
import { truncateForTts } from './utils';
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

app.post('/api/ask', (req: Request, res: Response) => {
  console.log(`[${new Date().toISOString()}] POST /api/ask content-type=${req.headers['content-type']} body-keys=${Object.keys(req.body ?? {}).join(',')}`);

  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${API_TOKEN}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as RequestBody;
  if (!body.audio) {
    res.status(400).json({ error: 'Missing audio field' });
    return;
  }
  if (!body.groqKey) {
    res.status(400).json({ error: 'Missing groqKey' });
    return;
  }

  const audio = Buffer.from(body.audio, 'base64');
  console.log(`[${new Date().toISOString()}] audio decoded: ${audio.length}b, first16=0x${audio.slice(0, 16).toString('hex')}`);
  try { writeFileSync('/tmp/debug_audio.bin', audio); } catch (_) { /* ignore */ }
  const llmProvider = body.llmProvider ?? 'groq';
  const llmModel = body.llmModel ?? '';
  const llmKey = body.llmKey ?? body.groqKey;
  const ttsVoice = body.ttsVoice ?? 'austin';
  const maxTurns = body.maxTurns ?? 10;
  const conversation: Message[] = body.conversation ?? [];

  console.log(`[${new Date().toISOString()}] POST /api/ask provider=${llmProvider} audio=${audio.length}b groqKey=${body.groqKey.slice(0, 8)}...${body.groqKey.slice(-4)}`);

  transcribeAudio(audio, body.groqKey)
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

          // TODO: TTS output (WAV->Zepp OS Opus) does not play on the watch.
          // The watch expects the proprietary Zepp OS framed Opus format
          // ([4-byte BE len][4-byte pad][opus payload] per frame).
          // Current wavToZeppOpus() conversion produces frames the watch rejects.
          // Need to figure out correct encoding parameters / frame structure.
          const ttsText = truncateForTts(answer, 50);
          if (ttsText !== answer) {
            console.log(`[${new Date().toISOString()}] TTS truncated: ${answer.split(/\s+/).length} -> ${ttsText.split(/\s+/).length} words`);
          }
          return synthesizeSpeech(ttsText, body.groqKey, ttsVoice).then((opusBuffer) => {
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
