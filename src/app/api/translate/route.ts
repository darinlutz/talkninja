import { NextResponse } from 'next/server';
import { aiErrorResponse } from '@/lib/aiErrors';
import { translateText, type Language } from '@/lib/translate';
import { LANGUAGES } from '@/lib/languages';
import { checkPracticeAccess } from '@/lib/practiceAccess';

const VALID_LANGUAGES: readonly Language[] = LANGUAGES;

export async function POST(request: Request) {
  // Paid subscribers and Admins only (see practiceAccess.ts)
  const access = await checkPracticeAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => ({}));
    const text = body.text;
    const from: Language = VALID_LANGUAGES.includes(body.from) ? body.from : 'Vietnamese';
    const to: Language = VALID_LANGUAGES.includes(body.to) ? body.to : 'English';

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json(
        { error: 'Missing text to translate' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY is not configured');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const translation = await translateText(text, from, to);

    return NextResponse.json({ success: true, translation }, { status: 200 });
  } catch (error) {
    console.error('Translate error:', error);

    return aiErrorResponse(error, 'Failed to translate text');
  }
}
