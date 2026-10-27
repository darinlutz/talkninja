import { NextResponse } from 'next/server';
import { adminNotFound, checkAdminAccess } from '@/lib/adminAccess';
import { deleteOverride, listOverrides } from '@/lib/rateLimits';

// Removes one of the Rate Limiting section's overrides, so the user or IP address has the usual limits again.
// Answers { overrides }. Admin role only; anyone else gets a 404.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await checkAdminAccess();
  if (access.denied) return access.denied;

  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || !(await deleteOverride(id))) {
      return NextResponse.json({ error: 'Override not found' }, { status: 404 });
    }
    console.log(`Rate limit override ${id} removed by user ${access.user.id}`);
    return NextResponse.json({ overrides: await listOverrides() });
  } catch (error) {
    console.error('Rate limit override delete error:', error);
    return NextResponse.json({ error: 'Failed to remove the override' }, { status: 500 });
  }
}

export { adminNotFound as GET, adminNotFound as POST, adminNotFound as PUT, adminNotFound as PATCH };
