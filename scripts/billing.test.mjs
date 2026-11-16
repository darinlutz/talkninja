// Subscription billing: npm run test:billing
//
// What each Stripe subscription state does to the account (src/lib/subscriptionProjection.ts, applied by
// syncSubscription in src/lib/stripeBilling.ts), walked through the subscription lifecycle, plus source guards on the
// webhook, Checkout and the billing routes. No database, Stripe or network needed: the lifecycle against real Stripe
// (test mode, test clocks) is in docs/stripe-setup.md.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLiveStripeStatus, projectSubscription } from '../src/lib/subscriptionProjection.ts';
import { ACCOUNT_STATUS, canSubscribe, hasPracticeAccess, isPlan } from '../src/lib/accountStatus.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const DAY = 86400;
const T0 = Math.floor(Date.parse('2026-11-16T12:00:00Z') / 1000);
const MONTH1 = T0 + 30 * DAY;
const MONTH2 = T0 + 61 * DAY;
const iso = (s) => new Date(s * 1000).toISOString();

const NEW_ACCOUNT = { accountStatus: ACCOUNT_STATUS.unsubscribed, subscriptionEndDate: null, paymentIssue: null };
const state = (over) => ({ status: 'active', currentPeriodEnd: MONTH1, latestInvoiceStatus: 'paid', cancelAt: null, startedAt: T0, ...over });
const before = (p) => ({ accountStatus: p.accountStatus, subscriptionEndDate: p.subscriptionEndDate, paymentIssue: p.paymentIssue });
// Access at a moment (hasPracticeAccess uses the clock, so compare against the end date directly)
const accessAt = (p, seconds) => !!p.subscriptionEndDate && Date.parse(p.subscriptionEndDate) > seconds * 1000;

