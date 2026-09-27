import { getCurrentUser } from "../../../auth";
import { describeError } from "../../../lib/errors";
import { FULL_REPORT_PRICE_INR_PAISE, FULL_REPORT_PRICE_USD_CENTS } from "../../../lib/full-report";
import { getRazorpay } from "../../../lib/razorpay";
import { getStripe } from "../../../lib/stripe";

export type FullReportOrderResponse =
  | { ok: true; provider: "razorpay"; orderId: string; amount: number; currency: string; keyId: string; prefillEmail: string }
  | { ok: true; provider: "stripe"; url: string }
  | { ok: false; reason: string };

/**
 * Creates a one-time "Full Report" purchase, preferring Razorpay's Orders
 * API (Standard Checkout, INR) when configured, else a Stripe one-off
 * Checkout Session (mode: "payment", USD), else a clear "not configured"
 * response. Requires sign-in for the same reason the existing one-time
 * check-pack flow does: the credit is tied to a stable `user:<email>`
 * subject, not the anonymous device cookie.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required before purchasing." } satisfies FullReportOrderResponse, {
      status: 401,
    });
  }

  const subject = `user:${user.email}`;

  const razorpay = getRazorpay();
  if (razorpay) {
    try {
      const order = await razorpay.orders.create({
        amount: FULL_REPORT_PRICE_INR_PAISE,
        currency: "INR",
        receipt: `fullreport_${Date.now()}`,
        notes: { subject, kind: "full_report" },
      });

      const response: FullReportOrderResponse = {
        ok: true,
        provider: "razorpay",
        orderId: order.id,
        amount: Number(order.amount),
        currency: String(order.currency),
        keyId: process.env.RAZORPAY_KEY_ID as string,
        prefillEmail: user.email,
      };
      return Response.json(response);
    } catch (error) {
      return Response.json({ ok: false, reason: describeError(error) } satisfies FullReportOrderResponse, { status: 500 });
    }
  }

  const stripe = getStripe();
  if (stripe) {
    try {
      const requestUrl = new URL(request.url);
      const origin = `${requestUrl.protocol}//${requestUrl.host}`;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: FULL_REPORT_PRICE_USD_CENTS,
              product_data: { name: "GovCheck Full Report" },
            },
            quantity: 1,
          },
        ],
        customer_email: user.email,
        client_reference_id: subject,
        metadata: { subject, kind: "full_report" },
        success_url: `${origin}/?fullReportPurchased=1`,
        cancel_url: `${origin}/?fullReportPurchased=0`,
      });

      if (!session.url) {
        return Response.json({ ok: false, reason: "Stripe did not return a checkout URL." } satisfies FullReportOrderResponse);
      }

      return Response.json({ ok: true, provider: "stripe", url: session.url } satisfies FullReportOrderResponse);
    } catch (error) {
      return Response.json({ ok: false, reason: describeError(error) } satisfies FullReportOrderResponse, { status: 500 });
    }
  }

  return Response.json({
    ok: false,
    reason: "No payment provider is configured on this deployment.",
  } satisfies FullReportOrderResponse);
}
