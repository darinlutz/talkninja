import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { Language } from './languages';

// Translates the site's own interface text (buttons, labels, headings) into
// the user's "I speak" language; see PageTranslator. Learning content is
// marked translate="no" and never sent here.

export const MAX_UI_STRINGS_PER_REQUEST = 100;
export const MAX_UI_STRING_LENGTH = 500;

const UiTranslationsSchema = z.object({
  translations: z
    .array(
      z.object({
        id: z.number().describe('The id of the string, exactly as given'),
        translation: z.string().describe('The translated string'),
      })
    )
    .describe('One entry per input string'),
});

const PROMPT_TEMPLATE = ChatPromptTemplate.fromMessages([
  [
    'system',
    'You translate the interface text of TalkNinja, a language learning website, into {toLanguage}. ' +
      'Each input is a short piece of the page: a button, label, heading, menu item or sentence, ' +
      'usually in English. Translate each one into natural {toLanguage} as a native speaker would ' +
      'see it on a website, keeping it about as short as the original. Keep the name "TalkNinja", ' +
      'numbers, email addresses and punctuation such as trailing colons or ellipses. Keep the ' +
      'meaning of belt colors and martial-arts terms. If a string is already in {toLanguage}, or is ' +
      'a proper name, return it unchanged. Return every id exactly once.',
  ],
  ['user', '{strings}'],
]);

// Translations already made, per language. Every visitor sees the same
// interface text, so this saves most calls after the first page views.
const cache = new Map<string, string>();
const cacheKey = (language: Language, text: string) => `${language}\u0000${text}`;

export async function translateUiStrings(texts: string[], toLanguage: Language): Promise<string[]> {
  const missing = Array.from(new Set(texts.filter((text) => !cache.has(cacheKey(toLanguage, text)))));

  if (missing.length > 0) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const model = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0 });
    const chain = PROMPT_TEMPLATE.pipe(model.withStructuredOutput(UiTranslationsSchema));
    const response = await chain.invoke({
      toLanguage,
      strings: JSON.stringify(missing.map((text, id) => ({ id, text }))),
    });

    for (const { id, translation } of response.translations) {
      const original = missing[id];
      if (original !== undefined && translation.trim()) {
        cache.set(cacheKey(toLanguage, original), translation);
      }
    }
  }

  // Anything the model skipped stays as it was
  return texts.map((text) => cache.get(cacheKey(toLanguage, text)) ?? text);
}
