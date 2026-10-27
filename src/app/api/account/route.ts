import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { DELETE_CONFIRMATION } from '@/lib/accountDeletion';
import { ACCOUNT_STATUS } from '@/lib/accountStatus';
import { isAdmin } from '@/lib/roles';
import { deleteSession, getCurrentUser } from '@/lib/session';
import { deleteUser } from '@/lib/users';

// The Account page's Delete Account. Body: { confirm: 'DELETE' }. Admins
// can't delete their account (403), so there's always an Admin. A live
// subscription is cancelled in Stripe first, so they're never charged for a
// deleted account; then the user and all their data (every table
// referencing "Users" ON DELETE CASCADE) is deleted and they're signed out.
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

    if (user.accountStatus === ACCOUNT_STATUS.subscribed && user.stripeSubscriptionId) {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
      }
      try {
        await new Stripe(stripeSecretKey).subscriptions.cancel(user.stripeSubscriptionId);
      } catch (error) {
        // Already gone in Stripe (e.g. cancelled in the Dashboard) is fine;
        // anything else stops the deletion so they aren't billed for it
        if ((error as { code?: string }).code !== 'resource_missing') throw error;
      }
    }

    if (!(await deleteUser(user.id))) {
      return NextResponse.json({ error: 'Your account could not be deleted' }, { status: 403 });
    }
    // The session row went with the account; this clears the cookie
    await deleteSession();
    console.log(`Account deleted: user ${user.id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json({ error: 'Your account could not be deleted. Please try again.' }, { status: 500 });
  }
}
