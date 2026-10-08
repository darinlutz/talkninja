// The languages the Language page and its APIs support. Dependency-free so
// both client components and API routes can import it.
export const LANGUAGES = [
  'Arabic',
  'English',
  'German',
  'Japanese',
  'Korean',
  'Portuguese',
  'Spanish',
  'Vietnamese',
] as const;

export type Language = (typeof LANGUAGES)[number];

// The "I speak" / "and want to learn" languages until the user saves their
// own on the Account page's Language Setup
export const DEFAULT_USER_LANGUAGE: Language = 'English';
export const DEFAULT_LEARN_LANGUAGE: Language = 'Vietnamese';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}
