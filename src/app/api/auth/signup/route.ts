import { NextResponse } from 'next/server';
import { createSession } from '@/lib/session';
import { createUser, EmailTakenError } from '@/lib/users';
import { isLanguage } from '@/lib/languages';
import { startLanguage } from '@/lib/languageProgress';
import { notifyAdmin } from '@/lib/adminNotification';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userName = typeof body.userName === 'string' ? body.userName.trim() : '';
    const emailAddress = typeof body.emailAddress === 'string' ? body.emailAddress.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!userName || !emailAddress || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }
    if (!EMAIL_REGEX.test(emailAddress)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (!isLanguage(body.nativeLanguage) || !isLanguage(body.activeLearningLanguage)) {
      return NextResponse.json({ error: 'Pick a language you speak and one to learn' }, { status: 400 });
    }

    const user = await createUser({
      userName,
      emailAddress,
      password,
      nativeLanguage: body.nativeLanguage,
      activeLearningLanguage: body.activeLearningLanguage,
    });
    // A new account stays logged in, as if "Remember me" were checked
    await createSession(user.id, true);
    // The language to learn starts at No Belt on the Account page, as when
    // it's picked in Language Setup. Without it, it's added with the first
    // Training or test result instead.
    await startLanguage(user.id, body.activeLearningLanguage).catch((error) =>
      console.error('Signup language start error:', error)
    );
    await notifyAdmin('signup', user.emailAddress);
    return NextResponse.json({ user: { userName: user.userName } }, { status: 201 });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
