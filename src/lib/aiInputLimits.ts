// The most text each AI route accepts, so one request can't send a huge prompt (an AI call is billed by its
// length). No imports, so client components can use it. Lists the client keeps growing (a conversation, the
// sentences already shown) are trimmed to their latest entries rather than refused.

export const AI_INPUT_LIMITS = {
  // Translator tab, and the translations of sentences and AI Friend replies
  translateText: 5000,
  // Text to speech (OpenAI's own limit is 4096)
  speechText: 4096,
  // One AI Friend message, and a message sent for grammar checking
  friendMessage: 2000,
  // The latest messages of an AI Friend conversation sent to the model
  friendHistory: 40,
  // Each side of a sentence and its translation for word alignment
  alignText: 2000,
  // A Training image search
  imageQuery: 300,
  // The latest words and sentences already shown, which a new sentence avoids
  usedWords: 500,
  usedSentences: 50,
  // Each of those words or sentences
  usedItem: 500,
} as const;

// The strings in `value` (anything else dropped), the last `count` of them, each at most `length` characters
export function latestStrings(value: unknown, count: number, length: number = AI_INPUT_LIMITS.usedItem): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .slice(-count)
    .map((item) => item.slice(0, length));
}

export const tooLongMessage = (what: string, max: number) => `${what} can be at most ${max.toLocaleString('en-US')} characters`;
