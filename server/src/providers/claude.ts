import { registerProvider, type Message } from '../llm';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 1024;

function buildSystemPrompt(): string {
  const today = new Date().toISOString().split('T')[0];
  return [
    `You are a voice assistant on a smartwatch. Today is ${today}.`,
    'Your responses will be spoken aloud via TTS, so:',
    '- Keep answers to 1-3 short sentences (under 50 words).',
    '- Never use lists, markdown, bullet points, or special characters.',
    '- Be conversational and natural, like talking to a friend.',
    '- If a question is broad, give a brief answer and ask if they want more detail.',
    '- Use web search for anything requiring current information.',
    '- All of your text output, including anything written before or between tool calls, is concatenated and read aloud to the user as one answer with no visibility into intermediate steps.',
    '- Never write narration, filler, or meta-commentary about what you are doing, before, between, or after tool calls: no "I\'ll search for that", "Let me check", "One moment", "Based on my search", etc.',
    '- Only ever output the words that should be spoken as the final answer itself.',
  ].join(' ');
}

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
      system: buildSystemPrompt(),
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    stop_reason: string;
    content: Array<{ type: string; text?: string }>;
  };
  console.log(`[claude] stop_reason=${data.stop_reason} content_types=${data.content.map(b => b.type).join(',')}`);

  const textBlocks = data.content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!);

  if (textBlocks.length === 0) {
    throw new Error('Claude returned empty response');
  }

  return textBlocks.join('');
}

registerProvider('claude', claudeProvider);

export { DEFAULT_MODEL as CLAUDE_DEFAULT_MODEL };
