// Which voice speaks each language: the rules, with no imports but languages.ts (also dependency-free), so the Admin
// page's Voice Management section and the tests can use them. src/lib/voiceSettings.ts reads the saved settings from
// "VoiceSettings" and calls chooseVoice; src/lib/speech.ts makes the audio.
//
// A language can have an ElevenLabs voice for male speakers and one for female speakers. Each comes from the Admin
// page (the "VoiceSettings" row) or, when nothing is saved there, the environment variable
// TALKNINJA_<LANGUAGE>_<MALE|FEMALE>_VOICE_ID (e.g. TALKNINJA_VIETNAMESE_MALE_VOICE_ID). Languages without one keep
// the site's default OpenAI voices (alloy for male, nova for female). Voice IDs never leave the server, except to
// Admins on the Admin page.

import { LANGUAGE_CODES, type Language } from './languages';

export const VOICE_GENDERS = ['male', 'female'] as const;
export type VoiceGender = (typeof VOICE_GENDERS)[number];

export function isVoiceGender(value: unknown): value is VoiceGender {
  return value === 'male' || value === 'female';
}

// The site's default voices (OpenAI text to speech), for languages without ElevenLabs voices and as the fallback
export const OPENAI_DEFAULT_VOICES: Record<VoiceGender, string> = { male: 'alloy', female: 'nova' };
// OpenAI's text to speech voices: a client may still name one (older pages sent { voice: 'alloy' | 'nova' })
export const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
const OPENAI_FEMALE_VOICES = new Set(['nova', 'shimmer', 'coral', 'sage', 'ballad']);

// The speaker a request asks for: { gender } from current pages, or the gender of an OpenAI voice name from older
// ones; null when it doesn't say (the language's default voice speaks)
export function requestedGender(body: { gender?: unknown; voice?: unknown }): VoiceGender | null {
  if (isVoiceGender(body.gender)) return body.gender;
  if (typeof body.voice === 'string' && OPENAI_VOICES.includes(body.voice)) {
    return OPENAI_FEMALE_VOICES.has(body.voice) ? 'female' : 'male';
  }
  return null;
}

// ElevenLabs models the Admin page offers. Language support is from https://elevenlabs.io/docs/models (checked
// 2026-11-16): Multilingual v2 has 29 languages and NOT Vietnamese; Flash v2.5 and Turbo v2.5 add Hungarian,
// Norwegian and Vietnamese; v3 has 70+ (including Vietnamese), so it isn't checked per language here. language_code
// is sent with every request so the model doesn't guess the language from the text; models that don't take it
// ignore it.
const MULTILINGUAL_V2 = ['en', 'ja', 'zh', 'de', 'hi', 'fr', 'ko', 'pt', 'it', 'es', 'id', 'nl', 'tr', 'fil', 'pl', 'sv', 'bg', 'ro', 'ar', 'cs', 'el', 'fi', 'hr', 'ms', 'sk', 'da', 'ta', 'uk', 'ru'];
const V2_5 = [...MULTILINGUAL_V2, 'hu', 'no', 'vi'];

export const ELEVENLABS_MODELS: { id: string; label: string; languages: string[] | null }[] = [
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 (fast, lowest cost)', languages: V2_5 },
  { id: 'eleven_v3', label: 'Eleven v3 (most expressive, higher cost)', languages: null },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5 (deprecated by ElevenLabs)', languages: V2_5 },
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 (no Vietnamese)', languages: MULTILINGUAL_V2 },
];
// The model used when none is picked for a language (ELEVENLABS_MODEL_ID changes it). It must speak Vietnamese:
// RacingCoach's default, Multilingual v2, doesn't.
export const DEFAULT_ELEVENLABS_MODEL = 'eleven_flash_v2_5';

export function isElevenLabsModel(value: unknown): value is string {
  return typeof value === 'string' && ELEVENLABS_MODELS.some((m) => m.id === value);
}

// Whether the model is documented to speak the language (true for v3, which isn't checked per language)
export function modelSupportsLanguage(model: string, language: Language): boolean {
  const info = ELEVENLABS_MODELS.find((m) => m.id === model);
  if (!info) return false;
  return info.languages === null || info.languages.includes(elevenLabsLanguageCode(language));
}

// The ISO 639-1 code ElevenLabs takes as language_code (Filipino is 'fil', as ElevenLabs lists it)
export function elevenLabsLanguageCode(language: Language): string {
  return LANGUAGE_CODES[language];
}

// ElevenLabs voice IDs are 20 letters and digits today; this allows a little either side without letting anything
// else (a URL, a path, an API key pasted by mistake) through
export function isValidVoiceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{16,32}$/.test(value);
}

