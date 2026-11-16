// TalkNinja's Stripe billing, server only: keeping each account in step with its subscription (syncSubscription),
// handling each webhook event once (claimWebhookEvent), and the Account page's view of the subscription and its
// Customer Portal. Ported from RacingCoach's src/lib/stripeBilling.ts and billingPortal.ts.
//
// Stripe is the source of truth. Every webhook event about a subscription, whatever its type or order, re-reads the
// subscription from Stripe under a per-subscription lock and applies what it says now (src/lib/subscriptionProjection.ts),
// so repeated or out-of-order deliveries can't leave stale data, and the Thank You and Account pages do the same.
//
// The Stripe account is shared with RacingCoach, whose events reach TalkNinja's webhook too. A subscription is
// TalkNinja's when an account here is linked to it, or it carries metadata.app = 'talkninja' (set at checkout), or
// it's for a TalkNinja product (TALKNINJA_MONTHLY_PRODUCT_ID, or TALKNINJA_LEGACY_PRODUCT_IDS for older ones).
// Anything else is ignored.
import Stripe from 'stripe';
import type { PoolClient } from 'pg';
import { query, transaction } from './db';
import { ensureUserSchema, type User } from './users';
import { notifyAdmin, notifyAdminAlert } from './adminNotification';
import {
  ENDED_STRIPE_STATUSES,
  isLiveStripeStatus,
  projectSubscription,
  type PaymentHint,
  type StripeSubscriptionState,
} from './subscriptionProjection';
import { ACCOUNT_STATUS } from './accountStatus';

// Tags TalkNinja's Checkout Sessions, Customers and Subscriptions (metadata.app); RacingCoach uses 'racingcoach'
export const STRIPE_APP = 'talkninja';

// A Stripe client, or null when STRIPE_SECRET_KEY isn't set. Retries rate-limited and failed requests.
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key, { maxNetworkRetries: 2 }) : null;
}

// Whether the secret key is a live or a test key (sk_/rk_ live or test), so a test event can't change live accounts
export function stripeKeyMode(key = process.env.STRIPE_SECRET_KEY): 'live' | 'test' | null {
  if (!key) return null;
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  return null;
}

export function talkNinjaProductIds(): string[] {
  return [process.env.TALKNINJA_MONTHLY_PRODUCT_ID, ...(process.env.TALKNINJA_LEGACY_PRODUCT_IDS ?? '').split(',')]
    .map((id) => id?.trim())
    .filter((id): id is string => !!id);
}

const idOf = (value: string | { id: string } | null | undefined) => (value == null ? null : typeof value === 'string' ? value : value.id);
const isNotFound = (error: unknown) => (error as { statusCode?: number } | null)?.statusCode === 404;

export function isTalkNinjaSubscription(subscription: Stripe.Subscription): boolean {
  if (subscription.metadata?.app === STRIPE_APP) return true;
  const products = talkNinjaProductIds();
  return subscription.items.data.some((item) => products.includes(idOf(item.price.product) ?? ''));
}

// What projectSubscription needs from a Stripe subscription (retrieved with latest_invoice expanded)
export function subscriptionState(subscription: Stripe.Subscription): StripeSubscriptionState {
  // In this API version the billing period is on each item
  const ends = subscription.items.data.map((item) => item.current_period_end).filter((n) => Number.isFinite(n));
  const currentPeriodEnd = ends.length ? Math.max(...ends) : null;
  const invoice = subscription.latest_invoice;
  return {
    status: subscription.status,
    currentPeriodEnd,
    latestInvoiceStatus: invoice && typeof invoice !== 'string' ? invoice.status : null,
    cancelAt: subscription.cancel_at ?? (subscription.cancel_at_period_end ? currentPeriodEnd : null),
    startedAt: subscription.start_date ?? null,
  };
}

export type SyncHints = {
  // The account a Checkout Session says subscribed (its client_reference_id)
  userId?: number;
  // What a payment webhook event said happened
  paymentHint?: PaymentHint;
};

