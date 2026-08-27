import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accountPlans } from "../../../../db/schema";
import { getCurrentUser } from "../../../auth";
import { getRazorpay } from "../../../lib/razorpay";
import { getStripe } from "../../../lib/stripe";

// Large but finite — Razorpay subscriptions require a total_count of
// billing cycles; ~10 years of monthly billing effectively behaves like an
// indefinite subscription that renews until canceled.
const RAZORPAY_TOTAL_CYCLES = 120;

export type BillingCheckoutResponse =
  | { ok: true; provider: "stripe"; url: string }
  | { ok: true; provider: "razorpay"; subscriptionId: string; keyId: string; prefillEmail: string }
  | { ok: false; reason: string };

/**
 * Creates a subscription checkout for the signed-in user, preferring
 * Razorpay when configured (the only option currently usable for
 * India-based merchants without a Stripe invite — see app/lib/razorpay.ts),
 * falling back to Stripe, or a clear "not configured" response so the
 * client can fall back to the mailto UPGRADE_URL.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required before upgrading." }, { status: 401 });
  }

  const subject = `user:${user.email}`;
  const requestUrl = new URL(request.url);
  const origin = `${requestUrl.protocol}//${requestUrl.host}`;

  const razorpay = getRazorpay();
  const razorpayPlanId = process.env.RAZORPAY_PLAN_ID;
  if (razorpay && razorpayPlanId) {
    try {
      const subscription = await razorpay.subscriptions.create({
        plan_id: razorpayPlanId,
        total_count: RAZORPAY_TOTAL_CYCLES,
        customer_notify: 1,
        notes: { subject },
      });

      const response: BillingCheckoutResponse = {
        ok: true,
        provider: "razorpay",
        subscriptionId: subscription.id,
        keyId: process.env.RAZORPAY_KEY_ID as string,
        prefillEmail: user.email,
      };
      return Response.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json({ ok: false, reason: message } satisfies BillingCheckoutResponse);
    }
  }

  const stripe = getStripe();
  const stripePriceId = process.env.STRIPE_PRICE_ID_PRO;
  if (stripe && stripePriceId) {
    try {
      const db = await getDb();
      const rows: (typeof accountPlans.$inferSelect)[] = await db
        .select()
        .from(accountPlans)
        .where(eq(accountPlans.subject, subject))
        .limit(1);
      const existingCustomerId: string | undefined = rows[0]?.stripeCustomerId || undefined;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: stripePriceId, quantity: 1 }],
        customer: existingCustomerId,
        customer_email: existingCustomerId ? undefined : user.email,
        client_reference_id: subject,
        metadata: { subject },
        subscription_data: { metadata: { subject } },
        success_url: `${origin}/?upgraded=1`,
        cancel_url: `${origin}/?upgraded=0`,
      });

      if (!session.url) {
        return Response.json({ ok: false, reason: "Stripe did not return a checkout URL." } satisfies BillingCheckoutResponse);
      }

      return Response.json({ ok: true, provider: "stripe", url: session.url } satisfies BillingCheckoutResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json({ ok: false, reason: message } satisfies BillingCheckoutResponse);
    }
  }

  return Response.json({
    ok: false,
    reason: "No payment provider is configured on this deployment.",
  } satisfies BillingCheckoutResponse);
}
