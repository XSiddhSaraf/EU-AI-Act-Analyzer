# AI Governance Compatibility Checker

Checks a public website or a pasted/uploaded document against six AI
governance frameworks (EU AI Act, GDPR, ISO/IEC 42001, NIST AI RMF, OECD AI
Principles, and optional SOC 2-style security controls), flags risks with
mitigations, and cross-checks findings against official regulatory sources.

Built on [vinext](https://github.com/cloudflare/vinext) (Next.js API surface
on Vite/Cloudflare Workers), with Cloudflare D1 + Drizzle for usage metering.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares the Sites D1 binding (`"d1": "DB"`) used for
  usage metering; R2 is unused
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` defines `usage_events` (one row per check) and
  `account_plans` (free/pro/team overrides)
- `examples/d1/` contains an optional, unrelated D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Free Tier & Monetization

Every website or document check is gated through `app/api/usage/consume`:

- **Identity**: the signed-in user's email (Google or Microsoft — see
  `app/auth.ts`) when available, otherwise a persistent anonymous device
  cookie (`app/lib/usage.ts`).
- **Free limit**: `FREE_CHECK_LIMIT` in `app/lib/usage.ts` (currently `3`
  checks). Usage is logged to D1 (`usage_events`) and counted per subject.
- **Paywall UI**: `app/compliance-checker.tsx` shows a live usage meter and,
  once the limit is hit, an upgrade modal with Free/Pro/Team pricing cards.
- **Upgrading a user**: no payment processor is wired up yet. `POST
  /api/admin/set-plan` (protected by an `ADMIN_TOKEN` env var, sent as the
  `x-admin-token` header) flips a `subject`'s row in `account_plans` to
  `pro` or `team`, making their checks unlimited. Wire a real billing
  webhook (Stripe, etc.) to call the same logic when you add one.
- **Configuring CTAs**: set `NEXT_PUBLIC_UPGRADE_URL` (e.g. a Stripe Payment
  Link) and `NEXT_PUBLIC_CONTACT_URL` in `.env.local` — both default to
  `mailto:` links so the paywall works out of the box.
- **Reliability**: if D1 isn't provisioned yet (e.g. before the first deploy
  applies the generated migration), the metering routes fail open — checks
  stay unlimited and the UI shows a "preview — metering not live yet" note
  instead of breaking the product.

After changing `db/schema.ts`, run `npm run db:generate` and commit the
generated `drizzle/` folder; the Sites host applies it on deploy.

## Smart Analysis (LLM-powered)

By default, checks are scored with a fast, free, static keyword heuristic
(`signalMap`/`riskPatterns` in `app/compliance-checker.tsx`). Set
`ANTHROPIC_API_KEY` to additionally run a real Claude-powered analysis that
replaces the heuristic's results in the UI when it succeeds — the heuristic
still renders first/instantly and remains the fallback if the smart call is
unavailable, slow, or fails (nothing ever breaks the "Run check" flow).

- **Knowledge base**: `app/lib/regulatory-sources.ts` lists the official
  source URL for each framework (EUR-Lex, NIST, ISO, OECD). `app/lib/
  knowledge-base.ts` fetches and caches their text in the `knowledge_sources`
  table, with a content hash so unchanged pages are cheap to re-check.
  Freshness is hybrid: a background timer refreshes everything periodically
  on self-hosted deployments (`KNOWLEDGE_BASE_REFRESH_INTERVAL_HOURS`,
  default 24h), and any source older than `KNOWLEDGE_BASE_MAX_STALENESS_DAYS`
  (default 7) is refreshed on demand before the next smart check — this is
  what keeps things current on Cloudflare Workers too, where there's no
  long-lived process for a background timer.
- **Forcing a refresh**: `POST /api/admin/refresh-knowledge-base` (protected
  by `ADMIN_TOKEN`) re-fetches every source immediately, e.g. right after a
  known regulatory update.
- **Analysis**: `POST /api/analyze-smart` sends the cached knowledge base
  (in the prompt-cached system prompt) plus the submitted content to Claude
  and validates the structured JSON response before using it.
- **Cost**: this uses the real Anthropic API and is not free. Model defaults
  to `claude-opus-4-7`; override with `ANTHROPIC_MODEL` (e.g.
  `claude-sonnet-4-6`) to trade quality for cost. It's covered by the same
  free-tier check limit as everything else — no separate metering.
- **Document formats**: `.pptx`/`.docx`/`.pdf` uploads are extracted
  server-side via `POST /api/extract-document` (using `officeparser`);
  `.txt`/`.md`/`.csv`/`.json` are still read directly in the browser.

## Stripe Billing

The paywall's "Upgrade to Pro" button creates a real Stripe Checkout
subscription ($11/mo) once configured; without configuration it falls back
to a plain `mailto:` link (`NEXT_PUBLIC_UPGRADE_URL`), so the app keeps
working either way.

### Setup (Stripe Dashboard)

1. Create a Stripe account at [stripe.com](https://stripe.com) and stay in
   **test mode** while you set things up.
2. **Product catalog → Add product**: create "AI Governance Checker Pro"
   with a recurring price of **$11.00/month**. Copy the Price id (starts
   with `price_`, not the Product id) for `STRIPE_PRICE_ID_PRO`.
3. **Developers → API keys**: copy the secret key for `STRIPE_SECRET_KEY`.
4. **Developers → Webhooks → Add endpoint**: URL
   `https://<your-domain>/api/stripe/webhook`, events
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the signing secret for
   `STRIPE_WEBHOOK_SECRET`.
