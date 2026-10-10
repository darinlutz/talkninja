import { NextResponse } from 'next/server';
import { aiErrorResponse } from '@/lib/aiErrors';
import type { Language } from '@/lib/translate';
import { alignTranslation } from '@/lib/wordAlignment';
import { LANGUAGES } from '@/lib/languages';
import { checkPracticeAccess } from '@/lib/practiceAccess';

const VALID_LANGUAGES: readonly Language[] = LANGUAGES;

// Pairs up the words of a sentence and its translation so matching words
// can be shown in the same color.
export async function POST(request: Request) {
  // Paid subscribers and Admins only (see practiceAccess.ts)
  const access = await checkPracticeAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => ({}));
    const { sentence, translation } = body;

    if (
      typeof sentence !== 'string' || !sentence.trim() ||
      typeof translation !== 'string' || !translation.trim()
    ) {
      return NextResponse.json({ error: 'Missing sentence or translation' }, { status: 400 });
    }

    if (!VALID_LANGUAGES.includes(body.from) || !VALID_LANGUAGES.includes(body.to)) {
      return NextResponse.json({ error: 'Invalid language' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const segments = await alignTranslation(sentence, body.from, translation, body.to);

    return NextResponse.json({ success: true, ...segments }, { status: 200 });
  } catch (error) {
    console.error('Align error:', error);
    return aiErrorResponse(error, 'Failed to align translation');
  }
}
