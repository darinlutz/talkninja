import { NextResponse } from 'next/server';
import { searchSentenceImage } from '@/lib/imageSearch';
import { checkPracticeAccess } from '@/lib/practiceAccess';

export async function POST(request: Request) {
  // Paid subscribers and Admins only (see practiceAccess.ts)
  const access = await checkPracticeAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => ({}));
    const query: string = typeof body.query === 'string' ? body.query.trim() : '';

    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    if (!process.env.TAVILY_API_KEY) {
      console.error('TAVILY_API_KEY is not configured');
      return NextResponse.json({ error: 'Tavily API key not configured' }, { status: 500 });
    }

    const imageUrl = await searchSentenceImage(query);

    return NextResponse.json({ success: true, imageUrl }, { status: 200 });
  } catch (error) {
    console.error('Image search error:', error);

    return NextResponse.json({ error: 'Failed to find an image' }, { status: 500 });
  }
}
