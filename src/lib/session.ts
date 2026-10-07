import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { query } from './db';
import { ensureUserSchema, getUserById, type User } from './users';

const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// "Remember me" keeps the user logged in this long, across browser restarts
const REMEMBER_ME_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Only a hash of the token is stored, so a leaked database can't be used to
// hijack live sessions.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Without rememberMe the cookie is cleared when the browser closes (and the
// session still expires after SESSION_TTL_MS if the browser stays open).
export async function createSession(userId: number, rememberMe: boolean): Promise<void> {
  await ensureUserSchema();
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (rememberMe ? REMEMBER_ME_TTL_MS : SESSION_TTL_MS);
  await query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    hashToken(token),
    userId,
    expiresAt,
  ]);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(rememberMe && { expires: new Date(expiresAt) }),
  });
}

// "Remember me" also keeps the email address so the login form can fill it in
// next time. The password is never stored; the browser's password manager
// handles that.
const REMEMBERED_EMAIL_COOKIE = 'remembered_email';
const REMEMBERED_EMAIL_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export async function setRememberedEmail(emailAddress: string | null): Promise<void> {
  const cookieStore = await cookies();
  if (!emailAddress) {
    cookieStore.delete(REMEMBERED_EMAIL_COOKIE);
    return;
  }
  cookieStore.set(REMEMBERED_EMAIL_COOKIE, emailAddress, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(Date.now() + REMEMBERED_EMAIL_TTL_MS),
  });
}

export async function getRememberedEmail(): Promise<string> {
  return (await cookies()).get(REMEMBERED_EMAIL_COOKIE)?.value ?? '';
}

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    await ensureUserSchema();
    const [row] = await query('SELECT user_id, expires_at FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    // BIGINT columns come back from pg as strings
    if (!row || Number(row.expires_at) < Date.now()) return null;
    return await getUserById(Number(row.user_id));
  } catch (error) {
    console.error('Session lookup error:', error);
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await ensureUserSchema();
    await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  }
  cookieStore.delete(SESSION_COOKIE);
}
