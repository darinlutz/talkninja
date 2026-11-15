// Limits on the forms that send email, so they can't be used to flood someone's inbox or run up the email bill.
// Counted in this server's memory: a restart forgets them, which is fine for limits this loose.

const HOUR = 60 * 60 * 1000;

export const ABUSE_LIMITS = {
  // Password reset requests per email address and per IP address an hour
  resetPerEmail: { max: 3, windowMs: HOUR },
  resetPerIp: { max: 10, windowMs: HOUR },
  // Email address confirmation links resent per account an hour (signing up sends the first)
  verifyEmailPerUser: { max: 3, windowMs: HOUR },
} as const;

type Limit = { max: number; windowMs: number };

const attempts = new Map<string, number[]>();

const recent = (key: string, now: number) => (attempts.get(key) ?? []).filter((at) => now - at < HOUR);

// Whether key already has max attempts in the window (doesn't count this one)
export function limitReached(key: string, limit: Limit): boolean {
  const now = Date.now();
  return recent(key, now).filter((at) => now - at < limit.windowMs).length >= limit.max;
}

// Counts an attempt against key
export function recordAttempt(key: string): void {
  const now = Date.now();
  attempts.set(key, [...recent(key, now), now]);
  if (attempts.size > 10_000) {
    for (const [k, list] of attempts) if (list.every((at) => now - at >= HOUR)) attempts.delete(k);
  }
}
