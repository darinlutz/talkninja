import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  claimWebhookEvent,
  finishWebhookEvent,
  releaseWebhookEvent,
  stripeKeyMode,
  syncCheckoutSession,
  syncSubscription,
  type SyncResult,
} from '@/lib/stripeBilling';
import type { PaymentHint } from '@/lib/subscriptionProjection';

// TalkNinja's Stripe webhook: https://talkninja.app/api/stripe-webhook, its own endpoint in the Stripe Dashboard with
// its own signing secret (STRIPE_WEBHOOK_SECRET; never RacingCoach's). The Stripe account is shared with RacingCoach,
// so events about RacingCoach's checkouts and subscriptions arrive here too and are ignored (src/lib/stripeBilling.ts).
//
// Every event about a subscription re-reads it from Stripe and brings its account to what Stripe says now, under a
// per-subscription lock (syncSubscription), so duplicate and out-of-order deliveries end in the same state. Each event
// ID is handled once (claimWebhookEvent). Answers: 400 bad signature (Stripe doesn't retry a forged event usefully);
// 200 handled, ignored or already handled; 409 being handled by another delivery, 500 failed (Stripe retries both).
const MAX_BODY_BYTES = 1024 * 1024;

const subscriptionOf = (invoice: Stripe.Invoice): string | null => {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return !subscription ? null : typeof subscription === 'string' ? subscription : subscription.id;
};

const describe = (result: SyncResult | null) =>
  !result ? 'ignored: not a TalkNinja checkout' : result.status === 'synced' ? `synced account ${result.userId}` : `${result.status}: ${result.reason}`;

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeSecretKey || !webhookSecret) {
    console.error('Stripe webhook is not configured (STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET)');
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey, { maxNetworkRetries: 2 });

  // Signature verification needs the raw, unparsed body
  let event: Stripe.Event;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Too large' }, { status: 413 });
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const log = (result: string) =>
    console.log(JSON.stringify({ stripeWebhook: true, eventId: event.id, type: event.type, livemode: event.livemode, result }));

  // A test-mode event must never change accounts on a live key, or the reverse
  const mode = stripeKeyMode(stripeSecretKey);
  if (mode && event.livemode !== (mode === 'live')) {
    log(`ignored: ${event.livemode ? 'live' : 'test'} event on a ${mode} key`);
    return NextResponse.json({ received: true, ignored: true });
  }

  // Stripe can deliver an event more than once; each is handled once
  try {
    const claim = await claimWebhookEvent(event);
    if (claim === 'done') {
      log('duplicate: already handled');
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (claim === 'busy') {
      log('busy: another delivery is handling it');
      return NextResponse.json({ error: 'Event is being handled' }, { status: 409 });
    }
  } catch (error) {
    console.error('Stripe webhook claim error:', error);
    return NextResponse.json({ error: 'Webhook handling failed' }, { status: 500 });
  }

  let result: string;
  try {
    result = await handle(stripe, event);
  } catch (error) {
    // A non-2xx response makes Stripe retry the event later
    console.error(`Stripe webhook ${event.type} ${event.id} failed:`, error);
    log('failed: will be retried');
    await releaseWebhookEvent(event.id).catch((e) => console.error('Stripe webhook release error:', e));
    return NextResponse.json({ error: 'Webhook handling failed' }, { status: 500 });
  }

  log(result);
  await finishWebhookEvent(event.id, result).catch((error) => console.error('Stripe webhook finish error:', error));
  return NextResponse.json({ received: true });
}

async function handle(stripe: Stripe, event: Stripe.Event): Promise<string> {
  switch (event.type) {
    // Checkout finished: links the subscription to the account that started it (client_reference_id) and syncs it.
    // Access only follows a paid invoice, so a delayed payment method grants nothing until it's paid.
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed':
      return describe(await syncCheckoutSession(stripe, event.data.object));

    // Created, changed (a cancellation scheduled or undone, a renewal, a status change) or ended
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return describe(await syncSubscription(stripe, event.data.object.id));

    // TalkNinja has no trials; if one is ever added, Stripe's own reminder email covers this. Synced anyway.
    case 'customer.subscription.trial_will_end':
      return describe(await syncSubscription(stripe, event.data.object.id));

    // A payment: paid (first payment, a renewal, or a failed one recovered), failed, or waiting for the customer to
    // authenticate (3D Secure). The hint only counts while the invoice is still unpaid.
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required': {
      const subscriptionId = subscriptionOf(event.data.object);
      if (!subscriptionId) return 'ignored: not a subscription invoice';
      const paymentHint: PaymentHint =
        event.type === 'invoice.payment_failed' ? 'payment_failed' : event.type === 'invoice.payment_action_required' ? 'action_required' : null;
      return describe(await syncSubscription(stripe, subscriptionId, { paymentHint }));
    }

    default:
      return 'ignored: event type not used';
  }
}
