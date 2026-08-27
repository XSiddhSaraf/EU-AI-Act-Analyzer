import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accountPlans } from "../../../../db/schema";
import { getCurrentUser } from "../../../auth";
import { getStripe } from "../../../lib/stripe";

/**
 * Creates a Stripe Checkout Session for the Pro subscription. Requires
 * sign-in (Google/Microsoft) so the resulting subscription reliably links
 * back to `user:<email>` — the same subject key usage/plan checks already
 * use — across devices and browsers, unlike the anonymous device cookie.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required before upgrading." }, { status: 401 });
  }

  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_ID_PRO;
  if (!stripe || !priceId) {
    return Response.json({ ok: false, reason: "Stripe checkout is not configured on this deployment." });
  }

  const subject = `user:${user.email}`;
  const requestUrl = new URL(request.url);
  const origin = `${requestUrl.protocol}//${requestUrl.host}`;

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
      line_items: [{ price: priceId, quantity: 1 }],
      customer: existingCustomerId,
      customer_email: existingCustomerId ? undefined : user.email,
      client_reference_id: subject,
      metadata: { subject },
      subscription_data: { metadata: { subject } },
      success_url: `${origin}/?upgraded=1`,
      cancel_url: `${origin}/?upgraded=0`,
    });

    if (!session.url) {
      return Response.json({ ok: false, reason: "Stripe did not return a checkout URL." });
    }

    return Response.json({ ok: true, url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message });
  }
}
