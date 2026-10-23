import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accountPlans, apiKeys, checkReports, usageEvents } from "../../../../db/schema";
import { getCurrentUser } from "../../../auth";

/**
 * GDPR/CCPA data export (data subject access request). Returns every row
 * this app holds for the signed-in subject, scoped strictly to their own
 * data via the `subject` column — no admin override, no arbitrary lookup.
 *
 * Linked directly from the footer as a plain `<a href>` (see
 * compliance-checker.tsx), the same pattern used for the PDF/CSV report
 * downloads, so the browser just downloads the JSON file.
 *
 * Raw API key hashes are intentionally omitted (they're not meaningful to
 * the user and shouldn't be re-exposed even as a hash); only the
 * identifying metadata already shown in the UI is included.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required." }, { status: 401 });
  }

  const subject = `user:${user.email}`;

  try {
    const db = await getDb();
    const [planRows, usageRows, reportRows, keyRows] = await Promise.all([
      db.select().from(accountPlans).where(eq(accountPlans.subject, subject)).limit(1),
      db.select().from(usageEvents).where(eq(usageEvents.subject, subject)),
      db.select().from(checkReports).where(eq(checkReports.subject, subject)),
      db.select().from(apiKeys).where(eq(apiKeys.subject, subject)),
    ]);

    const planRow = planRows[0] as typeof accountPlans.$inferSelect | undefined;

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      account: { email: user.email, name: user.name },
      plan: planRow
        ? {
            plan: planRow.plan,
            billingInterval: planRow.billingInterval,
            paymentProvider: planRow.paymentProvider,
            bonusChecks: planRow.bonusChecks,
            pendingFullReports: planRow.pendingFullReports,
            whiteLabelCompanyName: planRow.whiteLabelCompanyName,
            whiteLabelLogoUrl: planRow.whiteLabelLogoUrl,
            updatedAt: planRow.updatedAt,
          }
        : null,
      usageEvents: (usageRows as (typeof usageEvents.$inferSelect)[]).map((row) => ({
        kind: row.kind,
        label: row.label,
        createdAt: row.createdAt,
      })),
      checkReports: (reportRows as (typeof checkReports.$inferSelect)[]).map((row) => ({
        id: row.id,
        label: row.label,
        readiness: row.readiness,
        verdict: row.verdict,
        createdAt: row.createdAt,
        result: safeParseJson(row.resultJson),
      })),
      apiKeys: (keyRows as (typeof apiKeys.$inferSelect)[]).map((row) => ({
        keyPrefix: row.keyPrefix,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        revokedAt: row.revokedAt,
      })),
    };

    return new Response(JSON.stringify(exportPayload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="govcheck-data-export.json"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message }, { status: 500 });
  }
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