export type SyncResult =
  | { status: 'synced'; userId: number; emailAddress: string; started: boolean; ended: boolean }
  | { status: 'ignored' | 'duplicate'; reason: string };

type UserRow = {
  id: number;
  email_address: string;
  account_status: string;
  subscription_end_date: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  stripe_payment_issue: string | null;
};
const ROW_COLUMNS =
  'id, email_address, account_status, subscription_end_date, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_payment_issue';

// The account a subscription belongs to, linking it if this is the subscription's first sync. Never links an ended
// subscription, and never replaces an account's other live subscription (that would be a duplicate).
async function accountFor(
  client: PoolClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
  hints: SyncHints
): Promise<{ row: UserRow } | { ignored: SyncResult }> {
  const linked = await client.query<UserRow>(`SELECT ${ROW_COLUMNS} FROM "Users" WHERE stripe_subscription_id = $1 FOR UPDATE`, [
    subscription.id,
  ]);
  if (linked.rows[0]) return { row: linked.rows[0] };

  if (!isTalkNinjaSubscription(subscription)) return { ignored: { status: 'ignored', reason: 'not a TalkNinja subscription' } };
  const fromMetadata = Number(subscription.metadata?.talkninja_user_id);
  const userId = hints.userId ?? fromMetadata;
  if (!Number.isInteger(userId)) return { ignored: { status: 'ignored', reason: 'no TalkNinja account on it' } };
  if (hints.userId && Number.isInteger(fromMetadata) && fromMetadata !== hints.userId) {
    console.error(`Stripe subscription ${subscription.id} is for account ${fromMetadata}, but its checkout says ${hints.userId}`);
    return { ignored: { status: 'ignored', reason: 'account mismatch' } };
  }
  if (ENDED_STRIPE_STATUSES.includes(subscription.status)) {
    return { ignored: { status: 'ignored', reason: `an ended (${subscription.status}) subscription is never linked` } };
  }

  const found = await client.query<UserRow>(`SELECT ${ROW_COLUMNS} FROM "Users" WHERE id = $1 FOR UPDATE`, [userId]);
  const row = found.rows[0];
  if (!row) return { ignored: { status: 'ignored', reason: `account ${userId} not found` } };

  if (row.stripe_subscription_id && row.stripe_subscription_id !== subscription.id) {
    // Is the subscription the account has now still running? Asked of Stripe, in case an event about it was missed.
    let otherStatus: string | null = null;
    try {
      otherStatus = (await stripe.subscriptions.retrieve(row.stripe_subscription_id)).status;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    if (isLiveStripeStatus(otherStatus)) {
      const text = `Account ${row.id} (${row.email_address}) has two live TalkNinja subscriptions: ${row.stripe_subscription_id} (${otherStatus}) and ${subscription.id} (${subscription.status}). The account stays on the first; cancel and refund the duplicate in the Stripe Dashboard.`;
      console.error(`Duplicate subscription: ${text}`);
      await notifyAdminAlert('Duplicate TalkNinja subscription', text);
      return { ignored: { status: 'duplicate', reason: text } };
    }
  }
  console.log(`Stripe subscription ${subscription.id} linked to account ${row.id}`);
  return { row };
}

// Brings the account tied to the subscription to what Stripe says now. Safe to call any number of times, in any order.
export async function syncSubscription(stripe: Stripe, subscriptionId: string, hints: SyncHints = {}): Promise<SyncResult> {
  await ensureUserSchema();
  const result = await transaction(async (client): Promise<SyncResult> => {
    // One sync per subscription at a time, so two events can't interleave their reads and writes
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`talkninja_stripe_subscription:${subscriptionId}`]);
    let subscription: Stripe.Subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
    } catch (error) {
      if (isNotFound(error)) return { status: 'ignored', reason: 'subscription not found in Stripe' };
      throw error;
    }

    const account = await accountFor(client, stripe, subscription, hints);
    if ('ignored' in account) return account.ignored;
    const { row } = account;

    const projection = projectSubscription(
      subscriptionState(subscription),
      { accountStatus: row.account_status, subscriptionEndDate: row.subscription_end_date, paymentIssue: row.stripe_payment_issue },
      hints.paymentHint ?? null
    );
    await client.query(
      `UPDATE "Users" SET account_status = $2, subscription_end_date = $3, stripe_customer_id = $4,
         stripe_subscription_id = $5, stripe_subscription_status = $6, stripe_cancel_at = $7,
         stripe_current_period_end = $8, stripe_subscription_started_at = $9, stripe_payment_issue = $10,
         stripe_synced_at = now()
       WHERE id = $1`,
      [
        row.id,
        projection.accountStatus,
        projection.subscriptionEndDate,
        idOf(subscription.customer),
        subscription.id,
        projection.stripeStatus,
        projection.cancelAt,
        projection.currentPeriodEnd,
        projection.startedAt,
        projection.paymentIssue,
      ]
    );
    return {
      status: 'synced',
      userId: row.id,
      emailAddress: row.email_address,
      started: row.account_status !== ACCOUNT_STATUS.subscribed && projection.accountStatus === ACCOUNT_STATUS.subscribed,
      ended: row.account_status !== ACCOUNT_STATUS.canceled && projection.accountStatus === ACCOUNT_STATUS.canceled,
    };
  });
  // Emails after the transaction, and never failing the sync
  if (result.status === 'synced' && result.started) await notifyAdmin('monthly', result.emailAddress);
  return result;
}

