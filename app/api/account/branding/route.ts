import { getDb } from "../../../../db";
import { accountPlans } from "../../../../db/schema";
import { getCurrentUser } from "../../../auth";
import { resolvePlanContext } from "../../../lib/plans";

export type BrandingResponse = { ok: true; companyName: string; logoUrl: string } | { ok: false; reason: string };

const MAX_COMPANY_NAME_LENGTH = 80;

function isValidLogoUrl(value: string): boolean {
  if (!value) return true; // clearing the logo is allowed
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Sets Agency-only white-label branding (company name + a hosted HTTPS logo
 * URL) applied to generated PDFs - see app/lib/pdf-report.tsx. No file
 * upload/storage in this phase; the logo must already be hosted elsewhere.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required." } satisfies BrandingResponse, { status: 401 });
  }

  const subject = `user:${user.email}`;
  const planContext = await resolvePlanContext(subject);
  if (planContext.plan !== "agency") {
    return Response.json({ ok: false, reason: "White-label branding requires an Agency plan." } satisfies BrandingResponse, {
      status: 403,
    });
  }

  let body: { companyName?: string; logoUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const companyName = (body.companyName ?? "").trim().slice(0, MAX_COMPANY_NAME_LENGTH);
  const logoUrl = (body.logoUrl ?? "").trim();

  if (!isValidLogoUrl(logoUrl)) {
    return Response.json({ ok: false, reason: "Logo URL must be a valid https:// URL." } satisfies BrandingResponse, {
      status: 400,
    });
  }

  try {
    const db = await getDb();
    const now = new Date().toISOString();
    await db
      .insert(accountPlans)
      .values({ subject, whiteLabelCompanyName: companyName, whiteLabelLogoUrl: logoUrl, updatedAt: now })
      .onConflictDoUpdate({
        target: accountPlans.subject,
        set: { whiteLabelCompanyName: companyName, whiteLabelLogoUrl: logoUrl, updatedAt: now },
      });

    return Response.json({ ok: true, companyName, logoUrl } satisfies BrandingResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message } satisfies BrandingResponse, { status: 500 });
  }
}

/** Returns the signed-in Agency subject's current branding settings. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required." } satisfies BrandingResponse, { status: 401 });
  }

  const subject = `user:${user.email}`;
  const planContext = await resolvePlanContext(subject);
  return Response.json({
    ok: true,
    companyName: planContext.whiteLabelCompanyName,
    logoUrl: planContext.whiteLabelLogoUrl,
  } satisfies BrandingResponse);
}
