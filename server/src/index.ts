import express, { Request, Response } from 'express';

const app = express();
const PORT = process.env.PORT ?? '3000';
const API_TOKEN = process.env.API_TOKEN ?? '';

app.use(express.raw({ type: '*/*', limit: '10mb' }));

app.post('/api/ask', (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${API_TOKEN}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const audio = req.body as Buffer;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(audio);
});

app.listen(Number(PORT), () => {
  console.log(`Server listening on port ${PORT}`);
});
