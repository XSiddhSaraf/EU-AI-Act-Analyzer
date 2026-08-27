import Razorpay from "razorpay";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accountPlans } from "../../../../db/schema";

type RazorpaySubscriptionEntity = {
  id: string;
  status: string;
  notes?: Record<string, string | number> | null;
};

type RazorpayWebhookBody = {
  event: string;
  payload?: {
    subscription?: { entity?: RazorpaySubscriptionEntity };
  };
};

const ACTIVE_STATUSES = new Set(["active", "authenticated"]);

/**
 * Handles Razorpay subscription lifecycle events. Configure this URL in the
 * Razorpay Dashboard under Settings -> Webhooks. Verification requires the
 * exact raw request body — read it with request.text() before any JSON
 * parsing, unlike every other route here (see also app/api/stripe/webhook).
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json({ error: "Razorpay webhook is not configured on this deployment." }, { status: 501 });
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return Response.json({ error: "Missing x-razorpay-signature header." }, { status: 400 });
  }

  const rawBody = await request.text();

  const isValid = Razorpay.validateWebhookSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    return Response.json({ error: "Webhook signature verification failed." }, { status: 400 });
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(rawBody) as RazorpayWebhookBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const subscription = body.payload?.subscription?.entity;
    if (!subscription) {
      // Event type we don't care about (e.g. payment.* without a
      // subscription) — acknowledge so Razorpay doesn't retry.
      return Response.json({ received: true });
    }

    const subject = subscription.notes?.subject;
    const db = await getDb();

    if (body.event === "subscription.activated" || body.event === "subscription.charged") {
      if (typeof subject === "string") {
        const now = new Date().toISOString();
        await db
          .insert(accountPlans)
          .values({
            subject,
            plan: "pro",
            paymentProvider: "razorpay",
            razorpaySubscriptionId: subscription.id,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: accountPlans.subject,
            set: {
              plan: "pro",
              paymentProvider: "razorpay",
              razorpaySubscriptionId: subscription.id,
              updatedAt: now,
            },
          });
      }
    } else if (
      body.event === "subscription.cancelled" ||
      body.event === "subscription.completed" ||
      body.event === "subscription.halted"
    ) {
      const rows: (typeof accountPlans.$inferSelect)[] = await db
        .select()
        .from(accountPlans)
        .where(eq(accountPlans.razorpaySubscriptionId, subscription.id))
        .limit(1);
      const row = rows[0];

      if (row && !ACTIVE_STATUSES.has(subscription.status)) {
        await db
          .update(accountPlans)
          .set({ plan: "free", updatedAt: new Date().toISOString() })
          .where(eq(accountPlans.subject, row.subject));
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Unlike this app's other routes, return a real error status here so
    // Razorpay retries delivery — silently succeeding would drop the update.
    return Response.json({ error: message }, { status: 500 });
  }
}
