// Subscription sync, webhook deduplication and voice settings against a real Postgres: npm run test:billing:db
//
// Runs syncSubscription (src/lib/stripeBilling.ts) with a fake Stripe client, so no network is used, and checks the
// database ends up right: linking a checkout to its account, ignoring RacingCoach's subscriptions on the shared Stripe
// account, duplicate and concurrent deliveries, a second live subscription, renewals, cancellation and ending. Also
// the "VoiceSettings" round trip behind resolveVoice.
//
// Needs PRIVACY_TEST_DATABASE_URL pointing at a disposable Postgres on this computer (it refuses anything else, and it
// DROPS the talkninja schema there first); see scripts/privacy-db.test.mjs for a Docker one-liner. Skipped without it.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.PRIVACY_TEST_DATABASE_URL;
const local = url && /@(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(url);
if (url && !local) throw new Error('PRIVACY_TEST_DATABASE_URL must point at a database on this computer');
const skip = !url ? 'PRIVACY_TEST_DATABASE_URL is not set' : false;

const DAY = 86400;
const NOW = Math.floor(Date.now() / 1000);
const PRODUCT = 'prod_test_talkninja_monthly';

let db, users, billing, voices;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  process.env.TALKNINJA_MONTHLY_PRODUCT_ID = PRODUCT;
  // Never email anyone from a test (notifyAdmin only logs without a key)
  delete process.env.RESEND_API_KEY;
  const pg = (await import('pg')).default;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query('DROP SCHEMA IF EXISTS talkninja CASCADE');
  await admin.end();

  db = await import('../src/lib/db.ts');
  users = await import('../src/lib/users.ts');
  billing = await import('../src/lib/stripeBilling.ts');
  voices = await import('../src/lib/voiceSettings.ts');
  await users.ensureUserSchema();
});

after(async () => {
  if (skip) return;
  await globalThis.pgPool?.end();
});

let counter = 0;
async function makeUser() {
  counter++;
  return users.createUser({
    userName: `Billing ${counter}`,
    emailAddress: `billing-test-${counter}-${Date.now()}@example.test`,
    password: 'correct horse battery',
    nativeLanguage: 'English',
    activeLearningLanguage: 'Vietnamese',
  });
}

// A Stripe subscription as the API returns it (only the fields the sync reads)
function subscription(id, { userId, status = 'active', periodEnd = NOW + 30 * DAY, invoice = 'paid', app = 'talkninja', product = PRODUCT, cancelAtPeriodEnd = false } = {}) {
  return {
    id,
    status,
    customer: `cus_${id}`,
    metadata: app ? { app, ...(userId ? { talkninja_user_id: String(userId) } : {}) } : {},
    items: { data: [{ current_period_end: periodEnd, price: { product } }] },
    latest_invoice: { status: invoice },
    cancel_at: null,
    cancel_at_period_end: cancelAtPeriodEnd,
    start_date: NOW,
  };
}

// A fake Stripe whose subscriptions can be changed between syncs, like Stripe's state moving on
function fakeStripe() {
  const subs = new Map();
  return {
    subs,
    set: (sub) => subs.set(sub.id, sub),
    subscriptions: {
      retrieve: async (id) => {
        const sub = subs.get(id);
        if (!sub) throw Object.assign(new Error(`No such subscription: ${id}`), { statusCode: 404 });
        // A little latency, so concurrent syncs really overlap
        await new Promise((r) => setTimeout(r, 5));
        return structuredClone(sub);
      },
    },
  };
}

const row = async (userId) =>
  (await db.query('SELECT * FROM "Users" WHERE id = $1', [userId]))[0];

