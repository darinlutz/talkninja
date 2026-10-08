import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { getVocabSheetCsvUrl } from './vocabSheet';
import { difficultyGuide, MAX_READING_TEST_DIFFICULTY } from './readingTest';

// The sheet lays out several categories side-by-side (English | Vietnamese
// column pairs, separated by blank spacer columns): row 1 holds the category
// names, row 2 the "English"/"Vietnamese" sub-headers, row 3 is blank, and
// data starts at row 4 (all 0-indexed).
const CATEGORY_HEADER_ROW = 1;
const DATA_START_ROW = 4;

// Pre-made example sentences the user already knows; excluded from the
// "vocabulary to build a new sentence from" pool, since the goal is a sentence
// they haven't already memorized.
const EXCLUDED_CATEGORY = 'SENTENCES';

// A level on the 1-8 Difficulty scale shared with the test tabs (see
// readingTest.ts)
export type Difficulty = number;

// More words per category at higher levels: 3 at level 1 up to 10 at level 8
function maxWordsPerCategory(difficulty: Difficulty): number {
  return difficulty + 2;
}

function difficultyInstructions(difficulty: Difficulty): string {
  return (
    `Write the sentence at difficulty level ${difficulty}/${MAX_READING_TEST_DIFFICULTY} ` +
    `(1 = very easy, ${MAX_READING_TEST_DIFFICULTY} = very hard): ${difficultyGuide(difficulty)}`
  );
}

export interface VocabEntry {
  category: string;
  english: string;
  vietnamese: string;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (char === '\r') {
      i++;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }

