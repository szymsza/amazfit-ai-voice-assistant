const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export async function transcribeAudio(audio: Buffer, groqApiKey: string): Promise<string> {
  const blob = new Blob([audio], { type: 'audio/ogg' });
  const form = new FormData();
  form.append('file', blob, 'recording.opus');
  form.append('model', 'whisper-large-v3');

  const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq Whisper API error ${response.status}: ${errorText}`);
  }

  const json = (await response.json()) as { text?: unknown };
  if (typeof json.text !== 'string') {
    throw new Error('Unexpected Groq Whisper response: missing text field');
  }
  return json.text;
}
