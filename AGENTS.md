# TalkNinja Developer Guidelines

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project Overview

**TalkNinja** is a language learning tool. Learners pick a language (any of the 28 in `src/lib/languages.ts`) and work up through martial-arts style belt levels (No Belt → level 8: White, Green, Yellow, Orange, Blue, Red, Brown, Black). Each level is Training, then a Reading Test, then a Writing Test; a score of 80% or higher passes, and passing Writing earns the belt.

The Language page (`src/app/language/page.tsx`) has these tabs:
- **Training** – practice vocabulary from the learner's sheet, with text-to-speech and pictures
- **Reading Test / Writing Test** – the scored belt tests
- **Reading / Writing** – free practice
- **Translator** – translation with word-by-word alignment
- **Friend** – conversation practice with an AI friend, with grammar checking

The Account page's **Setup** section connects a Google Sheet of vocabulary (and repairs its format). Its **Customize Training Experience** section saves the user's own instructions (the `"CustomAgentInstructions"` table, one row per user, no row = none), which `wordPickerAgent.ts` uses to weight the words and sentence topics it picks. Subscribers (only) get a **Cancel Subscription** button: its modal asks for a reason (`src/lib/cancellationReasons.ts`) and optional comments, cancels in Stripe, sets the status to `Cancelled`, and saves a row in the `"CancellationReason"` table (user, email, date, reason, notes, Stripe subscription ID and cancel time).

Accounts (signup, login, password reset) and Stripe subscriptions gate access. The Account page also has **Change Password** (`PUT /api/account/password`: checks the current password, uses the signup rules in `src/lib/passwordRules.ts`, signs out every other session and gives this browser a fresh one), **My AI Usage** (their own AI calls over 24 hours / 7 days) and **Privacy & Data** (below).

### Privacy, legal and retention (full record: `docs/privacy.md`)
- **Legal pages** `/terms`, `/privacy`, `/cookies` render `src/lib/legal.ts` (English only, `translate="no"`), linked from `SiteFooter` with **Cookie Settings**. Operator Clarivex, LLC, Kentucky law, support@talkninja.app, minimum age 18 (`MINIMUM_AGE`). Changing a document's wording means changing its `effectiveDate` and its version in `src/lib/policyVersions.ts`. Only the Terms are *accepted* (signup's two unticked boxes, 18+ and Terms, recorded in `"PolicyAcceptances"` by `createUser`; a new Terms version shows `PolicyUpdateNotice`); the Privacy and Cookie Policies are notices, never accepted or gated.
- **Statements must match the code.** Before adding a vendor, AI provider, cookie/browser storage, analytics, microphone use, or a new kind of stored personal data, update `SERVICE_PROVIDERS`/the Privacy Policy, `src/lib/cookieInventory.ts`/the Cookie Policy, the export, and the retention rules. `npm run test:privacy` guards much of this (unlisted cookies/storage, third-party scripts, mic APIs, unexported user tables).
- **Cookies**: every item is strictly necessary today, so `OFFERED_CATEGORIES` (`src/lib/cookieConsent.ts`) is empty and no banner shows. An optional technology must be added per that file's header and rendered inside `<ConsentGate>`; the banner then appears (Accept All / Reject Nonessential / Customize, opt-in everywhere). Choices are recorded in `"CookieConsents"` without IP addresses.
- **Account page → Privacy & Data** (`PrivacyDataSection`): what's kept, providers, **Download My Data** (`POST /api/account/export`, password required, `src/lib/personalDataExport.ts`), Cookie Settings, **Delete My Account** (`DELETE /api/account` with `{ confirm: 'DELETE', password }`; hidden for and refused to Admins (403); cancels a live Stripe subscription first, then `deleteAccountRows` in `src/lib/deletionLedger.ts` writes a `"DeletionLedger"` row, unlinks `"AiUsage"` and deletes the user; emails a confirmation). Password checks allow 5 failures per 15 minutes (`src/lib/passwordConfirmation.ts`). After restoring a backup, run `npm run db:reapply-deletions`.
- **Retention** (`src/lib/retentionRules.ts`, owner-approved; env overrides `RETENTION_*_DAYS` with minimums) is enforced daily by `src/lib/retentionJob.ts` via `runRetention` (`src/lib/retention.ts`): triggered by a Render Cron Job calling `POST /api/cron/retention` with `RETENTION_CRON_SECRET`, with an in-process fallback (production only), recorded in `"RetentionRuns"` and shown on the Admin page's Data Retention section (Run Now: `POST /api/admin/retention`). New data with a limited life needs a rule and a step there.

