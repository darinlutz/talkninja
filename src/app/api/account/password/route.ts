import { NextResponse } from 'next/server';
import { passwordProblem } from '@/lib/passwordRules';
import { createSession, getCurrentUser, isRememberedSession } from '@/lib/session';
import { checkPassword, updatePassword } from '@/lib/users';

// The Account page's Change Password. Body: { currentPassword, newPassword }.
// The new password follows the signup rules and is hashed the same way
// (updatePassword). Every session the user has, on every device, is signed
// out, and this browser gets a fresh one so it stays signed in.
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Please log in again' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }
    const problem = passwordProblem(newPassword);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }
    if (!(await checkPassword(user.id, currentPassword))) {
      return NextResponse.json({ error: 'Your current password is incorrect' }, { status: 400 });
    }

    // Read before updatePassword deletes this session, so the new one
    // lasts the same way ("Remember me" or until the browser closes)
    const remembered = await isRememberedSession();
    await updatePassword(user.id, newPassword);
    await createSession(user.id, remembered);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Failed to change your password' }, { status: 500 });
  }
}
