import { NextResponse } from 'next/server';
import { ABUSE_LIMITS, limitReached, recordAttempt } from '@/lib/abuseGuards';
import { clientIp } from '@/lib/rateLimits';
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

    // Limits password guessing: too many failures for this address or from this IP address lock it for a while
    // (src/lib/abuseGuards.ts). Checked before the password, so a locked address can't be probed further.
    const emailKey = `login-email:${emailAddress}`;
    const ipKey = `login-ip:${clientIp(request) ?? 'unknown'}`;
    if (
      limitReached(emailKey, ABUSE_LIMITS.loginFailuresPerEmail) ||
      limitReached(ipKey, ABUSE_LIMITS.loginFailuresPerIp)
    ) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please wait 15 minutes and try again, or reset your password.' },
        { status: 429 }
      );
    }

    const user = await authenticateUser(emailAddress, password);
    if (!user) {
      recordAttempt(emailKey);
      recordAttempt(ipKey);
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