describe('subscription lifecycle', () => {
  test('abandoned checkout: nothing changes', () => {
    // No Stripe subscription exists, so nothing is synced; the account can still subscribe
    assert.ok(canSubscribe(NEW_ACCOUNT.accountStatus));
  });

  test('checkout completed but payment not yet confirmed: no access', () => {
    const p = projectSubscription(state({ status: 'incomplete', latestInvoiceStatus: 'open' }), NEW_ACCOUNT);
    assert.equal(p.accountStatus, ACCOUNT_STATUS.unsubscribed);
    assert.equal(p.subscriptionEndDate, null);
    assert.equal(p.paymentIssue, 'action_required');
    // But a second subscription can't be bought meanwhile
    assert.ok(isLiveStripeStatus('incomplete'));
  });

  test('first payment succeeds: subscribed until the end of the paid month', () => {
    const p = projectSubscription(state({}), NEW_ACCOUNT);
    assert.equal(p.accountStatus, ACCOUNT_STATUS.subscribed);
    assert.equal(p.subscriptionEndDate, iso(MONTH1));
    assert.equal(p.paymentIssue, null);
    assert.equal(p.cancelAt, null);
    assert.ok(!canSubscribe(p.accountStatus));
  });

  test('monthly renewal: the period moves ahead only once its invoice is paid', () => {
    const first = projectSubscription(state({}), NEW_ACCOUNT);
    // Stripe opens the next period about an hour before charging it
    const pending = projectSubscription(state({ currentPeriodEnd: MONTH2, latestInvoiceStatus: 'open' }), before(first));
    assert.equal(pending.subscriptionEndDate, iso(MONTH1));
    const renewed = projectSubscription(state({ currentPeriodEnd: MONTH2 }), before(pending));
    assert.equal(renewed.subscriptionEndDate, iso(MONTH2));
  });

  test('monthly renewal fails: still subscribed (Stripe retries), access only to the paid date, asked to fix it', () => {
    const first = projectSubscription(state({}), NEW_ACCOUNT);
    const failed = projectSubscription(state({ status: 'past_due', currentPeriodEnd: MONTH2, latestInvoiceStatus: 'open' }), before(first), 'payment_failed');
    assert.equal(failed.accountStatus, ACCOUNT_STATUS.subscribed);
    assert.equal(failed.subscriptionEndDate, iso(MONTH1));
    assert.equal(failed.paymentIssue, 'payment_failed');
    assert.ok(accessAt(failed, MONTH1 - DAY) && !accessAt(failed, MONTH1 + DAY));
    // Recovered: the issue clears and the new month is granted
    const recovered = projectSubscription(state({ currentPeriodEnd: MONTH2 }), before(failed));
    assert.equal(recovered.paymentIssue, null);
    assert.equal(recovered.subscriptionEndDate, iso(MONTH2));
  });

  test('payment requires authentication: the account is asked to confirm it', () => {
    const first = projectSubscription(state({}), NEW_ACCOUNT);
    const p = projectSubscription(state({ status: 'past_due', currentPeriodEnd: MONTH2, latestInvoiceStatus: 'open' }), before(first), 'action_required');
    assert.equal(p.paymentIssue, 'action_required');
    // A later sync without a hint (e.g. customer.subscription.updated) keeps it
    assert.equal(projectSubscription(state({ status: 'past_due', currentPeriodEnd: MONTH2, latestInvoiceStatus: 'open' }), before(p)).paymentIssue, 'action_required');
  });

  test('cancel at period end, then reverse it', () => {
    const first = projectSubscription(state({}), NEW_ACCOUNT);
    const scheduled = projectSubscription(state({ cancelAt: MONTH1 }), before(first));
    assert.equal(scheduled.accountStatus, ACCOUNT_STATUS.subscribed, 'keeps access until the end');
    assert.equal(scheduled.cancelAt, iso(MONTH1));
    assert.equal(scheduled.subscriptionEndDate, iso(MONTH1));
    const reversed = projectSubscription(state({}), before(scheduled));
    assert.equal(reversed.cancelAt, null);
    assert.equal(reversed.accountStatus, ACCOUNT_STATUS.subscribed);
  });

  test('subscription ends: Cancelled, the paid month kept, then no access', () => {
    const first = projectSubscription(state({}), NEW_ACCOUNT);
    const ended = projectSubscription(state({ status: 'canceled', cancelAt: MONTH1 }), before(first));
    assert.equal(ended.accountStatus, ACCOUNT_STATUS.canceled);
    assert.equal(ended.subscriptionEndDate, iso(MONTH1));
    assert.equal(ended.cancelAt, null);
    assert.ok(accessAt(ended, MONTH1 - DAY) && !accessAt(ended, MONTH1 + DAY));
    assert.ok(canSubscribe(ended.accountStatus), 'can subscribe again');
  });

  test('subscribing again after it ended', () => {
    const ended = { accountStatus: ACCOUNT_STATUS.canceled, subscriptionEndDate: iso(MONTH1), paymentIssue: null };
    const again = projectSubscription(state({ currentPeriodEnd: MONTH2, startedAt: MONTH1 + 5 * DAY }), ended);
    assert.equal(again.accountStatus, ACCOUNT_STATUS.subscribed);
    assert.equal(again.subscriptionEndDate, iso(MONTH2));
  });

  test('a payment that never completed expires without granting anything', () => {
    const p = projectSubscription(state({ status: 'incomplete_expired', latestInvoiceStatus: 'void' }), NEW_ACCOUNT);
    assert.equal(p.accountStatus, ACCOUNT_STATUS.unsubscribed);
    assert.equal(p.subscriptionEndDate, null);
    assert.equal(p.paymentIssue, null);
  });

  test('duplicate deliveries: applying the same Stripe state twice changes nothing', () => {
    const once = projectSubscription(state({}), NEW_ACCOUNT);
    assert.deepEqual(projectSubscription(state({}), before(once)), once);
  });

  test('out-of-order deliveries: an older state never moves the paid date back or revives an ended subscription', () => {
    const renewed = { accountStatus: ACCOUNT_STATUS.subscribed, subscriptionEndDate: iso(MONTH2), paymentIssue: null };
    // A stale read of last month's period
    assert.equal(projectSubscription(state({ currentPeriodEnd: MONTH1 }), renewed).subscriptionEndDate, iso(MONTH2));
    // invoice.paid arriving after the subscription ended: the sync reads Stripe's current state, which is canceled
    const ended = { accountStatus: ACCOUNT_STATUS.canceled, subscriptionEndDate: iso(MONTH1), paymentIssue: null };
    assert.equal(projectSubscription(state({ status: 'canceled' }), ended).accountStatus, ACCOUNT_STATUS.canceled);
  });

  test('paid access needs a paid date in the future (or the Admin role)', () => {
    assert.equal(hasPracticeAccess(null, 'User'), false);
    assert.equal(hasPracticeAccess(new Date(Date.now() - 1000).toISOString(), 'User'), false);
    assert.equal(hasPracticeAccess(new Date(Date.now() + DAY * 1000).toISOString(), 'User'), true);
    assert.equal(hasPracticeAccess(null, 'Admin'), true);
  });

  test('monthly only', () => {
    assert.equal(isPlan('monthly'), true);
    assert.equal(isPlan('annual'), false);
  });
});