    field += char;
    i++;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// The sheet can be read but isn't laid out the way fetchVocabulary expects.
export class SheetFormatError extends Error {
  constructor() {
    super(
      'This Google Sheet is not in the vocabulary format: category names in row 2, ' +
        '"English" and "Vietnamese" column headers in row 3, and words starting in row 5.'
    );
  }
}

// Defaults to the sheet connected on the Account page, or the built-in one.
export async function fetchVocabulary(csvUrl?: string): Promise<VocabEntry[]> {
  const res = await fetch(csvUrl ?? (await getVocabSheetCsvUrl()), { cache: 'no-store' });
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new Error(
      'The vocabulary sheet was not found or is not shared. In Google Sheets, set sharing to "Anyone with the link".'
    );
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch the vocabulary sheet (${res.status})`);
  }
  // A sheet that isn't shared publicly redirects to Google's sign-in page
  if (!res.headers.get('content-type')?.includes('text/csv')) {
    throw new Error(
      'The vocabulary sheet is not publicly readable. In Google Sheets, set sharing to "Anyone with the link".'
    );
  }
  const text = await res.text();
  const rows = parseCsv(text);

  const headerRow = rows[CATEGORY_HEADER_ROW] ?? [];
  const subHeaderRow = rows[CATEGORY_HEADER_ROW + 1] ?? [];
  const categories: Array<{ name: string; col: number }> = [];
  headerRow.forEach((cell, col) => {
    const name = cell.trim();
    if (name) categories.push({ name, col });
  });

  // Every category must sit over an "English" | "Vietnamese" column pair
  const isPairHeader = (col: number) =>
    (subHeaderRow[col] ?? '').trim().toLowerCase() === 'english' &&
    (subHeaderRow[col + 1] ?? '').trim().toLowerCase() === 'vietnamese';
  if (categories.length === 0 || !categories.every(({ col }) => isPairHeader(col))) {
    throw new SheetFormatError();
  }

  const entries: VocabEntry[] = [];
  for (let r = DATA_START_ROW; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    for (const { name, col } of categories) {
      const english = (row[col] ?? '').trim();
      const vietnamese = (row[col + 1] ?? '').trim();
      if (english && vietnamese) {
        entries.push({ category: name, english, vietnamese });
      }
    }
  }

  if (entries.length === 0) {
    throw new SheetFormatError();
  }

  return entries;
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

// Prefers vocabulary words that haven't appeared in a recent sentence yet,
// only falling back to already-used words once a category's fresh words run
// out, so the same common words don't dominate every sentence.
function sampleVocabulary(
  entries: VocabEntry[],
  difficulty: Difficulty,
  usedWords: Set<string>
): VocabEntry[] {
  const byCategory = new Map<string, VocabEntry[]>();
  for (const entry of entries) {
    if (entry.category === EXCLUDED_CATEGORY) continue;
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }

  const maxPerCategory = maxWordsPerCategory(difficulty);
  const sample: VocabEntry[] = [];
  for (const list of byCategory.values()) {
    const unused = list.filter((entry) => !usedWords.has(entry.vietnamese));
    const used = list.filter((entry) => usedWords.has(entry.vietnamese));
    const ordered = [...shuffle(unused), ...shuffle(used)];
    sample.push(...ordered.slice(0, maxPerCategory));
  }

  return sample;
}

function formatVocabularyForPrompt(entries: VocabEntry[]): string {
  const byCategory = new Map<string, VocabEntry[]>();
  for (const entry of entries) {
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }

  return Array.from(byCategory.entries())
    .map(([category, items]) => {
      const wordList = items.map((i) => `${i.vietnamese} (${i.english})`).join(', ');
      return `${category}: ${wordList}`;
    })
    .join('\n');
}

const SentenceSchema = z.object({
  vietnamese: z
    .string()
    .describe('A new Vietnamese practice sentence, written with correct diacritics'),
  english: z.string().describe('The natural English translation of the Vietnamese sentence'),
  wordsUsed: z
    .array(z.string())
    .describe(
      'The Vietnamese vocabulary words from the list above (exactly as written there) that you used in the sentence'
    ),
});

const promptTemplate = ChatPromptTemplate.fromMessages([
  [
    'system',
    'You are a Vietnamese language tutor helping a student practice with words they already know.\n' +
      'Using ONLY the vocabulary listed below (you may add minimal grammatical glue words such as ' +
      '"là", "không", or "của" only if strictly necessary for correct grammar), construct ONE new, ' +
      'natural Vietnamese sentence the student has not necessarily seen before. Vary the grammar and ' +
      'topic each time.\n\n' +
      '{difficultyInstructions}\n\n' +
      'Sentences already given to the student recently (do NOT repeat any of these or anything ' +
      'nearly identical):\n{recentSentences}\n\n' +
      'Known vocabulary:\n{vocabulary}',
  ],
  ['user', 'Give me a new sentence to practice.'],
]);

const LanguageState = Annotation.Root({
  difficulty: Annotation<Difficulty>,
  usedWords: Annotation<string[]>,
  usedSentences: Annotation<string[]>,
  vocabulary: Annotation<VocabEntry[]>,
  vietnamese: Annotation<string>,
  english: Annotation<string>,
  wordsUsed: Annotation<string[]>,
});

type LanguageStateType = typeof LanguageState.State;

async function fetchVocabularyNode(): Promise<Partial<LanguageStateType>> {
  const vocabulary = await fetchVocabulary();
  return { vocabulary };
}

async function generateSentenceNode(
  state: LanguageStateType
): Promise<Partial<LanguageStateType>> {
  const sample = sampleVocabulary(state.vocabulary, state.difficulty, new Set(state.usedWords));
  const vocabularyText = formatVocabularyForPrompt(sample);
  const recentSentences =
    state.usedSentences.length > 0 ? state.usedSentences.join('\n') : 'None yet.';

  const model = new ChatOpenAI({ model: 'gpt-4o', temperature: 1 });
  const structuredModel = model.withStructuredOutput(SentenceSchema);
  const chain = promptTemplate.pipe(structuredModel);

  const response = await chain.invoke({
    vocabulary: vocabularyText,
    difficultyInstructions: difficultyInstructions(state.difficulty),
    recentSentences,
  });
  return {
    vietnamese: response.vietnamese,
    english: response.english,
    wordsUsed: response.wordsUsed,
  };
}

// fetchVocabulary -> generateSentence today; future steps (e.g. spaced-repetition
// tracking) can be added as additional nodes in this graph.
const graph = new StateGraph(LanguageState)
  .addNode('fetchVocabulary', fetchVocabularyNode)
  .addNode('generateSentence', generateSentenceNode)
  .addEdge(START, 'fetchVocabulary')
  .addEdge('fetchVocabulary', 'generateSentence')
  .addEdge('generateSentence', END)
  .compile();

export async function getRandomSentence(
  difficulty: Difficulty = 1,
  usedWords: string[] = [],
  usedSentences: string[] = []
): Promise<{ vietnamese: string; english: string; wordsUsed: string[] }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const finalState = await graph.invoke({ difficulty, usedWords, usedSentences });

  if (!finalState.vietnamese || !finalState.english) {
    throw new Error('Language graph did not return a sentence');
  }

  return {
    vietnamese: finalState.vietnamese,
    english: finalState.english,
    wordsUsed: finalState.wordsUsed ?? [],
  };
}

export type WordCategory =
  | 'all'
  | 'nouns'
  | 'verbs'
  | 'adjectives'
  | 'numbers'
  | 'food'
  | 'colors'
  | 'classifiers'
  | 'clothing'
  | 'conjunctionsPrepositions'
  | 'focus'
  | 'foodDrink'
  | 'household'
  | 'houseHome'
  | 'peopleAnimals'
  | 'places'
  | 'pronouns'
  | 'things'
  | 'timeRelated'
  | 'activities'
  | 'fastPhrases'
  | 'generalPhrases';

// Each category maps directly to a section header in the vocabulary sheet;
// picking a category pulls only from that section's column pair.
const WORD_CATEGORY_SHEET_NAME: Partial<Record<WordCategory, string>> = {
  nouns: 'NOUNS',
  verbs: 'VERBS',
  adjectives: 'ADJECTIVES',
  numbers: 'NUMBERS & MONEY',
  food: 'FOOD & DRINK',
  colors: 'COLORS',
  classifiers: 'CLASSIFIERS',
  clothing: 'CLOTHING',
  conjunctionsPrepositions: 'CONJUNCTIONS & PREPOSITIONS',
  focus: 'FOCUS',
  foodDrink: 'FOOD & DRINK',
  household: 'HOUSEHOLD',
  houseHome: 'HOUSE & HOME',
  peopleAnimals: 'PEOPLE & ANIMALS',
  places: 'PLACES',
  pronouns: 'PRONOUNS',
  things: 'THINGS',
  timeRelated: 'TIME RELATED',
  activities: 'ACTIVITIES',
  fastPhrases: 'FAST PHRASES',
  generalPhrases: 'GENERAL PHRASES',
};

function poolForCategory(entries: VocabEntry[], category: WordCategory): VocabEntry[] {
  if (category === 'all') {
    return entries.filter((entry) => entry.category !== EXCLUDED_CATEGORY);
  }
  const sheetCategory = WORD_CATEGORY_SHEET_NAME[category];
  return entries.filter((entry) => entry.category.trim().toUpperCase() === sheetCategory);
}

// Draws a real word the student already knows from their vocabulary sheet
// (rather than letting the model invent one), preferring words not in
// usedWords so the same common words don't keep coming up; once every word
// in the category has been used, the pool resets so words can recycle.
export async function getRandomWord(
  category: WordCategory = 'all',
  usedWords: string[] = []
): Promise<{ vietnamese: string; english: string }> {
  const entries = await fetchVocabulary();
  const pool = poolForCategory(entries, category);

  if (pool.length === 0) {
    throw new Error(`No ${category} found in the vocabulary sheet`);
  }

  const usedSet = new Set(usedWords);
  const unused = pool.filter((entry) => !usedSet.has(entry.vietnamese));
  const candidates = unused.length > 0 ? unused : pool;
  const choice = candidates[Math.floor(Math.random() * candidates.length)];

  return { vietnamese: choice.vietnamese, english: choice.english };
}

// Lets callers show the student how many words are available in a category
// before they commit to practicing it.
export async function getWordCountForCategory(category: WordCategory = 'all'): Promise<number> {
  const entries = await fetchVocabulary();
  return poolForCategory(entries, category).length;
}

export const VALID_WORD_CATEGORIES: WordCategory[] = [
  'all',
  'nouns',
  'verbs',
  'adjectives',
  'numbers',
  'food',
  'colors',
  'classifiers',
  'clothing',
  'conjunctionsPrepositions',
  'focus',
  'foodDrink',
  'household',
  'houseHome',
  'peopleAnimals',
  'places',
  'pronouns',
  'things',
  'timeRelated',
  'activities',
  'fastPhrases',
  'generalPhrases',
];
