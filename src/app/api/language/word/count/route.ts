import { NextResponse } from 'next/server';
import { getWordCountForCategory, VALID_WORD_CATEGORIES, type WordCategory } from '@/lib/language';
import { checkPracticeAccess } from '@/lib/practiceAccess';

export async function POST(request: Request) {
  // Paid subscribers and Admins only (see practiceAccess.ts)
  const access = await checkPracticeAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => ({}));
    const category: WordCategory = VALID_WORD_CATEGORIES.includes(body.category)
      ? body.category
      : 'all';

    const count = await getWordCountForCategory(category);

    return NextResponse.json({ success: true, count }, { status: 200 });
  } catch (error) {
    console.error('Word count error:', error);

    return NextResponse.json(
      { error: 'Failed to count words in category' },
      { status: 500 }
    );
  }
}
