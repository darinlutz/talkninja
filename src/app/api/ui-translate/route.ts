import { NextResponse } from 'next/server';
import { aiErrorResponse } from '@/lib/aiErrors';
import { getCurrentUser } from '@/lib/session';
import { isLanguage } from '@/lib/languages';
import {
  MAX_UI_STRING_LENGTH,
  MAX_UI_STRINGS_PER_REQUEST,
  translateUiStrings,
} from '@/lib/uiTranslate';

// Translates the page's interface text into the signed-in user's "I speak"
// language (see PageTranslator)
export async function POST(request: Request) {
  try {
    // Only signed-in users have an "I speak" language, and this keeps the
    // OpenAI calls behind an account
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (!isLanguage(body.language)) {
      return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    }
    const texts: unknown = body.texts;
    if (
      !Array.isArray(texts) ||
      texts.length === 0 ||
      texts.length > MAX_UI_STRINGS_PER_REQUEST ||
      !texts.every((text) => typeof text === 'string' && text.length <= MAX_UI_STRING_LENGTH)
    ) {
      return NextResponse.json(
        { error: `Send 1 to ${MAX_UI_STRINGS_PER_REQUEST} strings of up to ${MAX_UI_STRING_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const translations = await translateUiStrings(texts as string[], body.language);
    return NextResponse.json({ translations });
  } catch (error) {
    console.error('UI translate error:', error);
    return aiErrorResponse(error, 'Failed to translate the page');
  }
}
