import { NextResponse } from 'next/server';
import { adminNotFound, checkAdminAccess } from '@/lib/adminAccess';
import { getAiServicesStatus, setAiServices } from '@/lib/aiKillSwitch';

// The Admin page's Emergency AI Stop (src/components/AiKillSwitch.tsx). Body: { on: boolean }. Off stops every AI
// model call, text to speech and image search for everyone, Admins included, within 5 seconds on every server
// (src/lib/aiKillSwitch.ts). Admin role only; anyone else gets a 404, like the Admin page.
export async function PUT(request: Request) {
  const access = await checkAdminAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.on !== 'boolean') {
      return NextResponse.json({ error: 'Send { on: true } or { on: false }' }, { status: 400 });
    }

    await setAiServices(body.on, access.user.id);
    console.log(`AI emergency stop ${body.on ? 'released (AI on)' : 'engaged (AI off)'} by user ${access.user.id}`);
    return NextResponse.json(await getAiServicesStatus());
  } catch (error) {
    console.error('AI emergency stop error:', error);
    return NextResponse.json({ error: 'Failed to save the setting' }, { status: 500 });
  }
}

export { adminNotFound as GET, adminNotFound as POST, adminNotFound as PATCH, adminNotFound as DELETE };