// A Checkout Session of TalkNinja's (webhook, Thank You page): links and syncs its subscription. Returns null when
// the session isn't TalkNinja's or isn't a completed subscription checkout.
export async function syncCheckoutSession(stripe: Stripe, session: Stripe.Checkout.Session): Promise<SyncResult | null> {
  const userId = Number(session.client_reference_id);
  const subscriptionId = idOf(session.subscription);
  if (session.metadata?.app !== STRIPE_APP || session.mode !== 'subscription' || !Number.isInteger(userId) || !subscriptionId) {
    return null;
  }
  return syncSubscription(stripe, subscriptionId, { userId });
}

// The account's live TalkNinja subscription in Stripe, if it has one (checked before Checkout, so a second one can't
// be bought even if the account's own record is behind)
export async function findLiveSubscription(stripe: Stripe, customerId: string): Promise<Stripe.Subscription | null> {
  for await (const subscription of stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 })) {
    if (isLiveStripeStatus(subscription.status) && isTalkNinjaSubscription(subscription)) return subscription;
  }
  return null;
}

// The account's Stripe Customer, created (and saved) the first time it subscribes, so its checkouts, subscriptions
// and invoices are all on one customer that's tied to the account on the server
export async function customerForUser(stripe: Stripe, user: User): Promise<string> {
  if (user.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(user.stripeCustomerId);
      if (!('deleted' in existing && existing.deleted)) return existing.id;
    } catch (error) {
      // A customer from the other mode (test vs live) or deleted in the Dashboard: make a new one
      if (!isNotFound(error)) throw error;
    }
  }
  const customer = await stripe.customers.create(
    {
      email: user.emailAddress,
      name: user.userName,
      metadata: { app: STRIPE_APP, talkninja_user_id: String(user.id) },
    },
    // Two clicks at once make one customer
    { idempotencyKey: `talkninja-customer-${user.id}-${user.stripeCustomerId ?? 'new'}` }
  );
  await ensureUserSchema();
  await query('UPDATE "Users" SET stripe_customer_id = $2 WHERE id = $1', [user.id, customer.id]);
  return customer.id;
}

// ---- Webhook events: each handled once ----

