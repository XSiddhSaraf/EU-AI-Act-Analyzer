import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { checkReports } from "../../../db/schema";
import { resolveSubject } from "../../lib/usage";

export type ReportSummary = { id: number; label: string; readiness: number; verdict: string; createdAt: string };
export type ReportsListResponse = { ok: true; reports: ReportSummary[] } | { ok: false; reason: string };

const MAX_REPORTS = 50;

/**
 * Lists the signed-in subject's persisted check reports (most recent
 * first), for the History panel. A row only ever exists for a subject
 * entitled to it (Pro/Team/Agency history, or a Full Report one-off) — see
 * app/api/analyze-smart/route.ts — so no extra plan gate is needed here,
 * only the subject filter itself.
 */
export async function GET() {
  const { subject, isAuthenticated } = await resolveSubject();
  if (!isAuthenticated) {
    return Response.json({ ok: true, reports: [] } satisfies ReportsListResponse);
  }

  try {
    const db = await getDb();
    const rows: (typeof checkReports.$inferSelect)[] = await db
      .select()
      .from(checkReports)
      .where(eq(checkReports.subject, subject))
      .orderBy(desc(checkReports.createdAt))
      .limit(MAX_REPORTS);

    const reports: ReportSummary[] = rows.map((row) => ({
      id: row.id,
      label: row.label,
      readiness: row.readiness,
      verdict: row.verdict,
      createdAt: row.createdAt,
    }));

    return Response.json({ ok: true, reports } satisfies ReportsListResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message } satisfies ReportsListResponse);
  }
}
