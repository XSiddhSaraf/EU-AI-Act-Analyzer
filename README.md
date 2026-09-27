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

## Pricing Tiers & Monetization

Five tiers, defined in one place (`app/lib/plans.ts`, `PLAN_LIMITS`):

- **Free** — $0. 3 checks/month, 1 framework per check, results truncated to
  score + top 3 gaps (no risks/official-source detail, no export/history).
- **Full Report** — $19 (~₹799) one-off. Not a subscription: buying one
  credits `account_plans.pendingFullReports`, and the *next* check that
  subject runs is forced to all 6 frameworks with the full response, a
  persisted history row, and a branded PDF — regardless of their regular
  plan. See "Full Report (one-off)" below.
- **Pro** — $29/mo or $24/mo billed yearly (₹999/mo in India). 60 checks/mo,
  all frameworks, PDF/CSV export, check history, 1 user.
- **Team** — $129/mo or $99/mo yearly (₹4,999/mo in India). 300 checks/mo, 5
  users (seat count is a label only — no invite flow yet, the limit applies
  to the one subscribing account). Weekly auto re-scans + alerts,
  Jira/GitHub export, and repo scanning are marked "coming soon" in the UI
  and not implemented yet.
- **Agency/Enterprise** — from $299/mo (custom pricing for larger deals).
  1,000+ checks/mo, white-label PDF branding, API access, and "SSO" (the
  existing Google/Microsoft sign-in, not a separate enterprise SAML/IdP
  integration — it's not actually Agency-exclusive today).

Every check runs through `app/api/usage/consume` for gating (monthly
counts, reset each calendar month in UTC) and `app/lib/plans.ts` for
resolving a subject's tier/limits everywhere else (analyze-smart, exports,
history, API keys).

- **Identity**: the signed-in user's email (Google or Microsoft — see
  `app/auth.ts`) when available, otherwise a persistent anonymous device
  cookie (`app/lib/usage.ts`). Only Free operates anonymously; all paid
  tiers and Full Report require sign-in.
- **Paywall UI**: `app/compliance-checker.tsx` shows a live usage meter and,
  once the monthly limit is hit (or on demand via "Upgrade"), a pricing
  modal with all 5 tiers, a monthly/yearly toggle, and a distinct "Buy Full
  Report" flow.
- **Upgrading/overriding a user manually**: `POST /api/admin/set-plan`
  (protected by `ADMIN_TOKEN`, sent as the `x-admin-token` header) can set
  `plan` directly, and `monthlyCheckLimitOverride` on `account_plans` can
  grant a custom negotiated limit (`-1` means unlimited) without needing a
  matching Stripe/Razorpay Price/Plan id — useful for Enterprise deals.
- **Configuring CTAs**: set `NEXT_PUBLIC_UPGRADE_URL` and
  `NEXT_PUBLIC_CONTACT_URL` in `.env.local` — both default to `mailto:`
  links used as the final fallback when no payment provider is configured.
- **Reliability**: if D1 isn't provisioned yet (e.g. before the first deploy
  applies the generated migration), the metering routes fail open — checks
  stay unlimited and the UI marks the run "degraded" instead of breaking
  the product.

After changing `db/schema.ts`, run `npm run db:generate` and commit the
generated `drizzle/` folder; the Sites host applies it on deploy.

## Smart Analysis (LLM-powered)

By default, checks are scored with a fast, free, static keyword heuristic
(`signalMap`/`riskPatterns` in `app/compliance-checker.tsx`). Set
`OPENAI_API_KEY` to additionally run a real OpenAI-powered analysis that
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
  (as the OpenAI system message, relying on OpenAI's automatic prompt
  caching for repeat requests) plus the submitted content to OpenAI, using
  Structured Outputs (`response_format: json_schema`, `strict: true`) so the
  response is guaranteed to match the expected schema, then validates it
  again with `zod` before using it.
- **Cost**: this uses the real OpenAI API and is not free. Model defaults to
  `gpt-4o-mini`; override with `OPENAI_MODEL` to use a different model (must
  support Structured Outputs). It's covered by the same free-tier check
  limit as everything else — no separate metering.
- **Document formats**: `.pptx`/`.docx`/`.pdf` uploads are extracted
  server-side via `POST /api/extract-document` (using `officeparser`);
  `.txt`/`.md`/`.csv`/`.json` are still read directly in the browser.

## Stripe Billing

