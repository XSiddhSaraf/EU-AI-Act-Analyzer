import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { checkReports } from "../../../../../db/schema";
import type { SmartAnalysisResponse } from "../../../analyze-smart/route";
import { resolvePlanContext } from "../../../../lib/plans";
import { renderComplianceReportPdf } from "../../../../lib/pdf-report";
import { resolveSubject } from "../../../../lib/usage";

/**
 * Streams a branded PDF for one persisted check report. A `checkReports`
 * row only ever exists for a subject that's entitled to it (Pro/Team/Agency
 * history, or a Full Report one-off credit spent on that specific check —
 * see app/api/analyze-smart/route.ts), so ownership alone (not a live plan
 * re-check) is the correct gate here: a Free-tier buyer of a one-off Full
 * Report must still be able to download it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) {
    return Response.json({ ok: false, reason: "Invalid report id." }, { status: 400 });
  }

  const { subject } = await resolveSubject();

  try {
    const db = await getDb();
    const rows: (typeof checkReports.$inferSelect)[] = await db
      .select()
      .from(checkReports)
      .where(eq(checkReports.id, reportId))
      .limit(1);
    const row = rows[0];

    if (!row || row.subject !== subject) {
      return Response.json({ ok: false, reason: "Report not found." }, { status: 404 });
    }

    const result = JSON.parse(row.resultJson) as SmartAnalysisResponse;
    const planContext = await resolvePlanContext(subject);

    const pdfBuffer = await renderComplianceReportPdf(result, {
      label: row.label,
      createdAt: row.createdAt,
      companyName: planContext.plan === "agency" ? planContext.whiteLabelCompanyName : "",
      logoUrl: planContext.plan === "agency" ? planContext.whiteLabelLogoUrl : "",
    });

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="govcheck-report-${reportId}.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message }, { status: 500 });
  }
}
