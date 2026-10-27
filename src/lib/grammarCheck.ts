import { ChatPromptTemplate } from '@langchain/core/prompts';
import { structuredModel } from './aiModels';
import { z } from 'zod';
import { Language } from './translate';

const TokenSchema = z.object({
  word: z.string().describe('The original word exactly as written by the user, including punctuation'),
  correct: z
    .string()
    .describe(
      'The correctly spelled and grammatical word or short phrase for this position; equal to ' +
        'word when the original is already correct'
    ),
  isCorrect: z
    .boolean()
    .describe('Whether the original word is correctly spelled, diacritically marked, and grammatically appropriate in context'),
});

const GrammarCheckSchema = z.object({
  tokens: z.array(TokenSchema),
});

export type GrammarToken = z.infer<typeof TokenSchema>;

const PROMPT_TEMPLATE = ChatPromptTemplate.fromMessages([
  [
    'system',
    'You are a strict {language} grammar, spelling, and diacritics checker. The user will give you ' +
      'a sentence they wrote in {language}. Split the sentence into words by whitespace, preserving ' +
      'the exact original order and the exact original word count (never merge or split words). For ' +
      'each word, decide whether it is spelled correctly and grammatically correct in context, ' +
      'including correct diacritical marks (for example, Vietnamese tone marks and vowel modifiers ' +
      'such as "Toi" needing to be "Tôi"). If a word is already correct, set isCorrect to true and ' +
      'set correct equal to the original word. If a word is misspelled, missing or wrong diacritics, ' +
      'or grammatically wrong in context, set isCorrect to false and set correct to the corrected ' +
      'word or short phrase that should replace it. Return exactly one token per original word, in ' +
      'the same order.',
  ],
  ['user', '{text}'],
]);

export async function checkGrammar(text: string, language: Language): Promise<GrammarToken[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const chain = PROMPT_TEMPLATE.pipe(await structuredModel('grammarCheck', GrammarCheckSchema, 0));

  const response = await chain.invoke({ text, language });

  // The model occasionally marks a word as incorrect while leaving `correct`
  // identical to `word` (no actual fix to show). Treat those as correct so
  // the UI never renders the same text in both red and blue.
  return response.tokens.map((token) =>
    token.correct === token.word ? { ...token, isCorrect: true } : token
  );
}
