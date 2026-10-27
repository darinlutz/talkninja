import { NextResponse } from 'next/server';
import { aiRateLimit, type AiRateLimit } from '@/lib/rateLimits';
import { aiErrorResponse } from '@/lib/aiErrors';
import { getRandomSentence, type Difficulty } from '@/lib/language';
import { isValidTestDifficulty, MIN_READING_TEST_DIFFICULTY } from '@/lib/readingTest';
import { checkPracticeAccess } from '@/lib/practiceAccess';

export async function POST(request: Request) {
  // Paid subscribers and Admins only (see practiceAccess.ts)
  const access = await checkPracticeAccess();
  if (access.denied) return access.denied;

  // Set just before the AI call; refunded if it fails, so failures don't count
  let limit: AiRateLimit | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    // A level on the 1-8 Difficulty scale, sent as a string or a number
    const requestedComplexity = Number(body.complexity);
    const complexity: Difficulty = isValidTestDifficulty(requestedComplexity)
      ? requestedComplexity
      : MIN_READING_TEST_DIFFICULTY;
    const usedWords: string[] = Array.isArray(body.usedWords) ? body.usedWords : [];
    const usedSentences: string[] = Array.isArray(body.usedSentences) ? body.usedSentences : [];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY is not configured');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    limit = await aiRateLimit(request, 'practiceSentence', access.user);
    if (limit.response) return limit.response;

    const sentence = await limit.track(() => getRandomSentence(complexity, usedWords, usedSentences));

    return NextResponse.json({ success: true, ...sentence }, { status: 200 });
  } catch (error) {
    await limit?.refund();
    console.error('Language practice error:', error);

    return aiErrorResponse(error, 'Failed to generate a new sentence');
  }
}
