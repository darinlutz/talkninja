import { NextResponse } from 'next/server';
import { aiRateLimit, type AiRateLimit } from '@/lib/rateLimits';
import { aiErrorResponse } from '@/lib/aiErrors';
import { checkGrammar } from '@/lib/grammarCheck';
import { LANGUAGES, type Language } from '@/lib/languages';
import { checkPracticeAccess } from '@/lib/practiceAccess';
import { AI_INPUT_LIMITS, tooLongMessage } from '@/lib/aiInputLimits';

const VALID_LANGUAGES: readonly Language[] = LANGUAGES;

export async function POST(request: Request) {
  // Paid subscribers and Admins only (see practiceAccess.ts)
  const access = await checkPracticeAccess();
  if (access.denied) return access.denied;

  // Set just before the AI call; refunded if it fails, so failures don't count
  let limit: AiRateLimit | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const text = body.text;
    const language: Language = VALID_LANGUAGES.includes(body.language) ? body.language : 'Vietnamese';

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Missing text to check' }, { status: 400 });
    }
    if (text.length > AI_INPUT_LIMITS.friendMessage) {
      return NextResponse.json({ error: tooLongMessage('Text to check', AI_INPUT_LIMITS.friendMessage) }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY is not configured');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    limit = await aiRateLimit(request, 'grammarCheck', access.user);
    if (limit.response) return limit.response;

    const tokens = await limit.track(() => checkGrammar(text, language));

    return NextResponse.json({ success: true, tokens }, { status: 200 });
  } catch (error) {
    await limit?.refund();
    console.error('Grammar check error:', error);

    return aiErrorResponse(error, 'Failed to check grammar');
  }
}
