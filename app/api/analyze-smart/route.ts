import { eq, sql } from "drizzle-orm";
import OpenAI from "openai";
import { z } from "zod";
import { getDb } from "../../../db";
import { accountPlans, checkReports } from "../../../db/schema";
import { extractBearerToken, resolveSubjectFromApiKey } from "../../lib/api-keys";
import { getKnowledgeBaseContext } from "../../lib/knowledge-base";
import { resolvePlanContext } from "../../lib/plans";
import { resolveSubject } from "../../lib/usage";
import { sourcesForFrameworks, type FrameworkId } from "../../lib/regulatory-sources";

// gpt-4o-mini is the strongest fit for this workload: it's cheap/fast and,
// unlike the other providers this project has used, supports *strict*
// Structured Outputs — the model is constrained at decode time to emit JSON
// that exactly matches the schema below, so we don't need best-effort JSON
// parsing/repair. Override via OPENAI_MODEL if you want a different model.
const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_INPUT_TEXT_LENGTH = 24000;
const FRAMEWORK_IDS: FrameworkId[] = ["euai", "gdpr", "iso42001", "nist", "oecd", "soc2"];

const findingSchema = z.object({
  label: z.string(),
  present: z.boolean(),
  evidence: z.string(),
});

const frameworkScoreSchema = z.object({
  score: z.number().min(0).max(100),
  status: z.enum(["Compatible", "Partial", "Not ready"]),
  findings: z.array(findingSchema),
});

const riskSchema = z.object({
  title: z.string(),
  severity: z.enum(["Critical", "High", "Medium", "Low"]),
  mitigation: z.string(),
  owner: z.string(),
  due: z.string(),
});

const officialMatchSchema = z.object({
  status: z.enum(["Strong source match", "Partial source match", "No direct source evidence"]),
  matchedTerms: z.array(z.string()),
});

export type SmartAnalysisResponse = {
  readiness: number;
  verdict: string;
  frameworkScores: Record<string, z.infer<typeof frameworkScoreSchema>>;
  risks: z.infer<typeof riskSchema>[];
  officialMatches: Record<string, z.infer<typeof officialMatchSchema>>;
  officialConfidence: number;
};

// OpenAI's strict Structured Outputs mode cannot express a dynamically-keyed
// record (every property must be explicitly enumerated in the schema), so we
// ask the model for arrays carrying an explicit id field instead, then
// convert back to the record shape the rest of the app expects (see
// toRecordResponse below). This keeps the client contract identical to the
// previous Gemini/Anthropic implementations.
const frameworkScoreEntrySchema = frameworkScoreSchema.extend({
  frameworkId: z.string(),
});

const officialMatchEntrySchema = officialMatchSchema.extend({
  sourceId: z.string(),
});

const openAiResponseSchema = z.object({
  readiness: z.number().min(0).max(100),
  verdict: z.string(),
  frameworkScores: z.array(frameworkScoreEntrySchema),
  risks: z.array(riskSchema),
  officialMatches: z.array(officialMatchEntrySchema),
  officialConfidence: z.number().min(0).max(100),
});

function isFrameworkId(value: string): value is FrameworkId {
  return (FRAMEWORK_IDS as string[]).includes(value);
}

/**
 * Strips a full analysis down to "score + top gaps" for the Free tier: each
 * framework keeps only its highest-priority not-present findings (falling
 * back to the first findings if everything is present), and risk/official-
 * source detail — both Pro+ differentiators — are dropped entirely. The
 * full (untruncated) result is still what gets persisted for Full Report
 * one-off purchases; this only shapes the free-tier HTTP response.
 */
function truncateForFreeTier(result: SmartAnalysisResponse): SmartAnalysisResponse {
  const MAX_GAPS = 3;
  const frameworkScores = Object.fromEntries(
    Object.entries(result.frameworkScores).map(([frameworkId, score]) => {
      const gaps = score.findings.filter((f) => !f.present);
      const findings = (gaps.length > 0 ? gaps : score.findings).slice(0, MAX_GAPS);
      return [frameworkId, { ...score, findings }];
    }),
  );
  return {
    readiness: result.readiness,
    verdict: result.verdict,
    frameworkScores,
    risks: [],
    officialMatches: {},
    officialConfidence: result.officialConfidence,
  };
}

function toRecordResponse(parsed: z.infer<typeof openAiResponseSchema>): SmartAnalysisResponse {
  return {
    readiness: parsed.readiness,
    verdict: parsed.verdict,
    frameworkScores: Object.fromEntries(
      parsed.frameworkScores.map(({ frameworkId, ...rest }) => [frameworkId, rest]),
    ),
    risks: parsed.risks,
    officialMatches: Object.fromEntries(
      parsed.officialMatches.map(({ sourceId, ...rest }) => [sourceId, rest]),
    ),
    officialConfidence: parsed.officialConfidence,
  };
}

