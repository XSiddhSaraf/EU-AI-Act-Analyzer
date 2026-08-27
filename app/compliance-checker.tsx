"use client";

import type { CSSProperties, ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  LogIn,
  LogOut,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { animate, motion, useReducedMotion } from "motion/react";
import { Badge } from "./components/ui/badge";
import { Button, buttonVariants } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Checkbox } from "./components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Progress } from "./components/ui/progress";
import { Textarea } from "./components/ui/textarea";
import { cn } from "./lib/cn";
import { sourcesForFrameworks, type FrameworkId } from "./lib/regulatory-sources";

type Severity = "Critical" | "High" | "Medium" | "Low";
type FetchState = "idle" | "loading" | "success" | "error";
type PlanId = "free" | "pro" | "team";

type UsageState = {
  plan: PlanId | string;
  used: number;
  limit: number;
  remaining: number | null;
  unlimited: boolean;
  degraded: boolean;
};

type UsageResponse = Partial<{
  allowed: boolean;
  plan: string;
  used: number;
  limit: number;
  remaining: number | null;
  unlimited: boolean;
  degraded: boolean;
  reason: string;
}>;

type AuthStatus = "loading" | "signed-out" | "signed-in";

type AuthState = {
  status: AuthStatus;
  email: string | null;
  name: string | null;
};

type SessionResponse = Partial<{
  user: Partial<{ email: string | null; name: string | null }>;
}>;

// Auth.js's own built-in signin/signout pages (server-rendered by
// app/api/auth/[...auth]/route.ts) handle CSRF tokens and the redirect to
// Google/Microsoft's consent screen — no custom form needed here.
const SIGN_IN_HREF = "/api/auth/signin?callbackUrl=%2F";
const SIGN_OUT_HREF = "/api/auth/signout?callbackUrl=%2F";

// Configure these via .env.local (or your host's environment settings) once
// real billing exists. They fall back to plain mailto links so the paywall
// is fully functional without any payment provider wired up yet.
const UPGRADE_URL =
  (process.env.NEXT_PUBLIC_UPGRADE_URL ?? "").trim() ||
  "mailto:hello@example.com?subject=Upgrade%20to%20Pro";
const CONTACT_SALES_URL =
  (process.env.NEXT_PUBLIC_CONTACT_URL ?? "").trim() ||
  "mailto:hello@example.com?subject=Team%20plan";

const frameworks: Array<{
  id: FrameworkId;
  label: string;
  short: string;
  description: string;
}> = [
  {
    id: "euai",
    label: "EU AI Act",
    short: "EUAI",
    description: "Risk class, human oversight, transparency, data governance",
  },
  {
    id: "gdpr",
    label: "GDPR",
    short: "GDPR",
    description: "Lawful basis, privacy notices, rights, DPIA, transfers",
  },
  {
    id: "iso42001",
    label: "ISO/IEC 42001",
    short: "AIMS",
    description: "AI management system, objectives, controls, audit cadence",
  },
  {
    id: "nist",
    label: "NIST AI RMF",
    short: "RMF",
    description: "Govern, map, measure, manage with traceable evidence",
  },
  {
    id: "oecd",
    label: "OECD AI Principles",
    short: "OECD",
    description: "Human-centered values, robustness, accountability",
  },
  {
    id: "soc2",
    label: "SOC 2 / Security",
    short: "SOC2",
    description: "Access control, incident response, monitoring, retention",
  },
];

const signalMap: Record<
  FrameworkId,
  Array<{ label: string; terms: string[]; impact: number }>
> = {
  euai: [
    { label: "AI system purpose and intended use", terms: ["intended use", "purpose", "ai system", "model card"], impact: 15 },
    { label: "Risk classification", terms: ["high-risk", "risk category", "risk classification", "prohibited"], impact: 18 },
    { label: "Human oversight", terms: ["human oversight", "human review", "appeal", "contest"], impact: 16 },
    { label: "Transparency notice", terms: ["transparency", "ai-generated", "users are informed", "disclosure"], impact: 14 },
    { label: "Data governance", terms: ["training data", "data quality", "bias", "representative data"], impact: 15 },
    { label: "Post-market monitoring", terms: ["monitoring", "incident", "logging", "conformity"], impact: 12 },
  ],
  gdpr: [
    { label: "Lawful basis and privacy notice", terms: ["lawful basis", "privacy notice", "privacy policy", "consent"], impact: 18 },
    { label: "Data subject rights", terms: ["access request", "erase", "rectification", "data subject"], impact: 14 },
    { label: "DPIA and automated decisioning", terms: ["dpia", "automated decision", "profiling", "meaningful information"], impact: 17 },
    { label: "Retention and minimization", terms: ["retention", "minimization", "delete", "purpose limitation"], impact: 13 },
    { label: "Cookies, tracking, and advertising notice", terms: ["cookie", "tracking", "advertising", "newsletter", "subscribe"], impact: 12 },
  ],
  iso42001: [
    { label: "AI management objectives", terms: ["management system", "policy", "objective", "scope"], impact: 18 },
    { label: "Defined roles and accountability", terms: ["owner", "accountable", "responsibility", "governance board"], impact: 14 },
    { label: "Supplier and lifecycle control", terms: ["supplier", "vendor", "lifecycle", "change management"], impact: 13 },
    { label: "Internal audit cadence", terms: ["audit", "review cadence", "nonconformity", "corrective action"], impact: 14 },
    { label: "Impact assessment", terms: ["impact assessment", "risk assessment", "stakeholder", "affected persons"], impact: 16 },
  ],
  nist: [
    { label: "Govern function", terms: ["govern", "policy", "roles", "risk tolerance"], impact: 14 },
    { label: "Map function", terms: ["context", "stakeholder", "intended use", "operating environment"], impact: 13 },
    { label: "Measure function", terms: ["test", "metric", "evaluation", "benchmark"], impact: 15 },
    { label: "Manage function", terms: ["mitigation", "residual risk", "monitoring", "response plan"], impact: 16 },
    { label: "Trustworthiness characteristics", terms: ["fairness", "explainability", "privacy", "security"], impact: 14 },
  ],
  oecd: [
    { label: "Human-centered values", terms: ["human rights", "dignity", "fairness", "non-discrimination"], impact: 17 },
    { label: "Transparency and explainability", terms: ["explainability", "transparency", "notice", "explanation"], impact: 15 },
    { label: "Robustness and safety", terms: ["robust", "safety", "security", "testing"], impact: 15 },
    { label: "Accountability", terms: ["accountability", "owner", "audit", "governance"], impact: 14 },
    { label: "Public information integrity", terms: ["news", "editorial", "correction", "fact check", "breaking"], impact: 10 },
  ],
  soc2: [
    { label: "Access controls", terms: ["access control", "least privilege", "mfa", "authentication"], impact: 16 },
    { label: "Logging and monitoring", terms: ["logging", "monitoring", "alert", "audit log"], impact: 14 },
    { label: "Incident response", terms: ["incident response", "breach", "escalation", "runbook"], impact: 15 },
    { label: "Vendor and data retention controls", terms: ["vendor", "subprocessor", "retention", "backup"], impact: 13 },
    { label: "Security testing", terms: ["penetration test", "vulnerability", "encryption", "secure development"], impact: 15 },
    { label: "Public website security posture", terms: ["https", "login", "account", "app", "advertisement"], impact: 9 },
  ],
};

