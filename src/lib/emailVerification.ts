import { createHash, randomBytes } from 'node:crypto';
import { query, transaction } from './db';
import { renderEmail, sendUserEmail } from './emailLayout';
import { ensureUserSchema, markEmailVerified, type User } from './users';

// Confirming a new account's email address. Signing up sends a link (sendVerificationEmail); opening it
// (GET /api/auth/verify-email?token=) marks the address confirmed (markEmailVerified). Until then the account can sign
// in and look around, but it can't subscribe or use AI features, so an address nobody controls can't be used for
// either. Accounts from before this existed count as confirmed. Only a hash of each token is stored, like
// "PasswordResets".

const VERIFY_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// A new link for the user; earlier ones stop working
export async function createEmailVerificationToken(userId: number): Promise<string> {
  await ensureUserSchema();
  const token = randomBytes(32).toString('hex');
  await transaction(async (client) => {
    await client.query('DELETE FROM "EmailVerifications" WHERE user_id = $1', [userId]);
    await client.query('INSERT INTO "EmailVerifications" (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
      hashToken(token),
      userId,
      Date.now() + VERIFY_TTL_MS,
    ]);
  });
  return token;
}

// The account a link confirms, now marked confirmed; null for an unknown, used or expired link. A link can only be
// used once: it's deleted as it's read.
export async function verifyEmailToken(token: string): Promise<User | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  await ensureUserSchema();
  const [row] = await query('DELETE FROM "EmailVerifications" WHERE token_hash = $1 AND expires_at > $2 RETURNING user_id', [
    hashToken(token),
    Date.now(),
  ]);
  return row ? markEmailVerified(Number(row.user_id)) : null;
}

// Emails the link. False when it couldn't be sent (the banner's Resend Link button tries again)
export async function sendVerificationEmail(user: User, siteUrl: string): Promise<boolean> {
  const link = `${siteUrl}/api/auth/verify-email?token=${await createEmailVerificationToken(user.id)}`;
  const subject = 'Confirm your TalkNinja email address';
  return sendUserEmail(
    user.emailAddress,
    subject,
    renderEmail({
      siteUrl,
      subject,
      heading: `Welcome to the dojo, ${user.userName}`,
      intro: [
        'Thanks for creating a TalkNinja account. Confirm this is your email address to activate your account and start earning your belts.',
      ],
      button: { label: 'Activate My Account', url: link },
      note: 'This link expires in 3 days and can only be used once.',
      footnote: "If you didn't create this account, you can ignore this email.",
    })
  );
}