### Roles and the Admin page
- `users.role` is `Admin` or `User` (default). `src/lib/roles.ts` (no imports) has `ROLES`, `isAdmin`, and `OWNER_EMAIL`: darinlutz@yahoo.com is always Admin (case-insensitive), promoted by `ensureUserSchema` and made Admin by `createUser` if it signs up again. The role is read from the database with the session on every request (`getCurrentUser`), never from a cookie or the request. The only route that changes a role is `PUT /api/admin/users/role`, which refuses an Admin's own role and demoting the last Admin.
- `/admin` (Admins only, nav link shown only to them) checks the role on the server and calls `notFound()` for everyone else, signed in or not: a plain 404, never a redirect. Sections: AI Model Control, AI Model Costs, Rate Limiting (with the AI usage report and overrides), User Roles, Data Retention.
- Every `/api/admin/*` route starts with `checkAdminAccess()` (`src/lib/adminAccess.ts`), which answers 404 to non-Admins, and exports `adminNotFound` for the methods it doesn't have, so a wrong method is a 404 too rather than a 405 that reveals the route. Routes: `ai-models` (PUT), `rate-limits` (PUT settings), `rate-limits/overrides` (POST), `rate-limits/overrides/[id]` (DELETE), `rate-limits/usage` (GET `?range=hour|day|week|month|all&by=user|ip&q=`), `rate-limits/reset` (POST `{ userId }` or `{ ipAddress }`), `users/role` (PUT), `retention` (GET runs, POST run now).