const riskPatterns: Array<{
  title: string;
  severity: Severity;
  terms: string[];
  mitigation: string;
}> = [
  {
    title: "Unclear EU AI Act risk classification",
    severity: "High",
    terms: ["ai", "model", "automated", "scoring"],
    mitigation:
      "Document intended use, affected persons, prohibited-use screening, and whether the system falls into high-risk Annex III categories.",
  },
  {
    title: "Missing human oversight route",
    severity: "High",
    terms: ["decision", "recommendation", "approval", "eligibility"],
    mitigation:
      "Add a named human review path, escalation criteria, override authority, and appeal language for impacted users.",
  },
  {
    title: "Privacy obligations are thin",
    severity: "Medium",
    terms: ["personal data", "email", "customer", "profile"],
    mitigation:
      "Publish lawful basis, retention periods, data subject request process, DPIA trigger, and transfer safeguards.",
  },
  {
    title: "Bias and representativeness evidence not visible",
    severity: "Medium",
    terms: ["training", "prediction", "classification", "ranking"],
    mitigation:
      "Maintain dataset lineage, representativeness checks, protected-class testing, and remediation thresholds.",
  },
  {
    title: "Security control evidence is incomplete",
    severity: "Medium",
    terms: ["api", "upload", "document", "integration"],
    mitigation:
      "Add encryption, access review, audit logs, incident response, vendor review, and vulnerability management evidence.",
  },
  {
    title: "Cookie, tracking, and advertising disclosures may be incomplete",
    severity: "Medium",
    terms: ["cookie", "advertisement", "advertising", "newsletter", "subscribe"],
    mitigation:
      "Publish clear cookie categories, ad-tech partners, consent controls, retention periods, and opt-out paths for visitors.",
  },
  {
    title: "Editorial or public-content governance evidence is limited",
    severity: "Low",
    terms: ["news", "breaking", "editorial", "article", "video"],
    mitigation:
      "Document correction policy, content provenance, moderation escalation, misinformation review, and archive retention controls.",
  },
];

const BINARY_UPLOAD_EXTENSIONS = new Set(["pptx", "docx", "pdf"]);

const examples = [
  "AI hiring assistant that screens resumes and ranks candidates. Includes human review, appeal process, bias testing, logging, privacy notice, retention schedule, and vendor monitoring.",
  "Website privacy policy for an AI chatbot. It collects contact details and conversation data, uses subprocessors, provides access and deletion rights, but has no DPIA or EU AI Act risk classification.",
  "Internal AI governance policy with AIMS scope, roles, risk assessment, human oversight, incident response, model monitoring, audit cadence, and corrective action workflow.",
];

function countMatches(text: string, terms: string[]) {
  return terms.reduce((total, term) => {
    return total + (text.includes(term.toLowerCase()) ? 1 : 0);
  }, 0);
}

function severityWeight(severity: Severity) {
  return { Critical: 4, High: 3, Medium: 2, Low: 1 }[severity];
}

function severityTone(severity: Severity): "critical" | "high" | "medium" | "low" {
  return severity.toLowerCase() as "critical" | "high" | "medium" | "low";
}

type SmartAnalysisSuccess = {
  ok: true;
  readiness: number;
  verdict: string;
  frameworkScores: Record<
    string,
    { score: number; status: string; findings: Array<{ label: string; present: boolean; evidence?: string }> }
  >;
  risks: Array<{ title: string; severity: Severity; mitigation: string; owner: string; due: string }>;
  officialMatches: Record<string, { status: string; matchedTerms: string[] }>;
  officialConfidence: number;
  knowledgeBaseUpdatedAt: string | null;
};

type SmartAnalysisApiResponse = SmartAnalysisSuccess | { ok: false; reason?: string };

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "not yet fetched";
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

/** Tweens a display number toward `target`, honoring prefers-reduced-motion. */
function useCountUp(target: number) {
  const shouldReduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    if (shouldReduceMotion) return;
    const controls = animate(0, target, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (value) => setDisplay(Math.round(value)),
    });
    return () => controls.stop();
  }, [target, shouldReduceMotion]);

  return shouldReduceMotion ? target : display;
}

function ScoreRing({ value, size = 118 }: { value: number; size?: number }) {
  const display = useCountUp(value);
  return (
    <div
      className="score-ring"
      style={{ "--score": display, width: size } as CSSProperties}
    >
      <span className="font-display text-[2.1rem] leading-none font-semibold text-text">
        {display}
      </span>
      <small className="mt-1 font-mono text-[0.62rem] tracking-[0.14em] text-text-3">
        /100
      </small>
    </div>
  );
}

