import type Stripe from 'stripe';
import { startSubscription } from './users';
import { notifyAdmin } from './adminNotification';
import { isPlan } from './accountStatus';

// Applies a completed Checkout Session to the account that started it
// (client_reference_id): the account becomes Subscribed until the end of
// the month (Monthly) or year (Annual) just paid for.
//
// Called by the Stripe webhook and by the Thank You page (/success), which
// looks the session up in Stripe itself, so the account is updated as soon
// as the user is back even if the webhook is late or not set up. Safe to
// run more than once for the same session.
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const userId = Number(session.client_reference_id);
  const plan = session.metadata?.plan;

  if (
    session.mode !== 'subscription' ||
    session.status !== 'complete' ||
    !isPlan(plan) ||
    !Number.isInteger(userId) ||
    typeof session.customer !== 'string' ||
    typeof session.subscription !== 'string'
  ) {
    console.warn('Checkout session not linked to a user:', session.id);
    return;
  }
  // Subscription mode sessions only complete once the first payment succeeds
  const emailAddress = await startSubscription(userId, session.customer, session.subscription, plan);
  if (emailAddress) await notifyAdmin(plan, emailAddress);
}
