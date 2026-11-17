// Speaking practice on the Reading & Speaking tab (src/components/SpeakPractice.tsx): the locale the browser's
// speech recognition listens in, and how a spoken attempt is scored against the sentence shown. No imports, so the
// client component and the Node tests (scripts/privacy.test.mjs) share it.
//
// The browser does the recognition (the Web Speech API): TalkNinja never receives the audio, and the transcript and
// score stay in the browser. The Privacy Policy says so (src/lib/legal.ts, "Speaking practice").

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

// Lower case, Unicode-normalized, without punctuation or symbols, single spaces: "Xin chào!" and "xin chào" match
export function normalizeSpokenText(text: string, locale?: string): string {
  return text
    .normalize('NFC')
    .toLocaleLowerCase(locale)
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a: string[], b: string[]): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

// 0-100: how closely what was heard matches what was expected, by characters (so it works for languages written
// without spaces, like Chinese, Japanese and Thai, and gives partial credit for a nearly right word). Spaces are
// ignored, since recognizers split words differently.
export function scoreSpokenAttempt(expected: string, spoken: string, locale?: string): number {
  const target = Array.from(normalizeSpokenText(expected, locale).replace(/ /g, ''));
  const heard = Array.from(normalizeSpokenText(spoken, locale).replace(/ /g, ''));
  if (target.length === 0) return 0;
  if (heard.length === 0) return 0;
  const distance = editDistance(target, heard);
  const score = Math.round((1 - distance / Math.max(target.length, heard.length)) * 100);
  return Math.max(0, Math.min(100, score));
}

// How well each word of the sentence was said: green, light red, bright red in the Speak box
export type SpokenWordGrade = 'correct' | 'close' | 'wrong';

// One piece of the sentence as the Speak box shows it: a word with its grade, or the spacing/punctuation between
// words (grade null), always in the sentence's own spelling, never the recognizer's
export interface SpokenWordPart {
  text: string;
  grade: SpokenWordGrade | null;
}

// A word with at least 80% of its letters right is correct (so a word of 5+ letters may have one slip, 10+ two;
// shorter words must be exact); at least half right is close; anything worse is wrong
export const CORRECT_WORD_SCORE = 0.8;
export const CLOSE_WORD_SCORE = 0.5;

interface SentencePiece {
  text: string;
  chars: string[]; // normalized letters, empty for spacing and punctuation
}

// The sentence's words and the text between them. Intl.Segmenter finds words in languages written without spaces
// (Chinese, Japanese, Thai); without it, words are what's between spaces.
function sentencePieces(sentence: string, locale?: string): SentencePiece[] {
  const piece = (text: string): SentencePiece => ({
    text,
    chars: Array.from(normalizeSpokenText(text, locale).replace(/ /g, '')),
  });
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

// Grades each word of the sentence by lining up its letters with what was heard (letters, not the recognizer's
// words, since recognizers split words differently). While the learner is still speaking (finished false), only the
// words they've reached so far are returned, so the box fills in as they speak; once they've finished, every word is
// returned and the ones never said are wrong.
export function gradeSpokenWords(
  expected: string,
  spoken: string,
  locale?: string,
  finished = false
): SpokenWordPart[] {
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
  const heard = Array.from(normalizeSpokenText(spoken, locale).replace(/ /g, ''));
  const n = target.length;
  const m = heard.length;
  if (n === 0 || m === 0) return [];

  // Edit distance between every prefix of the sentence and every prefix of what was heard
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => {
    const row = new Array<number>(m + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (target[i - 1] === heard[j - 1] ? 0 : 1)
      );
    }
  }

  // Finished: the whole sentence. Still speaking: the longest part of the sentence that best matches what's been
  // heard, so words not yet reached don't count as mistakes.
  let end = n;
  if (!finished) {
    end = 0;
    for (let i = 1; i <= n; i++) if (d[i][m] <= d[end][m]) end = i;
  }

  // Walk the alignment back, counting each word's mistakes; an extra letter counts against the word it follows
  const errors = new Array<number>(words.length).fill(0);
  let i = end;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (target[i - 1] === heard[j - 1] ? 0 : 1)) {
      if (target[i - 1] !== heard[j - 1]) errors[owner[i - 1]]++;
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      errors[owner[i - 1]]++;
      i--;
    } else {
      errors[i > 0 ? owner[i - 1] : 0]++;
      j--;
    }
  }

  const reachedWords = end === 0 ? 0 : owner[end - 1] + 1;
  if (reachedWords === 0) return [];
  const lastPiece = words[reachedWords - 1].index;
  const gradeOf = new Map(
    words.slice(0, reachedWords).map((w, k): [number, SpokenWordGrade] => {
      const score = 1 - errors[k] / w.chars.length;
      return [w.index, score >= CORRECT_WORD_SCORE ? 'correct' : score >= CLOSE_WORD_SCORE ? 'close' : 'wrong'];
    })
  );
  // The reached words and what's between them (spacing collapsed); once finished, the closing punctuation too
  const shown = (finished ? pieces : pieces.slice(0, lastPiece + 1)).map((p, k) => ({
    text: /^\s+$/.test(p.text) ? ' ' : p.text,
    grade: gradeOf.get(k) ?? null,
  }));
  while (shown.length > 0 && shown[0].text === ' ') shown.shift();
  while (shown.length > 0 && shown[shown.length - 1].text === ' ') shown.pop();
  return shown;
}

// The best score among the recognizer's alternatives, and the transcript it came from
export function bestSpokenAttempt(
  expected: string,
  alternatives: string[],
  locale?: string
): { transcript: string; score: number } {
  let best = { transcript: alternatives[0] ?? '', score: 0 };
  for (const transcript of alternatives) {
    const score = scoreSpokenAttempt(expected, transcript, locale);
    if (score > best.score) best = { transcript, score };
  }
  return best;
}
