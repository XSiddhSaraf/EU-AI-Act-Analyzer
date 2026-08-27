import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Returns a shared Stripe client, or `null` if STRIPE_SECRET_KEY isn't
 * configured on this deployment. Callers should fail open (same convention
 * as the rest of this codebase — see db/index.ts, app/auth.ts) rather than
 * erroring when this returns null: Stripe billing is optional until set up.
 */
export function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  if (cached) return cached;

  cached = new Stripe(secretKey);
  return cached;
}
