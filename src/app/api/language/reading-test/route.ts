import { NextResponse } from 'next/server';
import { aiRateLimit, type AiRateLimit } from '@/lib/rateLimits';
import { aiErrorResponse } from '@/lib/aiErrors';
import type { Language } from '@/lib/translate';
import { LANGUAGES } from '@/lib/languages';
import { getCustomAgentInstructions } from '@/lib/customAgentInstructions';
import { pickReadingItem } from '@/lib/wordPickerAgent';
import { checkPracticeAccess } from '@/lib/practiceAccess';
import {
  MAX_READING_TEST_DIFFICULTY,
  MIN_READING_TEST_DIFFICULTY,
} from '@/lib/readingTest';

const VALID_LANGUAGES: readonly Language[] = LANGUAGES;

export async function POST(request: Request) {
  // Paid subscribers and Admins only (see practiceAccess.ts)
  const access = await checkPracticeAccess();
  if (access.denied) return access.denied;

  // Set just before the AI call; refunded if it fails, so failures don't count
  let limit: AiRateLimit | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const learnLanguage: Language = VALID_LANGUAGES.includes(body.learnLanguage)
      ? body.learnLanguage
      : 'Vietnamese';
    const userLanguage: Language = VALID_LANGUAGES.includes(body.userLanguage)
      ? body.userLanguage
      : 'English';
    const difficulty = Number(body.difficulty);

    if (
      !Number.isInteger(difficulty) ||
      difficulty < MIN_READING_TEST_DIFFICULTY ||
      difficulty > MAX_READING_TEST_DIFFICULTY
    ) {
      return NextResponse.json(
        { error: `Difficulty must be a whole number from ${MIN_READING_TEST_DIFFICULTY} to ${MAX_READING_TEST_DIFFICULTY}` },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const avoid = Array.isArray(body.avoid)
      ? body.avoid.filter((s: unknown): s is string => typeof s === 'string').slice(-20)
      : [];

    // Signed-in users' Account page instructions weight what's picked
    const customInstructions = await getCustomAgentInstructions(access.user.id);

    limit = await aiRateLimit(request, 'readingTest', access.user);
    if (limit.response) return limit.response;

    const test = await limit.track(() =>
      pickReadingItem(learnLanguage, userLanguage, difficulty, avoid, customInstructions)
    );

    return NextResponse.json({ success: true, ...test }, { status: 200 });
  } catch (error) {
    await limit?.refund();
    console.error('Reading test error:', error);
    return aiErrorResponse(error, 'Failed to generate a reading test');
  }
}
