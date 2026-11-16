import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { recordCancellation } from '@/lib/users';
import { stripeClient, syncSubscription } from '@/lib/stripeBilling';
import { isLiveStripeStatus } from '@/lib/subscriptionProjection';
import { notifyAdmin } from '@/lib/adminNotification';
import { cancellationReasonLabel, MAX_CANCELLATION_NOTES_LENGTH } from '@/lib/cancellationReasons';

// The My Account page's Cancel Subscription modal: schedules the
// cancellation in Stripe for the end of the period already paid for (no more
// charges, access until then; Reactivate Subscription undoes it before then),
// and saves the reason the user picked (and any notes) in
// "CancellationReason". The account becomes Cancelled when Stripe ends the
// subscription. Returns Stripe's record of the cancellation as the user's
// proof. Only the signed-in account's own subscription, from the database.
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Please log in again' }, { status: 401 });
    }

    // Only a live subscription has something to cancel
    if (!user.stripeSubscriptionId || !isLiveStripeStatus(user.stripeStatus ?? 'active')) {
      return NextResponse.json({ error: 'No active subscription to cancel' }, { status: 400 });
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

    const stripe = stripeClient();
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }

    const current = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    if (current.status === 'canceled' || current.status === 'incomplete_expired') {
      await syncSubscription(stripe, current.id);
      return NextResponse.json({ error: 'This subscription has already ended' }, { status: 400 });
    }
    // At the end of the paid period: no further charges, no refund, access until then
    const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
      cancellation_details: { comment: `${reason}${notes ? `: ${notes}` : ''}`.slice(0, 500) },
    });
    const canceledAt = new Date();
    const sync = await syncSubscription(stripe, subscription.id);
    if (sync.status !== 'synced') console.error(`Cancellation of ${subscription.id} not synced:`, sync);
    const periodEnds = subscription.items.data.map((item) => item.current_period_end);
    const endsAt = subscription.cancel_at ?? (periodEnds.length ? Math.max(...periodEnds) : null);

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
      // When access ends: the end of the period already paid for
      subscriptionEndDate: endsAt ? new Date(endsAt * 1000).toISOString() : user.subscriptionEndDate,
    });
  } catch (error) {
    console.error('Stripe cancel subscription error:', error);
    return NextResponse.json(
      { error: 'Your subscription could not be cancelled. Please try again.' },
      { status: 500 }
    );
  }
}
