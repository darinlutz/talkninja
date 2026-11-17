import { NextResponse } from 'next/server';
import { ABUSE_LIMITS, limitReached, recordAttempt } from '@/lib/abuseGuards';
import { renderEmail, sendUserEmail } from '@/lib/emailLayout';
import { createPasswordResetToken } from '@/lib/passwordReset';
import { clientIp } from '@/lib/rateLimits';
import { getPublicSiteUrl } from '@/lib/siteOrigin';
import { getUserByEmail } from '@/lib/users';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBJECT = 'Reset your TalkNinja password';

// At most 10 requests an hour per IP address (then 429), and 3 reset emails an hour per address: past that it
// answers as if sent and sends nothing, so it can't be used to flood someone's inbox (src/lib/abuseGuards.ts).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const emailAddress = typeof body.emailAddress === 'string' ? body.emailAddress.trim().toLowerCase() : '';

    if (!emailAddress) {
      return NextResponse.json({ error: 'Email address is required' }, { status: 400 });
    }
    if (!EMAIL_REGEX.test(emailAddress)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    if (!process.env.RESEND_API_KEY) {
      console.error('Resend API key not configured. Password reset email disabled.');
      return NextResponse.json({ error: 'Email service is not configured' }, { status: 500 });
    }

    const ip = `reset-ip:${clientIp(request) ?? 'unknown'}`;
    if (limitReached(ip, ABUSE_LIMITS.resetPerIp)) {
      return NextResponse.json({ error: 'Too many attempts. Please try again in an hour.' }, { status: 429 });
    }
    recordAttempt(ip);

    // An address with no account gets the same answer as one with an account (and no email), so this form can't be
    // used to find out who has a TalkNinja account
    const user = await getUserByEmail(emailAddress);
    if (!user) {
      return NextResponse.json({ success: true });
    }
    const email = `reset-email:${emailAddress}`;
    if (limitReached(email, ABUSE_LIMITS.resetPerEmail)) {
      return NextResponse.json({ success: true });
    }
    recordAttempt(email);

    // SITE_URL pins the link to the real domain so a forged Host header can't
    // send the reset token somewhere else; locally it falls back to the request.
    const siteUrl = getPublicSiteUrl(request);
    const token = await createPasswordResetToken(user.id);
    const sent = await sendUserEmail(
      user.emailAddress,
      SUBJECT,
      renderEmail({
        siteUrl,
        subject: SUBJECT,
        heading: 'Reset your password',
        intro: [
          `Hi ${user.userName}, we received a request to reset the password for your TalkNinja account. Press the button to choose a new one.`,
        ],
        button: { label: 'Reset Password', url: `${siteUrl}/reset-password?token=${token}` },
        note: 'This link expires in 1 hour and can only be used once.',
        footnote: "If you didn't ask for this, you can ignore this email. Your password won't change.",
      })
    );
    if (!sent) {
      return NextResponse.json({ error: 'Failed to send reset email. Please try again in a few minutes.' }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Failed to process your request' }, { status: 500 });
  }
}