function FrameworkCard({
  framework,
  index,
}: {
  framework: {
    id: FrameworkId;
    label: string;
    short: string;
    description: string;
    score: number;
    status: string;
    found: Array<{ label: string; present: boolean }>;
  };
  index: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.article
      initial={shouldReduceMotion ? undefined : { opacity: 0, y: 14 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: "easeOut" }}
    >
      <Card className="grid h-full gap-3 p-5 transition-colors hover:border-border-strong">
        <div className="flex items-baseline gap-2.5">
          <Badge tone="neutral" size="sm" className="min-w-0 px-2">
            {framework.short}
          </Badge>
          <strong className="text-[0.92rem] font-semibold text-text">{framework.label}</strong>
        </div>
        <Progress
          value={framework.score}
          label={`${framework.label} score ${framework.score}`}
        />
        <div className="flex items-baseline gap-2">
          <b className="font-display text-[1.3rem] font-semibold text-text">{framework.score}%</b>
          <em className="font-mono text-[0.68rem] tracking-[0.1em] text-text-3 not-italic uppercase">
            {framework.status}
          </em>
        </div>
        <ul className="grid gap-1.5">
          {framework.found.slice(0, 4).map((signal) => (
            <li
              key={signal.label}
              className={cn(
                "flex items-start gap-2 text-[0.76rem]",
                signal.present ? "text-text-2" : "text-text-3",
              )}
            >
              {signal.present ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
              ) : (
                <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" />
              )}
              {signal.label}
            </li>
          ))}
        </ul>
      </Card>
    </motion.article>
  );
}

