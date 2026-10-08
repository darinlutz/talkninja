import { NextResponse } from 'next/server';
import { getCurrentUser } from './session';
import { hasPracticeAccess } from './accountStatus';
import type { User } from './users';

// For account routes any signed-in user may call (e.g. the My Account
// page's Google Sheet setup): just requires a login. Returns the refusal,
// or null when signed in.
export async function requireSignIn(): Promise<NextResponse | null> {
  const user = await getCurrentUser();
  return user ? null : NextResponse.json({ error: 'Please log in' }, { status: 401 });
}

// For the API routes behind the practice tabs (the AI, voice, image and
// test routes, and saving results): only paid subscribers and Admins may
// call them, like the pages that use them. Usage:
//   const access = await checkPracticeAccess();
//   if (access.denied) return access.denied;
export async function checkPracticeAccess(): Promise<
  { user: User; denied: null } | { user: null; denied: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, denied: NextResponse.json({ error: 'Please log in to practice' }, { status: 401 }) };
  }
  if (!hasPracticeAccess(user.accountStatus, user.role)) {
    return {
      user: null,
      denied: NextResponse.json({ error: 'Practice is for subscribers. See Pricing to subscribe.' }, { status: 403 }),
    };
  }
  return { user, denied: null };
}
