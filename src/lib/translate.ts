import { ChatPromptTemplate } from '@langchain/core/prompts';
import { structuredModel } from './aiModels';
import { z } from 'zod';

import type { Language } from './languages';

export type { Language };

const TranslationSchema = z.object({
  translation: z.string().describe('The translated text'),
});

const PROMPT_TEMPLATE = ChatPromptTemplate.fromMessages([
  [
    'system',
    'You are a {fromLanguage}-to-{toLanguage} translator. Translate the given {fromLanguage} ' +
      'text into natural, accurate {toLanguage}, preserving the original meaning and tone as ' +
      'closely as possible.',
  ],
  ['user', '{text}'],
]);

export async function translateText(
  text: string,
  fromLanguage: Language,
  toLanguage: Language
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const chain = PROMPT_TEMPLATE.pipe(await structuredModel('translate', TranslationSchema, 0));

  const response = await chain.invoke({ text, fromLanguage, toLanguage });
  return response.translation;
}
