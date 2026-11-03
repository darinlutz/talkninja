import { checkPassword } from './users';

// The password re-check before sensitive account actions (Download My Data, Delete My Account), with a limit of
// MAX_ATTEMPTS wrong passwords per account per WINDOW_MS. Kept in this server's memory: it resets on restart and
// isn't shared between instances, which is acceptable on TalkNinja's single instance (noted in docs/privacy.md).

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const failures = new Map<number, number[]>();

export type PasswordCheck = 'ok' | 'wrong' | 'locked';

export async function confirmPassword(userId: number, password: string, now: number = Date.now()): Promise<PasswordCheck> {
  const recent = (failures.get(userId) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS) {
    failures.set(userId, recent);
    return 'locked';
  }
  if (password && (await checkPassword(userId, password))) {
    failures.delete(userId);
    return 'ok';
  }
  recent.push(now);
  failures.set(userId, recent);
  return 'wrong';
}

export const PASSWORD_CHECK_ERRORS: Record<Exclude<PasswordCheck, 'ok'>, { error: string; status: number }> = {
  wrong: { error: 'That password is incorrect', status: 403 },
  locked: { error: 'Too many incorrect passwords. Please wait 15 minutes and try again.', status: 429 },
};
