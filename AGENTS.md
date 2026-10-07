# TalkNinja Developer Guidelines

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project Overview

**TalkNinja** is a language learning tool. Learners pick a language (Arabic, English, German, Japanese, Korean, Portuguese, Spanish, Vietnamese) and work up through martial-arts style belt levels (No Belt → level 10). Each level is Training, then a Reading Test, then a Writing Test; a score of 80% or higher passes, and passing Writing earns the belt.

The Language page (`src/app/language/page.tsx`) has these tabs:
- **Training** – practice vocabulary from the learner's sheet, with text-to-speech and pictures
- **Reading Test / Writing Test** – the scored belt tests
- **Reading / Writing** – free practice
- **Translator** – translation with word-by-word alignment
- **Friend** – conversation practice with an AI friend, with grammar checking

The Account page's **Setup** section connects a Google Sheet of vocabulary (and repairs its format).

Accounts (signup, login, password reset) and Stripe subscriptions gate access.

**Tech Stack:**
- Frontend: Next.js 16.2.6 (App Router), React 19.2.4, TypeScript 5, Tailwind CSS 4
- Backend: Next.js API routes, PostgreSQL (`pg`)
- AI: OpenAI via LangChain (translation, grammar checking, reading tests, AI friend) and OpenAI text-to-speech
- Integrations: Google Sheets (vocabulary), Tavily (image search), Resend (password reset email), Stripe (subscriptions)
- Styling: Tailwind CSS 4 with custom color palette (`powder-*`, `dark-blue`)

## Quick Start

```bash
npm run dev          # Development server on http://localhost:3000
npm run build        # Production build
npm start            # Start production server
npm run lint         # Run ESLint
```

**Environment Variables** (`.env.local`):
- `DATABASE_URL` - PostgreSQL connection string (users, sessions, password resets, belts/progress and test scores), e.g. `postgres://user:pass@host:5432/talkninja`. Passed to `pg` as-is. Required; tables are created on first use
- `OPENAI_API_KEY` - OpenAI API key (translation, grammar checks, reading tests, AI friend, text-to-speech)
- `TAVILY_API_KEY` - Tavily API key (image search for Training words)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` - Google Cloud service account (Sheets API enabled) that the Account page's Setup section uses to erase a wrongly formatted vocabulary sheet and fill it with sample words. Users share their sheet with this email as Editor. Put the key on one line with `\n` for line breaks, in double quotes. Optional; without it the Setup section only reports the format problem
- `RESEND_API_KEY` - Resend email service API key
- `RESEND_FROM_EMAIL` - Sender for password reset emails, on a domain verified in Resend. Defaults to `onboarding@resend.dev`, which only delivers to the Resend account owner
- `SITE_URL` - Public site URL used in password reset links. Set in production; locally it falls back to the request's host
- `STRIPE_SECRET_KEY` - Stripe secret key (Checkout Session creation, success page lookup)
- `STRIPE_MONTHLY_PRODUCT_ID` - Stripe Product ID for the Account page's Monthly Subscription button; its default Price must be recurring
- `STRIPE_LIFETIME_PRODUCT_ID` - Stripe Product ID for the Lifetime Subscription button; its default Price must be one-time. A paid purchase sets the account status to `Lifetime Subscription` with no end date, and cancels any monthly subscription the user had
- `STRIPE_WEBHOOK_SECRET` - Signing secret for `/api/stripe-webhook` (syncs `users.account_status` with the subscription: `Unsubscribed`, `Monthly Subscription`, `Lifetime Subscription`, `Canceled`, `Expired`; see `src/lib/accountStatus.ts`). Must receive `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid` and `customer.subscription.deleted`
- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` - Legacy Turso database; only read by `npm run db:migrate-from-turso`, which copies its data into `DATABASE_URL` once

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with Navigation & Footer
│   ├── language/           # The Language page (all learning tabs)
│   ├── account/            # Account & subscription page
│   ├── login/ signup/ reset-password/ success/
│   └── api/
│       ├── language/       # Vocabulary, words, images, alignment, tests, progress, sheet setup
│       ├── translate/      # Translator tab
│       ├── friend/         # AI friend conversation and checking
│       ├── speak/          # Text-to-speech
│       ├── auth/           # Signup, login, logout, password reset
│       ├── account/        # Account language settings
│       ├── create-checkout-session/ cancel-subscription/ stripe-webhook/
├── components/             # LanguageForm, Training, ReadingTest, WritingTest, BeltIcon, ...
└── lib/
    ├── languages.ts        # Supported languages
    ├── languageLevels.ts   # Belt rules (levels, order of activities, passing score)
    ├── languageProgress.ts # Saving/loading belt progress
    ├── vocabSheet.ts / vocabSheetWriter.ts  # Google Sheets vocabulary read/write
    ├── translate.ts, grammarCheck.ts, readingTest.ts, wordAlignment.ts, friend.ts
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
