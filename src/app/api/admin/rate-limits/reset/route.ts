import { NextResponse } from 'next/server';
import { adminNotFound, checkAdminAccess } from '@/lib/adminAccess';
import { isIpAddress, resetUsage } from '@/lib/rateLimits';

// Starts a user's or IP address's AI usage count over: POST { userId } or { ipAddress } (src/lib/rateLimits.ts
// resetUsage). Their calls stay in the report. Answers { reset }, how many calls stopped counting.
// Admin role only; anyone else gets a 404.
export async function POST(request: Request) {
  const access = await checkAdminAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => ({}));
    const target =
      Number.isInteger(body.userId) && body.userId > 0
        ? { userId: body.userId as number }
        : isIpAddress(body.ipAddress)
          ? { ipAddress: (body.ipAddress as string).trim() }
          : null;
    if (!target) {
      return NextResponse.json({ error: 'Choose a user or a valid IP address' }, { status: 400 });
    }
    const reset = await resetUsage(target);
    console.log(
      `AI usage reset for ${'userId' in target ? `user ${target.userId}` : `IP ${target.ipAddress}`} by user ${access.user.id}`
    );
    return NextResponse.json({ reset });
  } catch (error) {
    console.error('AI usage reset error:', error);
    return NextResponse.json({ error: 'Failed to reset the usage' }, { status: 500 });
  }
}

export { adminNotFound as GET, adminNotFound as PUT, adminNotFound as PATCH, adminNotFound as DELETE };