### AI features, models and rate limits
- **Models** (`src/lib/aiModelList.ts`, no imports): `AI_FEATURES` maps each place the site calls a chat model to its default model; `AI_MODELS` is what the Admin page offers (OpenAI, `claude-*`; DeepSeek was removed on 2026-11-03 because it processes data in China with no transfer safeguard, so don't re-add it, or any provider, without updating the Privacy Policy), and only models whose provider's key is set are offered or saved (`availableAiModels`). Models are chosen per feature and per category (`Admin`, `User`; signed-out visitors count as `User`, calls for no user as `Admin`), stored in `"SiteSettings"` as `ai_model:<category>:<feature>`; a missing key means the default. Prices for the AI Model Costs table are in `src/lib/aiModelPrices.ts`.
- **Every AI call gets its model from `chatModel(feature, temperature)` or `structuredModel(feature, schema, temperature)`** (`src/lib/aiModels.ts`), which read the setting on each call (no restart needed). Never construct `ChatOpenAI` directly. Claude models get no temperature; gpt-5+ reasoning models use the Responses API, so read replies with `.text`.
- **Rate limits** (`src/lib/rateLimitConfig.ts`, no imports; enforced in `src/lib/rateLimits.ts`): JSON in `"SiteSettings"` key `rate_limits`, parsed defensively (anything missing or invalid keeps its default). Off by default (calls are still logged); limits per tier (`Anonymous` by IP address, `User`) per hour/day/week/month (`null` unlimited, 0 no AI), a per-minute burst limit, an IP address cap, rolling or calendar (UTC, weeks from Monday) windows, Admins exempt by default, and a weight per feature (0 = logged but not limited). Overrides (`"RateLimitOverrides"`) give one user or IP address `unlimited`, `blocked` or a custom limit, for a while or until removed.
- **Rule for a new AI route:** add its feature to `RATE_LIMITED_FEATURES` with a label and a default weight in `DEFAULT_RATE_LIMITS`; if it calls a new chat model, add a key to `AI_FEATURES` (and `AI_FEATURE_LABELS`). In the route, after validating input: `limit = await aiRateLimit(request, '<feature>', user); if (limit.response) return limit.response;`, run the AI work in `limit.track(() => ...)` with its model from `chatModel`/`structuredModel`, and call `limit.refund()` in the catch so failures don't count. On the client, pass the response to `reportRateLimit(response)` (`src/lib/rateLimitClient.ts`); on a 429 it opens the Rate Limit dialog (`src/components/RateLimitDialog.tsx`, mounted in the root layout).

### Tables tied to a user
Every table that belongs to a user references `"Users"(id) ON DELETE CASCADE`, so Delete My Account removes their data: `"Sessions"`, `"PasswordResets"`, `"UserLanguageProgress"`, `"LanguageActivity"`, `"CustomAgentInstructions"`, `"RateLimitOverrides"`, `"PolicyAcceptances"`. The exceptions: `"AiUsage"` (one row per AI call: user_id with no foreign key, ip_address, feature, tier, weight, blocked/reason, counted/failed, model, input/cached-input/output tokens, model_calls, created_at; deletion sets user_id to NULL; IP removed after 90 days, rows deleted after 400), `"CancellationReason"` (`ON DELETE SET NULL`, with the name and email copied; those and the notes are removed after 2 years), `"CookieConsents"` (`ON DELETE SET NULL`, consent evidence, 3 years) and `"DeletionLedger"` (no FK; account ID and dates only, 3 years). `"SiteSettings"` (key, value, updated_by) holds the Admin page's settings; `"RetentionRuns"` records the retention job. Privacy schema changes are in `src/lib/privacyDb.ts`. A new user table must reference `"Users"(id) ON DELETE CASCADE` too, and be added to the export (`EXPORTED_TABLES` in `src/lib/personalDataExport.ts`) or `NOT_EXPORTED` with a reason (the tests check).

**Tech Stack:**
- Frontend: Next.js 16.2.6 (App Router), React 19.2.4, TypeScript 5, Tailwind CSS 4
- Backend: Next.js API routes, PostgreSQL (`pg`)
- AI: OpenAI via LangChain (translation, grammar checking, reading tests, AI friend) and OpenAI text-to-speech; Anthropic models can be chosen per feature on the Admin page (`src/lib/aiModels.ts`)
- Integrations: Google Sheets (vocabulary), Tavily (image search), Resend (password reset email), Stripe (subscriptions)
- Styling: Tailwind CSS 4 with custom color palette (`powder-*`, `dark-blue`)

## Quick Start

```bash
npm run dev          # Development server on http://localhost:3000
npm run build        # Production build
npm start            # Start production server
npm run lint         # Run ESLint
npm run test:privacy # Privacy rules and source guards (no database)
PRIVACY_TEST_DATABASE_URL=postgres://...@127.0.0.1:.../db npm run test:privacy:db  # Database tests; local only, drops its talkninja schema
```

**Environment Variables** (`.env.local`):
- `DATABASE_URL` - PostgreSQL connection string (users, sessions, password resets, belts/progress and test scores, site settings, AI usage), e.g. `postgres://user:pass@host:5432/talkninja`. Passed to `pg` as-is. Required; tables are created on first use
- `OPENAI_API_KEY` - OpenAI API key (translation, grammar checks, reading tests, AI friend, text-to-speech). The default model for every AI feature
- `ANTHROPIC_API_KEY` - Optional. Offers Claude models (`claude-*`) in the Admin page's AI Model Control
- `TAVILY_API_KEY` - Tavily API key (image search for Training words)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` - Google Cloud service account (Sheets API enabled) that the Account page's Setup section uses to erase a wrongly formatted vocabulary sheet and fill it with sample words. Users share their sheet with this email as Editor. Put the key on one line with `\n` for line breaks, in double quotes. Optional; without it the Setup section only reports the format problem
- `RESEND_API_KEY` - Resend email service API key
- `RESEND_FROM_EMAIL` - Sender for password reset emails, on a domain verified in Resend. Defaults to `onboarding@resend.dev`, which only delivers to the Resend account owner
- `SITE_URL` - Public site URL used in password reset links. Set in production; locally it falls back to the request's host
- `STRIPE_SECRET_KEY` - Stripe secret key (Checkout Session creation, success page lookup)
- `TALKNINJA_MONTHLY_PRODUCT_ID` - Stripe Product ID for the Monthly Subscription plan; its default Price must be recurring monthly
- `TALKNINJA_ANNUAL_PRODUCT_ID` - Stripe Product ID for the Annual Subscription plan; its default Price must be recurring yearly. The Pricing page shows how much cheaper it is than 12 months of Monthly (`src/lib/planPrices.ts`)
- `STRIPE_WEBHOOK_SECRET` - Signing secret for `/api/stripe-webhook` (syncs `users.account_status` with the subscription: `Unsubscribed`, `Subscribed` (either plan), `Cancelled`, `Expired`; see `src/lib/accountStatus.ts`). Must receive `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid` and `customer.subscription.deleted`
- `RETENTION_CRON_SECRET` - At least 32 characters. Lets the Render Cron Job call `POST /api/cron/retention` (404 without it). Optional: `RETENTION_SCHEDULER` (`off`/`on`; the in-process fallback runs in production by default), `RETENTION_*_DAYS` (see `src/lib/retentionRules.ts`), `CONSENT_REVIEW_DAYS`
- `LANGSMITH_TRACING` (with `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`) - When `true`, LangChain sends every AI prompt and response to LangSmith; disclosed in the Privacy Policy
- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` - Legacy Turso database; only read by `npm run db:migrate-from-turso`, which copies its data into `DATABASE_URL` once

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout: Navigation, SiteFooter, CookieConsentProvider, updated-Terms notice
│   ├── language/           # The Language page (all learning tabs)
│   ├── account/            # Account & subscription page (change password, My AI Usage, Privacy & Data)
│   ├── terms/ privacy/ cookies/  # Legal documents (src/lib/legal.ts)
│   ├── admin/              # Admin page (Admins only; 404 for everyone else)
│   ├── login/ signup/ reset-password/ success/
│   └── api/
│       ├── language/       # Vocabulary, words, images, alignment, tests, progress, sheet setup
│       ├── translate/      # Translator tab
│       ├── friend/         # AI friend conversation and checking
│       ├── speak/          # Text-to-speech
│       ├── auth/           # Signup, login, logout, password reset
│       ├── account/        # Language settings, password change, account deletion, data export, Terms acceptance
│       ├── consent/        # Cookie choices
│       ├── cron/retention/ # Daily retention job (RETENTION_CRON_SECRET)
│       ├── admin/          # AI models, rate limits, usage report, roles, retention (Admins only; 404 for everyone else)
│       ├── create-checkout-session/ cancel-subscription/ stripe-webhook/
├── components/             # LanguageForm, Training, ReadingTest, WritingTest, BeltIcon, ...
└── lib/
    ├── languages.ts        # Supported languages
    ├── languageLevels.ts   # Belt rules (levels, order of activities, passing score)
    ├── languageProgress.ts # Saving/loading belt progress
    ├── vocabSheet.ts / vocabSheetWriter.ts  # Google Sheets vocabulary read/write
    ├── wordPickerAgent.ts  # Decides which words/phrases each level shows (LEVEL_INSTRUCTIONS); other levels fall back to readingTest.ts sentences
    ├── translate.ts, grammarCheck.ts, readingTest.ts, wordAlignment.ts, friend.ts
    ├── aiModelList.ts, aiModels.ts, aiModelPrices.ts, aiTokenUsage.ts   # AI features, models (chatModel), prices, token logging
    ├── rateLimitConfig.ts, rateLimits.ts, rateLimitClient.ts           # AI rate limits (aiRateLimit, reportRateLimit)
    ├── roles.ts, adminAccess.ts, passwordRules.ts, accountDeletion.ts
    ├── legal.ts, policyVersions.ts, policyAcceptances.ts, i18n/en.ts            # Legal documents, versions, UI strings
    ├── cookieConsent.ts, cookieInventory.ts, cookieConsentServer.ts, cookieConsentRecords.ts  # Cookie consent
    ├── personalDataExport.ts, deletionLedger.ts, accountDeletionServer.ts, passwordConfirmation.ts  # Export, deletion
    ├── retentionRules.ts, retentionJob.ts, retention.ts, privacyDb.ts            # Retention and privacy schema
    └── db.ts, users.ts, session.ts, accountStatus.ts
```

## Development Conventions

### File Organization
- **Page components** in `src/app/[route]/page.tsx`
- **API routes** in `src/app/api/[feature]/route.ts`
- **Reusable components** in `src/components/`
- **Shared logic** in `src/lib/`; keep modules imported by client components dependency-free
- **One component per file** with matching exported name

### Styling
- Use Tailwind CSS utility classes (no CSS-in-JS)
- Custom colors: `powder-500/600` (primary), `dark-blue` (text), `slate-*` (neutrals)
- Gradients common in hero sections and CTAs: `bg-gradient-to-r from-powder-500 to-powder-600`
- The landing page brought over from color-belt-lingo (`color-belt-lingo/`, being merged in) has its own design system: tokens like `bg-primary`, `text-muted-foreground` and `font-display` in `globals.css`, page styles in `src/app/landing.css` scoped under a `.landing` wrapper, and shadcn components in `src/components/ui/`

### API Route Patterns
- Validate input early (required fields, supported language via `isLanguage`)
- Check environment variables before making external calls
- Return `NextResponse.json()` with appropriate status codes
- Handle errors gracefully with clear error messages

**Example API route structure:**
```typescript
export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Validate
    if (!body.requiredField) {
      return NextResponse.json({ error: 'Missing field' }, { status: 400 });
    }
    // Process
    // Return
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

## Vocabulary Sheet Format

A learner's Google Sheet lays out categories side by side as English | target-language column pairs separated by blank spacer columns: row 1 holds category names, row 2 the "English"/language sub-headers, row 3 is blank, and words start at row 4. See `src/lib/language.ts` and `src/lib/vocabSheetWriter.ts`.

## Linting & Code Quality

**ESLint configuration** (`eslint.config.mjs`):
- Next.js Core Web Vitals rules
- TypeScript support
- Uses modern ESLint flat config format

```bash
npm run lint         # Check all files
```

**Ignored paths**: `.next/`, `out/`, `build/`, `next-env.d.ts`

## Common Tasks

### Add a Supported Language
1. Add it to `LANGUAGES` in `src/lib/languages.ts`
2. Check prompts in `src/lib/` (translate, grammar check, reading test, friend) handle it

### Add an API Endpoint
1. Create `src/app/api/[feature]/route.ts`
2. Implement `GET`, `POST`, etc. handlers
3. Add env variables to `.env.local` if needed
4. If it calls an AI model, follow the rule for a new AI route under "AI features, models and rate limits"
5. If it's an admin route, put it under `src/app/api/admin/`, start with `checkAdminAccess()`, and export `adminNotFound` for its other methods

## Troubleshooting

**npm run dev fails with "command not found"?**
- Ensure Node.js 18+ is installed
- Run `npm install` first
- Check that `.env.local` exists

**ESLint errors on import statements?**
- Verify TypeScript path aliases in `tsconfig.json` (e.g., `@/*` → `src/*`)
- Run `npm run lint -- --fix` to auto-fix common issues

## Related Documentation

- [Next.js Documentation](https://nextjs.org/docs)
- [React 19 Upgrade Guide](https://react.dev/blog/2024/12/19/react-19)
- [Tailwind CSS 4 Changelog](https://tailwindcss.com/docs/v4)
- [TypeScript Configuration](tsconfig.json)
