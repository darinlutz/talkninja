// What a Stripe subscription, as Stripe says it is right now, makes of the TalkNinja account it belongs to. Applied by
// syncSubscription (src/lib/stripeBilling.ts) under the subscription's lock on every webhook event about it, on the
// Thank You page and on each visit to the Account page. Because it always starts from Stripe's current state, repeated
// and out-of-order webhook deliveries end up in the same place, and the paid-through date never moves backwards.
// No imports but accountStatus.ts, so the tests run it directly (scripts/billing.test.mjs).
import { ACCOUNT_STATUS } from './accountStatus';

// Stripe's subscription statuses that are still running: Stripe will bill (or is collecting) it, so a second
// subscription mustn't be bought. incomplete is the first payment still being confirmed.
export const LIVE_STRIPE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'];
// Of those, the ones that make the account Subscribed (incomplete hasn't been paid for yet)
const SUBSCRIBED_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'paused'];
// Ended for good
export const ENDED_STRIPE_STATUSES = ['canceled', 'incomplete_expired'];

export function isLiveStripeStatus(status: string | null | undefined): boolean {
  return !!status && LIVE_STRIPE_STATUSES.includes(status);
}

// A payment problem the Account page asks the subscriber to fix
export type PaymentIssue = 'payment_failed' | 'action_required';

export type StripeSubscriptionState = {
  status: string;
  // The current billing period's end (unix seconds)
  currentPeriodEnd: number | null;
  // The latest invoice's status: 'paid' once the current period is paid for
  latestInvoiceStatus: string | null;
  // When a scheduled cancellation takes effect (unix seconds): cancel_at, or the period end with cancel_at_period_end
  cancelAt: number | null;
  startedAt: number | null;
};

export type AccountBefore = {
  accountStatus: string;
  subscriptionEndDate: string | null;
  paymentIssue: string | null;
};

// What the webhook event said happened, when it was about a payment
export type PaymentHint = 'payment_failed' | 'action_required' | null;

export type SubscriptionProjection = {
  accountStatus: string;
  // The end of the period paid for (the entitlement, hasPracticeAccess), ISO 8601
  subscriptionEndDate: string | null;
  paymentIssue: PaymentIssue | null;
  stripeStatus: string;
  cancelAt: string | null;
  currentPeriodEnd: string | null;
  startedAt: string | null;
};

const iso = (seconds: number | null) => (seconds ? new Date(seconds * 1000).toISOString() : null);

function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export function projectSubscription(
  state: StripeSubscriptionState,
  before: AccountBefore,
  hint: PaymentHint = null
): SubscriptionProjection {
  const paid = state.latestInvoiceStatus === 'paid';
  let accountStatus = before.accountStatus;
  let subscriptionEndDate = before.subscriptionEndDate;

  if (SUBSCRIBED_STATUSES.includes(state.status)) {
    accountStatus = ACCOUNT_STATUS.subscribed;
    // The current period counts only once it's paid for: Stripe moves a subscription into its next period about an
    // hour before it charges the renewal, and a renewal that then fails mustn't have given the month away. Only
    // active or trialing extend it; past_due/unpaid/paused keep what was paid.
    if (paid && (state.status === 'active' || state.status === 'trialing')) {
      subscriptionEndDate = laterOf(before.subscriptionEndDate, iso(state.currentPeriodEnd));
    }
  } else if (state.status === 'canceled') {
    // Ended: the time already paid for is kept (hasPracticeAccess). An account that never paid stays as it was.
    if (before.accountStatus === ACCOUNT_STATUS.subscribed || before.subscriptionEndDate) {
      accountStatus = ACCOUNT_STATUS.canceled;
    }
  }
  // incomplete and incomplete_expired: the first payment isn't (or was never) confirmed, so nothing is granted

  let paymentIssue: PaymentIssue | null = null;
  if (ENDED_STRIPE_STATUSES.includes(state.status) || (paid && !['past_due', 'unpaid'].includes(state.status))) {
    paymentIssue = null;
  } else if (state.status === 'incomplete') {
    // The first payment needs the customer (3D Secure) or failed; either way they finish it on the invoice
    paymentIssue = 'action_required';
  } else if (['past_due', 'unpaid'].includes(state.status) || hint) {
    const knownAction = hint === 'action_required' || (hint === null && before.paymentIssue === 'action_required');
    paymentIssue = knownAction ? 'action_required' : 'payment_failed';
  }

  return {
    accountStatus,
    subscriptionEndDate,
    paymentIssue,
    stripeStatus: state.status,
    cancelAt: ENDED_STRIPE_STATUSES.includes(state.status) ? null : iso(state.cancelAt),
    currentPeriodEnd: iso(state.currentPeriodEnd),
    startedAt: iso(state.startedAt),
  };
}

// The subscription status in words, for the Account page
export const STRIPE_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Past Due',
  unpaid: 'Unpaid',
  paused: 'Paused',
  incomplete: 'Payment Pending',
  incomplete_expired: 'Payment Expired',
  canceled: 'Canceled',
};
