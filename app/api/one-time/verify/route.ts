import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accountPlans } from "../../../../db/schema";
import { getCurrentUser } from "../../../auth";
import { CHECK_PACK_SIZE } from "../../../lib/check-pack";
import { getRazorpay } from "../../../lib/razorpay";

export type VerifyOrderResponse =
  | { ok: true; bonusChecks: number; alreadyProcessed?: boolean }
  | { ok: false; reason: string };

/**
 * Verifies a Razorpay Standard Checkout payment for the one-time "extra
 * checks" pack and credits CHECK_PACK_SIZE onto the signed-in subject's
 * account_plans row. Mirrors the HMAC-SHA256(order_id + "|" + payment_id)
 * scheme Razorpay documents for Standard Checkout — same primitive (Node's
 * crypto) the existing /api/razorpay/webhook route already relies on via
 * the Razorpay SDK's validateWebhookSignature, so this stays self-hosted
 * only (Node), consistent with that precedent.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required." } satisfies VerifyOrderResponse, { status: 401 });
  }

  let body: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body;
  if (!orderId || !paymentId || !signature) {
    return Response.json(
      { ok: false, reason: "Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature." } satisfies VerifyOrderResponse,
      { status: 400 },
    );
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const razorpay = getRazorpay();
  if (!razorpay || !keySecret) {
    return Response.json(
      { ok: false, reason: "Razorpay is not configured on this deployment." } satisfies VerifyOrderResponse,
      { status: 501 },
    );
  }

  const expectedSignature = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const signatureValid =
    expectedSignature.length === signature.length &&
    timingSafeEqual(Buffer.from(expectedSignature, "utf8"), Buffer.from(signature, "utf8"));

  if (!signatureValid) {
    // Do NOT credit anything on a signature mismatch.
    return Response.json({ ok: false, reason: "Payment signature verification failed." } satisfies VerifyOrderResponse, {
      status: 400,
    });
  }

  const subject = `user:${user.email}`;

  try {
    // The signature only proves the order/payment pair is authentically
    // from Razorpay — it doesn't prove *this* subject created that order.
    // Confirm ownership via the order's notes (set in /api/one-time/create-order)
    // before crediting, so one subject can't replay another's order id.
    const order = await razorpay.orders.fetch(orderId);
    const orderSubject = order.notes && typeof order.notes === "object" ? (order.notes as Record<string, unknown>).subject : undefined;
    if (orderSubject !== subject) {
      return Response.json({ ok: false, reason: "This order does not belong to the signed-in account." } satisfies VerifyOrderResponse, {
        status: 400,
      });
    }

    const db = await getDb();
    const rows: (typeof accountPlans.$inferSelect)[] = await db
      .select()
      .from(accountPlans)
      .where(eq(accountPlans.subject, subject))
      .limit(1);
    const row = rows[0];

    // Idempotent: re-submitting the same already-processed order (e.g. a
    // retried request) returns the current balance instead of double-crediting.
    if (row?.lastCheckPackOrderId === orderId) {
      return Response.json({ ok: true, bonusChecks: row.bonusChecks, alreadyProcessed: true } satisfies VerifyOrderResponse);
    }

    const nextBonusChecks = (row?.bonusChecks ?? 0) + CHECK_PACK_SIZE;
    const now = new Date().toISOString();

    await db
      .insert(accountPlans)
      .values({ subject, bonusChecks: nextBonusChecks, lastCheckPackOrderId: orderId, updatedAt: now })
      .onConflictDoUpdate({
        target: accountPlans.subject,
        set: { bonusChecks: nextBonusChecks, lastCheckPackOrderId: orderId, updatedAt: now },
      });

    return Response.json({ ok: true, bonusChecks: nextBonusChecks } satisfies VerifyOrderResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message } satisfies VerifyOrderResponse, { status: 500 });
  }
}
