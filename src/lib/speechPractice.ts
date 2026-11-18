// Speaking practice on the Reading & Speaking tab (src/components/SpeakPractice.tsx): the locale the browser's
// speech recognition listens in, and how a spoken attempt is scored against the sentence shown. No imports, so the
// client component and the Node tests (scripts/privacy.test.mjs) share it.
//
// The browser does the recognition (the Web Speech API): TalkNinja never receives the audio, and the transcript and
// score stay in the browser. The Privacy Policy says so (src/lib/legal.ts, "Speaking practice").
//
// Grading gives the learner the benefit of the doubt. A recognizer only reports the words it guessed, so a word said
// well can come back spelled a little differently (a missing accent or tone mark, "c" for "k", a doubled letter, a
// number written as digits, a filler word in between). Those small differences cost little, every alternative the
// recognizer offered is tried, and each word keeps its best result across them.

// A score at or above this passes (shown green with a positive chime), like the belt tests
export const SPEAKING_PASS_SCORE = 80;

// The regional tag speech recognition needs for each supported language (src/lib/languages.ts). Recognizers want a
// region (vi-VN, not vi); languages a browser can't recognize (such as Latin) fail with a language error, shown to the
// learner.
export const SPEECH_RECOGNITION_LOCALES: Record<string, string> = {
  Arabic: 'ar-SA',
  Bengali: 'bn-IN',
  'Chinese (Mandarin)': 'zh-CN',
  Dutch: 'nl-NL',
  English: 'en-US',
  'Filipino (Tagalog)': 'fil-PH',
  French: 'fr-FR',
  German: 'de-DE',
  Greek: 'el-GR',
  Gujarati: 'gu-IN',
  Hindi: 'hi-IN',
  Indonesian: 'id-ID',
  Irish: 'ga-IE',
  Italian: 'it-IT',
  Japanese: 'ja-JP',
  Korean: 'ko-KR',
  Latin: 'la',
  Persian: 'fa-IR',
  Polish: 'pl-PL',
  Portuguese: 'pt-BR',
  Punjabi: 'pa-IN',
  Russian: 'ru-RU',
  Spanish: 'es-ES',
  Swahili: 'sw-KE',
  Thai: 'th-TH',
  Turkish: 'tr-TR',
  Urdu: 'ur-PK',
  Vietnamese: 'vi-VN',
};

export function speechLocale(language: string): string {
  return SPEECH_RECOGNITION_LOCALES[language] ?? 'en-US';
}

// Lower case, Unicode-normalized, without punctuation or symbols, single spaces: "Xin chào!" and "xin chào" match.
// Also "ß" as "ss" and katakana as hiragana, which recognizers use interchangeably.
export function normalizeSpokenText(text: string, locale?: string): string {
  return text
    .normalize('NFC')
    .toLocaleLowerCase(locale)
    .replace(/ß/g, 'ss')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// How well each word of the sentence was said: green, light red, bright red in the Speak box
export type SpokenWordGrade = 'correct' | 'close' | 'wrong';

// One piece of the sentence as the Speak box shows it: a word with its grade, or the spacing/punctuation between
// words (grade null), always in the sentence's own spelling, never the recognizer's
export interface SpokenWordPart {
  text: string;
  grade: SpokenWordGrade | null;
}

// A word is correct with at most one small slip (an accent, a look-alike letter, a doubled letter) or with at least
// 75% of it right (so a 4-letter word may miss a letter); at least 40% right is close; anything worse is wrong
export const CORRECT_WORD_SCORE = 0.75;
export const CLOSE_WORD_SCORE = 0.4;
const SMALL_SLIP = 0.5;

// What each kind of difference costs, where a whole wrong letter is 1
const COST = {
  accent: 0.25, // the same letter with a different accent, tone or dot (muốn / muôn / muon)
  mark: 0.5, // a vowel sign or tone mark on its own (Hindi, Thai) missing, added or swapped
  lookAlike: 0.5, // letters that sound alike and recognizers swap (c/k, s/z, i/y, b/v)
  doubled: 0.5, // a doubled letter written once, or the other way round
  between: 0.5, // something extra heard between words (a filler word); not held against either word
  number: 0.15, // per letter of a word heard as digits ("two" as "2")
};

const LOOK_ALIKE = new Set(
  ['ck', 'cq', 'kq', 'sz', 'iy', 'bv', 'dt', 'gj', 'fv', 'vw', 'iı'].map((pair) =>
    Array.from(pair).sort().join('')
  )
);

// Stands for a number the recognizer wrote as digits when the sentence has none: it can stand for any word
const NUMBER = '';

const isMark = (c: string) => /^\p{M}+$/u.test(c);
const baseLetter = (c: string) => c.normalize('NFD').replace(/\p{M}/gu, '');

function substitutionCost(expected: string, heard: string): number {
  if (expected === heard) return 0;
  if (heard === NUMBER) return COST.number;
  if (isMark(expected) && isMark(heard)) return COST.mark;
  const a = baseLetter(expected);
  if (a && a === baseLetter(heard)) return COST.accent;
  if (LOOK_ALIKE.has([expected, heard].sort().join(''))) return COST.lookAlike;
  return 1;
}

function letters(text: string, locale?: string): string[] {
  return Array.from(normalizeSpokenText(text, locale).replace(/ /g, ''));
}

// What was heard, letter by letter; digits become NUMBER when the sentence itself has no digits
function heardLetters(spoken: string, expectedHasDigits: boolean, locale?: string): string[] {
  const words = normalizeSpokenText(spoken, locale).split(' ').filter(Boolean);
  return words.flatMap((w) => (!expectedHasDigits && /\p{N}/u.test(w) ? [NUMBER] : Array.from(w)));
}

interface SentencePiece {
  text: string;
  chars: string[]; // normalized letters, empty for spacing and punctuation
}

// The sentence's words and the text between them. Intl.Segmenter finds words in languages written without spaces
// (Chinese, Japanese, Thai); without it, words are what's between spaces.
function sentencePieces(sentence: string, locale?: string): SentencePiece[] {
  const piece = (text: string): SentencePiece => ({ text, chars: letters(text, locale) });
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: 'word' }) => {
      segment(text: string): Iterable<{ segment: string; isWordLike?: boolean }>;
    };
  }).Segmenter;
  if (Segmenter) {
    try {
      return Array.from(new Segmenter(locale, { granularity: 'word' }).segment(sentence), (s) =>
        s.isWordLike ? piece(s.segment) : { text: s.segment, chars: [] }
      );
    } catch {
      // An unknown locale: fall through to spaces
    }
  }
  return sentence.split(/(\s+)/).filter(Boolean).map(piece);
}

