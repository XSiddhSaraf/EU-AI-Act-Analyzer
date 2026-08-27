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
