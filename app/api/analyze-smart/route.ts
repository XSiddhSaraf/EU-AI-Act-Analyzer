import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getKnowledgeBaseContext } from "../../lib/knowledge-base";
import { sourcesForFrameworks, type FrameworkId } from "../../lib/regulatory-sources";

const DEFAULT_MODEL = "claude-opus-4-7";
const MAX_INPUT_TEXT_LENGTH = 24000;
const FRAMEWORK_IDS: FrameworkId[] = ["euai", "gdpr", "iso42001", "nist", "oecd", "soc2"];

const findingSchema = z.object({
  label: z.string(),
  present: z.boolean(),
  evidence: z.string().optional().default(""),
});

const frameworkScoreSchema = z.object({
  score: z.number().min(0).max(100),
  status: z.enum(["Compatible", "Partial", "Not ready"]),
  findings: z.array(findingSchema).min(1).max(8),
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
  matchedTerms: z.array(z.string()).default([]),
});

const analysisResponseSchema = z.object({
  readiness: z.number().min(0).max(100),
  verdict: z.string(),
  frameworkScores: z.record(z.string(), frameworkScoreSchema),
  risks: z.array(riskSchema).default([]),
  officialMatches: z.record(z.string(), officialMatchSchema).default({}),
  officialConfidence: z.number().min(0).max(100),
});

export type SmartAnalysisResponse = z.infer<typeof analysisResponseSchema>;

function isFrameworkId(value: string): value is FrameworkId {
  return (FRAMEWORK_IDS as string[]).includes(value);
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function buildSystemInstructions(frameworkIds: FrameworkId[], sourceIds: string[]): string {
  return [
    "You are an AI governance compliance analyst. You will be given the text of a submitted website or document, and must assess it against the official regulatory source excerpts provided below (each under a ### heading).",
    "",
    `Assess ONLY these frameworks: ${frameworkIds.join(", ")}.`,
    `Official source ids you may cite in officialMatches: ${sourceIds.join(", ")}.`,
    "",
    "Respond with ONLY a single valid JSON object (no markdown code fences, no commentary before or after) matching exactly this shape:",
    `{
  "readiness": <0-100 overall compatibility score across all selected frameworks>,
  "verdict": "<one short phrase, e.g. 'Partially compatible'>",
  "frameworkScores": {
    "<frameworkId>": {
      "score": <0-100>,
      "status": "Compatible" | "Partial" | "Not ready",
      "findings": [ { "label": "<short control name>", "present": <true|false>, "evidence": "<short quote or empty string>" } ]
    }
  },
  "risks": [ { "title": "<risk>", "severity": "Critical"|"High"|"Medium"|"Low", "mitigation": "<practical fix>", "owner": "<team>", "due": "<e.g. '14 days'>" } ],
  "officialMatches": { "<sourceId>": { "status": "Strong source match"|"Partial source match"|"No direct source evidence", "matchedTerms": ["..."] } },
  "officialConfidence": <0-100, how well the submitted content is grounded in/cites the official sources above>
}`,
    "",
    "Include an entry in frameworkScores for every requested framework (3-6 findings each), and an entry in officialMatches for every official source id listed above. Be concise but specific.",
  ].join("\n");
}

/**
 * Runs the LLM-backed compliance analysis. Every failure mode (missing key,
 * API error, malformed/invalid JSON response) returns `{ ok: false, reason }`
 * rather than a non-2xx error, matching this codebase's fail-open convention
 * (see db/index.ts, app/auth.ts) — the client falls back to the static
 * heuristic instead of breaking the "Run check" flow.
 *
 * Intentionally a plain single-turn call (no extended/adaptive thinking):
 * this is a structured extraction task, not open-ended reasoning, and
 * skipping it keeps response latency predictable behind the production
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, reason: "Smart analysis is not configured on this deployment." });
  }

  const selectedFrameworks = (body.selectedFrameworks ?? []).filter(isFrameworkId);
  const activeFrameworks = body.includeSecurity
    ? Array.from(new Set([...selectedFrameworks, "soc2" as FrameworkId]))
    : selectedFrameworks;

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

    const client = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

    const userContent = [
      `Website/document label: ${url || "(pasted or uploaded document)"}`,
      `Selected frameworks: ${activeFrameworks.join(", ")}`,
      "",
      "Submitted content to analyze:",
      documentText || "(no additional text beyond the URL above)",
    ].join("\n");

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: buildSystemInstructions(activeFrameworks, relevantSources.map((source) => source.id)),
        },
        {
          // Stable across requests until the knowledge base actually
          // changes — the prompt-caching breakpoint. Placed last so it
          // (and the instructions above) cache together; the varying user
          // content below sits after this breakpoint.
          type: "text",
          text:
            knowledgeBase.text ||
            "(No official source text is currently cached for the selected frameworks. Rely on general knowledge of these frameworks, and note lower confidence in officialMatches.)",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    if (!textBlock) {
      return Response.json({ ok: false, reason: "Model returned no text content." });
    }

    const result = analysisResponseSchema.parse(extractJson(textBlock.text));

    return Response.json({
      ok: true,
      ...result,
      knowledgeBaseUpdatedAt: knowledgeBase.updatedAt,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ ok: false, reason: "Invalid Anthropic API key." });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ ok: false, reason: "Rate limited by Anthropic — try again shortly." });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message });
  }
}
