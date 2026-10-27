import { NextResponse } from 'next/server';
import { getCurrentUser } from './session';
import { isAdmin } from './roles';
import type { User } from './users';

// For the /api/admin/* routes: only the Admin role may call them. Anyone
// else, signed in or not, gets a plain 404, like the /admin page, so the
// routes' existence isn't advertised. The role comes from the database with
// the session (getCurrentUser), never from the request. Usage:
//   const access = await checkAdminAccess();
//   if (access.denied) return access.denied;
// The answer to a method an admin route doesn't have. Each admin route file
// exports it for its other methods, since Next's default 405 would tell
// anyone the route exists.
export function adminNotFound(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function checkAdminAccess(): Promise<
  { user: User; denied: null } | { user: null; denied: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    return { user: null, denied: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  return { user, denied: null };
}
