import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { checkReports } from "../../../../../db/schema";
import type { SmartAnalysisResponse } from "../../../analyze-smart/route";
import { reportToCsv } from "../../../../lib/csv";
import { resolveSubject } from "../../../../lib/usage";

/** Streams a CSV export for one persisted check report. See the PDF route
 * for why ownership alone (not a live plan re-check) is the correct gate. */
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
    const csv = reportToCsv(result);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="govcheck-report-${reportId}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message }, { status: 500 });
  }
}
