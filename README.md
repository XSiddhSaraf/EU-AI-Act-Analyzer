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

- **Identity**: the signed-in ChatGPT user's email (`app/chatgpt-auth.ts`) when
  available, otherwise a persistent anonymous device cookie
  (`app/lib/usage.ts`).
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

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the site and verify the build artifacts, the shipped
  homepage, and the free-tier usage metering wiring
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
