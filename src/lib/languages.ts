// The languages the Language page and its APIs support. Dependency-free so
// both client components and API routes can import it.
export const LANGUAGES = [
  'Arabic',
  'Bengali',
  'Chinese (Mandarin)',
  'Dutch',
  'English',
  'Filipino (Tagalog)',
  'French',
  'German',
  'Greek',
  'Gujarati',
  'Hindi',
  'Indonesian',
  'Irish',
  'Italian',
  'Japanese',
  'Korean',
  'Latin',
  'Persian',
  'Polish',
  'Portuguese',
  'Punjabi',
  'Russian',
  'Spanish',
  'Swahili',
  'Thai',
  'Turkish',
  'Urdu',
  'Vietnamese',
] as const;

export type Language = (typeof LANGUAGES)[number];

// BCP 47 tags for lang attributes (fonts, spellcheck, screen readers)
export const LANGUAGE_CODES: Record<Language, string> = {
  Arabic: 'ar',
  Bengali: 'bn',
  'Chinese (Mandarin)': 'zh',
  Dutch: 'nl',
  English: 'en',
  'Filipino (Tagalog)': 'fil',
  French: 'fr',
  German: 'de',
  Greek: 'el',
  Gujarati: 'gu',
  Hindi: 'hi',
  Indonesian: 'id',
  Irish: 'ga',
  Italian: 'it',
  Japanese: 'ja',
  Korean: 'ko',
  Latin: 'la',
  Persian: 'fa',
  Polish: 'pl',
  Portuguese: 'pt',
  Punjabi: 'pa',
  Russian: 'ru',
  Spanish: 'es',
  Swahili: 'sw',
  Thai: 'th',
  Turkish: 'tr',
  Urdu: 'ur',
  Vietnamese: 'vi',
};

// Each language's name in its own language, for the nav bar's "Supported
// Languages" list
export const NATIVE_NAMES: Record<Language, string> = {
  Arabic: 'العربية',
  Bengali: 'বাংলা',
  'Chinese (Mandarin)': '普通话',
  Dutch: 'Nederlands',
  English: 'English',
  'Filipino (Tagalog)': 'Filipino',
  French: 'Français',
  German: 'Deutsch',
  Greek: 'Ελληνικά',
  Gujarati: 'ગુજરાતી',
  Hindi: 'हिन्दी',
  Indonesian: 'Bahasa Indonesia',
  Irish: 'Gaeilge',
  Italian: 'Italiano',
  Japanese: '日本語',
  Korean: '한국어',
  Latin: 'Latina',
  Persian: 'فارسی',
  Polish: 'Polski',
  Portuguese: 'Português',
  Punjabi: 'ਪੰਜਾਬੀ',
  Russian: 'Русский',
  Spanish: 'Español',
  Swahili: 'Kiswahili',
  Thai: 'ไทย',
  Turkish: 'Türkçe',
  Urdu: 'اردو',
  Vietnamese: 'Tiếng Việt',
};

// The "I speak" / "and want to learn" languages until the user saves their
// own on the Account page's Language Setup
export const DEFAULT_USER_LANGUAGE: Language = 'English';
export const DEFAULT_LEARN_LANGUAGE: Language = 'Vietnamese';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}