interface WordAlignment {
  pieces: SentencePiece[];
  words: { index: number; chars: string[] }[];
  errors: number[]; // per word, in letters' worth
  reachedWords: number; // how many words the attempt got to (all of them once finished)
}

// Lines up the sentence's letters with what was heard (letters, not the recognizer's words, since recognizers split
// words differently) and adds up each word's mistakes. While the learner is still speaking (finished false), only the
// part of the sentence that best matches what's been heard counts, so words not yet reached aren't mistakes.
function alignWords(expected: string, spoken: string, locale: string | undefined, finished: boolean): WordAlignment | null {
  const pieces = sentencePieces(expected, locale);
  const words = pieces.map((p, i) => ({ index: i, chars: p.chars })).filter((p) => p.chars.length > 0);
  const target: string[] = [];
  const owner: number[] = []; // which word each letter of the sentence belongs to
  words.forEach((w, k) => {
    for (const c of w.chars) {
      target.push(c);
      owner.push(k);
    }
  });
  const heard = heardLetters(spoken, /\p{N}/u.test(target.join('')), locale);
  const n = target.length;
  const m = heard.length;
  if (n === 0 || m === 0) return null;

  // Between two words (or before the first, after the last): extra letters there cost less and count against no word
  const between = (i: number) => i === 0 || i === n || owner[i - 1] !== owner[i];
  const missingCost = (i: number) => // target letter i-1 not heard
    isMark(target[i - 1]) ? COST.mark : i > 1 && target[i - 1] === target[i - 2] ? COST.doubled : 1;
  const extraCost = (i: number, j: number) => { // heard letter j-1 matches nothing in the sentence
    if (isMark(heard[j - 1])) return COST.mark;
    if (j > 1 && heard[j - 1] === heard[j - 2] && heard[j - 1] !== NUMBER) return COST.doubled;
    return between(i) ? COST.between : 1;
  };

  // d[i][j]: the cheapest way to line up the first i letters of the sentence with the first j heard; step records
  // the move that got there (0 pair, 1 sentence letter missing, 2 extra heard letter, 3 a number absorbing a letter)
  const d: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const step: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) {
    d[i][0] = d[i - 1][0] + missingCost(i);
    step[i][0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    d[0][j] = d[0][j - 1] + extraCost(0, j);
    step[0][j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = d[i - 1][j - 1] + substitutionCost(target[i - 1], heard[j - 1]);
      let move = 0;
      const missing = d[i - 1][j] + missingCost(i);
      if (missing < best) [best, move] = [missing, 1];
      const extra = d[i][j - 1] + extraCost(i, j);
      if (extra < best) [best, move] = [extra, 2];
      if (heard[j - 1] === NUMBER) {
        const absorbed = d[i - 1][j] + COST.number;
        if (absorbed < best) [best, move] = [absorbed, 3];
      }
      d[i][j] = best;
      step[i][j] = move;
    }
  }

  let end = n;
  if (!finished) {
    end = 0;
    for (let i = 1; i <= n; i++) if (d[i][m] <= d[end][m] + 1e-9) end = i;
  }

  // Walk the alignment back, charging each difference to its word
  const errors = new Array<number>(words.length).fill(0);
  let i = end;
  let j = m;
  while (i > 0 || j > 0) {
    const move = i === 0 ? 2 : j === 0 ? 1 : step[i][j];
    if (move === 0) {
      errors[owner[i - 1]] += substitutionCost(target[i - 1], heard[j - 1]);
      i--;
      j--;
    } else if (move === 1) {
      errors[owner[i - 1]] += missingCost(i);
      i--;
    } else if (move === 3) {
      errors[owner[i - 1]] += COST.number;
      i--;
    } else {
      if (!between(i)) errors[owner[i - 1]] += extraCost(i, j);
      j--;
    }
  }

  const reachedWords = end === 0 ? 0 : owner[end - 1] + 1;
  return { pieces, words, errors, reachedWords };
}

