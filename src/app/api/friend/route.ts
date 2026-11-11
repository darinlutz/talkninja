import { NextResponse } from 'next/server';
import { aiRateLimit, type AiRateLimit } from '@/lib/rateLimits';
import { aiErrorResponse } from '@/lib/aiErrors';
import { chatWithFriend, ChatMessage, DEFAULT_FRIEND_DIFFICULTY } from '@/lib/friend';
import { Difficulty } from '@/lib/language';
import { Language } from '@/lib/translate';
import { LANGUAGES } from '@/lib/languages';
import { isValidTestDifficulty } from '@/lib/readingTest';
import { checkPracticeAccess } from '@/lib/practiceAccess';
import { AI_INPUT_LIMITS, tooLongMessage } from '@/lib/aiInputLimits';

interface FriendRequest {
  history: ChatMessage[];
  difficulty?: Difficulty;
  language?: Language;
}

const VALID_LANGUAGES: readonly Language[] = LANGUAGES;

export async function POST(request: Request) {
  // Paid subscribers and Admins only (see practiceAccess.ts)
  const access = await checkPracticeAccess();
  if (access.denied) return access.denied;

  // Set just before the AI call; refunded if it fails, so failures don't count
  let limit: AiRateLimit | null = null;
  try {
    const body: FriendRequest = await request.json();

    if (!Array.isArray(body.history)) {
      return NextResponse.json({ error: 'Missing conversation history' }, { status: 400 });
    }
    const validMessages = body.history.every(
      (m) =>
        m && (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' && m.content.length <= AI_INPUT_LIMITS.friendMessage
    );
    if (!validMessages) {
      return NextResponse.json({ error: tooLongMessage('Each message', AI_INPUT_LIMITS.friendMessage) }, { status: 400 });
    }
    // Only the latest messages go to the model, so a long conversation can't grow the prompt without end
    const history = body.history
      .slice(-AI_INPUT_LIMITS.friendHistory)
      .map((m) => ({ role: m.role, content: m.content }));

    const requestedDifficulty = Number(body.difficulty);
    const difficulty: Difficulty = isValidTestDifficulty(requestedDifficulty)
      ? requestedDifficulty
      : DEFAULT_FRIEND_DIFFICULTY;

    const language: Language = VALID_LANGUAGES.includes(body.language as Language)
      ? (body.language as Language)
      : 'Vietnamese';

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY is not configured');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    limit = await aiRateLimit(request, 'friendChat', access.user);
    if (limit.response) return limit.response;

    const reply = await limit.track(() => chatWithFriend(history, difficulty, language));

    return NextResponse.json({ success: true, reply }, { status: 200 });
  } catch (error) {
    await limit?.refund();
    console.error('Friend chat error:', error);

    return aiErrorResponse(error, 'Failed to get a reply');
  }
}
