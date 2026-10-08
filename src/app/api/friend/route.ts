import { NextResponse } from 'next/server';
import { chatWithFriend, ChatMessage, DEFAULT_FRIEND_DIFFICULTY } from '@/lib/friend';
import { Difficulty } from '@/lib/language';
import { Language } from '@/lib/translate';
import { LANGUAGES } from '@/lib/languages';
import { isValidTestDifficulty } from '@/lib/readingTest';

interface FriendRequest {
  history: ChatMessage[];
  difficulty?: Difficulty;
  language?: Language;
}

const VALID_LANGUAGES: readonly Language[] = LANGUAGES;

export async function POST(request: Request) {
  try {
    const body: FriendRequest = await request.json();

    if (!Array.isArray(body.history)) {
      return NextResponse.json({ error: 'Missing conversation history' }, { status: 400 });
    }

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

    const reply = await chatWithFriend(body.history, difficulty, language);

    return NextResponse.json({ success: true, reply }, { status: 200 });
  } catch (error) {
    console.error('Friend chat error:', error);

    return NextResponse.json(
      { error: 'Failed to get a reply' },
      { status: 500 }
    );
  }
}
