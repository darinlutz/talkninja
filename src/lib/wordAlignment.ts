import { ChatPromptTemplate } from '@langchain/core/prompts';
import { structuredModel } from './aiModels';
import { z } from 'zod';
import type { Language } from '@/lib/translate';

// A piece of a sentence or its translation. Pieces with the same group mean
// the same thing; null means unpaired (spaces, punctuation, unmatched words).
export type AlignedSegment = { text: string; group: number | null };

export const AlignmentPairsSchema = z
  .array(
    z.object({
      source: z.string().describe('A word or short phrase copied exactly from the sentence'),
      target: z.string().describe('The words copied exactly from the translation that mean the same thing'),
    })
  )
  .describe('Word-by-word pairs linking the sentence to the translation, in sentence order');

export type AlignmentPairs = z.infer<typeof AlignmentPairsSchema>;

// Shared prompt wording for asking a model to pair up a sentence with its
// translation; {sourceLanguage}/{targetLanguage} are template variables.
export const ALIGNMENT_INSTRUCTIONS =
  'pair up the sentence and the translation word by word, in sentence order. Each pair links ' +
  'the smallest {sourceLanguage} word or phrase to the {targetLanguage} words with the same ' +
  'meaning (e.g. "Tôi có xe." -> "I have a car.": Tôi/I, có/have, xe/a car). Copy both sides ' +
  'exactly as written, without punctuation. Use each word only once and leave out words with ' +
  'no counterpart.';

const ALIGN_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    'You align a {sourceLanguage} sentence with its {targetLanguage} translation. ' +
      'In alignment, ' +
      ALIGNMENT_INSTRUCTIONS,
  ],
  ['user', 'Sentence: {sentence}\nTranslation: {translation}'],
]);

export async function alignTranslation(
  sentence: string,
  sourceLanguage: Language,
  translation: string,
  targetLanguage: Language
): Promise<{ sentenceSegments: AlignedSegment[]; translationSegments: AlignedSegment[] }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const chain = ALIGN_PROMPT.pipe(
    await structuredModel('wordAlignment', z.object({ alignment: AlignmentPairsSchema }), 0)
  );

  const response = await chain.invoke({ sentence, sourceLanguage, translation, targetLanguage });
  return segmentsFromPairs(sentence, translation, response.alignment);
}

export function segmentsFromPairs(sentence: string, translation: string, pairs: AlignmentPairs) {
  const usable = pairs.filter((p) => p.source.trim() && p.target.trim());
  return {
    sentenceSegments: buildSegments(sentence, usable.map((p) => p.source.trim()), true),
    translationSegments: buildSegments(translation, usable.map((p) => p.target.trim()), false),
  };
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

// Splits text into segments by finding each phrase in it (phrase i becomes
// group i). The model's copies aren't always exact, so a phrase that can't be
// found is skipped and that part of the text is left uncolored.
function buildSegments(text: string, phrases: string[], inOrder: boolean): AlignedSegment[] {
  const lower = text.toLocaleLowerCase();
  const claimed: { start: number; end: number; group: number }[] = [];
  const isFree = (start: number, end: number) =>
    claimed.every((c) => end <= c.start || start >= c.end);
  const isWordEdge = (i: number) =>
    i <= 0 || i >= text.length || !LETTER_OR_DIGIT.test(text[i - 1]) || !LETTER_OR_DIGIT.test(text[i]);

  const find = (needle: string, from: number, wholeWord: boolean) => {
    for (let i = lower.indexOf(needle, from); i !== -1; i = lower.indexOf(needle, i + 1)) {
      const end = i + needle.length;
      if (isFree(i, end) && (!wholeWord || (isWordEdge(i) && isWordEdge(end)))) return i;
    }
    return -1;
  };

  // Sentence phrases arrive in order, so search on from the previous match
  // first; translation phrases can be anywhere. Whole-word matches are
  // preferred, with a plain substring match as the fallback for languages
  // written without spaces (Japanese).
  let cursor = 0;
  phrases.forEach((phrase, group) => {
    const needle = phrase.toLocaleLowerCase();
    let start = -1;
    for (const wholeWord of [true, false]) {
      if (inOrder) start = find(needle, cursor, wholeWord);
      if (start === -1) start = find(needle, 0, wholeWord);
      if (start !== -1) break;
    }
    if (start === -1) return;
    claimed.push({ start, end: start + needle.length, group });
    cursor = start + needle.length;
  });

  claimed.sort((a, b) => a.start - b.start);
  const segments: AlignedSegment[] = [];
  let pos = 0;
  for (const { start, end, group } of claimed) {
    if (start > pos) segments.push({ text: text.slice(pos, start), group: null });
    segments.push({ text: text.slice(start, end), group });
    pos = end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), group: null });
  return segments;
}
