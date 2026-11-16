// Voice selection: npm run test:voice
//
// The rules that pick which voice speaks (src/lib/voiceConfig.ts chooseVoice, used by resolveVoice in
// src/lib/voiceSettings.ts), the audio cache key (src/lib/speech.ts), and source guards that keep voice IDs and the
// ElevenLabs key on the server and the Admin voice routes behind the Admin role. No database or network needed.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chooseVoice,
  DEFAULT_ELEVENLABS_MODEL,
  ELEVENLABS_MODELS,
  isValidVoiceId,
  modelSupportsLanguage,
  OPENAI_DEFAULT_VOICES,
  requestedGender,
  voiceEnvName,
} from '../src/lib/voiceConfig.ts';
import { LANGUAGES } from '../src/lib/languages.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Made-up IDs in ElevenLabs' format; the real ones live only in the environment
const MALE = 'AbCdEfGhIjKlMnOpQrSt';
const FEMALE = 'TsRqPoNmLkJiHgFeDcBa';
const ADMIN_MALE = 'ZyXwVuTsRqPoNmLkJi12';
const ENV = { TALKNINJA_VIETNAMESE_MALE_VOICE_ID: MALE, TALKNINJA_VIETNAMESE_FEMALE_VOICE_ID: FEMALE };
const pick = (language, gender, extra = {}) =>
  chooseVoice({ language, gender, saved: null, env: ENV, elevenLabsKeySet: true, ...extra });
const saved = (overrides = {}) => ({
  maleVoiceId: null,
  femaleVoiceId: null,
  maleEnabled: true,
  femaleEnabled: true,
  defaultGender: 'male',
  model: null,
  ...overrides,
});

