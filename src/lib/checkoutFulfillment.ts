import type Stripe from 'stripe';
import { grantLifetimeAccess, startSubscription } from './users';

// Applies a completed Checkout Session to the account that started it
// (client_reference_id): Monthly starts a one-month Monthly Subscription,
// a paid Lifetime purchase makes the account Lifetime and stops any monthly
// subscription it had.
//
// Called by the Stripe webhook and by the Thank You page (/success), which
// looks the session up in Stripe itself, so the account is updated as soon
// as the user is back even if the webhook is late or not set up. Safe to
// run more than once for the same session.
export async function fulfillCheckoutSession(stripe: Stripe, session: Stripe.Checkout.Session): Promise<void> {
  const userId = Number(session.client_reference_id);

  if (session.mode === 'payment') {
    if (session.metadata?.plan !== 'lifetime' || !Number.isInteger(userId)) {
      console.warn('Payment session not linked to a Lifetime purchase:', session.id);
      return;
    }
    // A delayed payment (e.g. a bank debit) completes the session before the
    // money arrives; checkout.session.async_payment_succeeded comes later
    if (session.payment_status !== 'paid') return;
    const previousSubscriptionId = await grantLifetimeAccess(
      userId,
      typeof session.customer === 'string' ? session.customer : null
    );
    // A monthly subscriber upgraded: stop charging them monthly
    if (previousSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(previousSubscriptionId);
      } catch (error) {
        // e.g. it was already canceled; the account is Lifetime either way
        console.error('Failed to cancel monthly subscription after Lifetime purchase:', error);
      }
    }
    return;
  }

  if (
    session.mode !== 'subscription' ||
    session.status !== 'complete' ||
    !Number.isInteger(userId) ||
    typeof session.customer !== 'string' ||
    typeof session.subscription !== 'string'
  ) {
    console.warn('Checkout session not linked to a user:', session.id);
    return;
  }
  // Subscription mode sessions only complete once the first payment succeeds
  await startSubscription(userId, session.customer, session.subscription);
}