// The environment variable holding a language's voice, e.g. TALKNINJA_VIETNAMESE_MALE_VOICE_ID or
// TALKNINJA_CHINESE_MANDARIN_FEMALE_VOICE_ID
export function voiceEnvName(language: Language, gender: VoiceGender): string {
  const name = language.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `TALKNINJA_${name}_${gender.toUpperCase()}_VOICE_ID`;
}

// A "VoiceSettings" row: what an Admin saved for a language. A null voice ID means "use the environment variable".
export type SavedVoiceSettings = {
  maleVoiceId: string | null;
  femaleVoiceId: string | null;
  maleEnabled: boolean;
  femaleEnabled: boolean;
  // The voice that speaks when a request doesn't name a speaker (the AI Friend, the Translator)
  defaultGender: VoiceGender;
  // null means DEFAULT_ELEVENLABS_MODEL (or ELEVENLABS_MODEL_ID)
  model: string | null;
};

export type VoiceSource = 'database' | 'environment' | 'none';

export type ResolvedVoice =
  | {
      provider: 'elevenlabs';
      voiceId: string;
      model: string;
      languageCode: string;
      // The speaker that will be heard (the other one when the one asked for is off or missing)
      gender: VoiceGender;
      source: VoiceSource;
    }
  | {
      provider: 'openai';
      voice: string;
      gender: VoiceGender;
      // Why no ElevenLabs voice: null when the language simply has none
      problem: string | null;
    };

export type VoiceChoiceInput = {
  language: Language;
  gender: VoiceGender | null;
  saved: SavedVoiceSettings | null;
  env: Record<string, string | undefined>;
  elevenLabsKeySet: boolean;
};

// One gender's voice for the language as configured: its ID and where it came from, and whether it's on
export function configuredVoice(
  language: Language,
  gender: VoiceGender,
  saved: SavedVoiceSettings | null,
  env: Record<string, string | undefined>
): { voiceId: string | null; source: VoiceSource; enabled: boolean } {
  const savedId = gender === 'male' ? saved?.maleVoiceId : saved?.femaleVoiceId;
  const enabled = saved ? (gender === 'male' ? saved.maleEnabled : saved.femaleEnabled) : true;
  if (savedId) return { voiceId: savedId, source: 'database', enabled };
  const envId = env[voiceEnvName(language, gender)]?.trim();
  return envId ? { voiceId: envId, source: 'environment', enabled } : { voiceId: null, source: 'none', enabled };
}

// The model a language's ElevenLabs voices use: the saved one, else ELEVENLABS_MODEL_ID, else the default
export function voiceModel(saved: SavedVoiceSettings | null, env: Record<string, string | undefined>): string {
  if (saved?.model && isElevenLabsModel(saved.model)) return saved.model;
  const fromEnv = env.ELEVENLABS_MODEL_ID?.trim();
  return fromEnv && isElevenLabsModel(fromEnv) ? fromEnv : DEFAULT_ELEVENLABS_MODEL;
}

// The voice for text in `language` spoken by `gender` (null: the language's default speaker). Depends only on the
// language of the text being learned and the speaker, never the learner's own or interface language.
//   1. the asked-for speaker's ElevenLabs voice, when it's set, valid and on
//   2. else the language's other ElevenLabs voice, so the accent stays the same
//   3. else the site's OpenAI voice for that speaker
export function chooseVoice({ language, gender, saved, env, elevenLabsKeySet }: VoiceChoiceInput): ResolvedVoice {
  const defaultGender: VoiceGender = saved?.defaultGender ?? 'male';
  const wanted: VoiceGender = gender ?? defaultGender;
  const other: VoiceGender = wanted === 'male' ? 'female' : 'male';
  const model = voiceModel(saved, env);
  const problems: string[] = [];

  for (const g of [wanted, other]) {
    const voice = configuredVoice(language, g, saved, env);
    if (!voice.voiceId) continue;
    if (!voice.enabled) {
      problems.push(`the ${g} voice is turned off`);
      continue;
    }
    if (!isValidVoiceId(voice.voiceId)) {
      problems.push(`the ${g} voice ID (${voice.source}) is not a valid ElevenLabs voice ID`);
      continue;
    }
    if (!elevenLabsKeySet) {
      problems.push('ELEVENLABS_API_KEY is not set');
      break;
    }
    if (!modelSupportsLanguage(model, language)) {
      problems.push(`the ElevenLabs model ${model} does not speak ${language}`);
      break;
    }
    return {
      provider: 'elevenlabs',
      voiceId: voice.voiceId,
      model,
      languageCode: elevenLabsLanguageCode(language),
      gender: g,
      source: voice.source,
    };
  }
  return {
    provider: 'openai',
    voice: OPENAI_DEFAULT_VOICES[wanted],
    gender: wanted,
    problem: problems.length ? `${language}: ${problems.join('; ')}` : null,
  };
}
