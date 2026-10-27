import { NextResponse } from 'next/server';
import { adminNotFound, checkAdminAccess } from '@/lib/adminAccess';
import { isRole } from '@/lib/roles';
import { RoleChangeError, setUserRole } from '@/lib/users';

const ROLE_CHANGE_MESSAGES = {
  'not-found': 'User not found',
  'own-role': 'You can’t change your own role',
  'last-admin': 'There must be at least one Admin',
};

// The Admin page's User Roles section. Body: { userId: number, role: 'Admin' | 'User' }. An Admin can't change
// their own role, and the last Admin can't be demoted (setUserRole). This is the only route that sets a role.
// Admin role only; anyone else gets a 404, like the Admin page.
export async function PUT(request: Request) {
  const access = await checkAdminAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => ({}));
    const userId = Number(body.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }
    if (!isRole(body.role)) {
      return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
    }

    const userName = await setUserRole(userId, body.role, access.user.id);
    console.log(`Role change: user ${userId} (${userName}) set to ${body.role} by user ${access.user.id}`);
    return NextResponse.json({ userId, role: body.role });
  } catch (error) {
    if (error instanceof RoleChangeError) {
      return NextResponse.json(
        { error: ROLE_CHANGE_MESSAGES[error.reason] },
        { status: error.reason === 'not-found' ? 404 : 400 }
      );
    }
    console.error('Role change error:', error);
    return NextResponse.json({ error: 'Failed to save the role' }, { status: 500 });
  }
}

export { adminNotFound as GET, adminNotFound as POST, adminNotFound as PATCH, adminNotFound as DELETE };
