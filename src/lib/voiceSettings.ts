// The Admin page's Voice Management settings ("VoiceSettings", one row per language an Admin changed; created by
// ensureUserSchema) and resolveVoice, the one place the site decides which voice speaks. The rules are in
// src/lib/voiceConfig.ts; the environment variables there are the starting values and the fallback, so a language
// with no row uses them, and Reset (deleting the row) goes back to them. Settings are read at most every 5 seconds
// per server, so a change applies to the next audio request without a redeploy.
import { query } from './db';
import { ensureUserSchema } from './users';
import { elevenLabsApiKey } from './elevenLabs';
import { LANGUAGES, type Language } from './languages';
import {
  chooseVoice,
  configuredVoice,
  isVoiceGender,
  voiceModel,
  VOICE_GENDERS,
  voiceEnvName,
  type ResolvedVoice,
  type SavedVoiceSettings,
  type VoiceGender,
  type VoiceSource,
} from './voiceConfig';

const CACHE_MS = 5_000;
let cached: { at: number; rows: Map<string, SavedVoiceSettings> } | null = null;

// The latest setup problem each language's voices hit on this server (a missing key, a voice ID ElevenLabs doesn't
// know), for the Admin page. Cleared when the language's settings are saved or reset.
const configErrors = new Map<Language, { message: string; at: string }>();

export function reportVoiceProblem(language: Language, message: string): void {
  configErrors.set(language, { message, at: new Date().toISOString() });
}

function toSaved(row: Record<string, unknown>): SavedVoiceSettings {
  return {
    maleVoiceId: (row.male_voice_id as string | null) ?? null,
    femaleVoiceId: (row.female_voice_id as string | null) ?? null,
    maleEnabled: row.male_enabled !== false,
    femaleEnabled: row.female_enabled !== false,
    defaultGender: isVoiceGender(row.default_gender) ? row.default_gender : 'male',
    model: (row.model as string | null) ?? null,
  };
}

async function savedSettings(): Promise<Map<string, SavedVoiceSettings>> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rows;
  await ensureUserSchema();
  const rows = await query('SELECT * FROM "VoiceSettings"');
  const map = new Map(rows.map((row) => [row.language as string, toSaved(row)]));
  cached = { at: Date.now(), rows: map };
  return map;
}

// The voice for text in `language` spoken by `gender` (null: the language's default speaker). The language is that
// of the text, which on the learning tabs is the language being learned. Logs the choice (never the API key).
export async function resolveVoice(language: Language, gender: VoiceGender | null): Promise<ResolvedVoice> {
  let saved: SavedVoiceSettings | null = null;
  try {
    saved = (await savedSettings()).get(language) ?? null;
  } catch (error) {
    // The environment variables still give the voices; the database being unreadable mustn't silence the site
    console.error('Voice settings could not be read; using the environment variables:', error);
  }
  const voice = chooseVoice({ language, gender, saved, env: process.env, elevenLabsKeySet: Boolean(elevenLabsApiKey()) });
  if (voice.provider === 'elevenlabs') {
    console.log(`Voice: ${language} ${gender ?? 'default'} -> ElevenLabs ${voice.gender} voice ${voice.voiceId} (${voice.source}, ${voice.model})`);
  } else {
    if (voice.problem) {
      console.error(`Voice configuration problem: ${voice.problem}. Using OpenAI ${voice.voice}.`);
      reportVoiceProblem(language, voice.problem);
    }
    console.log(`Voice: ${language} ${gender ?? 'default'} -> OpenAI ${voice.voice}`);
  }
  return voice;
}

export type AdminVoiceRow = {
  language: Language;
  voices: Record<VoiceGender, { voiceId: string | null; source: VoiceSource; enabled: boolean; envName: string }>;
  defaultGender: VoiceGender;
  model: string;
  modelSaved: boolean;
  // Whether an Admin saved anything for it (Reset goes back to the environment variables)
  customized: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  lastProblem: { message: string; at: string } | null;
};

// Every supported language's voices as they are now, for the Admin page (Admins only: it shows the voice IDs)
export async function listVoiceSettingsForAdmin(): Promise<AdminVoiceRow[]> {
  await ensureUserSchema();
  const rows = await query(
    `SELECT v.*, u.user_name FROM "VoiceSettings" v LEFT JOIN "Users" u ON u.id = v.updated_by`
  );
  const byLanguage = new Map(rows.map((row) => [row.language as string, row]));
  return LANGUAGES.map((language) => {
    const row = byLanguage.get(language);
    const saved = row ? toSaved(row) : null;
    const voices = Object.fromEntries(
      VOICE_GENDERS.map((g) => [g, { ...configuredVoice(language, g, saved, process.env), envName: voiceEnvName(language, g) }])
    ) as AdminVoiceRow['voices'];
    return {
      language,
      voices,
      defaultGender: saved?.defaultGender ?? 'male',
      model: voiceModel(saved, process.env),
      modelSaved: Boolean(saved?.model),
      customized: Boolean(row),
      updatedAt: row?.updated_at instanceof Date ? row.updated_at.toISOString() : null,
      updatedBy: (row?.user_name as string | null) ?? null,
      lastProblem: configErrors.get(language) ?? null,
    };
  });
}

export type VoiceSettingsInput = {
  maleVoiceId: string | null;
  femaleVoiceId: string | null;
  maleEnabled: boolean;
  femaleEnabled: boolean;
  defaultGender: VoiceGender;
  model: string | null;
};

export async function saveVoiceSettings(language: Language, input: VoiceSettingsInput, userId: number): Promise<void> {
  await ensureUserSchema();
  await query(
    `INSERT INTO "VoiceSettings" (language, male_voice_id, female_voice_id, male_enabled, female_enabled,
       default_gender, model, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
     ON CONFLICT (language) DO UPDATE SET male_voice_id = EXCLUDED.male_voice_id,
       female_voice_id = EXCLUDED.female_voice_id, male_enabled = EXCLUDED.male_enabled,
       female_enabled = EXCLUDED.female_enabled, default_gender = EXCLUDED.default_gender, model = EXCLUDED.model,
       updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [
      language,
      input.maleVoiceId,
      input.femaleVoiceId,
      input.maleEnabled,
      input.femaleEnabled,
      input.defaultGender,
      input.model,
      userId,
    ]
  );
  cached = null;
  configErrors.delete(language);
}

// Back to the environment variables' voices and the default model
export async function resetVoiceSettings(language: Language): Promise<void> {
  await ensureUserSchema();
  await query('DELETE FROM "VoiceSettings" WHERE language = $1', [language]);
  cached = null;
  configErrors.delete(language);
}
