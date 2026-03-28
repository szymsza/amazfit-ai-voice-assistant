import { registerProvider, type Message } from '../llm';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'moonshotai/kimi-k2-instruct';

async function groqProvider(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: model || DEFAULT_MODEL, messages }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq chat API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Groq returned empty response');
  }

  return content;
}

registerProvider('groq', groqProvider);

export { DEFAULT_MODEL as GROQ_DEFAULT_MODEL };
