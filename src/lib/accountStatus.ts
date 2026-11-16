// Values of users.account_status, which Stripe plans each can buy, and who
// can practice. Dependency-free (roles.ts is too) so pages and API routes
// can share it.
import { isAdmin } from './roles';

export const ACCOUNT_STATUS = {
  // Signed up, never subscribed
  unsubscribed: 'Unsubscribed',
  // A live Stripe subscription (active, trialing, or a renewal Stripe is still
  // collecting: past_due, unpaid, paused). Access itself follows the paid
  // period (hasPracticeAccess). Was 'Monthly Subscription' or 'Lifetime
  // Subscription'; ensureUserSchema converts old rows.
  subscribed: 'Subscribed',
  // Subscription ended in Stripe (a cancellation took effect, it was canceled
  // in the Dashboard, or payments failed). A cancellation only scheduled for
  // the end of the period stays Subscribed until then. Was 'Canceled';
  // ensureUserSchema converts old rows.
  canceled: 'Cancelled',
  // Subscription that wasn't renewed by its end date
  expired: 'Expired',
} as const;

export type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];

// TalkNinja sells one plan: a monthly subscription (TALKNINJA_MONTHLY_PRODUCT_ID's
// default recurring Price). There is no annual plan.
export type Plan = 'monthly';

export function isPlan(value: unknown): value is Plan {
  return value === 'monthly';
}

// Whether an account can use My Dojo and the Language page: Admins, and
// anyone whose subscription end date is still ahead, whatever the status
// says (so a Cancelled subscriber keeps the time they paid for). Everyone
// else is sent to Pricing.
export function hasPracticeAccess(subscriptionEndDate: string | null, role: string): boolean {
  if (isAdmin(role)) return true;
  if (!subscriptionEndDate) return false;
  const endsAt = Date.parse(subscriptionEndDate);
  return !Number.isNaN(endsAt) && endsAt > Date.now();
}

// The plan can be bought by anyone without a live subscription. Subscribers
// can't buy a second one (create-checkout-session also asks Stripe).
export function canSubscribe(accountStatus: string): boolean {
  return accountStatus !== ACCOUNT_STATUS.subscribed;
}
