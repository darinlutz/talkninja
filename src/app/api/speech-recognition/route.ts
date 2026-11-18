import { NextResponse } from 'next/server';
import { aiErrorResponse } from '@/lib/aiErrors';
import { aiRateLimit, type AiRateLimit } from '@/lib/rateLimits';
import { checkPracticeAccess } from '@/lib/practiceAccess';
import { aiServicesOn } from '@/lib/aiKillSwitch';
import { isLanguage } from '@/lib/languages';
import { scribeLanguageCode } from '@/lib/speechPractice';
import { createScribeSession, scribeConfigured } from '@/lib/scribe';

// Speaking practice (src/components/SpeakPractice.tsx): one ElevenLabs Scribe session for one Speak attempt.
// Body: { language } (the language being learned, the only input, so nothing else needs a size cap). Answers
// { provider: 'elevenlabs', url } with a WebSocket URL holding a single-use token (src/lib/scribe.ts) that the browser
// streams the microphone to, or { provider: 'browser' } when Scribe can't be used (no ElevenLabs key, a language
// Scribe doesn't know, the Emergency AI Stop on), and the page uses the browser's own recognition instead. The audio
// and transcript never come here.
const browserRecognition = () => NextResponse.json({ provider: 'browser' }, { headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request) {
  // Paid subscribers and Admins only (see practiceAccess.ts)
  const access = await checkPracticeAccess();
  if (access.denied) return access.denied;

  // Set just before the paid call; refunded if it fails, so failures don't count
  let limit: AiRateLimit | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (!isLanguage(body.language)) {
      return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    }
    const languageCode = scribeLanguageCode(body.language);
    // Nothing paid happens in these cases, so they aren't counted
    if (!languageCode || !scribeConfigured() || !(await aiServicesOn())) return browserRecognition();

    limit = await aiRateLimit(request, 'speechRecognition', access.user);
    if (limit.response) return limit.response;

    const session = await limit.track(() => createScribeSession(languageCode));
    return NextResponse.json(
      { provider: 'elevenlabs', url: session.url },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    await limit?.refund();
    console.error('Speech recognition session error:', error instanceof Error ? error.message : error);
    return aiErrorResponse(error, 'Speech recognition is unavailable right now');
  }
}
