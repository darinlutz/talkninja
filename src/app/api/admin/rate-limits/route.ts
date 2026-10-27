import { NextResponse } from 'next/server';
import { adminNotFound, checkAdminAccess } from '@/lib/adminAccess';
import { getRateLimitSettings, parseRateLimitSettings, setRateLimitSettings } from '@/lib/rateLimits';

// The Admin page's Rate Limiting settings (src/lib/rateLimits.ts). Body: the RateLimitSettings to save; anything
// left out or invalid keeps its saved value. Answers { settings }, as saved. Admin role only; anyone else gets a
// 404.
export async function PUT(request: Request) {
  const access = await checkAdminAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Missing settings' }, { status: 400 });
    }
    const settings = parseRateLimitSettings(body, await getRateLimitSettings());
    await setRateLimitSettings(settings, access.user.id);
    console.log(`Rate limits saved by user ${access.user.id} (${settings.enabled ? 'on' : 'off'})`);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Rate limit settings error:', error);
    return NextResponse.json({ error: 'Failed to save the setting' }, { status: 500 });
  }
}

export { adminNotFound as GET, adminNotFound as POST, adminNotFound as PATCH, adminNotFound as DELETE };