// 'new': handle it. 'done': already handled (a repeated delivery). 'busy': another delivery is handling it now
// (Stripe is told to retry). A claim not finished within 10 minutes (a crash) can be taken again.
export async function claimWebhookEvent(event: Stripe.Event): Promise<'new' | 'done' | 'busy'> {
  await ensureUserSchema();
  const claimed = await query(
    `INSERT INTO "StripeWebhookEvents" AS e (event_id, event_type, event_created, livemode) VALUES ($1, $2, $3, $4)
     ON CONFLICT (event_id) DO UPDATE SET received_at = now()
       WHERE e.processed_at IS NULL AND e.received_at < now() - interval '10 minutes'
     RETURNING event_id`,
    [event.id, event.type, new Date(event.created * 1000), event.livemode]
  );
  if (claimed.length) return 'new';
  const [row] = await query('SELECT processed_at FROM "StripeWebhookEvents" WHERE event_id = $1', [event.id]);
  return row?.processed_at ? 'done' : 'busy';
}

export async function finishWebhookEvent(eventId: string, result: string): Promise<void> {
  await query('UPDATE "StripeWebhookEvents" SET processed_at = now(), result = $2 WHERE event_id = $1', [eventId, result.slice(0, 500)]);
  await query(`DELETE FROM "StripeWebhookEvents" WHERE received_at < now() - interval '90 days'`);
}

// Handling failed: lets Stripe's retry handle it again
export async function releaseWebhookEvent(eventId: string): Promise<void> {
  await query('DELETE FROM "StripeWebhookEvents" WHERE event_id = $1 AND processed_at IS NULL', [eventId]);
}

// ---- The Account page ----

export type InvoiceSummary = {
  id: string;
  number: string | null;
  created: string;
  amount: string;
  status: string | null;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
};

export type SubscriptionOverview = {
  planName: string;
  price: string | null;
  interval: string | null;
  status: string;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  startedAt: string | null;
  paymentMethod: string | null;
  // The latest invoice when it still needs paying (a failed payment or one awaiting authentication)
  openInvoiceUrl: string | null;
  invoices: InvoiceSummary[];
};

export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (amount == null || !currency) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);
}

function describePaymentMethod(method: string | Stripe.PaymentMethod | null | undefined): string | null {
  if (!method || typeof method === 'string') return null;
  if (method.card) {
    const brand = method.card.brand.charAt(0).toUpperCase() + method.card.brand.slice(1);
    return `${brand} ending in ${method.card.last4} (expires ${String(method.card.exp_month).padStart(2, '0')}/${method.card.exp_year})`;
  }
  return method.type.replace(/_/g, ' ');
}

// The signed-in user's own subscription and invoices, read from Stripe now (after syncing the account with it, so
// coming back from Checkout or the Customer Portal shows the change). Only ever the account's own customer and
// subscription, from the database, never from the request. null when there's nothing to show or Stripe can't be read.
export async function getSubscriptionOverview(user: User): Promise<SubscriptionOverview | null> {
  const stripe = stripeClient();
  if (!stripe || !user.stripeSubscriptionId) return null;
  try {
    await syncSubscription(stripe, user.stripeSubscriptionId);
    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
      expand: ['default_payment_method', 'latest_invoice', 'items.data.price.product'],
    });
    const item = subscription.items.data[0];
    const price = item?.price;
    const product = price && typeof price.product !== 'string' && !('deleted' in price.product && price.product.deleted) ? price.product : null;
    const state = subscriptionState(subscription);

    let paymentMethod = describePaymentMethod(subscription.default_payment_method);
    const customerId = idOf(subscription.customer)!;
    if (!paymentMethod) {
      const customer = await stripe.customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] });
      if (!('deleted' in customer && customer.deleted)) {
        paymentMethod = describePaymentMethod((customer as Stripe.Customer).invoice_settings?.default_payment_method);
      }
    }

    const latest = subscription.latest_invoice && typeof subscription.latest_invoice !== 'string' ? subscription.latest_invoice : null;
    const invoices = await stripe.invoices.list({ customer: customerId, limit: 12 });
    return {
      planName: product && 'name' in product ? product.name : 'TalkNinja Monthly Subscription',
      price: formatMoney(price?.unit_amount, price?.currency),
      interval: price?.recurring?.interval ?? null,
      status: subscription.status,
      currentPeriodEnd: state.currentPeriodEnd ? new Date(state.currentPeriodEnd * 1000).toISOString() : null,
      cancelAt: ENDED_STRIPE_STATUSES.includes(subscription.status) || !state.cancelAt ? null : new Date(state.cancelAt * 1000).toISOString(),
      startedAt: state.startedAt ? new Date(state.startedAt * 1000).toISOString() : null,
      paymentMethod,
      openInvoiceUrl: latest && latest.status === 'open' ? latest.hosted_invoice_url ?? null : null,
      invoices: invoices.data
        .filter((invoice) => invoice.status !== 'draft')
        .map((invoice) => ({
          id: invoice.id!,
          number: invoice.number ?? null,
          created: new Date(invoice.created * 1000).toISOString(),
          amount: formatMoney(invoice.total, invoice.currency) ?? '—',
          status: invoice.status ?? null,
          hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
          pdfUrl: invoice.invoice_pdf ?? null,
        })),
    };
  } catch (error) {
    console.error(`Subscription overview for account ${user.id} failed:`, error);
    return null;
  }
}

