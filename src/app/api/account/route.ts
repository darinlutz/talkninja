import { NextResponse } from 'next/server';
import { DELETE_CONFIRMATION } from '@/lib/accountDeletion';
import { deleteAccount, StripeNotConfiguredError } from '@/lib/accountDeletionServer';
import { isAdmin } from '@/lib/roles';
import { deleteSession, getCurrentUser } from '@/lib/session';
import { confirmPassword, PASSWORD_CHECK_ERRORS } from '@/lib/passwordConfirmation';

// Delete My Account (Account page → Privacy & Data). Body: { confirm: 'DELETE', password }. Works only on the
// session's own account (it takes no user ID), needs the account's current password, and is refused to Admins
// (403), so there's always an Admin. See src/lib/accountDeletionServer.ts for the order of steps.
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Please log in again' }, { status: 401 });
    }
    if (isAdmin(user.role)) {
      return NextResponse.json({ error: 'Admin accounts can’t be deleted' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.confirm !== DELETE_CONFIRMATION) {
      return NextResponse.json({ error: `Type ${DELETE_CONFIRMATION} to confirm` }, { status: 400 });
    }
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) {
      return NextResponse.json({ error: 'Enter your password to confirm' }, { status: 400 });
    }
    const check = await confirmPassword(user.id, password);
    if (check !== 'ok') {
      const { error, status } = PASSWORD_CHECK_ERRORS[check];
      return NextResponse.json({ error }, { status });
    }

    const outcome = await deleteAccount(user);
    if (!outcome.deleted) {
      return NextResponse.json({ error: 'Your account could not be deleted' }, { status: 403 });
    }
    // The session rows went with the account; this clears the cookie
    await deleteSession();
    return NextResponse.json({ success: true, subscriptionCancelled: outcome.subscriptionCancelled });
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }
    console.error('Delete account error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Your account could not be deleted. Please try again.' }, { status: 500 });
  }
}
