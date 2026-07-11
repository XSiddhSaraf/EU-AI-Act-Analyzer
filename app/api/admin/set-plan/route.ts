import { getDb } from "../../../../db";
import { accountPlans } from "../../../../db/schema";

const VALID_PLANS = ["free", "pro", "team"] as const;
type Plan = (typeof VALID_PLANS)[number];

function isValidPlan(value: string): value is Plan {
  return (VALID_PLANS as readonly string[]).includes(value);
}

/**
 * Manually flips a user's plan after they pay through any out-of-band
 * channel (Stripe Payment Link, invoice, etc.). Protect with ADMIN_TOKEN.
 * Point a real billing webhook at this same logic once one exists.
 */
export async function POST(request: Request) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return Response.json(
      { error: "ADMIN_TOKEN is not configured on this deployment." },
      { status: 501 },
    );
  }

  const providedToken = request.headers.get("x-admin-token");
  if (providedToken !== adminToken) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { email?: string; plan?: string } = {};
  try {
    body = (await request.json()) as { email?: string; plan?: string };
  } catch {
    body = {};
  }

  const email = body.email?.trim().toLowerCase();
  const plan = body.plan?.trim().toLowerCase() ?? "";

  if (!email) {
    return Response.json({ error: "email is required." }, { status: 400 });
  }
  if (!isValidPlan(plan)) {
    return Response.json(
      { error: `plan must be one of: ${VALID_PLANS.join(", ")}` },
      { status: 400 },
    );
  }

  const subject = `user:${email}`;

  try {
    const db = getDb();
    await db
      .insert(accountPlans)
      .values({ subject, plan })
      .onConflictDoUpdate({
        target: accountPlans.subject,
        set: { plan, updatedAt: new Date().toISOString() },
      });

    return Response.json({ subject, plan, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