// Hand-written (not zod-derived) JSON Schema for OpenAI's strict json_schema
// response format. Strict mode has stricter constraints than zod's default
// semantics can express (no optional/default properties, no numeric
// min/max, no array length bounds) — every property must appear in
// `required`, and every object needs `additionalProperties: false`. Numeric
// range and array-length constraints are instead enforced afterwards by the
// zod schemas above.
function buildJsonSchema(frameworkIds: FrameworkId[], sourceIds: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      readiness: { type: "number" },
      verdict: { type: "string" },
      frameworkScores: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            frameworkId: { type: "string", enum: frameworkIds },
            score: { type: "number" },
            status: { type: "string", enum: ["Compatible", "Partial", "Not ready"] },
            findings: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string" },
                  present: { type: "boolean" },
                  evidence: { type: "string" },
                },
                required: ["label", "present", "evidence"],
              },
            },
          },
          required: ["frameworkId", "score", "status", "findings"],
        },
      },
      risks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            severity: { type: "string", enum: ["Critical", "High", "Medium", "Low"] },
            mitigation: { type: "string" },
            owner: { type: "string" },
            due: { type: "string" },
          },
          required: ["title", "severity", "mitigation", "owner", "due"],
        },
      },
      officialMatches: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            sourceId: { type: "string", enum: sourceIds },
            status: {
              type: "string",
              enum: ["Strong source match", "Partial source match", "No direct source evidence"],
            },
            matchedTerms: { type: "array", items: { type: "string" } },
          },
          required: ["sourceId", "status", "matchedTerms"],
        },
      },
      officialConfidence: { type: "number" },
    },
    required: ["readiness", "verdict", "frameworkScores", "risks", "officialMatches", "officialConfidence"],
  } as const;
}

function buildSystemInstructions(frameworkIds: FrameworkId[], sourceIds: string[]): string {
  return [
    "You are an AI governance compliance analyst. You will be given the text of a submitted website or document, and must assess it against the official regulatory source excerpts provided below (each under a ### heading).",
    "",
    `Assess ONLY these frameworks: ${frameworkIds.join(", ")}.`,
    `Official source ids you may cite in officialMatches: ${sourceIds.join(", ")}.`,
    "",
    "Your response will be constrained to a JSON schema automatically. Populate it as follows:",
    "- frameworkScores: include exactly one entry per requested framework id, each with 3-6 findings.",
    "- officialMatches: include exactly one entry per official source id listed above.",
    "- readiness: 0-100 overall compatibility score across all selected frameworks.",
    "- officialConfidence: 0-100, how well the submitted content is grounded in/cites the official sources above.",
    "- evidence: a short quote from the submitted content, or an empty string if not present.",
    "Be concise but specific.",
  ].join("\n");
}

/**
 * Runs the LLM-backed compliance analysis. Every failure mode (missing key,
 * API error, malformed/invalid JSON response) returns `{ ok: false, reason }`
 * rather than a non-2xx error, matching this codebase's fail-open convention
 * (see db/index.ts, app/auth.ts) — the client falls back to the static
 * heuristic instead of breaking the "Run check" flow.
 *
 * Intentionally a plain single-turn call (no extended/adaptive thinking
 * budget): this is a structured extraction task, not open-ended reasoning,
 * and skipping it keeps response latency predictable behind the production
 * reverse proxy.
 */
