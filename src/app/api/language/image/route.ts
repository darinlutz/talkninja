import { NextResponse } from 'next/server';
import { aiErrorResponse } from '@/lib/aiErrors';
import { AI_INPUT_LIMITS, tooLongMessage } from '@/lib/aiInputLimits';
import { searchSentenceImage } from '@/lib/imageSearch';
import { checkPracticeAccess } from '@/lib/practiceAccess';
import { aiRateLimit, type AiRateLimit } from '@/lib/rateLimits';

export async function POST(request: Request) {
  // Paid subscribers and Admins only (see practiceAccess.ts)
  const access = await checkPracticeAccess();
  if (access.denied) return access.denied;

  // Set just before the search; refunded if it fails, so failures don't count
  let limit: AiRateLimit | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const query: string = typeof body.query === 'string' ? body.query.trim() : '';

    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }
    if (query.length > AI_INPUT_LIMITS.imageQuery) {
      return NextResponse.json({ error: tooLongMessage('The search', AI_INPUT_LIMITS.imageQuery) }, { status: 400 });
    }

    if (!process.env.TAVILY_API_KEY) {
      console.error('TAVILY_API_KEY is not configured');
      return NextResponse.json({ error: 'Tavily API key not configured' }, { status: 500 });
    }

    // Tavily bills each search, so it's rate limited (and logged) like the AI features
    limit = await aiRateLimit(request, 'imageSearch', access.user);
    if (limit.response) return limit.response;

    const imageUrl = await limit.track(() => searchSentenceImage(query));

    return NextResponse.json({ success: true, imageUrl }, { status: 200 });
  } catch (error) {
    await limit?.refund();
    console.error('Image search error:', error);

    return aiErrorResponse(error, 'Failed to find an image');
  }
}
