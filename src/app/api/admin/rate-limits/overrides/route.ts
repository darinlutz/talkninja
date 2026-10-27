import { NextResponse } from 'next/server';
import { adminNotFound, checkAdminAccess } from '@/lib/adminAccess';
import {
  isIpAddress,
  LIMIT_OPTIONS,
  listOverrides,
  OVERRIDE_DURATIONS,
  OVERRIDE_MODES,
  type OverrideMode,
  PERIODS,
  type Period,
  RateLimitInputError,
  saveOverride,
} from '@/lib/rateLimits';

const INVALID_OVERRIDE = 'Choose a user or enter a valid IP address, a rule, and how long it lasts';

// The Rate Limiting section's overrides: POST { userId } or { ipAddress }, with { mode, limit, period, note,
// durationSeconds } (src/lib/rateLimits.ts saveOverride), replacing the user's or IP address's earlier one.
// Answers { overrides }. Admin role only; anyone else gets a 404.
export async function POST(request: Request) {
  const access = await checkAdminAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => ({}));
    const userId = Number.isInteger(body.userId) && body.userId > 0 ? (body.userId as number) : null;
    const ipAddress = isIpAddress(body.ipAddress) ? body.ipAddress.trim() : null;
    const mode = (OVERRIDE_MODES as readonly string[]).includes(body.mode) ? (body.mode as OverrideMode) : null;
    const period = (PERIODS as readonly string[]).includes(body.period) ? (body.period as Period) : 'day';
    const limit = mode === 'custom' && LIMIT_OPTIONS.includes(body.limit) ? (body.limit as number | null) : null;
    const duration = body.durationSeconds ?? null;
    const durationSeconds = (OVERRIDE_DURATIONS as readonly (number | null)[]).includes(duration)
      ? (duration as number | null)
      : undefined;
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';

    // Exactly one of a user or an IP address; a custom limit needs a number (Unlimited is its own mode)
    if (
      (userId === null) === (ipAddress === null) ||
      !mode ||
      durationSeconds === undefined ||
      (mode === 'custom' && limit === null)
    ) {
      return NextResponse.json({ error: INVALID_OVERRIDE }, { status: 400 });
    }

    await saveOverride({ userId, ipAddress, mode, limit, period, note, durationSeconds }, access.user.id);
    console.log(
      `Rate limit override: ${userId !== null ? `user ${userId}` : `IP ${ipAddress}`} set to ${mode} by user ${access.user.id}`
    );
    return NextResponse.json({ overrides: await listOverrides() });
  } catch (error) {
    if (error instanceof RateLimitInputError) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    console.error('Rate limit override error:', error);
    return NextResponse.json({ error: 'Failed to save the override' }, { status: 500 });
  }
}

export { adminNotFound as GET, adminNotFound as PUT, adminNotFound as PATCH, adminNotFound as DELETE };