export async function POST(request: Request) {
  let body: {
    documentText?: string;
    url?: string;
    selectedFrameworks?: string[];
    includeSecurity?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "Invalid request body." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, reason: "Smart analysis is not configured on this deployment." });
  }

  // Identity: an Agency API key (Authorization: Bearer <key>) takes
  // precedence over the usual cookie/session subject, so programmatic
  // callers don't need a browser session.
  const bearerToken = extractBearerToken(request);
  let subject: string;
  if (bearerToken) {
    const apiKeySubject = await resolveSubjectFromApiKey(bearerToken);
    if (!apiKeySubject) {
      return Response.json({ ok: false, reason: "Invalid or revoked API key." });
    }
    subject = apiKeySubject;
  } else {
    subject = (await resolveSubject()).subject;
  }

  const planContext = await resolvePlanContext(subject);
  if (bearerToken && planContext.plan !== "agency") {
    return Response.json({ ok: false, reason: "API access requires an Agency plan." });
  }

  const isFullReportRun = planContext.pendingFullReports > 0;

  const selectedFrameworks = (body.selectedFrameworks ?? []).filter(isFrameworkId);
  const requestedFrameworks = body.includeSecurity
    ? Array.from(new Set([...selectedFrameworks, "soc2" as FrameworkId]))
    : selectedFrameworks;
  // Full Report one-offs always unlock all 6 frameworks regardless of the
  // buyer's regular plan; otherwise cap at the plan's per-check limit (e.g.
  // Free is limited to 1 framework per check) — enforced here, not just in
  // the UI, so it can't be bypassed via a direct API call.
  const activeFrameworks = isFullReportRun
    ? FRAMEWORK_IDS
    : requestedFrameworks.slice(0, planContext.limits.maxFrameworksPerCheck);

  if (activeFrameworks.length === 0) {
    return Response.json({ ok: false, reason: "No frameworks selected." });
  }

  const documentText = (body.documentText ?? "").slice(0, MAX_INPUT_TEXT_LENGTH);
  const url = (body.url ?? "").trim();
  if (!documentText && !url) {
    return Response.json({ ok: false, reason: "No content to analyze." });
  }

  try {
    const knowledgeBase = await getKnowledgeBaseContext(activeFrameworks);
    const relevantSources = sourcesForFrameworks(activeFrameworks);
    const sourceIds = relevantSources.map((source) => source.id);

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

    const userContent = [
      `Website/document label: ${url || "(pasted or uploaded document)"}`,
      `Selected frameworks: ${activeFrameworks.join(", ")}`,
      "",
      "Submitted content to analyze:",
      documentText || "(no additional text beyond the URL above)",
    ].join("\n");

    // OpenAI automatically caches (and discounts) the prompt prefix shared
    // across requests once it exceeds ~1024 tokens, no code required — like
    // the Gemini implicit caching this replaces, keeping the large, mostly
    // stable knowledge base text in the system message (ahead of the small
    // per-request user content) maximizes the chance of a cache hit.
    const systemInstruction = [
      buildSystemInstructions(activeFrameworks, sourceIds),
      "",
      "### Official regulatory source excerpts",
      knowledgeBase.text ||
        "(No official source text is currently cached for the selected frameworks. Rely on general knowledge of these frameworks, and note lower confidence in officialMatches.)",
    ].join("\n");

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "compliance_analysis",
          strict: true,
          schema: buildJsonSchema(activeFrameworks, sourceIds),
        },
      },
    });

    const message = response.choices[0]?.message;
    if (message?.refusal) {
      return Response.json({ ok: false, reason: `Model refused to respond: ${message.refusal}` });
    }

    const text = message?.content;
    if (!text) {
      return Response.json({ ok: false, reason: "Model returned no text content." });
    }

    const parsed = openAiResponseSchema.parse(JSON.parse(text));
    const result = toRecordResponse(parsed);

    // Check history / export (Pro/Team/Agency, or any Full Report one-off
    // regardless of the buyer's regular plan) persists the *full* result —
    // truncation below only shapes what's returned over HTTP to Free tier.
    let reportId: number | null = null;
    if (planContext.limits.history || isFullReportRun) {
      try {
        const db = await getDb();
        const label = (url || documentText).slice(0, 200);
        const inserted: { id: number }[] = await db
          .insert(checkReports)
          .values({
            subject,
            label,
            resultJson: JSON.stringify(result),
            readiness: Math.round(result.readiness),
            verdict: result.verdict,
          })
          .returning({ id: checkReports.id });
        reportId = inserted[0]?.id ?? null;
      } catch {
        // History is a convenience feature — never fail the check over it.
      }
    }

    if (isFullReportRun) {
      try {
        const db = await getDb();
        await db
          .update(accountPlans)
          .set({ pendingFullReports: sql`max(${accountPlans.pendingFullReports} - 1, 0)` })
          .where(eq(accountPlans.subject, subject));
      } catch {
        // Best-effort decrement — worst case a buyer gets one extra run.
      }
    }

    const responseBody = planContext.plan === "free" && !isFullReportRun ? truncateForFreeTier(result) : result;

    return Response.json({
      ok: true,
      ...responseBody,
      knowledgeBaseUpdatedAt: knowledgeBase.updatedAt,
      cacheReadTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      plan: planContext.plan,
      fullReport: isFullReportRun,
      reportId,
    });
  } catch (error) {
    if (error instanceof OpenAI.AuthenticationError) {
      return Response.json({ ok: false, reason: "Invalid OpenAI API key." });
    }
    if (error instanceof OpenAI.RateLimitError) {
      return Response.json({ ok: false, reason: "Rate limited by OpenAI — try again shortly." });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message });
  }
}