export function ComplianceChecker() {
  const [mode, setMode] = useState<"website" | "document">("website");
  const [url, setUrl] = useState("https://example.com/ai-product-policy");
  const [documentText, setDocumentText] = useState(examples[1]);
  const [selected, setSelected] = useState<FrameworkId[]>([
    "euai",
    "gdpr",
    "iso42001",
    "nist",
  ]);
  const [includeSecurity, setIncludeSecurity] = useState(true);
  const [submittedUrl, setSubmittedUrl] = useState(url);
  const [submittedDocumentText, setSubmittedDocumentText] = useState(documentText);
  const [submittedSelected, setSubmittedSelected] = useState<FrameworkId[]>(selected);
  const [submittedIncludeSecurity, setSubmittedIncludeSecurity] = useState(includeSecurity);
  const [lastRunLabel, setLastRunLabel] = useState("Initial sample check");
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [fetchMessage, setFetchMessage] = useState(
    "Website content has not been fetched yet.",
  );
  const [fetchedWebsiteText, setFetchedWebsiteText] = useState("");
  const [fetchedWebsiteTitle, setFetchedWebsiteTitle] = useState("");
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [auth, setAuth] = useState<AuthState>({
    status: "loading",
    email: null,
    name: null,
  });
  const [smartResult, setSmartResult] = useState<SmartAnalysisSuccess | null>(null);
  const [smartStatus, setSmartStatus] = useState<"idle" | "loading" | "success" | "unavailable">("idle");
  const [smartReason, setSmartReason] = useState("");
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session")
      .then((response) => (response.ok ? response.json<SessionResponse>() : null))
      .then((data: SessionResponse | null) => {
        if (cancelled) return;
        const email = data?.user?.email ?? null;
        setAuth({
          status: email ? "signed-in" : "signed-out",
          email,
          name: data?.user?.name ?? null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Sign-in is optional (free-tier metering still works via an
        // anonymous cookie); treat an unreachable/unconfigured auth route
        // as signed-out rather than breaking the page.
        setAuth({ status: "signed-out", email: null, name: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/usage")
      .then((response) => response.json<UsageResponse>())
      .then((data: UsageResponse) => {
        if (cancelled) return;
        setUsage({
          plan: data.plan ?? "free",
          used: data.used ?? 0,
          limit: data.limit ?? 3,
          remaining: data.remaining ?? null,
          unlimited: Boolean(data.unlimited),
          degraded: Boolean(data.degraded),
        });
      })
      .catch(() => {
        // Usage metering is best-effort; the checker still works without it.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const atFreeLimit = Boolean(usage && !usage.unlimited && usage.remaining === 0);

  const sourceText = `${submittedUrl} ${submittedDocumentText}`.toLowerCase();
  const canRunCheck =
    mode === "website"
      ? url.trim().length > 0
      : documentText.trim().length > 0;

  const assessment = useMemo(() => {
    const active = submittedIncludeSecurity
      ? Array.from(new Set([...submittedSelected, "soc2" as FrameworkId]))
      : submittedSelected;

    const frameworkResults = active.map((frameworkId) => {
      const signals = signalMap[frameworkId];
      const max = signals.reduce((sum, signal) => sum + signal.impact, 0);
      const found = signals.map((signal) => ({
        ...signal,
        present: countMatches(sourceText, signal.terms) > 0,
      }));
      const raw = found.reduce(
        (sum, signal) => sum + (signal.present ? signal.impact : 0),
        0,
      );
      const score = Math.min(96, Math.round((raw / max) * 100 + 12));
      return {
        ...frameworks.find((item) => item.id === frameworkId)!,
        score,
        status:
          score >= 78 ? "Compatible" : score >= 56 ? "Partial" : "Not ready",
        found,
      };
    });

    const detectedRisks = riskPatterns
      .filter((risk) => countMatches(sourceText, risk.terms) > 0)
      .map((risk, index) => ({
        ...risk,
        owner: ["Legal", "AI Governance", "Security", "Product"][index % 4],
        due: ["7 days", "14 days", "30 days", "Next release"][index % 4],
      }));

    const missingTransparency =
      !sourceText.includes("transparency") && !sourceText.includes("notice");
    const missingAudit =
      !sourceText.includes("audit") && !sourceText.includes("monitoring");

    if (missingTransparency) {
      detectedRisks.push({
        title: "Transparency notice is not evidenced",
        severity: "Medium",
        terms: [],
        mitigation:
          "Add plain-language AI disclosure, system purpose, limitations, and user recourse where AI materially affects outcomes.",
        owner: "Product",
        due: "14 days",
      });
    }

    if (missingAudit) {
      detectedRisks.push({
        title: "Ongoing monitoring and audit trail are weak",
        severity: "High",
        terms: [],
        mitigation:
          "Create monitoring metrics, incident thresholds, audit logs, review cadence, and assigned control owners.",
        owner: "AI Governance",
        due: "30 days",
      });
    }

    const average =
      frameworkResults.reduce((sum, item) => sum + item.score, 0) /
      Math.max(frameworkResults.length, 1);
    const riskPenalty = detectedRisks.reduce(
      (sum, risk) => sum + severityWeight(risk.severity) * 2,
      0,
    );
    const readiness = Math.max(18, Math.min(94, Math.round(average - riskPenalty)));

    return {
      frameworkResults,
      detectedRisks,
      readiness,
      verdict:
        readiness >= 78
          ? "Compatible with evidence gaps"
          : readiness >= 56
            ? "Partially compatible"
            : "Not compatible yet",
    };
  }, [submittedIncludeSecurity, submittedSelected, sourceText]);

  const officialValidation = useMemo(() => {
    const submittedHost = (() => {
      try {
        return submittedUrl ? new URL(submittedUrl).hostname.replace(/^www\./, "") : "";
      } catch {
        return "";
      }
    })();
    const relevantSources = sourcesForFrameworks(
      submittedIncludeSecurity
        ? [...submittedSelected, "soc2" as FrameworkId]
        : submittedSelected,
    );
    const matches = relevantSources.map((source) => {
      const officialDomainMatch =
        submittedHost === source.domain || submittedHost.endsWith(`.${source.domain}`);
      const matchedTerms = source.evidenceTerms.filter((term) =>
        sourceText.includes(term.toLowerCase()),
      );

      return {
        ...source,
        officialDomainMatch,
        matchedTerms,
        status:
          officialDomainMatch || matchedTerms.length >= 3
            ? "Strong source match"
            : matchedTerms.length > 0
              ? "Partial source match"
              : "No direct source evidence",
      };
    });
    const strongCount = matches.filter((match) => match.status === "Strong source match").length;
    const partialCount = matches.filter((match) => match.status === "Partial source match").length;
    const confidence = Math.min(
      96,
      Math.max(18, Math.round(((strongCount * 2 + partialCount) / Math.max(matches.length * 2, 1)) * 100)),
    );

    return {
      matches,
      confidence,
      verdict:
        confidence >= 74
          ? "Officially grounded"
          : confidence >= 42
            ? "Needs official evidence"
            : "Not source-validated yet",
    };
  }, [sourceText, submittedIncludeSecurity, submittedSelected, submittedUrl]);

  // Merges the LLM-backed smart analysis (when available) over the static
  // heuristic above, which always renders first/instantly and remains the
  // guaranteed fallback if the smart call is slow, disabled, or fails.
  const displayAssessment = useMemo(() => {
    const frameworkResults = assessment.frameworkResults.map((fw) => {
      const smart = smartResult?.frameworkScores[fw.id];
      return {
        id: fw.id,
        label: fw.label,
        short: fw.short,
        description: fw.description,
        score: smart?.score ?? fw.score,
        status: smart?.status ?? fw.status,
        found: smart
          ? smart.findings.map((finding) => ({ label: finding.label, present: finding.present }))
          : fw.found.map((finding) => ({ label: finding.label, present: finding.present })),
      };
    });

    return {
      frameworkResults,
      detectedRisks:
        smartResult && smartResult.risks.length > 0 ? smartResult.risks : assessment.detectedRisks,
      readiness: smartResult?.readiness ?? assessment.readiness,
      verdict: smartResult?.verdict ?? assessment.verdict,
    };
  }, [assessment, smartResult]);

  const displayOfficialValidation = useMemo(() => {
    const matches = officialValidation.matches.map((source) => {
      const smart = smartResult?.officialMatches[source.id];
      return {
        id: source.id,
        authority: source.authority,
        title: source.title,
        url: source.url,
        status: smart?.status ?? source.status,
        matchedTerms: smart?.matchedTerms ?? source.matchedTerms,
      };
    });

    const confidence = smartResult?.officialConfidence ?? officialValidation.confidence;
    const verdict = smartResult
      ? confidence >= 74
        ? "Officially grounded"
        : confidence >= 42
          ? "Needs official evidence"
          : "Not source-validated yet"
      : officialValidation.verdict;

    return { matches, confidence, verdict };
  }, [officialValidation, smartResult]);

  function toggleFramework(id: FrameworkId) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = (file.name.split(".").pop() ?? "").toLowerCase();

    if (BINARY_UPLOAD_EXTENSIONS.has(extension)) {
      setDocumentText(`Extracting text from ${file.name}...`);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/extract-document", { method: "POST", body: formData });
        const payload = (await response.json()) as { text?: string; error?: string };
        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Could not extract text from this file.");
        }
        setDocumentText(payload.text ?? "");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not extract text from this file.";
        setDocumentText(`(${message} Paste the text manually instead.)`);
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setDocumentText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  /**
   * Runs after runCheck's gate + fetch steps, without blocking the button —
   * the static heuristic above already rendered instantly; this upgrades
   * the display in place when (and if) it succeeds.
   */
  async function runSmartAnalysis(
    analysisText: string,
    analysisUrl: string,
    activeFrameworks: FrameworkId[],
  ) {
    setSmartStatus("loading");
    setSmartResult(null);
    try {
      const response = await fetch("/api/analyze-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentText: analysisText,
          url: analysisUrl,
          selectedFrameworks: activeFrameworks,
          includeSecurity: false, // already expanded into activeFrameworks
        }),
      });
      const payload = (await response.json()) as SmartAnalysisApiResponse;
      if (payload.ok) {
        setSmartResult(payload);
        setSmartStatus("success");
      } else {
        setSmartStatus("unavailable");
        setSmartReason(payload.reason ?? "AI-powered analysis unavailable for this run.");
      }
    } catch {
      setSmartStatus("unavailable");
      setSmartReason("AI-powered analysis unavailable for this run.");
    }
  }

  async function runCheck() {
    const trimmedUrl = url.trim();
    const trimmedDocumentText = documentText.trim();
    let websiteText = "";
    let websiteTitle = "";

    let gate: UsageResponse = { allowed: true };
    try {
      const gateResponse = await fetch("/api/usage/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: mode,
          label: mode === "website" ? trimmedUrl : "document upload",
        }),
      });
      gate = (await gateResponse.json()) as UsageResponse;
    } catch {
      gate = { allowed: true, degraded: true };
    }

    if (gate.plan !== undefined) {
      setUsage({
        plan: gate.plan ?? "free",
        used: gate.used ?? 0,
        limit: gate.limit ?? 3,
        remaining: gate.remaining ?? null,
        unlimited: Boolean(gate.unlimited),
        degraded: Boolean(gate.degraded),
      });
    }

    if (gate.allowed === false) {
      setShowPaywall(true);
      return;
    }
    setShowPaywall(false);

    setFetchMessage("Checking website content...");
    setFetchState(mode === "website" && trimmedUrl ? "loading" : "idle");

    if (mode === "website" && trimmedUrl) {
      try {
        const response = await fetch("/api/fetch-website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmedUrl }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          status?: number;
          finalUrl?: string;
          title?: string;
          description?: string;
          text?: string;
          textLength?: number;
          error?: string;
        };

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Website could not be fetched.");
        }

        websiteTitle = payload.title ?? "";
        websiteText = [
          payload.finalUrl,
          payload.title,
          payload.description,
          payload.text,
        ]
          .filter(Boolean)
          .join(" ");
        setFetchedWebsiteText(payload.text ?? "");
        setFetchedWebsiteTitle(websiteTitle);
        setFetchState("success");
        setFetchMessage(
          `Fetched ${Math.min(payload.textLength ?? websiteText.length, 18000).toLocaleString()} characters from ${payload.finalUrl ?? trimmedUrl}.`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Website could not be fetched.";
        setFetchedWebsiteText("");
        setFetchedWebsiteTitle("");
        setFetchState("error");
        setFetchMessage(
          `${message} Paste page or policy text below and run the check again.`,
        );
      }
    } else {
      setFetchedWebsiteText("");
      setFetchedWebsiteTitle("");
      setFetchMessage("Using pasted document text.");
    }

    setSubmittedUrl(mode === "website" ? trimmedUrl : "");
    setSubmittedDocumentText(
      mode === "website" ? websiteText : trimmedDocumentText,
    );
    setSubmittedSelected(selected);
    setSubmittedIncludeSecurity(includeSecurity);
    setLastRunLabel(`Checked ${mode === "website" ? "website" : "document"} input just now`);

    const activeFrameworksForSmart = includeSecurity
      ? Array.from(new Set([...selected, "soc2" as FrameworkId]))
      : selected;
    // Not awaited: the heuristic above already rendered instantly, and this
    // upgrades the display in place whenever it resolves.
    void runSmartAnalysis(
      mode === "website" ? websiteText : trimmedDocumentText,
      mode === "website" ? trimmedUrl : "",
      activeFrameworksForSmart,
    );
  }

  return (
    <main className="app-shell min-h-screen text-text">
      <div className="ambient-glow" aria-hidden="true" />

      {/* ── hero ─────────────────────────────────────────────────────────── */}
      <section className="border-b border-border/60 px-6 pt-9 pb-12">
        <div className="mx-auto grid max-w-[1240px] items-end gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <motion.div
            className="max-w-[720px]"
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 14 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {auth.status !== "loading" ? (
              <div className="mb-5 flex flex-wrap items-center gap-3" aria-live="polite">
                {auth.status === "signed-in" ? (
                  <>
                    <span className="font-mono text-[0.74rem] text-text-2">
                      Signed in as {auth.name || auth.email}
                    </span>
                    <a
                      href={SIGN_OUT_HREF}
                      className="glass-panel-soft inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[0.8rem] font-semibold text-text transition-colors hover:border-gold hover:text-gold-soft"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </a>
                  </>
                ) : (
                  <a
                    href={SIGN_IN_HREF}
                    className="glass-panel-soft inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[0.8rem] font-semibold text-text transition-colors hover:border-gold hover:text-gold-soft"
                  >
                    <LogIn className="h-3.5 w-3.5" /> Sign in with Google or Microsoft
                  </a>
                )}
              </div>
            ) : null}
            <p className="eyebrow mb-1.5">AI governance compatibility workspace</p>
            <h1 className="font-display text-[clamp(2rem,4.4vw,3.1rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-text">
              Check a website or document against the EU AI Act.
            </h1>
            <p className="mt-3.5 mb-6 max-w-[560px] text-[0.98rem] text-text-2">
              Scan policy text, product pages, procurement notes, or website
              copy for AI governance readiness. The checker maps evidence to
              major frameworks, flags risks, and turns each gap into a practical
              mitigation.
            </p>
            <div
              className="glass-panel-soft inline-flex gap-1.5 p-1.5"
              aria-label="Assessment modes"
            >
              <Button
                variant={mode === "website" ? "glass" : "ghost"}
                onClick={() => setMode("website")}
                className={mode === "website" ? "border-border-strong text-text" : "border-transparent"}
              >
                <Globe className="h-4 w-4" /> Website
              </Button>
              <Button
                variant={mode === "document" ? "glass" : "ghost"}
                onClick={() => setMode("document")}
                className={mode === "document" ? "border-border-strong text-text" : "border-transparent"}
              >
                <FileText className="h-4 w-4" /> Document
              </Button>
            </div>

            {usage ? (
              <div
                className={cn(
                  "glass-panel-soft mt-6 flex max-w-[480px] flex-wrap items-center gap-3.5 px-4 py-3",
                  atFreeLimit && "border-critical/45",
                  usage.unlimited && "border-gold/45",
                )}
                aria-live="polite"
              >
                {usage.unlimited ? (
                  <span className="font-mono text-[0.74rem] text-gold">
                    {usage.plan === "team" ? "Team plan" : "Pro plan"} · Unlimited checks
                  </span>
                ) : (
                  <>
                    <span className="font-mono text-[0.74rem] text-text-2">
                      {Math.min(usage.used, usage.limit)} of {usage.limit} free checks used
                      {usage.degraded ? " (preview — metering not live yet)" : ""}
                    </span>
                    <Progress
                      value={(Math.min(usage.used, usage.limit) / usage.limit) * 100}
                      className="min-w-[90px] flex-1"
                      label="Free checks used"
                    />
                  </>
                )}
                {!usage.unlimited ? (
                  <Button size="sm" variant="solid" onClick={() => setShowPaywall(true)}>
                    Upgrade
                  </Button>
                ) : null}
              </div>
            ) : null}
          </motion.div>

          <motion.div
            initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          >
            <Card className="flex items-center gap-5 p-6" aria-live="polite">
              <ScoreRing value={displayAssessment.readiness} />
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <p className="eyebrow mb-0">Compatibility verdict</p>
                  {smartStatus === "loading" ? (
                    <Badge tone="blue" size="sm" className="gap-1 px-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> AI analyzing
                    </Badge>
                  ) : smartStatus === "success" ? (
                    <Badge tone="gold" size="sm" className="gap-1 px-2">
                      <Sparkles className="h-3 w-3" /> AI-powered
                    </Badge>
                  ) : smartStatus === "unavailable" ? (
                    <Badge tone="neutral" size="sm" className="px-2" title={smartReason}>
                      Baseline heuristic
                    </Badge>
                  ) : null}
                </div>
                <h2 className="font-display text-[1.5rem] font-semibold tracking-[-0.01em] text-text">
                  {displayAssessment.verdict}
                </h2>
                <p className="mt-1.5 text-[0.85rem] text-text-2">
                  Based on {displayAssessment.frameworkResults.length} frameworks and{" "}
                  {displayAssessment.detectedRisks.length} active risk findings.
                </p>
                <p className="mt-2 font-mono text-[0.7rem] text-text-3">{lastRunLabel}</p>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* ── workspace ────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-[1240px] gap-6 px-6 py-9 pb-20 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card className="grid gap-5 p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-gold/10 font-mono text-[0.8rem] font-semibold text-gold">
                1
              </span>
              <div>
                <h2 className="font-display text-[1.12rem] font-semibold text-text">Source to check</h2>
                <p className="text-[0.8rem] text-text-3">
                  {mode === "website"
                    ? "Enter one public website URL for analysis."
                    : "Paste text or upload one plain-text document."}
                </p>
              </div>
            </div>

            {mode === "website" ? (
              <div className="glass-panel-soft grid gap-3 p-4">
                <label className="grid gap-1.5">
                  <span className="font-mono text-[0.66rem] font-medium tracking-[0.16em] text-text-3 uppercase">
                    Website URL
                  </span>
                  <Input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://company.com/ai-policy"
                    inputMode="url"
                  />
                </label>
                <p className="text-[0.76rem] leading-[1.55] text-text-3">
                  The checker reads the public page content from this URL. It does
                  not upload or use a document in Website mode.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 border-b border-border/60 pb-3.5">
                <label className="grid gap-1.5">
                  <span className="font-mono text-[0.66rem] font-medium tracking-[0.16em] text-text-3 uppercase">
                    Document text
                  </span>
                  <Textarea
                    value={documentText}
                    onChange={(event) => setDocumentText(event.target.value)}
                    placeholder="Paste AI policy, DPIA, model card, privacy notice, or product documentation..."
                  />
                </label>

                <label className="glass-panel-soft grid cursor-pointer justify-items-center gap-0.5 p-4 text-center transition-colors hover:border-gold">
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.json,.pptx,.docx,.pdf"
                    onChange={handleFile}
                    className="sr-only"
                  />
                  <Upload className="mb-1 h-4 w-4 text-text-3" />
                  <span className="text-[0.86rem] font-semibold text-text">Upload document</span>
                  <small className="font-mono text-[0.68rem] text-text-3">
                    .txt, .md, .csv, .json, .pptx, .docx, or .pdf
                  </small>
                </label>

                <div className="flex flex-wrap gap-2" aria-label="Document examples">
                  {examples.map((example, index) => (
                    <Button
                      key={example}
                      size="sm"
                      variant="outline"
                      className="rounded-full font-mono text-[0.7rem]"
                      onClick={() => setDocumentText(example)}
                    >
                      Example {index + 1}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-2.5">
              <Button
                size="lg"
                className="w-full"
                disabled={!canRunCheck || fetchState === "loading"}
                onClick={atFreeLimit ? () => setShowPaywall(true) : runCheck}
              >
                {fetchState === "loading"
                  ? "Checking..."
                  : atFreeLimit
                    ? "View upgrade options"
                    : "Run check"}
              </Button>
              <p className="text-center text-[0.76rem] text-text-3">
                {atFreeLimit
                  ? "You've used every free check. Upgrade to keep running checks."
                  : mode === "website"
                    ? "Results update after the public website is fetched and analyzed."
                    : "Results update from the pasted or uploaded document content."}
              </p>
            </div>

            {mode === "website" ? (
              <div
                className={cn(
                  "glass-panel-soft grid gap-1 border-l-[3px] p-3.5",
                  fetchState === "idle" && "border-l-border-strong",
                  fetchState === "loading" && "border-l-blue",
                  fetchState === "success" && "border-l-ok bg-ok/5",
                  fetchState === "error" && "border-l-critical bg-critical/5",
                )}
                aria-live="polite"
              >
                <strong
                  className={cn(
                    "text-[0.84rem]",
                    fetchState === "loading" && "text-blue",
                    fetchState === "success" && "text-ok",
                    fetchState === "error" && "text-critical",
                  )}
                >
                  {fetchState === "success"
                    ? "Website fetched"
                    : fetchState === "error"
                      ? "Website fetch needs help"
                      : fetchState === "loading"
                        ? "Fetching website"
                        : "Website fetch status"}
                </strong>
                <p className="text-[0.78rem] text-text-2">{fetchMessage}</p>
                {fetchedWebsiteTitle ? (
                  <small className="font-mono text-[0.68rem] text-text-3">
                    Page title: {fetchedWebsiteTitle}
                  </small>
                ) : null}
                {fetchedWebsiteText ? (
                  <small className="font-mono text-[0.68rem] break-words text-text-3">
                    Preview: {fetchedWebsiteText.slice(0, 150)}...
                  </small>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-gold/10 font-mono text-[0.8rem] font-semibold text-gold">
                  2
                </span>
                <div>
                  <h2 className="font-display text-[1rem] font-semibold text-text">Frameworks</h2>
                  <p className="text-[0.8rem] text-text-3">Select the governance lens for this review.</p>
                </div>
              </div>
              <div className="grid gap-1.5">
                {frameworks
                  .filter((framework) => framework.id !== "soc2")
                  .map((framework) => (
                    <label
                      key={framework.id}
                      className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-transparent px-2.5 py-2 transition-colors hover:border-border hover:bg-surface-strong/40"
                    >
                      <Checkbox
                        checked={selected.includes(framework.id)}
                        onCheckedChange={() => toggleFramework(framework.id)}
                        className="mt-0.5"
                      />
                      <span className="grid gap-0.5">
                        <strong className="text-[0.86rem] font-semibold text-text">{framework.label}</strong>
                        <small className="text-[0.73rem] leading-[1.45] text-text-3">
                          {framework.description}
                        </small>
                      </span>
                    </label>
                  ))}
                <label className="mt-1 flex cursor-pointer items-start gap-2.5 border-t border-border/60 px-2.5 pt-3.5">
                  <Checkbox
                    checked={includeSecurity}
                    onCheckedChange={() => setIncludeSecurity((value) => !value)}
                    className="mt-0.5"
                  />
                  <span className="grid gap-0.5">
                    <strong className="text-[0.86rem] font-semibold text-text">Include security controls</strong>
                    <small className="text-[0.73rem] leading-[1.45] text-text-3">
                      SOC 2-style evidence for access, logging, and incidents
                    </small>
                  </span>
                </label>
              </div>
            </div>

            <div className="glass-panel-soft grid gap-0.5 p-3.5" aria-live="polite">
              <span className="font-mono text-[0.64rem] font-medium tracking-[0.18em] text-gold uppercase">
                Review scope
              </span>
              <strong className="font-display text-[1.05rem] font-semibold text-text">
                {selected.length + (includeSecurity ? 1 : 0)} frameworks active
              </strong>
              <small className="text-[0.74rem] text-text-3">
                {mode === "website" ? "Public website assessment" : "Document assessment"}
              </small>
            </div>
          </Card>
        </aside>

        <section className="grid min-w-0 gap-6" aria-label="Compliance results">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow mb-1.5">Assessment report</p>
              <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.01em] text-text">
                Compatibility by framework
              </h2>
            </div>
            <Badge tone="gold">{displayAssessment.verdict}</Badge>
          </div>

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]">
            {displayAssessment.frameworkResults.map((framework, index) => (
              <FrameworkCard key={framework.id} framework={framework} index={index} />
            ))}
          </div>

          <div className="grid gap-3.5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow mb-1.5">Risk register</p>
                <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.01em] text-text">
                  Risks and mitigations
                </h2>
              </div>
              <span className="font-mono text-[0.74rem] text-text-3">
                {displayAssessment.detectedRisks.length} findings
              </span>
            </div>

            <div className="grid gap-2.5">
              {displayAssessment.detectedRisks.map((risk, index) => (
                <motion.article
                  key={risk.title}
                  initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.04, ease: "easeOut" }}
                >
                  <Card className="flex gap-4 p-4.5">
                    <Badge tone={severityTone(risk.severity)} size="sm" className="shrink-0 self-start">
                      {risk.severity}
                    </Badge>
                    <div>
                      <h3 className="font-display text-[1.02rem] font-semibold text-text">{risk.title}</h3>
                      <p className="mt-1 mb-2 text-[0.82rem] text-text-2">{risk.mitigation}</p>
                      <div className="flex flex-wrap gap-3.5">
                        <span className="font-mono text-[0.68rem] text-text-3">Owner: {risk.owner}</span>
                        <span className="font-mono text-[0.68rem] text-text-3">Target: {risk.due}</span>
                      </div>
                    </div>
                  </Card>
                </motion.article>
              ))}
            </div>
          </div>

          <div className="grid gap-3.5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow mb-1.5">Sub-agent validation</p>
                <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.01em] text-text">
                  Official Validation Agent
                </h2>
              </div>
              <span className="font-mono text-[0.74rem] text-text-3">
                {displayOfficialValidation.confidence}% source confidence
              </span>
            </div>
            <Card className="grid gap-1.5 border-blue/30 bg-blue/[0.04] p-4.5">
              <strong className="font-display text-[1.05rem] font-semibold text-blue">
                {displayOfficialValidation.verdict}
              </strong>
              <p className="text-[0.82rem] text-text-2">
                This sub-agent checks the submitted URL and pasted document text
                against official compliance sources and flags where official
                evidence is missing.
              </p>
              <p className="font-mono text-[0.7rem] text-text-3">
                Knowledge base updated {formatRelativeTime(smartResult?.knowledgeBaseUpdatedAt ?? null)}
              </p>
            </Card>
            <div className="grid gap-2">
              {displayOfficialValidation.matches.map((source) => (
                <Card key={source.id} soft className="flex items-start gap-3.5 p-4">
                  <span
                    className={cn(
                      "mt-1.5 block h-2.5 w-2.5 shrink-0 rounded-full",
                      source.status === "Strong source match" &&
                        "bg-ok shadow-[0_0_8px_rgba(61,214,140,0.55)]",
                      source.status === "Partial source match" && "bg-medium",
                      source.status === "No direct source evidence" && "bg-text-3",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-mono text-[0.7rem] font-semibold tracking-[0.1em] text-text uppercase">
                      {source.authority}
                    </h3>
                    <p className="mt-0.5 text-[0.82rem] text-text-2">{source.title}</p>
                    <small className="text-[0.72rem] text-text-3">
                      {source.status}
                      {source.matchedTerms.length > 0
                        ? `: ${source.matchedTerms.slice(0, 3).join(", ")}`
                        : ": no official terms found in submitted text"}
                    </small>
                  </div>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-[0.74rem] font-semibold text-blue transition-colors hover:border-blue"
                  >
                    Official source <ExternalLink className="h-3 w-3" />
                  </a>
                </Card>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card soft className="p-4.5">
              <span className="font-mono text-[0.72rem] font-semibold tracking-[0.12em] text-gold">01</span>
              <h3 className="font-display mt-1.5 mb-1.5 text-[1rem] font-semibold text-text">Evidence pack</h3>
              <p className="text-[0.78rem] leading-[1.55] text-text-3">
                Gather model purpose, data lineage, risk classification, privacy
                notice, DPIA, evaluation results, and monitoring logs.
              </p>
            </Card>
            <Card soft className="p-4.5">
              <span className="font-mono text-[0.72rem] font-semibold tracking-[0.12em] text-gold">02</span>
              <h3 className="font-display mt-1.5 mb-1.5 text-[1rem] font-semibold text-text">Control owners</h3>
              <p className="text-[0.78rem] leading-[1.55] text-text-3">
                Assign named Legal, Security, Product, and AI Governance owners
                for every open finding.
              </p>
            </Card>
            <Card soft className="p-4.5">
              <span className="font-mono text-[0.72rem] font-semibold tracking-[0.12em] text-gold">03</span>
              <h3 className="font-display mt-1.5 mb-1.5 text-[1rem] font-semibold text-text">Residual risk</h3>
              <p className="text-[0.78rem] leading-[1.55] text-text-3">
                Re-score after mitigations and record accepted residual risk
                before production or procurement approval.
              </p>
            </Card>
          </div>
        </section>
      </section>

      {/* ── paywall ──────────────────────────────────────────────────────── */}
      <Dialog open={showPaywall} onOpenChange={setShowPaywall}>
        <DialogContent aria-label="Upgrade plan">
          <p className="eyebrow mb-1.5">
            {atFreeLimit ? "Free plan limit reached" : "Plans and pricing"}
          </p>
          <DialogTitle className="font-display text-[1.55rem] font-semibold tracking-[-0.01em] text-text">
            {atFreeLimit
              ? `You've used all ${usage?.limit ?? 3} free checks.`
              : "Check more websites and documents."}
          </DialogTitle>
          <DialogDescription className="mt-2 mb-6 max-w-[520px] text-[0.9rem] text-text-2">
            Upgrade to keep checking websites and documents against AI
            governance frameworks with no monthly cap.
          </DialogDescription>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card soft className="flex flex-col gap-2.5 p-5">
              <h3 className="font-mono text-[0.7rem] font-semibold tracking-[0.16em] text-text-3 uppercase">
                Free
              </h3>
              <p className="font-display text-[2rem] font-semibold text-text">
                $0<small className="font-sans text-[0.8rem] font-normal text-text-3">/mo</small>
              </p>
              <ul className="grid flex-1 gap-1.5">
                {[`${usage?.limit ?? 3} checks total`, "All 6 governance frameworks", "Risk register & mitigations"].map(
                  (item) => (
                    <li key={item} className="flex items-start gap-2 text-[0.79rem] text-text-2">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" /> {item}
                    </li>
                  ),
                )}
              </ul>
              <span className="rounded-lg border border-border py-2.5 text-center text-[0.82rem] font-semibold text-text-3">
                Current plan
              </span>
            </Card>

            <Card className="glass-panel-strong relative flex flex-col gap-2.5 border-gold/60 p-5 shadow-[0_0_0_1px_rgba(233,185,78,0.35),0_18px_42px_-18px_rgba(233,185,78,0.35)]">
              <Badge
                tone="gold"
                size="sm"
                className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-3"
              >
                Most popular
              </Badge>
              <h3 className="font-mono text-[0.7rem] font-semibold tracking-[0.16em] text-gold uppercase">Pro</h3>
              <p className="font-display text-[2rem] font-semibold text-text">
                $29<small className="font-sans text-[0.8rem] font-normal text-text-3">/mo</small>
              </p>
              <ul className="grid flex-1 gap-1.5">
                {["Unlimited website & document checks", "Priority website fetch queue", "Priority email support"].map(
                  (item) => (
                    <li key={item} className="flex items-start gap-2 text-[0.79rem] text-text-2">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" /> {item}
                    </li>
                  ),
                )}
              </ul>
              <a
                href={UPGRADE_URL}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "solid", className: "w-full" })}
              >
                Upgrade to Pro
              </a>
            </Card>

            <Card soft className="flex flex-col gap-2.5 p-5">
              <h3 className="font-mono text-[0.7rem] font-semibold tracking-[0.16em] text-text-3 uppercase">Team</h3>
              <p className="font-display text-[2rem] font-semibold text-text">Custom</p>
              <ul className="grid flex-1 gap-1.5">
                {["Everything in Pro", "Shared workspace & SSO", "API access"].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[0.79rem] text-text-2">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" /> {item}
                  </li>
                ))}
              </ul>
              <a
                href={CONTACT_SALES_URL}
                className={buttonVariants({ variant: "outline", className: "w-full" })}
              >
                Contact sales
              </a>
            </Card>
          </div>

          <p className="mt-4.5 text-center text-[0.74rem] text-text-3">
            Already upgraded? Refresh this page after payment — your plan
            syncs automatically once it is confirmed.
          </p>
        </DialogContent>
      </Dialog>
    </main>
  );
}