// ---- Customer Portal ----

// TalkNinja's own portal configuration, made by the site the first time and kept in "SiteSettings"
// (stripe_portal_configuration:<live|test>), so the Stripe account's default (shared with RacingCoach) is never
// touched. Monthly only: no plan switching. Cancelling happens at the end of the paid period.
const PORTAL_VERSION = '1';
export const PORTAL_FEATURES: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
  payment_method_update: { enabled: true },
  invoice_history: { enabled: true },
  customer_update: { enabled: false },
  subscription_cancel: {
    enabled: true,
    mode: 'at_period_end',
    proration_behavior: 'none',
    cancellation_reason: {
      enabled: true,
      options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'too_complex', 'low_quality', 'customer_service', 'other'],
    },
  },
  subscription_update: { enabled: false },
};

async function portalConfigurationId(stripe: Stripe, siteUrl: string): Promise<string> {
  await ensureUserSchema();
  const key = `stripe_portal_configuration:${stripeKeyMode() ?? 'unknown'}`;
  const [row] = await query<{ value: string }>('SELECT value FROM "SiteSettings" WHERE key = $1', [key]);
  const params = {
    business_profile: {
      headline: 'TalkNinja billing',
      privacy_policy_url: `${siteUrl}/privacy`,
      terms_of_service_url: `${siteUrl}/terms`,
    },
    default_return_url: `${siteUrl}/account#subscription`,
    features: PORTAL_FEATURES,
    metadata: { app: STRIPE_APP, talkninja_portal_version: PORTAL_VERSION },
  };
  if (row) {
    try {
      const existing = await stripe.billingPortal.configurations.retrieve(row.value);
      if (existing.active) {
        // Brought up to date when this file's features change
        if (existing.metadata?.talkninja_portal_version !== PORTAL_VERSION) {
          await stripe.billingPortal.configurations.update(existing.id, params);
        }
        return existing.id;
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
  const created = await stripe.billingPortal.configurations.create({ name: 'TalkNinja', ...params });
  await query(
    `INSERT INTO "SiteSettings" (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, created.id]
  );
  console.log(`Stripe Customer Portal configuration ${created.id} created`);
  return created.id;
}

// A portal session for the account's own customer; its URL works once and expires. flow 'payment_method_update'
// opens straight on changing the card.
export async function billingPortalUrl(
  stripe: Stripe,
  customerId: string,
  siteUrl: string,
  flow: 'payment_method_update' | null
): Promise<string> {
  const configuration = await portalConfigurationId(stripe, siteUrl);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    configuration,
    return_url: `${siteUrl}/account?billing=updated#subscription`,
    ...(flow ? { flow_data: { type: flow, after_completion: { type: 'redirect', redirect: { return_url: `${siteUrl}/account?billing=updated#subscription` } } } } : {}),
  });
  return session.url;
}
