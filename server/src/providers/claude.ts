import { registerProvider, type Message } from '../llm';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 1024;

async function claudeProvider(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const block = data.content.find((b) => b.type === 'text');
  if (!block?.text) {
    throw new Error('Claude returned empty response');
  }

  return block.text;
}

registerProvider('claude', claudeProvider);

export { DEFAULT_MODEL as CLAUDE_DEFAULT_MODEL };
