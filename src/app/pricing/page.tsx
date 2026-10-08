import type { Metadata } from 'next';
import PricingPlans from '@/components/PricingPlans';
import { getPlanPrices } from '@/lib/planPrices';
import { getCurrentUser } from '@/lib/session';

// Keeps the site-wide tab title from the root layout
export const metadata: Metadata = {
  description: 'TalkNinja monthly and lifetime subscriptions.',
};

export default async function PricingPage() {
  const [prices, user] = await Promise.all([getPlanPrices(), getCurrentUser()]);

  return (
    <section className="py-12 px-4 bg-gradient-to-b from-slate-100 to-white flex justify-center">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold pb-2 bg-gradient-to-r from-powder-600 via-powder-500 to-powder-600 bg-clip-text text-transparent">
            Pricing
          </h1>
          <p className="mt-2 text-lg text-slate-600">Choose your path to mastery.</p>
        </div>

        <PricingPlans prices={prices} accountStatus={user?.accountStatus ?? null} />

        <p className="mt-8 text-center text-sm text-slate-500">Same curiosity. Two ways to keep it going.</p>
      </div>
    </section>
  );
}
