import { getCurrentUser } from '@/lib/session';
import { STRIPE_APP, stripeClient, syncCheckoutSession } from '@/lib/stripeBilling';
import { getUserById } from '@/lib/users';
import { hasPracticeAccess } from '@/lib/accountStatus';

type Outcome = 'active' | 'pending' | 'failed';

// Looks the session up in Stripe (so it can't be faked), checks it's the signed-in account's own, and syncs the
// account with its subscription straight away rather than waiting for the webhook. What the page says comes from
// that verified state: paid access only once Stripe says the first invoice is paid, never just from this redirect.
async function checkoutOutcome(sessionId: string | undefined): Promise<{ outcome: Outcome; email: string | null }> {
  const stripe = stripeClient();
  const user = await getCurrentUser();
  if (!sessionId || !stripe || !user) return { outcome: 'failed', email: null };

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    // Someone else's checkout (or another app's) shows nothing
    if (session.metadata?.app !== STRIPE_APP || session.client_reference_id !== String(user.id)) {
      return { outcome: 'failed', email: null };
    }
    if (session.status !== 'complete') return { outcome: 'failed', email: null };
    try {
      await syncCheckoutSession(stripe, session);
    } catch (error) {
      // The webhook will still apply it
      console.error(`Updating the account for checkout ${session.id} failed:`, error);
    }
    const fresh = await getUserById(user.id);
    const active = fresh ? hasPracticeAccess(fresh.subscriptionEndDate, 'User') && fresh.stripeSubscriptionId !== null : false;
    return { outcome: active ? 'active' : 'pending', email: session.customer_details?.email ?? null };
  } catch (error) {
    console.error('Stripe session lookup error:', error);
    return { outcome: 'failed', email: null };
  }
}

const TEXT: Record<Outcome, { title: string; body: string }> = {
  active: { title: 'Thank You!', body: 'Your subscription is active.' },
  pending: {
    title: 'Payment Processing',
    body: 'Stripe is still confirming your payment. Your subscription starts as soon as it does; your Account page shows when.',
  },
  failed: { title: 'Payment Not Confirmed', body: "We couldn't confirm your payment. If you were charged, please contact us." },
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { session_id } = await searchParams;
  const { outcome, email } = await checkoutOutcome(typeof session_id === 'string' ? session_id : undefined);
  const text = TEXT[outcome];

  return (
    <section className="py-12 px-4 bg-gradient-to-b from-slate-100 to-white flex justify-center">
      <div className="w-full max-w-lg bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8 text-center">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-powder-600 via-powder-500 to-powder-600 bg-clip-text text-transparent">
          {text.title}
        </h1>
        <p className="text-slate-600 mb-8">
          {text.body}
          {outcome === 'active' && email ? ` A receipt has been sent to ${email}.` : ''}
        </p>

        {/* A full page load, so the nav bar also reflects the new plan
            (e.g. Pricing disappears once subscribed) */}
        <a
          href="/account#subscription"
          className="inline-block px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors"
        >
          Back to My Account
        </a>
      </div>
    </section>
  );
}
