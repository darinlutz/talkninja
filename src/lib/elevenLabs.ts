// ElevenLabs text to speech, server only: the voices chosen in src/lib/voiceConfig.ts for languages that have them
// (Vietnamese's Southern male and female voices first). The key is ELEVENLABS_API_KEY (or ELEVEN_LABS_API_KEY, the
// spelling RacingCoach uses); it and the voice IDs never reach the browser. Callers go through src/lib/speech.ts.
import { assertAiServicesOn } from './aiKillSwitch';

const API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const OUTPUT_FORMAT = 'mp3_44100_128';
const TIMEOUT_MS = 20_000;

export const elevenLabsApiKey = (): string | undefined =>
  process.env.ELEVENLABS_API_KEY?.trim() || process.env.ELEVEN_LABS_API_KEY?.trim() || undefined;

// A failed ElevenLabs request. configProblem is true when the answer means the setup is wrong (a bad key, a voice
// ID the account doesn't have, a model that can't be used), as opposed to ElevenLabs being down or busy.
export class ElevenLabsError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly configProblem: boolean
  ) {
    super(message);
  }
}

export async function elevenLabsSpeech(input: {
  text: string;
  voiceId: string;
  model: string;
  languageCode: string;
}): Promise<Buffer> {
  await assertAiServicesOn();
  const key = elevenLabsApiKey();
  if (!key) throw new ElevenLabsError('ELEVENLABS_API_KEY is not set', null, true);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/${encodeURIComponent(input.voiceId)}?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: input.text, model_id: input.model, language_code: input.languageCode }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new ElevenLabsError(`ElevenLabs request failed: ${error instanceof Error ? error.message : String(error)}`, null, false);
  }
  if (!response.ok) {
    // The body says why (e.g. voice_not_found); it never contains the key
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    const configProblem = [400, 401, 403, 404, 422].includes(response.status);
    throw new ElevenLabsError(`ElevenLabs answered ${response.status}: ${detail}`, response.status, configProblem);
  }
  return Buffer.from(await response.arrayBuffer());
}
