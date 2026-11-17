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
