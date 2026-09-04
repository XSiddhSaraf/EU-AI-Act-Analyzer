import { getCurrentUser } from "../../../auth";
import { CHECK_PACK_CURRENCY, CHECK_PACK_PRICE_USD_CENTS, CHECK_PACK_SIZE } from "../../../lib/check-pack";
import { getRazorpay } from "../../../lib/razorpay";

// Razorpay's minimum order amount, in the smallest currency unit.
const RAZORPAY_MIN_AMOUNT = 100;

export type CreateOrderResponse =
  | { ok: true; orderId: string; amount: number; currency: string; keyId: string; prefillEmail: string }
  | { ok: false; reason: string };

/**
 * Creates a Razorpay Order for a one-time "extra checks" pack — Razorpay's
 * Standard Checkout (Orders API), independent of the recurring $11/mo Pro
 * subscription (Razorpay Subscriptions API, see app/api/billing/checkout).
 * Requires sign-in for the same reason subscription checkout does: a stable
 * `user:<email>` subject is what /api/one-time/verify credits bonus checks
 * to, and what /api/usage reads back — an anonymous device cookie would lose
 * purchased credits if the cookie is ever cleared.
 */
export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required before purchasing." } satisfies CreateOrderResponse, {
      status: 401,
    });
  }

  if (CHECK_PACK_PRICE_USD_CENTS < RAZORPAY_MIN_AMOUNT) {
    return Response.json(
      { ok: false, reason: `Amount must be at least ${RAZORPAY_MIN_AMOUNT}.` } satisfies CreateOrderResponse,
      { status: 400 },
    );
  }

  const razorpay = getRazorpay();
  if (!razorpay) {
    return Response.json(
      { ok: false, reason: "Razorpay is not configured on this deployment." } satisfies CreateOrderResponse,
      { status: 501 },
    );
  }

  const subject = `user:${user.email}`;

  try {
    const order = await razorpay.orders.create({
      amount: CHECK_PACK_PRICE_USD_CENTS,
      currency: CHECK_PACK_CURRENCY,
      receipt: `checkpack_${Date.now()}`,
      notes: { subject, kind: "check_pack", checks: String(CHECK_PACK_SIZE) },
    });

    const response: CreateOrderResponse = {
      ok: true,
      orderId: order.id,
      amount: Number(order.amount),
      currency: String(order.currency),
      keyId: process.env.RAZORPAY_KEY_ID as string,
      prefillEmail: user.email,
    };
    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message } satisfies CreateOrderResponse, { status: 500 });
  }
}
