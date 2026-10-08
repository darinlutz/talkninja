import { CalendarDays, Check, InfinityIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ACCOUNT_STATUS, canBuyPlan, type Plan } from '@/lib/accountStatus';
import type { PlanPrices } from '@/lib/planPrices';

// The home page's two plan cards (#plans), with each plan's Stripe price
// and a button that starts Checkout. Styled by landing.css (.plan).

const PLANS: {
  plan: Plan;
  name: string;
  icon: React.ReactNode;
  // Shown after the price, e.g. "$4.99 / month"
  period: string;
  description: string;
  features: string[];
  // The account status that means the user already has this plan
  ownedStatus: string;
}[] = [
  {
    plan: 'monthly',
    name: 'Monthly Subscription',
    icon: <CalendarDays size={16} />,
    period: '/ month',
    description: 'One month at a time. Cancel anytime from your account.',
    features: [
      'Training, Reading and Writing Tests for every belt',
      'Free Reading and Writing practice',
      'Translator and conversations with Friend',
    ],
    ownedStatus: ACCOUNT_STATUS.monthly,
  },
  {
    plan: 'lifetime',
    name: 'Lifetime Subscription',
    icon: <InfinityIcon size={18} />,
    period: 'one time',
    description: 'Pay once and keep your place in the dojo for good.',
    features: ['Everything in Monthly', 'No renewals, ever', 'Replaces a monthly subscription if you have one'],
    ownedStatus: ACCOUNT_STATUS.lifetime,
  },
];

export default function PricingPlans({
  prices,
  accountStatus,
}: {
  prices: PlanPrices;
  // The signed-in user's account status, or null when signed out
  accountStatus: string | null;
}) {
  return (
    <div className="pricing-grid">
      {PLANS.map((info) => {
        const price = prices[info.plan];
        const owned = accountStatus === info.ownedStatus;
        // Signed-out visitors can click Buy; Checkout sends them to log in
        const buyable = accountStatus === null || canBuyPlan(accountStatus, info.plan);
        const upgrade = info.plan === 'lifetime' && accountStatus === ACCOUNT_STATUS.monthly;

        return (
          <article key={info.plan} className={`plan ${info.plan === 'lifetime' ? 'plan-lifetime' : ''}`}>
            <span className="plan-label">
              {info.icon} {info.name.toUpperCase()}
            </span>
            <p className="plan-price">
              {price ?? '—'}
              {price && <span>{info.period}</span>}
            </p>
            <p>{info.description}</p>
            <ul>
              {info.features.map((feature) => (
                <li key={feature}>
                  <Check /> {feature}
                </li>
              ))}
            </ul>

            {owned ? (
              <p className="plan-status">Your current plan</p>
            ) : buyable ? (
              <form action="/api/create-checkout-session" method="POST" className="plan-form">
                <Button
                  type="submit"
                  name="plan"
                  value={info.plan}
                  disabled={!price}
                  variant={info.plan === 'lifetime' ? 'dojo' : 'inverse'}
                  size="hero"
                >
                  {upgrade ? `Upgrade to ${info.name}` : `Buy ${info.name}`}
                </Button>
              </form>
            ) : (
              <p className="plan-status">Included in your Lifetime Subscription</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
