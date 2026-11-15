import { NextResponse } from 'next/server';
import { ABUSE_LIMITS, limitReached, recordAttempt } from '@/lib/abuseGuards';
import { sendVerificationEmail, verifyEmailToken } from '@/lib/emailVerification';
import { getCurrentUser } from '@/lib/session';
import { getPublicSiteUrl, getSiteOrigin } from '@/lib/siteOrigin';

const SEND_FAILED = "We couldn't send the email. Please try again in a few minutes.";

// Email address confirmation (src/lib/emailVerification.ts).
// GET ?token=: the link in the email. Confirms the address and goes to the Account page (?emailVerified=1), or to
// Log In when this browser isn't signed in to that account (?emailVerified=1, or =invalid for a link that's unknown,
// used or expired). No sign-in needed: the token is the proof.
// POST: the banner's Resend Link, for the signed-in user whose address isn't confirmed yet. Answers { sent: true }.
export async function GET(request: Request) {
  // The redirect goes to the site the link was opened on; nothing secret is in it
  const siteUrl = process.env.SITE_URL?.trim().replace(/\/+$/, '') || getSiteOrigin(request);
  try {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const user = await verifyEmailToken(token);
    if (!user) return NextResponse.redirect(`${siteUrl}/login?emailVerified=invalid`, 303);
    // Only the account ID, never the email address, in the logs
    console.log(`Email address confirmed for user ${user.id}`);
    const current = await getCurrentUser();
    return NextResponse.redirect(`${siteUrl}/${current?.id === user.id ? 'account' : 'login'}?emailVerified=1`, 303);
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.redirect(`${siteUrl}/login?emailVerified=invalid`, 303);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Please log in' }, { status: 401 });
  try {
    if (user.emailVerified) return NextResponse.json({ sent: false, verified: true });
    const key = `verify-email:${user.id}`;
    if (limitReached(key, ABUSE_LIMITS.verifyEmailPerUser)) {
      return NextResponse.json({ error: 'Too many emails sent. Please try again in an hour.' }, { status: 429 });
    }
    recordAttempt(key);
    if (!(await sendVerificationEmail(user, getPublicSiteUrl(request)))) {
      return NextResponse.json({ error: SEND_FAILED }, { status: 502 });
    }
    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error('Resend verification email error:', error);
    return NextResponse.json({ error: SEND_FAILED }, { status: 500 });
  }
}
