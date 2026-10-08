import { NextResponse } from 'next/server';
import { checkPracticeAccess } from '@/lib/practiceAccess';
import { isLanguage } from '@/lib/languages';
import { getLanguageProgress, recordLanguageActivity } from '@/lib/languageProgress';
import { MAX_BELT_LEVEL, type LanguageActivity } from '@/lib/languageLevels';

const ACTIVITIES: LanguageActivity[] = ['training', 'reading', 'writing'];

// The signed-in user's belt and next step for each language they've
// started, their role (Admins can pick any Difficulty), and their saved
// "want to learn" / "I speak" languages
export async function GET() {
  try {
    // Paid subscribers and Admins only (see practiceAccess.ts)
    const access = await checkPracticeAccess();
    if (access.denied) return access.denied;
    const user = access.user;
    return NextResponse.json({
      progress: await getLanguageProgress(user.id),
      role: user.role,
      activeLearningLanguage: user.activeLearningLanguage,
      nativeLanguage: user.nativeLanguage,
    });
  } catch (error) {
    console.error('Language progress lookup error:', error);
    return NextResponse.json({ error: 'Failed to look up progress' }, { status: 500 });
  }
}

// Records a completed Training or a Reading/Writing test score
export async function POST(request: Request) {
  try {
    // Paid subscribers and Admins only (see practiceAccess.ts)
    const access = await checkPracticeAccess();
    if (access.denied) return access.denied;
    const user = access.user;

    const body = await request.json().catch(() => ({}));
    const { language, activity } = body;
    // Null for practice at the Fast Phrases/Words difficulties
    const level = body.level ?? null;
    const score = body.score ?? null;

    if (!isLanguage(language)) {
      return NextResponse.json({ error: 'Invalid language' }, { status: 400 });
    }
    if (!ACTIVITIES.includes(activity)) {
      return NextResponse.json({ error: 'Invalid activity' }, { status: 400 });
    }
    if (level !== null && (!Number.isInteger(level) || level < 1 || level > MAX_BELT_LEVEL)) {
      return NextResponse.json({ error: `Level must be 1 to ${MAX_BELT_LEVEL}` }, { status: 400 });
    }
    if (activity !== 'training' && (!Number.isInteger(score) || score < 0 || score > 100)) {
      return NextResponse.json({ error: 'Score must be a whole number from 0 to 100' }, { status: 400 });
    }

    const result = await recordLanguageActivity(user.id, { language, level, activity, score });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Language progress record error:', error);
    return NextResponse.json({ error: 'Failed to record progress' }, { status: 500 });
  }
}
