// Values of users.account_status, which Stripe plans each can buy, and who
// can practice. Dependency-free (roles.ts is too) so pages and API routes
// can share it.
import { isAdmin } from './roles';

export const ACCOUNT_STATUS = {
  // Signed up, never subscribed
  unsubscribed: 'Unsubscribed',
  monthly: 'Monthly Subscription',
  lifetime: 'Lifetime Subscription',
  // Monthly subscription canceled (here, in the Stripe Dashboard, or after
  // failed payments). Was 'Canceled'; ensureUserSchema converts old rows.
  canceled: 'Cancelled',
  // Monthly subscription that wasn't renewed by its end date
  expired: 'Expired',
} as const;

export type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];

export type Plan = 'monthly' | 'lifetime';

// Whether an account can use My Dojo and the Language page: paid
// subscribers (Monthly or Lifetime) and Admins. Everyone else is sent to
// Pricing.
export function hasPracticeAccess(accountStatus: string, role: string): boolean {
  return (
    accountStatus === ACCOUNT_STATUS.monthly || accountStatus === ACCOUNT_STATUS.lifetime || isAdmin(role)
  );
}

// Monthly can be bought by anyone without a current subscription; Lifetime
// also by monthly subscribers (their monthly subscription is then canceled).
// Lifetime subscribers can't buy either.
export function canBuyPlan(accountStatus: string, plan: Plan): boolean {
  switch (accountStatus) {
    case ACCOUNT_STATUS.unsubscribed:
    case ACCOUNT_STATUS.canceled:
    case ACCOUNT_STATUS.expired:
      return true;
    case ACCOUNT_STATUS.monthly:
      return plan === 'lifetime';
    default:
      return false;
  }
}