describe('voice selection', () => {
  test('Vietnamese uses the Southern male and female ElevenLabs voices from the environment', () => {
    const male = pick('Vietnamese', 'male');
    const female = pick('Vietnamese', 'female');
    assert.equal(male.provider, 'elevenlabs');
    assert.equal(male.voiceId, MALE);
    assert.equal(male.gender, 'male');
    assert.equal(male.source, 'environment');
    assert.equal(female.voiceId, FEMALE);
    assert.equal(female.gender, 'female');
    // Pinned to Vietnamese, on a model that speaks it
    assert.equal(male.languageCode, 'vi');
    assert.equal(male.model, DEFAULT_ELEVENLABS_MODEL);
    assert.ok(modelSupportsLanguage(male.model, 'Vietnamese'));
  });

  test('English and French keep the existing default voices', () => {
    for (const language of ['English', 'French']) {
      assert.deepEqual(pick(language, 'male'), { provider: 'openai', voice: 'alloy', gender: 'male', problem: null });
      assert.deepEqual(pick(language, 'female'), { provider: 'openai', voice: 'nova', gender: 'female', problem: null });
    }
  });

  test('every other language keeps the default voices when it has no ElevenLabs voice', () => {
    for (const language of LANGUAGES.filter((l) => l !== 'Vietnamese')) {
      assert.equal(pick(language, 'female').provider, 'openai', language);
    }
  });

  test('switching from Vietnamese to another language changes the voice on the next request', () => {
    // The choice depends only on the language of this request: nothing is remembered between requests
    assert.equal(pick('Vietnamese', 'male').provider, 'elevenlabs');
    assert.equal(pick('Spanish', 'male').provider, 'openai');
    assert.equal(pick('Vietnamese', 'male').provider, 'elevenlabs');
  });

  test('a voice an Admin saved replaces the environment variable; an empty one falls back to it', () => {
    const changed = pick('Vietnamese', 'male', { saved: saved({ maleVoiceId: ADMIN_MALE }) });
    assert.equal(changed.voiceId, ADMIN_MALE);
    assert.equal(changed.source, 'database');
    assert.equal(pick('Vietnamese', 'female', { saved: saved({ maleVoiceId: ADMIN_MALE }) }).voiceId, FEMALE);
  });

  test('an Admin can give any language voices without a code change', () => {
    const voice = pick('Japanese', 'female', { saved: saved({ femaleVoiceId: ADMIN_MALE }) });
    assert.equal(voice.provider, 'elevenlabs');
    assert.equal(voice.languageCode, 'ja');
  });

  test('a disabled voice falls back to the language’s other voice, keeping the accent', () => {
    const voice = pick('Vietnamese', 'male', { saved: saved({ maleEnabled: false }) });
    assert.equal(voice.provider, 'elevenlabs');
    assert.equal(voice.voiceId, FEMALE);
  });

  test('requests that name no speaker use the default voice', () => {
    assert.equal(pick('Vietnamese', null).voiceId, MALE);
    assert.equal(pick('Vietnamese', null, { saved: saved({ defaultGender: 'female' }) }).voiceId, FEMALE);
  });

  test('missing or broken configuration falls back to the default voice and reports why', () => {
    const noKey = pick('Vietnamese', 'female', { elevenLabsKeySet: false });
    assert.equal(noKey.provider, 'openai');
    assert.equal(noKey.voice, OPENAI_DEFAULT_VOICES.female);
    assert.match(noKey.problem, /ELEVENLABS_API_KEY/);

    const bothOff = pick('Vietnamese', 'male', { saved: saved({ maleEnabled: false, femaleEnabled: false }) });
    assert.equal(bothOff.provider, 'openai');
    assert.match(bothOff.problem, /turned off/);

    const badId = chooseVoice({
      language: 'Vietnamese',
      gender: 'male',
      saved: null,
      env: { TALKNINJA_VIETNAMESE_MALE_VOICE_ID: 'https://example.com/not-an-id' },
      elevenLabsKeySet: true,
    });
    assert.equal(badId.provider, 'openai');
    assert.match(badId.problem, /not a valid ElevenLabs voice ID/);

    const wrongModel = pick('Vietnamese', 'male', { saved: saved({ model: 'eleven_multilingual_v2' }) });
    assert.equal(wrongModel.provider, 'openai');
    assert.match(wrongModel.problem, /does not speak Vietnamese/);
  });

  test('Multilingual v2 (RacingCoach’s default) does not speak Vietnamese; the default and v3 do', () => {
    assert.equal(modelSupportsLanguage('eleven_multilingual_v2', 'Vietnamese'), false);
    assert.equal(modelSupportsLanguage('eleven_flash_v2_5', 'Vietnamese'), true);
    assert.equal(modelSupportsLanguage('eleven_v3', 'Vietnamese'), true);
    assert.ok(ELEVENLABS_MODELS.some((m) => m.id === DEFAULT_ELEVENLABS_MODEL));
  });

  test('the speaker comes from gender, or from the old OpenAI voice names', () => {
    assert.equal(requestedGender({ gender: 'female' }), 'female');
    assert.equal(requestedGender({ voice: 'nova' }), 'female');
    assert.equal(requestedGender({ voice: 'alloy' }), 'male');
    assert.equal(requestedGender({ voice: 'not-a-voice' }), null);
    assert.equal(requestedGender({}), null);
  });

  test('environment variable names and voice ID format', () => {
    assert.equal(voiceEnvName('Vietnamese', 'male'), 'TALKNINJA_VIETNAMESE_MALE_VOICE_ID');
    assert.equal(voiceEnvName('Chinese (Mandarin)', 'female'), 'TALKNINJA_CHINESE_MANDARIN_FEMALE_VOICE_ID');
    assert.ok(isValidVoiceId(MALE));
    for (const bad of ['', 'short', 'sk_live_123456789012345678', '../../etc/passwd', 'a'.repeat(40), null]) {
      assert.equal(isValidVoiceId(bad), false, String(bad));
    }
  });
});