describe('subscription sync (database)', { skip }, () => {
  test('a completed checkout links the subscription and grants the paid month; repeating it changes nothing', async () => {
    const user = await makeUser();
    const stripe = fakeStripe();
    stripe.set(subscription('sub_a1', { userId: user.id }));

    const first = await billing.syncSubscription(stripe, 'sub_a1', { userId: user.id });
    assert.equal(first.status, 'synced');
    const r1 = await row(user.id);
    assert.equal(r1.account_status, 'Subscribed');
    assert.equal(r1.stripe_subscription_id, 'sub_a1');
    assert.equal(r1.stripe_customer_id, 'cus_sub_a1');
    assert.equal(r1.stripe_subscription_status, 'active');
    assert.ok(Date.parse(r1.subscription_end_date) > Date.now() + 29 * DAY * 1000);

    // A duplicate delivery (and the Thank You page) apply the same state again
    await billing.syncSubscription(stripe, 'sub_a1', { userId: user.id });
    const r2 = await row(user.id);
    assert.equal(r2.subscription_end_date, r1.subscription_end_date);
    assert.equal(r2.account_status, 'Subscribed');
  });

  test('a subscription event that arrives before its checkout finds the account from its metadata', async () => {
    const user = await makeUser();
    const stripe = fakeStripe();
    stripe.set(subscription('sub_b1', { userId: user.id }));
    assert.equal((await billing.syncSubscription(stripe, 'sub_b1')).status, 'synced');
    assert.equal((await row(user.id)).stripe_subscription_id, 'sub_b1');
  });

  test("RacingCoach's subscriptions on the shared Stripe account are ignored", async () => {
    const user = await makeUser();
    const stripe = fakeStripe();
    stripe.set(subscription('sub_rc1', { userId: user.id, app: 'racingcoach', product: 'prod_racingcoach_gold' }));
    const result = await billing.syncSubscription(stripe, 'sub_rc1');
    assert.equal(result.status, 'ignored');
    const r = await row(user.id);
    assert.equal(r.stripe_subscription_id, null);
    assert.equal(r.account_status, 'Unsubscribed');
  });

  test('payment not yet confirmed grants nothing; confirmed later, it does', async () => {
    const user = await makeUser();
    const stripe = fakeStripe();
    stripe.set(subscription('sub_c1', { userId: user.id, status: 'incomplete', invoice: 'open' }));
    await billing.syncSubscription(stripe, 'sub_c1', { userId: user.id });
    let r = await row(user.id);
    assert.equal(r.account_status, 'Unsubscribed');
    assert.equal(r.subscription_end_date, null);
    assert.equal(r.stripe_payment_issue, 'action_required');

    stripe.set(subscription('sub_c1', { userId: user.id }));
    await billing.syncSubscription(stripe, 'sub_c1');
    r = await row(user.id);
    assert.equal(r.account_status, 'Subscribed');
    assert.equal(r.stripe_payment_issue, null);
  });

  test('renewal, failed renewal, cancel at period end, then the end: in any order of events', async () => {
    const user = await makeUser();
    const stripe = fakeStripe();
    const end1 = NOW + 30 * DAY;
    const end2 = NOW + 61 * DAY;
    stripe.set(subscription('sub_d1', { userId: user.id, periodEnd: end1 }));
    await billing.syncSubscription(stripe, 'sub_d1', { userId: user.id });

    // Renewal fails: still subscribed, paid date unchanged, asked to fix it
    stripe.set(subscription('sub_d1', { userId: user.id, status: 'past_due', periodEnd: end2, invoice: 'open' }));
    await billing.syncSubscription(stripe, 'sub_d1', { paymentHint: 'payment_failed' });
    let r = await row(user.id);
    assert.equal(r.account_status, 'Subscribed');
    assert.equal(Date.parse(r.subscription_end_date), end1 * 1000);
    assert.equal(r.stripe_payment_issue, 'payment_failed');

    // Recovered
    stripe.set(subscription('sub_d1', { userId: user.id, periodEnd: end2 }));
    await billing.syncSubscription(stripe, 'sub_d1');
    r = await row(user.id);
    assert.equal(Date.parse(r.subscription_end_date), end2 * 1000);
    assert.equal(r.stripe_payment_issue, null);

    // Cancellation scheduled: still Subscribed, the end date shown
    stripe.set(subscription('sub_d1', { userId: user.id, periodEnd: end2, cancelAtPeriodEnd: true }));
    await billing.syncSubscription(stripe, 'sub_d1');
    r = await row(user.id);
    assert.equal(r.account_status, 'Subscribed');
    assert.equal(r.stripe_cancel_at.getTime(), end2 * 1000);

    // Ended; then a late invoice.paid delivery re-reads Stripe and finds it ended
    stripe.set(subscription('sub_d1', { userId: user.id, status: 'canceled', periodEnd: end2 }));
    await billing.syncSubscription(stripe, 'sub_d1');
    await billing.syncSubscription(stripe, 'sub_d1');
    r = await row(user.id);
    assert.equal(r.account_status, 'Cancelled');
    assert.equal(Date.parse(r.subscription_end_date), end2 * 1000, 'the paid month is kept');
    assert.equal(r.stripe_cancel_at, null);
  });

  test('subscribing again after the subscription ended moves the account to the new one', async () => {
    const user = await makeUser();
    const stripe = fakeStripe();
    stripe.set(subscription('sub_e1', { userId: user.id, status: 'canceled' }));
    stripe.set(subscription('sub_e2', { userId: user.id, periodEnd: NOW + 90 * DAY }));
    // An ended subscription is never linked
    assert.equal((await billing.syncSubscription(stripe, 'sub_e1', { userId: user.id })).status, 'ignored');
    await db.query('UPDATE "Users" SET stripe_subscription_id = $2, account_status = $3 WHERE id = $1', [user.id, 'sub_e1', 'Cancelled']);
    assert.equal((await billing.syncSubscription(stripe, 'sub_e2', { userId: user.id })).status, 'synced');
    const r = await row(user.id);
    assert.equal(r.stripe_subscription_id, 'sub_e2');
    assert.equal(r.account_status, 'Subscribed');
  });

  test('a second live subscription for the same account is reported, not swapped in', async () => {
    const user = await makeUser();
    const stripe = fakeStripe();
    stripe.set(subscription('sub_f1', { userId: user.id }));
    stripe.set(subscription('sub_f2', { userId: user.id }));
    await billing.syncSubscription(stripe, 'sub_f1', { userId: user.id });
    const second = await billing.syncSubscription(stripe, 'sub_f2', { userId: user.id });
    assert.equal(second.status, 'duplicate');
    assert.equal((await row(user.id)).stripe_subscription_id, 'sub_f1');
  });

  test('concurrent deliveries about one subscription are applied one at a time', async () => {
    const user = await makeUser();
    const stripe = fakeStripe();
    stripe.set(subscription('sub_g1', { userId: user.id }));
    const results = await Promise.all(Array.from({ length: 6 }, () => billing.syncSubscription(stripe, 'sub_g1', { userId: user.id })));
    assert.ok(results.every((r) => r.status === 'synced'));
    // Only one of them started the subscription (the purchase email is sent once)
    assert.equal(results.filter((r) => r.started).length, 1);
  });

  test('the checkout and the subscription must name the same account', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const stripe = fakeStripe();
    stripe.set(subscription('sub_h1', { userId: a.id }));
    assert.equal((await billing.syncSubscription(stripe, 'sub_h1', { userId: b.id })).status, 'ignored');
    assert.equal((await row(b.id)).stripe_subscription_id, null);
  });
});

