import Stripe from 'stripe';
import { fulfillCheckoutSession } from '@/lib/checkoutFulfillment';

// Looks the session up in Stripe (so it can't be faked) and, once it's paid,
// updates the account straight away rather than waiting for the webhook
async function getCheckoutSession(sessionId: string | undefined) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!sessionId || !stripeSecretKey) return null;

  try {
    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === 'complete') {
      try {
        await fulfillCheckoutSession(session);
      } catch (error) {
        // The webhook will still apply it
        console.error(`Updating the account for checkout ${session.id} failed:`, error);
      }
    }
    return session;
  } catch (error) {
    console.error('Stripe session lookup error:', error);
    return null;
  }
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { session_id } = await searchParams;
  const session = await getCheckoutSession(
    typeof session_id === 'string' ? session_id : undefined
  );
  const isComplete = session?.status === 'complete';

  return (
    <section className="py-12 px-4 bg-gradient-to-b from-slate-100 to-white flex justify-center">
      <div className="w-full max-w-lg bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8 text-center">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-powder-600 via-powder-500 to-powder-600 bg-clip-text text-transparent">
          {isComplete ? 'Thank You!' : 'Payment Not Confirmed'}
        </h1>
        <p className="text-slate-600 mb-8">
          {isComplete
            ? `${
                'Your subscription is active.'
              }${
                session.customer_details?.email
                  ? ` A receipt has been sent to ${session.customer_details.email}.`
                  : ''
              }`
            : "We couldn't confirm your payment. If you were charged, please contact us."}
        </p>

        {/* A full page load, so the nav bar also reflects the new plan
            (e.g. Pricing disappears once subscribed) */}
        <a
          href="/account"
          className="inline-block px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors"
        >
          Back to My Account
        </a>
      </div>
    </section>
  );
}
