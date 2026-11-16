import { NextResponse } from 'next/server';
import { aiErrorResponse } from '@/lib/aiErrors';
import { aiRateLimit, type AiRateLimit } from '@/lib/rateLimits';
import { checkPracticeAccess } from '@/lib/practiceAccess';
import { AI_INPUT_LIMITS, tooLongMessage } from '@/lib/aiInputLimits';
import { assertAiServicesOn } from '@/lib/aiKillSwitch';
import { DEFAULT_LEARN_LANGUAGE, isLanguage } from '@/lib/languages';
import { requestedGender } from '@/lib/voiceConfig';
import { SpeechError, synthesizeSpeech } from '@/lib/speech';

// Text to speech for every tab. Body: { text, language, gender }. language is the language of the text (on the
// learning tabs, the one being learned; without it, the account's saved "want to learn" language); gender is 'male'
// or 'female' (older pages send voice: 'alloy' | 'nova'). The voice is chosen on the server (src/lib/voiceSettings.ts):
// Vietnamese gets its Southern male and female ElevenLabs voices, other languages the default voices. Voice IDs and
// keys never reach the browser; X-Voice-Provider says only which service spoke.
export async function POST(request: Request) {
  // Paid subscribers and Admins only (see practiceAccess.ts)
  const access = await checkPracticeAccess();
  if (access.denied) return access.denied;

  // Set just before the AI call; refunded if it fails, so failures don't count
  let limit: AiRateLimit | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const text = body.text;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Missing text to speak' },
        { status: 400 }
      );
    }
    if (text.length > AI_INPUT_LIMITS.speechText) {
      return NextResponse.json({ error: tooLongMessage('Text to speak', AI_INPUT_LIMITS.speechText) }, { status: 400 });
    }
    if (body.language !== undefined && !isLanguage(body.language)) {
      return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    }
    const language = isLanguage(body.language)
      ? body.language
      : access.user.activeLearningLanguage ?? DEFAULT_LEARN_LANGUAGE;
    const gender = requestedGender(body);

    limit = await aiRateLimit(request, 'speech', access.user);
    if (limit.response) return limit.response;

    await assertAiServicesOn();
    const result = await limit.track(() => synthesizeSpeech({ text, language, gender }));

    return new NextResponse(new Uint8Array(result.audio), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'X-Voice-Provider': result.provider,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    await limit?.refund();
    console.error('Speak error:', error);

    return aiErrorResponse(error instanceof SpeechError ? error.detail : error, 'Failed to generate speech');
  }
}
