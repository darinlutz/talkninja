// Spoken audio for /api/speak and the Admin page's voice samples: the voice from resolveVoice
// (src/lib/voiceSettings.ts), made by ElevenLabs or OpenAI text to speech. Server only.
//
// Recent audio is kept in this server's memory (never on disk or in the database) so the same words replay without
// another paid call. Its key is everything that changes the sound: provider, voice, model, language and text, so
// audio made for one language or voice is never played for another, and a voice changed on the Admin page is heard
// on the next request.
import { assertAiServicesOn } from './aiKillSwitch';
import { elevenLabsSpeech, ElevenLabsError } from './elevenLabs';
import { reportVoiceProblem, resolveVoice } from './voiceSettings';
import type { Language } from './languages';
import { OPENAI_DEFAULT_VOICES, type ResolvedVoice, type VoiceGender } from './voiceConfig';

const OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';
const OPENAI_TIMEOUT_MS = 20_000;
const CACHE_ENTRIES = 200;
const CACHE_BYTES = 40 * 1024 * 1024;
const cache = new Map<string, Buffer>();
let cacheBytes = 0;
// Audio being made right now, so the same words asked for twice at once are made once
const inFlight = new Map<string, Promise<Buffer>>();
// ElevenLabs voices that just failed, and until when the OpenAI voice is used without trying them again, so a voice
// that's down or misconfigured doesn't make every click wait for it to fail first (a minute for an outage, five for
// a setup problem; a voice changed on the Admin page has a new ID and is tried at once)
const OUTAGE_REST_MS = 60_000;
const CONFIG_PROBLEM_REST_MS = 5 * 60_000;
const restingVoices = new Map<string, number>();

export function speechCacheKey(voice: ResolvedVoice, language: Language, text: string): string {
  return voice.provider === 'elevenlabs'
    ? ['elevenlabs', voice.voiceId, voice.model, voice.languageCode, language, text].join('\u0000')
    : ['openai', voice.voice, OPENAI_TTS_MODEL, language, text].join('\u0000');
}

function fromCache(key: string): Buffer | null {
  const audio = cache.get(key);
  if (!audio) return null;
  // Most recently used last
  cache.delete(key);
  cache.set(key, audio);
  return audio;
}

function remember(key: string, audio: Buffer): void {
  if (audio.length > CACHE_BYTES / 4) return;
  cache.set(key, audio);
  cacheBytes += audio.length;
  while (cache.size > CACHE_ENTRIES || cacheBytes > CACHE_BYTES) {
    const oldest = cache.keys().next().value!;
    cacheBytes -= cache.get(oldest)!.length;
    cache.delete(oldest);
  }
}

export class SpeechError extends Error {
  constructor(message: string, readonly detail: string) {
    super(message);
  }
}

async function openAiSpeech(text: string, voice: string): Promise<Buffer> {
  await assertAiServicesOn();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new SpeechError('Text to speech is not configured', 'OPENAI_API_KEY is not set');
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: OPENAI_TTS_MODEL, voice, input: text, response_format: 'mp3' }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  }).catch((error: unknown) => {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new SpeechError(
      timedOut ? 'The voice took too long to respond. Please try again.' : 'Failed to generate speech',
      `OpenAI TTS request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('OpenAI TTS error:', errorText);
    throw new SpeechError('Failed to generate speech', errorText);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function speak(voice: ResolvedVoice, language: Language, text: string): Promise<Buffer> {
  const key = speechCacheKey(voice, language, text);
  const hit = fromCache(key);
  if (hit) return hit;
  const running = inFlight.get(key);
  if (running) return running;
  const making = (async () => {
    const audio =
      voice.provider === 'elevenlabs'
        ? await elevenLabsSpeech({ text, voiceId: voice.voiceId, model: voice.model, languageCode: voice.languageCode })
        : await openAiSpeech(text, voice.voice);
    remember(key, audio);
    return audio;
  })();
  inFlight.set(key, making);
  try {
    return await making;
  } finally {
    inFlight.delete(key);
  }
}

export type SpeechResult = { audio: Buffer; provider: 'elevenlabs' | 'openai'; fellBack: boolean };

// The text spoken in `language` by `gender` (null: the language's default speaker). If the language's ElevenLabs
// voice fails, the site's OpenAI voice for the same speaker says it instead (and the problem is logged and shown on
// the Admin page), so learners still hear the words.
export async function synthesizeSpeech(input: { text: string; language: Language; gender: VoiceGender | null }): Promise<SpeechResult> {
  const voice = await resolveVoice(input.language, input.gender);
  if (voice.provider === 'openai') {
    return { audio: await speak(voice, input.language, input.text), provider: 'openai', fellBack: false };
  }
  const fallback = (problem: string): ResolvedVoice => ({
    provider: 'openai',
    voice: OPENAI_DEFAULT_VOICES[voice.gender],
    gender: voice.gender,
    problem,
  });
  // Already made by this voice: no need to try it
  const cached = fromCache(speechCacheKey(voice, input.language, input.text));
  if (cached) return { audio: cached, provider: 'elevenlabs', fellBack: false };
  if ((restingVoices.get(voice.voiceId) ?? 0) > Date.now()) {
    const problem = `${input.language}: ElevenLabs ${voice.gender} voice ${voice.voiceId} failed recently`;
    return { audio: await speak(fallback(problem), input.language, input.text), provider: 'openai', fellBack: true };
  }
  try {
    const audio = await speak(voice, input.language, input.text);
    restingVoices.delete(voice.voiceId);
    return { audio, provider: 'elevenlabs', fellBack: false };
  } catch (error) {
    // The emergency stop is not a voice problem: nothing else may run either
    if (!(error instanceof ElevenLabsError)) throw error;
    restingVoices.set(voice.voiceId, Date.now() + (error.configProblem ? CONFIG_PROBLEM_REST_MS : OUTAGE_REST_MS));
    const problem = `${input.language}: ElevenLabs ${voice.gender} voice ${voice.voiceId} failed (${error.message})`;
    console.error(`Voice ${error.configProblem ? 'configuration problem' : 'outage'}: ${problem}. Using OpenAI instead.`);
    reportVoiceProblem(input.language, problem);
    return { audio: await speak(fallback(problem), input.language, input.text), provider: 'openai', fellBack: true };
  }
}

// The Admin page's Play Sample / Test Voice: one ElevenLabs voice exactly as given, with no fallback, so a wrong
// voice ID shows as an error instead of another voice
export async function elevenLabsSample(input: { text: string; voiceId: string; model: string; languageCode: string; language: Language }): Promise<Buffer> {
  const voice: ResolvedVoice = {
    provider: 'elevenlabs',
    voiceId: input.voiceId,
    model: input.model,
    languageCode: input.languageCode,
    gender: 'male',
    source: 'database',
  };
  return speak(voice, input.language, input.text);
}
