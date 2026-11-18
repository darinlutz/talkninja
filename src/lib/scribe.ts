// ElevenLabs Scribe speech to text for Speaking practice (the Reading & Speaking tab's Speak button), server only.
//
// The browser streams the microphone straight to ElevenLabs's realtime WebSocket; the audio and the transcript never
// pass through TalkNinja's server. All the server does is ask ElevenLabs for a single-use token (consumed when the
// socket opens, expiring after 15 minutes, its session closed after SCRIBE_SESSION_SECONDS) and build the socket URL
// with it, so ELEVENLABS_API_KEY never reaches the browser. /api/speech-recognition hands the URL out, behind a login
// and aiRateLimit.
//
// Model: scribe_v3_live (ELEVENLABS_SCRIBE_MODEL_ID changes it). Commits are manual: the browser commits once, when
// the learner has finished, so the whole attempt is transcribed with its full context. ELEVENLABS_SCRIBE_ZERO_RETENTION
// =true asks ElevenLabs not to keep the audio or transcript (enable_logging=false; only on plans that allow it).
import { assertAiServicesOn } from './aiKillSwitch';
import { ElevenLabsError, elevenLabsApiKey } from './elevenLabs';
import { SCRIBE_SAMPLE_RATE, SCRIBE_SESSION_SECONDS } from './speechPractice';

const TOKEN_URL = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';
const REALTIME_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
const TIMEOUT_MS = 10_000;

export const DEFAULT_SCRIBE_MODEL = 'scribe_v3_live';

export const scribeModel = (): string => process.env.ELEVENLABS_SCRIBE_MODEL_ID?.trim() || DEFAULT_SCRIBE_MODEL;

// Whether Speaking practice can use Scribe at all (the browser's recognition is used otherwise)
export const scribeConfigured = (): boolean => Boolean(elevenLabsApiKey());

// A WebSocket URL for one Speak attempt in the given language (a Scribe language_code, src/lib/speechPractice.ts)
export async function createScribeSession(languageCode: string): Promise<{ url: string; model: string }> {
  await assertAiServicesOn();
  const key = elevenLabsApiKey();
  if (!key) throw new ElevenLabsError('ELEVENLABS_API_KEY is not set', null, true);

  let response: Response;
  try {
    response = await fetch(`${TOKEN_URL}?max_session_duration_seconds=${SCRIBE_SESSION_SECONDS}`, {
      method: 'POST',
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new ElevenLabsError(`ElevenLabs token request failed: ${error instanceof Error ? error.message : String(error)}`, null, false);
  }
  if (!response.ok) {
    // The body says why (e.g. a key without Speech to Text access); it never contains the key
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new ElevenLabsError(`ElevenLabs token request answered ${response.status}: ${detail}`, response.status, [400, 401, 403, 422].includes(response.status));
  }
  const body = (await response.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== 'string' || !body.token) {
    throw new ElevenLabsError('ElevenLabs token response had no token', response.status, false);
  }

  const model = scribeModel();
  const params = new URLSearchParams({
    model_id: model,
    token: body.token,
    audio_format: `pcm_${SCRIBE_SAMPLE_RATE}`,
    language_code: languageCode,
    commit_strategy: 'manual',
  });
  if (process.env.ELEVENLABS_SCRIBE_ZERO_RETENTION?.trim().toLowerCase() === 'true') params.set('enable_logging', 'false');
  return { url: `${REALTIME_URL}?${params}`, model };
}
