import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { stripeClient, syncSubscription } from '@/lib/stripeBilling';

// The Account page's Reactivate Subscription: undoes a cancellation scheduled for the end of the paid period, so the
// subscription renews as before. Only the signed-in account's own subscription (from the database), and only while
// Stripe still has it running; once it has ended, the account subscribes again instead.
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Please log in again' }, { status: 401 });
    }
    if (!user.stripeSubscriptionId) {
      return NextResponse.json({ error: 'No subscription to reactivate' }, { status: 400 });
    }
    const stripe = stripeClient();
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }

    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
      await syncSubscription(stripe, subscription.id);
      return NextResponse.json(
        { error: 'This subscription has already ended. Use Subscribe to start a new one.' },
        { status: 400 }
      );
    }
    if (!subscription.cancel_at_period_end && !subscription.cancel_at) {
      await syncSubscription(stripe, subscription.id);
      return NextResponse.json({ reactivated: true, alreadyActive: true });
    }

    // Clears either way a cancellation can be scheduled (at the period end, or at a date)
    await stripe.subscriptions.update(subscription.id, {
      ...(subscription.cancel_at_period_end ? { cancel_at_period_end: false } : {}),
      ...(subscription.cancel_at ? { cancel_at: '' } : {}),
    });
    await syncSubscription(stripe, subscription.id);
    console.log(`Subscription ${subscription.id} reactivated by account ${user.id}`);
    return NextResponse.json({ reactivated: true });
  } catch (error) {
    console.error('Stripe reactivate subscription error:', error);
    return NextResponse.json(
      { error: 'Your subscription could not be reactivated. Please try again.' },
      { status: 500 }
    );
  }
}