The pricing modal's "Upgrade to Pro/Team/Agency" buttons create a real
Stripe Checkout subscription once configured; without configuration they
fall back to a plain `mailto:` link (`NEXT_PUBLIC_UPGRADE_URL`), so the app
keeps working either way.

### Setup (Stripe Dashboard)

1. Create a Stripe account at [stripe.com](https://stripe.com) and stay in
   **test mode** while you set things up.
2. **Product catalog → Add product**: create one recurring Price per tier x
   interval you want to sell — Pro $29/mo or $24/mo billed yearly, Team
   $129/mo or $99/mo yearly, Agency from $299/mo. Copy each Price id
   (starts with `price_`, not the Product id) into the matching
   `STRIPE_PRICE_ID_*` var (see `.env.example`) — skip any cell you don't
   want to sell self-serve (e.g. only offer Agency via "Contact sales").
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

- **Sign-in required**: upgrading requires Google/Microsoft sign-in first
  (see below), because a Stripe subscription needs a stable identity
  (`user:<email>`) to link back to — not the anonymous device cookie used
  before sign-in.
- **`POST /api/billing/checkout`**: takes `{ plan, interval }`, looks up the
  matching `STRIPE_PRICE_ID_*` var, creates the Checkout Session (with
  `plan`/`interval` in `metadata`), and redirects to Stripe's hosted
  payment page.
- **`POST /api/stripe/webhook`**: the source of truth for entitlement.
  `checkout.session.completed` reads `plan`/`interval` back out of
  `metadata` and sets `account_plans.plan`/`billingInterval` accordingly
  (defaulting to `"pro"`/`"monthly"` if missing) and stores the Stripe
  customer/subscription id; `customer.subscription.updated`/`.deleted`
  preserves the existing tier while active and flips to `"free"` once the
  subscription is no longer active. This replaces the day-to-day job of the
  manual `POST /api/admin/set-plan`, which stays available for negotiated
  Enterprise deals or support cases.
- **`POST /api/stripe/portal`**: opens a Stripe-hosted Billing Portal
  session ("Manage billing" next to the usage meter) so subscribers can
  update payment methods or cancel themselves. Only works for subjects with
  a Stripe customer id — accounts granted a plan manually via
  `/api/admin/set-plan` have no self-service billing.
- **Reliability**: if the relevant `STRIPE_SECRET_KEY`/`STRIPE_PRICE_ID_*`
  aren't set, checkout/portal requests return a clear "not configured"
  response and the client falls back to the mailto link, matching this
  project's existing fail-open conventions.

## Razorpay Billing

Stripe is currently invite-only in India, so Razorpay is supported as an
alternative payment provider for the same 3 paid tiers.
`POST /api/billing/checkout` is the single endpoint the client calls — it
prefers Razorpay when `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` and the
relevant `RAZORPAY_PLAN_ID_*` are set, otherwise falls back to Stripe,
otherwise to the plain `mailto:` link, so only one provider needs to be
configured on any given deployment.

### Setup (Razorpay Dashboard)

1. Create a Razorpay account at
   [dashboard.razorpay.com](https://dashboard.razorpay.com) and stay in
   **Test Mode** while you set things up.
2. **Account & Settings → International Payments/Payment Methods**: enable
   international payments so non-Indian cards can subscribe (skip this if
   you only expect Indian customers).
3. **Subscriptions → Plans → Create Plan**: one recurring Plan per tier x
   interval you want to sell in India — Pro ₹999/mo, Team ₹4,999/mo, Agency
   custom. Copy each Plan id (starts with `plan_`) into the matching
   `RAZORPAY_PLAN_ID_*` var (see `.env.example`).
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

- **`POST /api/billing/checkout`**: requires sign-in, same as Stripe. Takes
  `{ plan, interval }`, looks up the matching `RAZORPAY_PLAN_ID_*` var,
  creates a Razorpay subscription server-side (with `plan`/`interval` in
  `notes`) and returns its id plus the public Key Id; the client loads
  Razorpay's `checkout.js` and opens the hosted payment modal inline
  (Razorpay has no equivalent to Stripe's redirect-to-hosted-page flow).
- **`POST /api/razorpay/webhook`**: the source of truth for entitlement.
  `subscription.activated`/`.charged` read `plan`/`interval` back out of
  `notes` and set `account_plans.plan`/`billingInterval` accordingly
  (defaulting to `"pro"`/`"monthly"` if missing) with
  `paymentProvider: "razorpay"` and store the subscription id;
  `subscription.cancelled`/`.completed`/`.halted` flip it back to `"free"`.
  Verifies the raw request body against `RAZORPAY_WEBHOOK_SECRET` using
  Razorpay's signature scheme.
- **`POST /api/billing/cancel`**: Razorpay has no self-service Billing
  Portal like Stripe's, so subscribers on Razorpay instead see a "Cancel
  subscription" button (with a confirm prompt) next to the usage meter,
  which cancels the subscription directly. Stripe subscribers keep using
  the existing "Manage billing" portal button instead. Either way, the
  respective webhook remains the actual source of truth for the plan flip —
  this route also optimistically updates the local row.
- **`GET /api/usage`** additionally reports `paymentProvider` so the client
  knows which of the two billing actions to render.
- **Reliability**: if `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/the relevant
  `RAZORPAY_PLAN_ID_*` aren't all set, `/api/billing/checkout` skips
  Razorpay and falls back to Stripe (then to the mailto link), matching
  this project's existing fail-open conventions.

### One-time check pack (Razorpay Standard Checkout)

Separate from Full Report (below) and not currently surfaced in the UI: a
one-time pack of `CHECK_PACK_SIZE` (10) extra checks for
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
- **`bonusChecks`** stacks on top of the plan's monthly limit in both
  `GET /api/usage` and `POST /api/usage/consume`, independent of `plan` —
  a free-tier subject can buy extra checks without subscribing.

## Full Report (one-off)

`app/lib/full-report.ts` + `app/api/full-report/*` sell a single all-6-
framework check with a complete evidence map, fix list, and branded PDF for
$19 (~₹799), independent of the buyer's regular plan.

- **`POST /api/full-report/create-order`**: requires sign-in; prefers
  Razorpay Orders (INR) when configured, else a Stripe one-off Checkout
  Session (`mode: "payment"`, USD), else "not configured".
- **`POST /api/full-report/verify`**: Razorpay path only (mirrors
  `/api/one-time/verify`'s HMAC + idempotency pattern) — the Stripe path is
  credited via `app/api/stripe/webhook`'s `checkout.session.completed`
  handler instead, keyed off `metadata.kind === "full_report"`.
- Either path increments `account_plans.pendingFullReports`. The **next**
  call to `POST /api/analyze-smart` for that subject ignores the caller's
  plan-based framework cap (forces all 6), persists a `check_reports` row
  regardless of plan, decrements the counter by 1, and the client then
  offers a PDF/CSV download for that specific run.

## Check History & Exports (Pro/Team/Agency)

Every check run by a Pro/Team/Agency subject — plus any Full Report one-off
run, regardless of the buyer's plan — is persisted to the `check_reports`
table (full JSON result, readiness, verdict, label, timestamp).

- **`GET /api/reports`**: lists the signed-in subject's saved reports
  (newest first). Since a row only ever exists for an entitled subject,
  this needs no extra plan check beyond the `subject` filter itself.
- **`GET /api/reports/:id/pdf`** and **`GET /api/reports/:id/csv`**: stream
  a branded PDF (`app/lib/pdf-report.tsx`, via `@react-pdf/renderer`) or a
  CSV export (`app/lib/csv.ts`) for one report, ownership-checked against
  the signed-in subject.
- The "History" link in the header (signed-in Pro/Team/Agency only) opens a
  panel listing saved reports with PDF/CSV download links; the results page
  also links directly to the just-completed run's PDF/CSV when available.

## API Access (Agency)

Agency subjects can call `POST /api/analyze-smart` programmatically instead
of through the browser session.

- **`POST /api/api-keys`**: creates a new key (returns the raw key once —
  only a SHA-256 hash is stored). **`GET /api/api-keys`**: lists masked keys
  (prefix only). **`DELETE /api/api-keys/:id`**: revokes a key. All three
  require the signed-in subject's plan to be `"agency"`.
- Call `POST /api/analyze-smart` with `Authorization: Bearer <key>` instead
  of a browser session/cookie — the key resolves to its owning subject
  (which must still be on the Agency plan) and is subject to the same
  monthly quota as browser-driven checks.

## White-Label Branding (Agency)

**`POST /api/account/branding`** (Agency-only) sets `companyName` and a
hosted `https://` `logoUrl`, applied to that subject's generated PDFs in
place of GovCheck's default branding. No file upload/storage in this phase
— the logo must already be hosted elsewhere. **`GET /api/account/branding`**
returns the current values.

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
