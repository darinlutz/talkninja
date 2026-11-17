import type { Metadata } from 'next';
import PricingPlans from '@/components/PricingPlans';
import { getPlanPrices } from '@/lib/planPrices';
import { getCurrentUser } from '@/lib/session';

// Keeps the site-wide tab title from the root layout
export const metadata: Metadata = {
  description: 'The TalkNinja monthly subscription.',
};

// In the home page's design (src/app/landing.css, scoped under .landing)
export default async function PricingPage() {
  const [prices, user] = await Promise.all([getPlanPrices(), getCurrentUser()]);

  return (
    <div className="landing">
      <section className="pricing-section">
        <div className="container-wide">
          <div className="section-heading">
            <span className="eyebrow">COMMIT TO YOUR NEXT CHAPTER</span>
            <h1>Choose your path to mastery.</h1>
            <p>A little practice today. A whole new world tomorrow.</p>
          </div>

          <PricingPlans prices={prices} accountStatus={user?.accountStatus ?? null} />

          <p className="pricing-note">One plan, billed monthly. Cancel anytime.</p>
        </div>
      </section>
    </div>
  );
}