describe('audio cache', async () => {
  const { speechCacheKey } = await import('../src/lib/speech.ts');
  test('cached audio is tied to its provider, voice, model, language and text', () => {
    const vi = { provider: 'elevenlabs', voiceId: MALE, model: 'eleven_flash_v2_5', languageCode: 'vi', gender: 'male', source: 'environment' };
    const base = speechCacheKey(vi, 'Vietnamese', 'Xin chào');
    assert.notEqual(base, speechCacheKey({ ...vi, voiceId: FEMALE }, 'Vietnamese', 'Xin chào'), 'another voice');
    assert.notEqual(base, speechCacheKey({ ...vi, model: 'eleven_v3' }, 'Vietnamese', 'Xin chào'), 'another model');
    assert.notEqual(base, speechCacheKey(vi, 'English', 'Xin chào'), 'another language');
    assert.notEqual(base, speechCacheKey({ provider: 'openai', voice: 'alloy', gender: 'male', problem: null }, 'Vietnamese', 'Xin chào'), 'the default voice');
    assert.notEqual(base, speechCacheKey(vi, 'Vietnamese', 'Xin chào!'), 'other text');
    assert.equal(base, speechCacheKey({ ...vi }, 'Vietnamese', 'Xin chào'), 'the same request hits the cache');
  });
});

describe('voice source guards', () => {
  const clientFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name) && read(rel).trimStart().startsWith("'use client'")) clientFiles.push(rel);
    }
  };
  walk('src');

  test('client code never sees the ElevenLabs key or the voice environment variables', () => {
    assert.ok(clientFiles.length > 10);
    for (const file of clientFiles) {
      const text = read(file);
      // Naming a variable in a message is fine; reading it is not
      assert.doesNotMatch(text, /process\.env\.(ELEVEN|TALKNINJA_)|elevenLabsApiKey|api\.elevenlabs\.io/, file);
      // Only types may come from the server-side voice modules
      assert.doesNotMatch(text, /^import (?!type)[^;]*from '@\/lib\/(voiceSettings|speech|elevenLabs)'/m, file);
    }
  });

  test('no voice ID is written in the source', () => {
    for (const file of ['src/lib/voiceConfig.ts', 'src/lib/voiceSettings.ts', 'src/lib/speech.ts', 'src/app/api/speak/route.ts']) {
      const literals = [...read(file).matchAll(/'([A-Za-z0-9]{20})'/g)].map((m) => m[1]);
      assert.deepEqual(literals.filter((l) => /\d/.test(l) && /[A-Z]/.test(l)), [], file);
    }
  });

  test('/api/speak picks the voice on the server and tells the browser only the provider', () => {
    const speak = read('src/app/api/speak/route.ts');
    assert.match(speak, /synthesizeSpeech\(\{ text, language, gender \}\)/);
    assert.match(speak, /'X-Voice-Provider': result\.provider/);
    assert.doesNotMatch(speak, /voiceId/);
  });

  test('the Admin voice routes are for Admins only, and every other method is a 404', () => {
    for (const file of ['src/app/api/admin/voices/route.ts', 'src/app/api/admin/voices/sample/route.ts']) {
      const text = read(file);
      const handlers = [...text.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
      assert.ok(handlers.length > 0, file);
      for (const name of handlers) {
        const body = text.slice(text.indexOf(`export async function ${name}(`));
        assert.match(body.slice(0, 200), /const access = await checkAdminAccess\(\);\s*if \(access\.denied\) return access\.denied;/, `${file} ${name}`);
      }
      assert.match(text, /export \{ adminNotFound as /, file);
    }
  });

  test('the learning tabs send the language of the text and the speaker', () => {
    assert.match(read('src/lib/languageTestClient.ts'), /JSON\.stringify\(\{ text, gender: voice, language \}\)/);
    for (const file of ['src/components/Training.tsx', 'src/components/ReadingTest.tsx']) {
      assert.match(read(file), /speakText\(text, voice, learnLanguage\)/, file);
    }
    assert.match(read('src/components/WritingTest.tsx'), /speakText\(text, voice, wordLanguage\)/);
    const page = read('src/app/language/page.tsx');
    assert.doesNotMatch(page, /JSON\.stringify\(\{ text \}\)/, 'every /api/speak call on the Language page names the language');
  });
});