5. Test with [Stripe's test card numbers](https://docs.stripe.com/testing)
   before switching to live keys — test and live are entirely separate API
   keys, prices, and webhook endpoints, so repeat steps 2–4 in live mode
   when you're ready to accept real payments.

### How it works

- **Sign-in required**: "Upgrade to Pro" requires Google/Microsoft sign-in
  first (see below), because a Stripe subscription needs a stable identity
  (`user:<email>`) to link back to — not the anonymous device cookie used
  before sign-in.
- **`POST /api/stripe/checkout`**: creates the Checkout Session for the
  signed-in user and redirects to Stripe's hosted payment page.
- **`POST /api/stripe/webhook`**: the source of truth for entitlement.
  `checkout.session.completed` flips `account_plans.plan` to `"pro"` and
  stores the Stripe customer/subscription id;
  `customer.subscription.updated`/`.deleted` flips it back to `"free"` when
  the subscription is canceled or unpaid. This replaces the day-to-day job
  of the manual `POST /api/admin/set-plan`, which stays available for Team
  deals or support cases.
- **`POST /api/stripe/portal`**: opens a Stripe-hosted Billing Portal
  session ("Manage billing" next to the usage meter) so Pro subscribers can
  update payment methods or cancel themselves. Only works for subjects with
  a Stripe customer id — accounts granted Pro manually via
  `/api/admin/set-plan` have no self-service billing.
- **Reliability**: if `STRIPE_SECRET_KEY`/`STRIPE_PRICE_ID_PRO` aren't set,
  checkout/portal requests return a clear "not configured" response and the
  client falls back to the mailto link, matching this project's existing
  fail-open conventions.

## Razorpay Billing

Stripe is currently invite-only in India, so Razorpay is supported as an
alternative payment provider for the same $11/mo Pro subscription.
`POST /api/billing/checkout` is the single endpoint the client calls — it
prefers Razorpay when `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/
`RAZORPAY_PLAN_ID` are all set, otherwise falls back to Stripe, otherwise to
the plain `mailto:` link, so only one provider needs to be configured on any
given deployment.

### Setup (Razorpay Dashboard)

1. Create a Razorpay account at
   [dashboard.razorpay.com](https://dashboard.razorpay.com) and stay in
   **Test Mode** while you set things up.
2. **Account & Settings → International Payments/Payment Methods**: enable
   international payments so non-Indian cards can subscribe (skip this if
   you only expect Indian customers).
3. **Subscriptions → Plans → Create Plan**: a monthly recurring Plan billed
   in USD for **$11.00**. Copy its Plan id (starts with `plan_`) for
   `RAZORPAY_PLAN_ID`.
4. **Settings → API Keys → Generate Key**: copy the Key Id and Key Secret
   for `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
5. **Account & Settings → Webhooks → Add New Webhook**: URL
   `https://<your-domain>/api/razorpay/webhook`, active events
   `subscription.activated`, `subscription.charged`,
   `subscription.cancelled`, `subscription.completed`,
   `subscription.halted`. Copy the webhook secret for
   `RAZORPAY_WEBHOOK_SECRET`.
6. Test with [Razorpay's test cards](https://razorpay.com/docs/payments/payments/test-card-upi-details/)
   before switching to live keys — repeat steps 3–5 in Live Mode when
   you're ready to accept real payments.

### How it works

- **`POST /api/billing/checkout`**: requires sign-in, same as Stripe. When
  Razorpay is the active provider, it creates a Razorpay subscription
  server-side and returns its id plus the public Key Id; the client loads
  Razorpay's `checkout.js` and opens the hosted payment modal inline
  (Razorpay has no equivalent to Stripe's redirect-to-hosted-page flow).
- **`POST /api/razorpay/webhook`**: the source of truth for entitlement.
  `subscription.activated`/`.charged` flip `account_plans.plan` to `"pro"`
  with `paymentProvider: "razorpay"` and store the subscription id;
  `subscription.cancelled`/`.completed`/`.halted` flip it back to `"free"`.
  Verifies the raw request body against `RAZORPAY_WEBHOOK_SECRET` using
  Razorpay's signature scheme.
- **`POST /api/billing/cancel`**: Razorpay has no self-service Billing
  Portal like Stripe's, so Pro subscribers on Razorpay instead see a
  "Cancel subscription" button (with a confirm prompt) next to the usage
  meter, which cancels the subscription directly. Stripe subscribers keep
  using the existing "Manage billing" portal button instead. Either way, the
  respective webhook remains the actual source of truth for the plan flip —
  this route also optimistically updates the local row.
- **`GET /api/usage`** additionally reports `paymentProvider` so the client
  knows which of the two billing actions to render.
- **Reliability**: if `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/
  `RAZORPAY_PLAN_ID` aren't all set, `/api/billing/checkout` skips Razorpay
  and falls back to Stripe (then to the mailto link), matching this
  project's existing fail-open conventions.

### One-time check pack (Razorpay Standard Checkout)

For visitors who don't want a recurring subscription, the paywall also
offers a one-time pack of `CHECK_PACK_SIZE` (10) extra checks for
`CHECK_PACK_PRICE_USD_CENTS` ($9.00) — see `app/lib/check-pack.ts`. This
uses Razorpay's **Orders API** (Standard Checkout), a different product
from the Subscriptions API above, reusing the same `RAZORPAY_KEY_ID`/
`RAZORPAY_KEY_SECRET`.

- **`POST /api/one-time/create-order`**: requires sign-in; creates a
  Razorpay Order and returns its id plus the public Key Id for the client
  to open Razorpay's inline checkout modal (`order_id` instead of
  `subscription_id`).
- **`POST /api/one-time/verify`**: verifies `razorpay_signature` as
  `HMAC-SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET)` — a
  signature mismatch is rejected and nothing is credited. On success, also
  fetches the order back from Razorpay to confirm its `notes.subject`
  matches the signed-in caller (preventing one account from replaying
  another's order id), then credits `CHECK_PACK_SIZE` onto
  `account_plans.bonusChecks`, tracking the last-processed order id
  (`lastCheckPackOrderId`) so a retried verification call doesn't
  double-credit the same payment.
- **`bonusChecks`** stacks on top of `FREE_CHECK_LIMIT` in both
  `GET /api/usage` and `POST /api/usage/consume`, independent of `plan` —
  a free-tier subject can buy extra checks without subscribing to Pro.

## Sign in with Google or Microsoft

Authentication is handled by [Auth.js core](https://authjs.dev) (`@auth/core`)
directly — no external hosting platform involved, so this works on any
Cloudflare Workers deployment. Sessions are JWT-based (a signed/encrypted
cookie), so no database adapter or extra schema is required.

- `app/auth.ts` builds the Auth.js config (Google + Microsoft Entra ID
  providers) and exposes the helpers used elsewhere in the app:
  - `getCurrentUser()` for optional signed-in UI (returns `null` when
    anonymous or when auth isn't configured yet — see Reliability below).
  - `requireUser(returnTo)` for server-rendered pages that should send
    anonymous visitors through sign-in first.
  - `signInPath(returnTo)` / `signOutPath(returnTo)` for browser links —
    they point at Auth.js's own built-in sign-in/sign-out pages, which
    handle CSRF tokens and the provider redirect for you.
- `app/api/auth/[...auth]/route.ts` is the catch-all route handler that
  serves every Auth.js action (`signin`, `callback`, `session`, `signout`,
  etc.) under `/api/auth/*`.
- `app/compliance-checker.tsx` renders a small account control in the hero
  section ("Sign in with Google or Microsoft" / "Signed in as ... · Sign
  out") backed by a client-side fetch to `/api/auth/session`.
- Mark any additional protected pages with `export const dynamic =
  "force-dynamic"` because they depend on per-request session cookies.

### Configuration

Set these in `.env.local` for local development, and in your Cloudflare
Workers deployment's environment variables/secrets for production (see
`.env.example`):

```env
AUTH_SECRET=              # required — generate with `npx auth secret`
AUTH_GOOGLE_ID=           # Google Cloud Console > APIs & Services > Credentials
AUTH_GOOGLE_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ID=      # Microsoft Entra admin center > App registrations
AUTH_MICROSOFT_ENTRA_ID_SECRET=
# AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
#   ^ optional — omit to allow any Microsoft account (personal, school, or work);
#     set it to restrict sign-in to a single organization's tenant.
```

Register these OAuth redirect URIs with each provider (swap in your real
domain for local dev vs. production):

```
https://<your-domain>/api/auth/callback/google
https://<your-domain>/api/auth/callback/microsoft-entra-id
```

**Reliability**: if `AUTH_SECRET` or provider credentials aren't set yet,
`getCurrentUser()` fails open and returns `null` — the app keeps working
fully anonymously (free-tier metering falls back to the anonymous device
cookie, and the account control shows "Sign in") instead of breaking the
page.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the site and verify the build artifacts, the shipped
  homepage, and the free-tier usage metering wiring
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
