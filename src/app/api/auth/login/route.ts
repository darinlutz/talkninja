import { NextResponse } from 'next/server';
import { createSession, setRememberedEmail } from '@/lib/session';
import { authenticateUser, recordLogin } from '@/lib/users';
import { linkConsentToUser } from '@/lib/cookieConsentRecords';
import { getConsentBrowserId } from '@/lib/cookieConsentServer';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const emailAddress = typeof body.emailAddress === 'string' ? body.emailAddress.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const rememberMe = body.rememberMe === true;

    if (!emailAddress || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const user = await authenticateUser(emailAddress, password);
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    await createSession(user.id, rememberMe);
    await setRememberedEmail(rememberMe ? emailAddress : null);
    await recordLogin(user.id);
    const browserId = await getConsentBrowserId();
    if (browserId) await linkConsentToUser(browserId, user.id).catch(() => {});
    return NextResponse.json({ user: { userName: user.userName } });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Failed to log in' }, { status: 500 });
  }
}
