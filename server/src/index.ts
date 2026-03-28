import 'dotenv/config';
import express, { Request, Response } from 'express';
import { transcribeAudio } from './stt.js';

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

  const audio = req.body as Buffer;
  console.log(`[${new Date().toISOString()}] POST /api/ask -> transcribing ${audio.length} bytes`);

  transcribeAudio(audio, groqKey)
    .then((question) => {
      console.log(`[${new Date().toISOString()}] STT -> "${question}"`);
      res.json({ question });
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
