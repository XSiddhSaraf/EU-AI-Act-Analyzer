import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accountPlans } from "../../../../db/schema";
import { getCurrentUser } from "../../../auth";
import { describeError } from "../../../lib/errors";
import { getRazorpay } from "../../../lib/razorpay";

export type VerifyFullReportResponse =
  | { ok: true; pendingFullReports: number; alreadyProcessed?: boolean }
  | { ok: false; reason: string };

/**
 * Verifies a Razorpay Standard Checkout payment for the one-time "Full
 * Report" purchase and credits one pendingFullReports unit onto the
 * signed-in subject's account_plans row. Mirrors
 * app/api/one-time/verify's HMAC-SHA256(order_id + "|" + payment_id) scheme
 * and idempotency pattern exactly, just crediting a different counter.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required." } satisfies VerifyFullReportResponse, { status: 401 });
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
      { ok: false, reason: "Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature." } satisfies VerifyFullReportResponse,
      { status: 400 },
    );
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const razorpay = getRazorpay();
  if (!razorpay || !keySecret) {
    return Response.json(
      { ok: false, reason: "Razorpay is not configured on this deployment." } satisfies VerifyFullReportResponse,
      { status: 501 },
    );
  }

  const expectedSignature = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const signatureValid =
    expectedSignature.length === signature.length &&
    timingSafeEqual(Buffer.from(expectedSignature, "utf8"), Buffer.from(signature, "utf8"));

  if (!signatureValid) {
    return Response.json({ ok: false, reason: "Payment signature verification failed." } satisfies VerifyFullReportResponse, {
      status: 400,
    });
  }

  const subject = `user:${user.email}`;

  try {
    const order = await razorpay.orders.fetch(orderId);
    const orderSubject = order.notes && typeof order.notes === "object" ? (order.notes as Record<string, unknown>).subject : undefined;
    if (orderSubject !== subject) {
      return Response.json({ ok: false, reason: "This order does not belong to the signed-in account." } satisfies VerifyFullReportResponse, {
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

    if (row?.lastFullReportOrderId === orderId) {
      return Response.json({ ok: true, pendingFullReports: row.pendingFullReports, alreadyProcessed: true } satisfies VerifyFullReportResponse);
    }

    const nextPendingFullReports = (row?.pendingFullReports ?? 0) + 1;
    const now = new Date().toISOString();

    await db
      .insert(accountPlans)
      .values({ subject, pendingFullReports: nextPendingFullReports, lastFullReportOrderId: orderId, updatedAt: now })
      .onConflictDoUpdate({
        target: accountPlans.subject,
        set: { pendingFullReports: nextPendingFullReports, lastFullReportOrderId: orderId, updatedAt: now },
      });

    return Response.json({ ok: true, pendingFullReports: nextPendingFullReports } satisfies VerifyFullReportResponse);
  } catch (error) {
    return Response.json({ ok: false, reason: describeError(error) } satisfies VerifyFullReportResponse, { status: 500 });
  }
}