describe('billing source guards', () => {
  const webhook = read('src/app/api/stripe-webhook/route.ts');

  test('the webhook verifies the signature on the raw body before anything else', () => {
    assert.match(webhook, /const body = await request\.text\(\);/);
    assert.match(webhook, /stripe\.webhooks\.constructEvent\(body, signature, webhookSecret\)/);
    assert.doesNotMatch(webhook, /request\.json\(\)/);
    assert.ok(webhook.indexOf('constructEvent(') < webhook.indexOf('claimWebhookEvent(event)'));
  });

  test('each event is handled once, released for a retry when it fails, and test/live are kept apart', () => {
    assert.ok(webhook.indexOf('claimWebhookEvent(event)') < webhook.indexOf('await handle(stripe, event)'));
    assert.match(webhook, /releaseWebhookEvent\(event\.id\)[\s\S]{0,200}status: 500/);
    assert.match(webhook, /finishWebhookEvent\(event\.id, result\)/);
    assert.match(webhook, /event\.livemode !== \(mode === 'live'\)/);
  });

  test('the webhook handles the eight configured events', () => {
    for (const type of [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_failed',
      'invoice.payment_action_required',
      'customer.subscription.trial_will_end',
    ]) {
      assert.ok(webhook.includes(`case '${type}':`), type);
    }
  });

  test('every subscription change re-reads Stripe under a per-subscription lock', () => {
    const billing = read('src/lib/stripeBilling.ts');
    const sync = billing.slice(billing.indexOf('export async function syncSubscription'));
    assert.ok(sync.indexOf('pg_advisory_xact_lock') < sync.indexOf('stripe.subscriptions.retrieve'));
    assert.match(billing, /metadata\?\.app === STRIPE_APP/, "ignores RacingCoach's subscriptions on the shared account");
  });

  test('Checkout: the account’s own customer, monthly only, and no second live subscription', () => {
    const checkout = read('src/app/api/create-checkout-session/route.ts');
    assert.match(checkout, /customer: customerId/);
    assert.match(checkout, /subscription_data: \{ metadata: \{ app: STRIPE_APP, talkninja_user_id: String\(user\.id\) \} \}/);
    assert.ok(checkout.indexOf('findLiveSubscription(') < checkout.indexOf('checkout.sessions.create('));
    assert.match(checkout, /price\.recurring\?\.interval !== 'month'/);
    assert.doesNotMatch(checkout, /annual/i);
  });

  test('no annual plan is offered anywhere', () => {
    for (const file of ['src/components/PricingPlans.tsx', 'src/app/account/page.tsx', 'src/components/MySubscription.tsx', 'src/lib/planPrices.ts']) {
      assert.doesNotMatch(read(file), /annual|\/ year/i, file);
    }
  });

  test('billing routes act only on the signed-in account’s own Stripe records', () => {
    for (const file of [
      'src/app/api/cancel-subscription/route.ts',
      'src/app/api/reactivate-subscription/route.ts',
      'src/app/api/billing-portal/route.ts',
    ]) {
      const text = read(file);
      assert.match(text, /await getCurrentUser\(\)/, file);
      assert.doesNotMatch(text, /body\.(customer|subscription|userId)|get\('(customer|subscription|userId)'\)/, file);
      assert.match(text, /user\.stripe(SubscriptionId|CustomerId)/, file);
    }
  });

  test('cancelling waits for the end of the paid period', () => {
    const cancel = read('src/app/api/cancel-subscription/route.ts');
    assert.match(cancel, /cancel_at_period_end: true/);
    assert.doesNotMatch(cancel, /subscriptions\.cancel\(/);
  });

  test('the Thank You page grants nothing by itself and shows only the account’s own checkout', () => {
    const success = read('src/app/success/page.tsx');
    assert.match(success, /session\.client_reference_id !== String\(user\.id\)/);
    assert.match(success, /syncCheckoutSession\(stripe, session\)/);
    assert.doesNotMatch(success, /UPDATE "Users"|startSubscription/);
  });

  test('the Customer Portal can’t switch plans', () => {
    const billing = read('src/lib/stripeBilling.ts');
    assert.match(billing, /subscription_update: \{ enabled: false \}/);
    assert.match(billing, /mode: 'at_period_end'/);
  });
});