describe('webhook event deduplication (database)', { skip }, () => {
  const event = (id) => ({ id, type: 'invoice.paid', created: NOW, livemode: false });

  test('an event is handled once; a failed one can be handled again', async () => {
    assert.equal(await billing.claimWebhookEvent(event('evt_1')), 'new');
    assert.equal(await billing.claimWebhookEvent(event('evt_1')), 'busy', 'still being handled');
    await billing.finishWebhookEvent('evt_1', 'synced account 1');
    assert.equal(await billing.claimWebhookEvent(event('evt_1')), 'done');

    assert.equal(await billing.claimWebhookEvent(event('evt_2')), 'new');
    await billing.releaseWebhookEvent('evt_2');
    assert.equal(await billing.claimWebhookEvent(event('evt_2')), 'new', 'released for the retry');
  });
});

describe('voice settings (database)', { skip }, () => {
  test('an Admin change is used on the next request, and Reset goes back to the environment', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key-not-used';
    process.env.TALKNINJA_VIETNAMESE_MALE_VOICE_ID = 'AbCdEfGhIjKlMnOpQrSt';
    process.env.TALKNINJA_VIETNAMESE_FEMALE_VOICE_ID = 'TsRqPoNmLkJiHgFeDcBa';
    const admin = await makeUser();

    assert.equal((await voices.resolveVoice('Vietnamese', 'male')).voiceId, 'AbCdEfGhIjKlMnOpQrSt');

    await voices.saveVoiceSettings(
      'Vietnamese',
      { maleVoiceId: 'ZyXwVuTsRqPoNmLkJi12', femaleVoiceId: null, maleEnabled: true, femaleEnabled: true, defaultGender: 'female', model: 'eleven_v3' },
      admin.id
    );
    const male = await voices.resolveVoice('Vietnamese', 'male');
    assert.equal(male.voiceId, 'ZyXwVuTsRqPoNmLkJi12');
    assert.equal(male.model, 'eleven_v3');
    assert.equal((await voices.resolveVoice('Vietnamese', 'female')).voiceId, 'TsRqPoNmLkJiHgFeDcBa', 'empty means the environment');
    assert.equal((await voices.resolveVoice('Vietnamese', null)).gender, 'female', 'the default voice');

    const listed = (await voices.listVoiceSettingsForAdmin()).find((r) => r.language === 'Vietnamese');
    assert.equal(listed.customized, true);
    assert.equal(listed.voices.male.source, 'database');
    assert.equal(listed.updatedBy, admin.userName);

    await voices.resetVoiceSettings('Vietnamese');
    assert.equal((await voices.resolveVoice('Vietnamese', 'male')).voiceId, 'AbCdEfGhIjKlMnOpQrSt');
    assert.equal((await voices.resolveVoice('English', 'male')).provider, 'openai');
  });
});
