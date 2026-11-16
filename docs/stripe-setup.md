# TalkNinja Stripe setup (monthly subscription)

TalkNinja sells one plan, the **Monthly Subscription**. The code is in `src/lib/stripeBilling.ts`,
`src/lib/subscriptionProjection.ts`, `src/app/api/stripe-webhook/route.ts`, `/api/create-checkout-session`,
`/api/cancel-subscription`, `/api/reactivate-subscription`, `/api/billing-portal` and the Account page's
My Subscription (`src/components/MySubscription.tsx`).

**The Stripe account is shared with RacingCoach.** Both apps' events go to both webhook endpoints, and each app
ignores the other's (TalkNinja tags its checkouts, customers and subscriptions with `metadata.app = talkninja`).
Never change the account's default Customer Portal configuration or RacingCoach's webhook endpoint for TalkNinja.

## Keys and secrets: which is which

| Thing | Test mode | Live mode | Where it goes |
| --- | --- | --- | --- |
| Secret key | `sk_test_…` or restricted `rk_test_…` | `sk_live_…` or restricted `rk_live_…` | `STRIPE_SECRET_KEY` |
| Webhook signing secret | `whsec_…` of the **test** TalkNinja endpoint (or the one `stripe listen` prints) | `whsec_…` of the **live** TalkNinja endpoint | `STRIPE_WEBHOOK_SECRET` |
| Monthly product | a test-mode Product ID | the live Product ID | `TALKNINJA_MONTHLY_PRODUCT_ID` |

Each webhook endpoint has its own signing secret. RacingCoach's endpoint's secret does not work for TalkNinja. A test
endpoint's secret does not work in live mode. The webhook ignores events whose mode doesn't match the key's
(a test event on a live key, or the reverse).

A restricted key needs **write** access to Customers, Checkout Sessions, Subscriptions and Customer portal
(configurations and sessions), and **read** access to Products, Prices, Invoices and Payment Methods.

## 1. Open the Dashboard

Go to https://dashboard.stripe.com and sign in. The **Test mode** switch (top right; on newer accounts, a
**Sandbox** chosen from the account menu) picks the mode. Do steps 2–9 in test mode first, then again in live mode
(section 14).

## 2–4. The product and its monthly Price

1. **Product catalog** → find **TalkNinja Monthly Subscription** (live: `prod_VPwa3kuwOGPCKA`, $4.99/month). In test
   mode, create it: **+ Add product**, name `TalkNinja Monthly Subscription`.
