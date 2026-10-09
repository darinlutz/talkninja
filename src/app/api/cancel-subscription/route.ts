import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getCurrentUser } from '@/lib/session';
import { recordCancellation } from '@/lib/users';
import { ACCOUNT_STATUS } from '@/lib/accountStatus';
import { notifyAdmin } from '@/lib/adminNotification';
import { cancellationReasonLabel, MAX_CANCELLATION_NOTES_LENGTH } from '@/lib/cancellationReasons';

// The My Account page's Cancel Subscription modal: cancels the Monthly
// subscription in Stripe, marks the account Cancelled, and saves the
// reason the user picked (and any notes) in "CancellationReason". Returns
// Stripe's record of the cancellation as the user's proof.
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Please log in again' }, { status: 401 });
    }

    // Only Monthly subscribers have something to cancel (Lifetime never
    // renews, and its button isn't shown)
    if (user.accountStatus !== ACCOUNT_STATUS.monthly || !user.stripeSubscriptionId) {
      return NextResponse.json({ error: 'No active monthly subscription to cancel' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const reason = cancellationReasonLabel(body.reason);
    if (!reason) {
      return NextResponse.json({ error: 'Please pick a reason for cancelling' }, { status: 400 });
    }
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    if (notes.length > MAX_CANCELLATION_NOTES_LENGTH) {
      return NextResponse.json(
        { error: `Comments can be up to ${MAX_CANCELLATION_NOTES_LENGTH} characters` },
        { status: 400 }
      );
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }

    // Cancels immediately: no further charges, no refund. The subscription
    // end date (the end of the month already paid for) is kept.
    const stripe = new Stripe(stripeSecretKey);
    const subscription = await stripe.subscriptions.cancel(user.stripeSubscriptionId);
    const canceledAt = subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : new Date();

    // Stripe has cancelled it; a failure saving here mustn't hide that
    try {
      await recordCancellation({
        user,
        stripeSubscriptionId: subscription.id,
        stripeCanceledAt: canceledAt,
        reason,
        notes: notes || null,
      });
    } catch (error) {
      console.error(`Saving cancellation of ${subscription.id} failed (Stripe cancelled it):`, error);
    }
    await notifyAdmin('cancelled', user.emailAddress);

    return NextResponse.json({
      // Stripe's proof: the subscription's ID is its reference for this
      // cancellation, with its status and the time Stripe recorded
      confirmation: {
        subscriptionId: subscription.id,
        status: subscription.status,
        canceledAt: canceledAt.toISOString(),
      },
      subscriptionEndDate: user.subscriptionEndDate,
    });
  } catch (error) {
    console.error('Stripe cancel subscription error:', error);
    return NextResponse.json(
      { error: 'Your subscription could not be cancelled. Please try again.' },
      { status: 500 }
    );
  }
}