// 0-1: how much of a word was right
function wordScore(errors: number, length: number): number {
  return Math.max(0, 1 - errors / length);
}

function gradeOf(errors: number, length: number): SpokenWordGrade {
  if (errors <= SMALL_SLIP + 1e-9) return 'correct';
  const score = wordScore(errors, length);
  return score >= CORRECT_WORD_SCORE - 1e-9 ? 'correct' : score >= CLOSE_WORD_SCORE - 1e-9 ? 'close' : 'wrong';
}

// The pieces the Speak box shows: the reached words with their grades and what's between them (spacing collapsed);
// once finished, every word and the closing punctuation too
function shownParts(
  pieces: SentencePiece[],
  grades: Map<number, SpokenWordGrade>,
  lastPiece: number,
  finished: boolean
): SpokenWordPart[] {
  const shown = (finished ? pieces : pieces.slice(0, lastPiece + 1)).map((p, k) => ({
    text: /^\s+$/.test(p.text) ? ' ' : p.text,
    grade: grades.get(k) ?? null,
  }));
  while (shown.length > 0 && shown[0].text === ' ') shown.shift();
  while (shown.length > 0 && shown[shown.length - 1].text === ' ') shown.pop();
  return shown;
}

// Grades each word of the sentence against one transcript. While the learner is still speaking (finished false), only
// the words they've reached so far are returned, so the box fills in as they speak; once they've finished, every word
// is returned and the ones never said are wrong.
export function gradeSpokenWords(
  expected: string,
  spoken: string,
  locale?: string,
  finished = false
): SpokenWordPart[] {
  const alignment = alignWords(expected, spoken, locale, finished);
  if (!alignment || alignment.reachedWords === 0) return [];
  const { pieces, words, errors, reachedWords } = alignment;
  const grades = new Map(
    words.slice(0, reachedWords).map((w, k): [number, SpokenWordGrade] => [w.index, gradeOf(errors[k], w.chars.length)])
  );
  return shownParts(pieces, grades, words[reachedWords - 1].index, finished);
}

// A finished attempt, graded against everything the recognizer offered (its alternatives, and what it heard along the
// way): each word keeps its best result, and the score (0-100) is the share of the sentence's letters said right,
// with every correct word counting in full
export function gradeSpokenAttempt(
  expected: string,
  transcripts: string[],
  locale?: string
): { parts: SpokenWordPart[]; score: number } {
  let best: { pieces: SentencePiece[]; words: WordAlignment['words']; errors: number[] } | null = null;
  for (const transcript of transcripts) {
    if (!transcript.trim()) continue;
    const alignment = alignWords(expected, transcript, locale, true);
    if (!alignment) continue;
    if (!best) {
      best = { pieces: alignment.pieces, words: alignment.words, errors: [...alignment.errors] };
      continue;
    }
    alignment.errors.forEach((e, k) => {
      if (e < best!.errors[k]) best!.errors[k] = e;
    });
  }
  if (!best || best.words.length === 0) return { parts: [], score: 0 };

  let total = 0;
  let earned = 0;
  const grades = new Map<number, SpokenWordGrade>();
  best.words.forEach((w, k) => {
    const grade = gradeOf(best!.errors[k], w.chars.length);
    grades.set(w.index, grade);
    total += w.chars.length;
    earned += w.chars.length * (grade === 'correct' ? 1 : wordScore(best!.errors[k], w.chars.length));
  });
  const score = Math.max(0, Math.min(100, Math.round((earned / total) * 100)));
  return { parts: shownParts(best.pieces, grades, best.words[best.words.length - 1].index, true), score };
}

// 0-100 for one transcript
export function scoreSpokenAttempt(expected: string, spoken: string, locale?: string): number {
  return gradeSpokenAttempt(expected, [spoken], locale).score;
}
