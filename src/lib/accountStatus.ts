// Values of users.account_status, which Stripe plans each can buy, and who
// can practice. Dependency-free (roles.ts is too) so pages and API routes
// can share it.
import { isAdmin } from './roles';

export const ACCOUNT_STATUS = {
  // Signed up, never subscribed
  unsubscribed: 'Unsubscribed',
  // A current Monthly or Annual subscription. Was 'Monthly Subscription' or
  // 'Lifetime Subscription'; ensureUserSchema converts old rows.
  subscribed: 'Subscribed',
  // Subscription canceled (here, in the Stripe Dashboard, or after failed
  // payments). Was 'Canceled'; ensureUserSchema converts old rows.
  canceled: 'Cancelled',
  // Subscription that wasn't renewed by its end date
  expired: 'Expired',
} as const;

export type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];

export type Plan = 'monthly' | 'annual';

export function isPlan(value: unknown): value is Plan {
  return value === 'monthly' || value === 'annual';
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

// Either plan can be bought by anyone without a current subscription.
// Subscribers can't buy either.
export function canSubscribe(accountStatus: string): boolean {
  return accountStatus !== ACCOUNT_STATUS.subscribed;
}