2. Its Price must be **Recurring**, **Monthly** (every 1 month), in USD. Make it the product's **default price**
   (the price's ⋯ menu → **Set as default price**). Checkout refuses a default price that isn't monthly.
3. Product ID: shown at the top of the product page (`prod_…`); put it in `TALKNINJA_MONTHLY_PRODUCT_ID`. The Price ID
   (`price_…`, in the product's Pricing section) is not needed: the code uses the product's default price, so
   changing the price later is just a new default price in Stripe.
4. Don't create an annual price. The old product `prod_VNdvGjzAk0JGwx` (archived) still has live subscriptions; to
   have them recognised by product as well as by account, set `TALKNINJA_LEGACY_PRODUCT_IDS=prod_VNdvGjzAk0JGwx`.

## 5–9. The webhook endpoint

5. **Developers → Webhooks** (on newer Dashboards: **Workbench → Webhooks**, or **Event destinations**).
6. **+ Add endpoint** (or **Add destination** → **Webhook endpoint**). Choose events from **Your account**.
7. Endpoint URL: **`https://talkninja.app/api/stripe-webhook`**. API version: the newest offered
   (`2026-09-30.endive` matches the code's Stripe library; the code only reads IDs from events and re-reads
   everything from Stripe, so an older version also works).
8. Select these eight events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.payment_action_required`
   - `customer.subscription.trial_will_end`
   Name it `TalkNinja`, then **Add endpoint**.
9. On the endpoint's page, **Signing secret** → **Reveal**. Copy the `whsec_…` value into `STRIPE_WEBHOOK_SECRET`
   (Render for production, `.env.local` only if you test against this endpoint locally).

## 10. Environment variables

| Variable | Local (`.env.local`) | Render (production) |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | a **test** key | the live key |
| `STRIPE_WEBHOOK_SECRET` | the secret `stripe listen` prints, or the test endpoint's | the live TalkNinja endpoint's |
| `TALKNINJA_MONTHLY_PRODUCT_ID` | the test product | `prod_VPwa3kuwOGPCKA` |
| `TALKNINJA_LEGACY_PRODUCT_IDS` | (empty) | `prod_VNdvGjzAk0JGwx` (optional) |
| `SITE_URL` | (falls back to the request) | `https://talkninja.app` |
| `TALKNINJA_ANNUAL_PRODUCT_ID` | delete | delete (no longer read) |

`.env.local` currently holds a **live** restricted key, so running the site locally charges real cards and changes
live subscriptions. Swap it for a test key before testing.

## 11–12. The Customer Portal

Nothing to set up by hand: the first time someone opens **Manage Subscription**, the site creates a TalkNinja portal
configuration through the API (one per mode) and saves its ID in `"SiteSettings"`
(`stripe_portal_configuration:live` / `:test`). It allows:

- **Payment method updates** (Update Payment Method opens straight on this)
- **Invoice history** (invoices and receipts to download)
- **Cancellation at the end of the billing period**, with a reason (no refunds or proration)
- **No plan switching** and no email or address changes

To check it: **Settings → Billing → Customer portal** shows the account's default configuration (used by nothing in
TalkNinja); the TalkNinja one is listed through the API (`stripe billing_portal configurations list`). Don't edit the
default configuration for TalkNinja: RacingCoach shares the account. Also turn on, under **Settings → Billing →
Subscriptions and emails**: emails for failed payments and for payments that need authentication (3D Secure), so
customers get Stripe's link to fix them, and **Smart Retries** with "cancel the subscription" after the final retry.

## 13. Test the lifecycle in test mode

Locally, with test keys in `.env.local`:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe-webhook \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,invoice.payment_action_required,customer.subscription.trial_will_end
# put the whsec_... it prints into STRIPE_WEBHOOK_SECRET, then: npm run dev
```

Test cards (any future expiry, any CVC): `4242 4242 4242 4242` succeeds; `4000 0025 0000 3155` asks for
authentication; `4000 0000 0000 9995` is declined; `4000 0000 0000 0341` is accepted at checkout but fails later
charges (use it to fail a renewal).

| Case | Do | Expect on the Account page |
| --- | --- | --- |
| Subscribe | Subscribe → pay with 4242 | Thank You says active; My Subscription: Active, $4.99 / month, next billing date, Visa ending 4242 |
| Abandoned checkout | Subscribe → back arrow on Checkout | Back on Pricing; nothing changed |
| First payment needs authentication | Pay with 3155: Checkout shows the bank's challenge | **Fail** it: Checkout shows an error, nothing is bought. **Complete** it: Active |
| Second subscription | While subscribed, POST the Subscribe form again (e.g. from an old Pricing tab) | Back on the Account page: "You already have a subscription" |
| Renewal succeeds | Test clock (below) → advance 1 month | Next billing date moves a month; a new receipt in View Billing History |
| Renewal fails | Test-clock customer with card 0341 → advance 1 month | Past Due, "Your last payment didn't go through"; access until the paid date |
| Renewal needs authentication | Test-clock customer with card 3155 → advance | "Your bank needs you to confirm the payment" with a link |
| Cancel at period end | Cancel Subscription → pick a reason | "Scheduled: ends …"; still has access; Reactivate shown |
| Reverse it | Reactivate Subscription | "None scheduled"; Cancel shown again |
| Expires | Test clock past the end (or cancel immediately in the Dashboard) | Canceled; Account Status Cancelled; access ends at the paid date; Subscribe shown |
| Subscribe again | Subscribe after it ended | Active on the new subscription |
| Duplicate delivery | Dashboard → the endpoint → an event → **Resend** | Log line `duplicate: already handled`; nothing changes |
| Out of order | Resend an old `invoice.paid` after the subscription ended | Stays Canceled (each event re-reads Stripe) |
| Portal | Manage Subscription / Update Payment Method / cancel in the portal | Back on the Account page with the change shown |

**Test clocks** (renewals without waiting a month): Checkout creates TalkNinja's own customers, which can't be put on
a test clock afterwards, so make the subscription in the Dashboard instead: **Billing → Test clocks → + New** →
add a customer to the clock with a test card → create a subscription for it on the TalkNinja Monthly price with
**metadata** `app = talkninja` and `talkninja_user_id = <the test account's ID>` (shown in the Download My Data
export). The `customer.subscription.created` event links it to that account, the same way a checkout would. Then
**Advance time** on the clock.

Each webhook event prints one log line like
`{"stripeWebhook":true,"eventId":"evt_…","type":"invoice.paid","livemode":false,"result":"synced account 7"}`.
`npm run test:billing` and `npm run test:billing:db` cover the same rules without Stripe.

## 14. Switching to live mode

1. In live mode, repeat steps 5–9: a **live** TalkNinja endpoint with the same URL and events, and its own signing
   secret.
2. In Render → the TalkNinja web service → **Environment**: set `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET`
   (the live endpoint's), `TALKNINJA_MONTHLY_PRODUCT_ID=prod_VPwa3kuwOGPCKA`, `SITE_URL=https://talkninja.app`, and
   delete `TALKNINJA_ANNUAL_PRODUCT_ID`. Save (Render redeploys).
3. After the deploy, the first request adds the new columns and tables (`ensureUserSchema`: additive, no data
   removed). In the endpoint's page, **Send test event** isn't useful (it's signed but has no real objects); instead
   open the Account page as a subscriber, which syncs it from Stripe, and watch the endpoint's **Event deliveries**
   tab return 200s on the next real event.
4. Make one real purchase with your own card and cancel it (then refund it in the Dashboard if you like) to see the
   whole path in live mode.
5. Keep test keys out of Render and live keys out of `.env.local`.
