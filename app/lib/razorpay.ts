import Razorpay from "razorpay";

let cached: Razorpay | null = null;

/**
 * Returns a shared Razorpay client, or `null` if RAZORPAY_KEY_ID /
 * RAZORPAY_KEY_SECRET aren't configured on this deployment. Callers should
 * fail open (same convention as the rest of this codebase — see
 * db/index.ts, app/lib/stripe.ts) rather than erroring when this returns
 * null.
 */
export function getRazorpay(): Razorpay | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  if (cached) return cached;

  cached = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return cached;
}
