import { getKnowledgeBaseContext, refreshAllSources } from "../../../lib/knowledge-base";
import { regulatorySources } from "../../../lib/regulatory-sources";

/**
 * Forces an immediate refresh of every official regulatory source, bypassing
 * the normal staleness check. Protect with ADMIN_TOKEN, same convention as
 * app/api/admin/set-plan/route.ts. Useful right after a known regulatory
 * change, without waiting for the next scheduled/on-demand refresh.
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

  try {
    await refreshAllSources();
    const context = await getKnowledgeBaseContext(regulatorySources.map((source) => source.frameworkId));

    return Response.json({
      ok: true,
      refreshedSources: context.sources.length,
      sources: context.sources.map((row) => ({
        id: row.id,
        status: row.status,
        fetchedAt: row.fetchedAt,
        lastError: row.lastError || undefined,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
