/** Truncate text to at most maxWords, cutting at the last sentence boundary. */
export function truncateForTts(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  const truncated = words.slice(0, maxWords).join(' ');
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?'),
  );
  return lastSentenceEnd > 0 ? truncated.slice(0, lastSentenceEnd + 1) : truncated;
}
