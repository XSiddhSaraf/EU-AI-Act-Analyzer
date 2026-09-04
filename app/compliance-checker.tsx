"use client";

import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Hero3D } from "./components/hero-3d";
import { PropIllo } from "./components/prop-illo";
import { sourcesForFrameworks, type FrameworkId } from "./lib/regulatory-sources";

/* ────────────────────────────────────────────────────────────────────────────
   Types + API contracts (unchanged from the previous checker)
──────────────────────────────────────────────────────────────────────────── */
type Severity = "Critical" | "High" | "Medium" | "Low";
type PlanId = "free" | "pro" | "team";
type UsageState = { plan: PlanId | string; paymentProvider: string; used: number; limit: number; remaining: number | null; unlimited: boolean; degraded: boolean };
type UsageResponse = Partial<{ allowed: boolean; plan: string; paymentProvider: string; used: number; limit: number; remaining: number | null; unlimited: boolean; degraded: boolean; reason: string }>;
type AuthState = { status: "loading" | "signed-out" | "signed-in"; email: string | null; name: string | null };
type SessionResponse = Partial<{ user: Partial<{ email: string | null; name: string | null }> }>;
type SmartAnalysisSuccess = {
  ok: true; readiness: number; verdict: string;
  frameworkScores: Record<string, { score: number; status: string; findings: Array<{ label: string; present: boolean; evidence?: string }> }>;
  risks: Array<{ title: string; severity: Severity; mitigation: string; owner: string; due: string }>;
  officialMatches: Record<string, { status: string; matchedTerms: string[] }>;
  officialConfidence: number; knowledgeBaseUpdatedAt: string | null;
};
type SmartAnalysisApiResponse = SmartAnalysisSuccess | { ok: false; reason?: string };
type BillingCheckoutResponse =
  | { ok: true; provider: "stripe"; url: string }
  | { ok: true; provider: "razorpay"; subscriptionId: string; keyId: string; prefillEmail: string }
  | { ok: false; reason?: string };
type RazorpayCheckoutOptions = { key: string; subscription_id: string; name: string; description?: string; prefill?: { email?: string }; theme?: { color?: string }; handler?: (r: unknown) => void; modal?: { ondismiss?: () => void } };
declare global { interface Window { Razorpay?: new (o: RazorpayCheckoutOptions) => { open: () => void } } }

const SIGN_IN_HREF = "/api/auth/signin?callbackUrl=%2F";
const SIGN_OUT_HREF = "/api/auth/signout?callbackUrl=%2F";
const UPGRADE_URL = (process.env.NEXT_PUBLIC_UPGRADE_URL ?? "").trim() || "mailto:hello@euactanalyzer.com?subject=Upgrade%20to%20Pro";
const CONTACT_SALES_URL = (process.env.NEXT_PUBLIC_CONTACT_URL ?? "").trim() || "mailto:hello@euactanalyzer.com?subject=Team%20plan";

/* ────────────────────────────────────────────────────────────────────────────
   Heuristic knowledge (same scoring as before)
──────────────────────────────────────────────────────────────────────────── */
const frameworks: Array<{ id: FrameworkId; label: string; short: string; description: string }> = [
  { id: "euai", label: "EU AI Act", short: "EUAI", description: "Risk class, human oversight, transparency, data governance" },
  { id: "gdpr", label: "GDPR", short: "GDPR", description: "Lawful basis, privacy notices, rights, DPIA, transfers" },
  { id: "iso42001", label: "ISO/IEC 42001", short: "AIMS", description: "AI management system, objectives, controls, audit cadence" },
  { id: "nist", label: "NIST AI RMF", short: "RMF", description: "Govern, map, measure, manage with traceable evidence" },
  { id: "oecd", label: "OECD AI Principles", short: "OECD", description: "Human-centred values, robustness, accountability" },
  { id: "soc2", label: "SOC 2 / Security", short: "SOC2", description: "Access control, incident response, monitoring, retention" },
];
const signalMap: Record<FrameworkId, Array<{ label: string; terms: string[]; impact: number }>> = {
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
const riskPatterns: Array<{ title: string; severity: Severity; terms: string[]; mitigation: string }> = [
  { title: "Unclear EU AI Act risk classification", severity: "High", terms: ["ai", "model", "automated", "scoring"], mitigation: "Document intended use, affected persons, prohibited-use screening, and whether the system falls into high-risk Annex III categories." },
  { title: "Missing human oversight route", severity: "High", terms: ["decision", "recommendation", "approval", "eligibility"], mitigation: "Add a named human review path, escalation criteria, override authority, and appeal language for impacted users." },
  { title: "Privacy obligations are thin", severity: "Medium", terms: ["personal data", "email", "customer", "profile"], mitigation: "Publish lawful basis, retention periods, data subject request process, DPIA trigger, and transfer safeguards." },
  { title: "Bias and representativeness evidence not visible", severity: "Medium", terms: ["training", "prediction", "classification", "ranking"], mitigation: "Maintain dataset lineage, representativeness checks, protected-class testing, and remediation thresholds." },
  { title: "Security control evidence is incomplete", severity: "Medium", terms: ["api", "upload", "document", "integration"], mitigation: "Add encryption, access review, audit logs, incident response, vendor review, and vulnerability management evidence." },
  { title: "Cookie, tracking, and advertising disclosures may be incomplete", severity: "Medium", terms: ["cookie", "advertisement", "advertising", "newsletter", "subscribe"], mitigation: "Publish clear cookie categories, ad-tech partners, consent controls, retention periods, and opt-out paths for visitors." },
  { title: "Editorial or public-content governance evidence is limited", severity: "Low", terms: ["news", "breaking", "editorial", "article", "video"], mitigation: "Document correction policy, content provenance, moderation escalation, misinformation review, and archive retention controls." },
];
const BINARY_UPLOAD_EXTENSIONS = new Set(["pptx", "docx", "pdf"]);
const examples = [
  "AI hiring assistant that screens resumes and ranks candidates. Includes human review, appeal process, bias testing, logging, privacy notice, retention schedule, and vendor monitoring.",
  "Website privacy policy for an AI chatbot. It collects contact details and conversation data, uses subprocessors, provides access and deletion rights, but has no DPIA or EU AI Act risk classification.",
  "Internal AI governance policy with AIMS scope, roles, risk assessment, human oversight, incident response, model monitoring, audit cadence, and corrective action workflow.",
];
const PROPS = [
  { kind: "source", title: "Grounded, not guessed", body: "Every framework is checked against its official text — EUR-Lex, NIST, ISO, OECD — refreshed daily and cached with a content hash, so a regulatory update shows up in your next run." },
  { kind: "layers", title: "Instant baseline, smarter follow-up", body: "A fast heuristic scores your source in under a second. When AI analysis is available it upgrades the same view in place, and it never blocks the result." },
  { kind: "backlog", title: "Fixes, not findings", body: "Each gap becomes a mitigation with an owner and a due date, written to drop straight onto a product or engineering backlog." },
] as const;
const FAQS: Array<[string, string]> = [
  ["What can I check?", "A public web page by URL, or a document — paste text or upload .pdf, .docx, .pptx or .txt. Policies, DPIAs, model cards, privacy notices and product documentation all work."],
  ["Is this legal advice?", "No. The checker maps evidence in your text to framework obligations and flags gaps. It helps you prepare for a review; it does not replace counsel or a conformity assessment."],
  ["What is the free tier?", "Three checks a month with the baseline heuristic, no account needed. Pro adds unlimited checks, AI-powered analysis and a history of every run."],
  ["How current are the sources?", "Official texts are fetched and cached with a content hash. They refresh daily, and any source older than a week is refreshed before your next AI-powered check."],
  ["Do you store my documents?", "Website mode reads public page text only. Document text is used for the check and is not retained beyond it."],
];
const STAGE_LABELS = ["Reading the source", "Mapping evidence to frameworks", "Checking against official texts", "Running AI analysis"];
const SEV_W: Record<Severity, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const countMatches = (text: string, terms: string[]) => terms.reduce((n, t) => n + (text.includes(t.toLowerCase()) ? 1 : 0), 0);
const pad = (n: number) => String(n + 1).padStart(2, "0");

function loadRazorpayCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.async = true;
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   Style tokens
──────────────────────────────────────────────────────────────────────────── */
const INK = "#0b0f19", BLUE = "#0e76ff", BLUE_DK = "#0a54b8", PAPER = "#f3f3f3";
const MONO = "'JetBrains Mono',ui-monospace,monospace";
const muted = (a: number) => `rgba(11,15,25,${a})`;
const eyebrow: CSSProperties = { margin: "0 0 16px", fontFamily: MONO, fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: BLUE };
const h2: CSSProperties = { margin: "0 0 20px", fontSize: "clamp(36px,5vw,64px)", lineHeight: 1, letterSpacing: "-.04em", fontWeight: 600, textWrap: "balance" };
const lede: CSSProperties = { margin: 0, fontSize: 17, color: muted(0.65), maxWidth: 520, textWrap: "pretty" };
const pill = (variant: "solid" | "outline" | "dark", size: "md" | "lg" = "lg"): CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", textDecoration: "none",
  borderRadius: 999, padding: size === "lg" ? "16px 28px" : "10px 18px", fontSize: size === "lg" ? 14 : 13, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase",
  border: variant === "outline" ? `1px solid ${muted(0.18)}` : "1px solid transparent",
  background: variant === "solid" ? BLUE : variant === "dark" ? INK : "transparent", color: variant === "outline" ? INK : "#fff",
});
const tag = (bg: string, fg: string, extra: CSSProperties = {}): CSSProperties => ({ display: "inline-flex", alignItems: "center", fontFamily: MONO, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 999, background: bg, color: fg, ...extra });
const sevTag: Record<Severity, CSSProperties> = { Critical: tag(INK, "#fff"), High: tag(BLUE, "#fff"), Medium: tag("transparent", INK, { border: `1px solid ${muted(0.25)}` }), Low: tag("transparent", muted(0.55), { border: `1px solid ${muted(0.12)}` }) };
const statusTag = (s: string) => s === "Compatible" ? tag("rgba(14,118,255,.1)", BLUE_DK) : s === "Partial" ? tag(muted(0.06), INK) : tag(INK, "#fff");
const Kicker = ({ n, children }: { n: string; children: ReactNode }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}><span style={{ fontFamily: MONO, fontSize: 12, color: BLUE }}>{n}</span><h3 style={{ margin: 0, fontSize: 22, letterSpacing: "-.02em", fontWeight: 600 }}>{children}</h3></div>
);

/* ────────────────────────────────────────────────────────────────────────────
   Component
──────────────────────────────────────────────────────────────────────────── */
export function ComplianceChecker() {
  const [step, setStep] = useState<"input" | "analyzing" | "results">("input");
  const [stage, setStage] = useState(0);
  const [mode, setMode] = useState<"website" | "document">("website");
  const [url, setUrl] = useState("");
  const [documentText, setDocumentText] = useState("");
  const [selected, setSelected] = useState<FrameworkId[]>(["euai", "gdpr", "iso42001", "nist"]);
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [submittedDocumentText, setSubmittedDocumentText] = useState("");
  const [submittedSelected, setSubmittedSelected] = useState<FrameworkId[]>(selected);
  const [fetchMessage, setFetchMessage] = useState("");
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [auth, setAuth] = useState<AuthState>({ status: "loading", email: null, name: null });
  const [smartResult, setSmartResult] = useState<SmartAnalysisSuccess | null>(null);
  const [smartStatus, setSmartStatus] = useState<"idle" | "loading" | "success" | "unavailable">("idle");
  const [smartReason, setSmartReason] = useState("");
  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "loading">("idle");
  const [portalStatus, setPortalStatus] = useState<"idle" | "loading">("idle");
  const [billingMessage, setBillingMessage] = useState("");
  const [expanded, setExpanded] = useState<string | null>("euai");
  const [faq, setFaq] = useState<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const checkRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session").then((r) => (r.ok ? (r.json() as Promise<SessionResponse>) : null)).then((d) => {
      if (cancelled) return; const email = d?.user?.email ?? null;
      setAuth({ status: email ? "signed-in" : "signed-out", email, name: d?.user?.name ?? null });
    }).catch(() => { if (!cancelled) setAuth({ status: "signed-out", email: null, name: null }); });
    fetch("/api/usage").then((r) => r.json() as Promise<UsageResponse>).then((d) => { if (!cancelled) applyUsage(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function applyUsage(d: UsageResponse) {
    setUsage({ plan: d.plan ?? "free", paymentProvider: d.paymentProvider ?? "", used: d.used ?? 0, limit: d.limit ?? 3, remaining: d.remaining ?? null, unlimited: Boolean(d.unlimited), degraded: Boolean(d.degraded) });
  }

  const sourceText = `${submittedUrl} ${submittedDocumentText}`.toLowerCase();
  const canRun = selected.length > 0 && (mode === "website" ? url.trim().length > 0 : documentText.trim().length > 0);

  const assessment = useMemo(() => {
    const frameworkResults = submittedSelected.map((id) => {
      const signals = signalMap[id];
      const max = signals.reduce((s, x) => s + x.impact, 0);
      const found = signals.map((x) => ({ ...x, present: countMatches(sourceText, x.terms) > 0 }));
      const raw = found.reduce((s, x) => s + (x.present ? x.impact : 0), 0);
      const score = Math.min(96, Math.round((raw / max) * 100 + 12));
      return { ...frameworks.find((f) => f.id === id)!, score, status: score >= 78 ? "Compatible" : score >= 56 ? "Partial" : "Not ready", found };
    });
    const detectedRisks = riskPatterns.filter((r) => countMatches(sourceText, r.terms) > 0).map((r, i) => ({ ...r, owner: ["Legal", "AI Governance", "Security", "Product"][i % 4], due: ["7 days", "14 days", "30 days", "Next release"][i % 4] }));
    if (!sourceText.includes("transparency") && !sourceText.includes("notice")) detectedRisks.push({ title: "Transparency notice is not evidenced", severity: "Medium", terms: [], mitigation: "Add plain-language AI disclosure, system purpose, limitations, and user recourse where AI materially affects outcomes.", owner: "Product", due: "14 days" });
    if (!sourceText.includes("audit") && !sourceText.includes("monitoring")) detectedRisks.push({ title: "Ongoing monitoring and audit trail are weak", severity: "High", terms: [], mitigation: "Create monitoring metrics, incident thresholds, audit logs, review cadence, and assigned control owners.", owner: "AI Governance", due: "30 days" });
    const avg = frameworkResults.reduce((s, f) => s + f.score, 0) / Math.max(frameworkResults.length, 1);
    const penalty = detectedRisks.reduce((s, r) => s + SEV_W[r.severity] * 2, 0);
    const readiness = Math.max(18, Math.min(94, Math.round(avg - penalty)));
    return { frameworkResults, detectedRisks, readiness, verdict: readiness >= 78 ? "Compatible, with evidence gaps" : readiness >= 56 ? "Partially compatible" : "Not compatible yet" };
  }, [submittedSelected, sourceText]);

  const officialValidation = useMemo(() => {
    let host = ""; try { host = submittedUrl ? new URL(submittedUrl).hostname.replace(/^www\./, "") : ""; } catch {}
    return sourcesForFrameworks(submittedSelected).map((src) => {
      const domainMatch = host === src.domain || host.endsWith(`.${src.domain}`);
      const matched = src.evidenceTerms.filter((t) => sourceText.includes(t.toLowerCase()));
      return { ...src, status: domainMatch || matched.length >= 3 ? "strong source match" : matched.length > 0 ? "partial source match" : "no direct citation of the source" };
    });
  }, [sourceText, submittedSelected, submittedUrl]);

  const display = useMemo(() => {
    const fws = assessment.frameworkResults.map((fw) => {
      const smart = smartResult?.frameworkScores[fw.id];
      const src = officialValidation.find((s) => s.frameworkId === fw.id);
      const smartSrc = src && smartResult?.officialMatches[src.id];
      return { ...fw, score: smart?.score ?? fw.score, status: smart?.status ?? fw.status, found: (smart ? smart.findings : fw.found).map((x) => ({ label: x.label, present: x.present })), sourceTitle: src?.title ?? "", sourceUrl: src?.url ?? "#", sourceStatus: smartSrc?.status?.toLowerCase() ?? src?.status ?? "" };
    });
    const risks = [...(smartResult && smartResult.risks.length ? smartResult.risks : assessment.detectedRisks)].sort((a, b) => SEV_W[b.severity] - SEV_W[a.severity]);
    return { fws, risks, readiness: smartResult?.readiness ?? assessment.readiness, verdict: smartResult?.verdict ?? assessment.verdict };
  }, [assessment, smartResult, officialValidation]);

  /* ── actions ─────────────────────────────────────────────────────────── */
  const toggleFramework = (id: FrameworkId) => setSelected((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const goHome = () => { setStep("input"); checkRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); };

  async function handleUpgradeClick() {
    if (auth.status !== "signed-in") { window.location.href = SIGN_IN_HREF; return; }
    setCheckoutStatus("loading"); setBillingMessage("");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const p = (await res.json()) as BillingCheckoutResponse;
      if (p.ok && p.provider === "stripe") { window.location.href = p.url; return; }
      if (p.ok && p.provider === "razorpay") {
        if (!(await loadRazorpayCheckout()) || !window.Razorpay) throw new Error("Could not load Razorpay checkout.");
        new window.Razorpay({ key: p.keyId, subscription_id: p.subscriptionId, name: "GovCheck", description: "Pro plan — unlimited checks", prefill: { email: p.prefillEmail }, theme: { color: BLUE },
          handler: () => { setCheckoutStatus("idle"); setShowPaywall(false); setBillingMessage("Payment received — your plan updates automatically within a few seconds. Refresh if it doesn't."); },
          modal: { ondismiss: () => setCheckoutStatus("idle") } }).open();
        return;
      }
      if (!p.ok) setBillingMessage(p.reason ?? "No payment provider is configured on this deployment.");
    } catch { setBillingMessage("Could not start checkout right now."); }
    setCheckoutStatus("idle");
    window.location.href = UPGRADE_URL;
  }

  async function handleManageBilling() {
    setBillingMessage("");
    if (usage?.paymentProvider === "razorpay") {
      if (!window.confirm("Cancel your Pro subscription? This takes effect immediately.")) return;
      setPortalStatus("loading");
      try {
        const p = (await (await fetch("/api/billing/cancel", { method: "POST" })).json()) as { ok?: boolean; reason?: string };
        if (p.ok) { setBillingMessage("Subscription canceled. You're back on the free plan."); setUsage((c) => (c ? { ...c, plan: "free", unlimited: false, paymentProvider: "" } : c)); }
        else setBillingMessage(p.reason ?? "Could not cancel your subscription right now.");
      } catch { setBillingMessage("Could not cancel your subscription right now."); } finally { setPortalStatus("idle"); }
      return;
    }
    setPortalStatus("loading");
    try {
      const p = (await (await fetch("/api/stripe/portal", { method: "POST" })).json()) as { ok?: boolean; url?: string; reason?: string };
      if (p.ok && p.url) { window.location.href = p.url; return; }
      setBillingMessage(p.reason ?? "Billing management is not available for this account yet.");
    } catch { setBillingMessage("Billing management is not available right now."); } finally { setPortalStatus("idle"); }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (BINARY_UPLOAD_EXTENSIONS.has(ext)) {
      setDocumentText(`Extracting text from ${file.name}...`);
      try {
        const fd = new FormData(); fd.append("file", file);
        const res = await fetch("/api/extract-document", { method: "POST", body: fd });
        const p = (await res.json()) as { text?: string; error?: string };
        if (!res.ok || p.error) throw new Error(p.error ?? "Could not extract text from this file.");
        setDocumentText(p.text ?? "");
      } catch (err) { setDocumentText(`(${err instanceof Error ? err.message : "Could not extract text from this file."} Paste the text manually instead.)`); }
      return;
    }
    const reader = new FileReader(); reader.onload = () => setDocumentText(String(reader.result ?? "")); reader.readAsText(file);
  }

  async function runSmartAnalysis(text: string, analysisUrl: string, active: FrameworkId[]) {
    setSmartStatus("loading"); setSmartResult(null);
    try {
      const res = await fetch("/api/analyze-smart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentText: text, url: analysisUrl, selectedFrameworks: active, includeSecurity: false }) });
      const p = (await res.json()) as SmartAnalysisApiResponse;
      if (p.ok) { setSmartResult(p); setSmartStatus("success"); } else { setSmartStatus("unavailable"); setSmartReason(p.reason ?? "AI-powered analysis unavailable for this run."); }
    } catch { setSmartStatus("unavailable"); setSmartReason("AI-powered analysis unavailable for this run."); }
  }

  async function runCheck() {
    if (!canRun) return;
    const trimmedUrl = url.trim(), trimmedDoc = documentText.trim();
    // 1) usage gate
    let gate: UsageResponse = { allowed: true };
    try {
      gate = (await (await fetch("/api/usage/consume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: mode, label: mode === "website" ? trimmedUrl : "document upload" }) })).json()) as UsageResponse;
    } catch { gate = { allowed: true, degraded: true }; }
    if (gate.plan !== undefined) applyUsage(gate);
    if (gate.allowed === false) { setShowPaywall(true); return; }
    setShowPaywall(false);
    setStep("analyzing"); setStage(0); setSmartResult(null); setSmartStatus("idle");

    // 2) fetch website text
    let websiteText = "";
    if (mode === "website") {
      try {
        const res = await fetch("/api/fetch-website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: trimmedUrl }) });
        const p = (await res.json()) as { ok?: boolean; finalUrl?: string; title?: string; description?: string; text?: string; textLength?: number; error?: string };
        if (!res.ok || p.error) throw new Error(p.error ?? "Website could not be fetched.");
        websiteText = [p.finalUrl, p.title, p.description, p.text].filter(Boolean).join(" ");
        setFetchMessage(`Fetched ${Math.min(p.textLength ?? websiteText.length, 18000).toLocaleString()} characters from ${p.finalUrl ?? trimmedUrl}.`);
      } catch (err) { setFetchMessage(`${err instanceof Error ? err.message : "Website could not be fetched."} Paste the page text in Document mode for a fuller read.`); }
    } else setFetchMessage("Using pasted document text.");
    setStage(1);

    // 3) heuristic (instant) + 4) AI upgrade in place
    setSubmittedUrl(mode === "website" ? trimmedUrl : "");
    setSubmittedDocumentText(mode === "website" ? websiteText : trimmedDoc);
    setSubmittedSelected(selected);
    setExpanded(selected[0] ?? null);
    await new Promise((r) => setTimeout(r, 450)); setStage(2);
    await new Promise((r) => setTimeout(r, 450)); setStage(3);
    void runSmartAnalysis(mode === "website" ? websiteText : trimmedDoc, mode === "website" ? trimmedUrl : "", selected);
    await new Promise((r) => setTimeout(r, 500));
    setStep("results");
  }

  /* ── derived labels ──────────────────────────────────────────────────── */
  const remaining = usage ? (usage.unlimited ? null : Math.max(0, usage.remaining ?? usage.limit - usage.used)) : null;
  const remainingLabel = usage ? (usage.unlimited ? "∞" : `${remaining}/${usage.limit}`) : "3/3";
  const sourceLabel = mode === "website" ? url.trim().replace(/^https?:\/\//, "") || "website" : documentText.trim().split(/\s+/).slice(0, 6).join(" ") + "…";
  const highCount = display.risks.filter((r) => SEV_W[r.severity] >= 3).length;
  const runHint = !canRun ? (selected.length ? (mode === "website" ? "Enter a URL to continue." : "Paste text or pick an example to continue.") : "Select at least one framework.")
    : usage?.unlimited ? `${usage.plan === "team" ? "Team" : "Pro"} plan · unlimited checks` : remaining !== null ? (remaining > 0 ? `${remaining} of ${usage!.limit} free checks left.` : "Free checks used — upgrade to continue.") : "3 free checks, no account needed.";
  const analysisTag = smartStatus === "loading" ? "AI analysis running…" : smartStatus === "success" ? "AI-powered · grounded in official texts" : "Baseline heuristic";

  const navLink: CSSProperties = { color: INK, textDecoration: "none" };
  const gutter = "clamp(20px,4vw,56px)";

  return (
    <div style={{ minHeight: "100vh", background: PAPER, color: INK }}>
      {/* HEADER */}
      <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 32, padding: `14px ${gutter}`, background: "rgba(243,243,243,.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
        <a href="#top" style={{ ...navLink, fontWeight: 700, fontSize: 18, letterSpacing: "-.02em", display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 12, height: 12, background: BLUE, borderRadius: 2, display: "inline-block" }} />GovCheck</a>
        <nav className="gc-nav" style={{ display: "flex", gap: 26, marginLeft: "auto", fontSize: 14, fontWeight: 500 }}>
          <a href="#check" style={navLink}>Checker</a><a href="#why" style={navLink}>Why</a><a href="#frameworks" style={navLink}>Frameworks</a><a href="#faq" style={navLink}>FAQ</a>
        </nav>
        {auth.status === "signed-in" ? (
          <a href={SIGN_OUT_HREF} className="gc-nav" style={{ ...navLink, fontSize: 13, color: muted(0.6) }} title={auth.email ?? ""}>{auth.name?.split(" ")[0] || auth.email} · Sign out</a>
        ) : auth.status === "signed-out" ? (
          <a href={SIGN_IN_HREF} className="gc-nav" style={{ ...navLink, fontSize: 13, color: muted(0.6) }}>Sign in</a>
        ) : null}
        <a href="#check" className="gc-btn-solid" style={pill("solid", "md")}>Run a check</a>
      </header>

      {/* HERO */}
      <section id="top" className="gc-hero" style={{ position: "relative", padding: `clamp(24px,4vh,48px) ${gutter} 60px`, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 40, alignItems: "center" }}>
        <div className="gc-rise" style={{ maxWidth: 640 }}>
          <p style={{ ...eyebrow, marginBottom: 24 }}>EU AI Act · GDPR · ISO 42001 · NIST AI RMF</p>
          <h1 style={{ margin: "0 0 28px", fontSize: "clamp(48px,7.5vw,104px)", lineHeight: 0.95, letterSpacing: "-.045em", fontWeight: 600, textWrap: "balance" }}>AI governance with an edge.</h1>
          <p style={{ margin: "0 0 36px", fontSize: "clamp(17px,1.6vw,21px)", lineHeight: 1.45, color: muted(0.65), maxWidth: 520, textWrap: "pretty" }}>Point at a page or paste a policy. In seconds you get a readiness score, per-framework evidence and a prioritised fix list — grounded in the official regulatory texts.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <a href="#check" className="gc-btn-solid" style={pill("solid")}>Run a free check</a>
            <a href="#why" className="gc-btn-outline" style={pill("outline")}>How it works</a>
          </div>
        </div>
        <div className="gc-rise" style={{ position: "relative", aspectRatio: "1/1", maxHeight: "70vh" }}><Hero3D /></div>
      </section>

      {/* STATS */}
      <section style={{ margin: `0 ${gutter}`, background: INK, color: PAPER, borderRadius: 24, padding: "clamp(28px,4vw,56px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 32, alignItems: "end" }}>
        {[["Frameworks covered", "6", PAPER], ["Sources refreshed", "Daily", PAPER], ["Time to first result", "<10s", PAPER], ["Free checks", remainingLabel, BLUE]].map(([k, v, c]) => (
          <div key={k}><p style={{ margin: "0 0 12px", fontFamily: MONO, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(243,243,243,.55)" }}>{k}</p><p style={{ margin: 0, fontSize: "clamp(40px,5vw,72px)", lineHeight: 1, letterSpacing: "-.04em", fontWeight: 600, color: c }}>{v}</p></div>
        ))}
      </section>

      {/* CHECKER */}
      <section id="check" ref={checkRef} style={{ padding: `clamp(80px,12vh,160px) ${gutter} 40px`, scrollMarginTop: 70 }}>
        <div style={{ maxWidth: 760, marginBottom: 48 }}>
          <p style={eyebrow}>The checker</p>
          <h2 style={h2}>{step === "results" ? "Your result." : step === "analyzing" ? "Working on it." : "Run a check in seconds."}</h2>
          <p style={lede}>{step === "results" ? "Findings are ordered by severity; frameworks expand to show the evidence behind each score." : "Choose a source, pick the frameworks that apply, and run. No account needed for your first three checks."}</p>
        </div>
        <div style={{ background: "#fff", borderRadius: 24, padding: "clamp(24px,3.5vw,48px)", boxShadow: "0 1px 0 rgba(11,15,25,.06),0 24px 60px -30px rgba(11,15,25,.18)" }}>
          {step === "input" && (
            <div className="gc-rise" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "40px 56px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <Kicker n="01">Source</Kicker>
                <div style={{ display: "inline-flex", background: PAPER, borderRadius: 999, padding: 4, width: "fit-content", gap: 4 }}>
                  {(["website", "document"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)} style={{ padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", border: 0, borderRadius: 999, background: mode === m ? INK : "transparent", color: mode === m ? "#fff" : INK, textTransform: "capitalize" }}>{m}</button>
                  ))}
                </div>
                {mode === "website" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input className="gc-field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://company.com/ai-policy" inputMode="url" style={{ width: "100%", minHeight: 56, padding: "0 20px", fontSize: 17 }} />
                    <p style={{ margin: 0, fontSize: 13, color: muted(0.5) }}>We read the public page text only. Nothing is stored beyond this check.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <textarea className="gc-field" value={documentText} onChange={(e) => setDocumentText(e.target.value)} placeholder="Paste an AI policy, DPIA, model card, privacy notice or product documentation…" style={{ width: "100%", minHeight: 170, padding: "16px 20px", fontSize: 16, lineHeight: 1.5, resize: "vertical" }} />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "baseline", fontSize: 13 }}>
                      <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,.pptx,.docx,.pdf" onChange={handleFile} style={{ display: "none" }} />
                      <button type="button" onClick={() => fileRef.current?.click()} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontWeight: 600, color: BLUE, fontSize: 13 }}>Upload .pdf, .docx, .pptx, .txt</button>
                      <span style={{ color: muted(0.5) }}>Try:</span>
                      {["hiring assistant", "chatbot privacy policy", "governance policy"].map((l, i) => <button key={l} type="button" onClick={() => setDocumentText(examples[i])} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: BLUE, fontSize: 13 }}>{l}</button>)}
                      <span style={{ marginLeft: "auto", color: muted(0.5), fontFamily: MONO, fontSize: 12 }}>{documentText.length ? `${documentText.length.toLocaleString()} chars` : ""}</span>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <Kicker n="02">Frameworks</Kicker>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {frameworks.map((f) => { const on = selected.includes(f.id); return (
                    <button key={f.id} type="button" aria-pressed={on} onClick={() => toggleFramework(f.id)} style={{ padding: "10px 16px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer", border: `1px solid ${on ? BLUE : muted(0.18)}`, background: on ? BLUE : "transparent", color: on ? "#fff" : INK }}>{f.label}</button>
                  ); })}
                </div>
                <p style={{ margin: 0, fontSize: 13, color: muted(0.5) }}>{selected.length ? `${selected.length} of ${frameworks.length} selected. Fewer frameworks means a sharper read.` : "Select at least one framework."}</p>
              </div>
              <div style={{ gridColumn: "1/-1", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px 24px", paddingTop: 12 }}>
                <button type="button" className="gc-btn-solid" onClick={runCheck} disabled={!canRun} style={{ ...pill("solid"), padding: "18px 32px", opacity: canRun ? 1 : 0.45, cursor: canRun ? "pointer" : "not-allowed" }}>Run check</button>
                <span style={{ fontSize: 14, color: muted(0.55) }}>{runHint}</span>
                {usage && !usage.unlimited && <button type="button" onClick={() => setShowPaywall(true)} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: BLUE, fontSize: 14, fontWeight: 600 }}>Upgrade</button>}
                {usage?.unlimited && <button type="button" onClick={handleManageBilling} disabled={portalStatus === "loading"} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: BLUE, fontSize: 14, fontWeight: 600 }}>{portalStatus === "loading" ? "…" : usage.paymentProvider === "razorpay" ? "Cancel subscription" : "Manage billing"}</button>}
                {billingMessage && <span style={{ flexBasis: "100%", fontFamily: MONO, fontSize: 12, color: muted(0.55) }}>{billingMessage}</span>}
              </div>
            </div>
          )}

          {step === "analyzing" && (
            <div className="gc-rise" style={{ maxWidth: 560, padding: "20px 0" }}>
              <p style={{ ...eyebrow, marginBottom: 12 }}>Checking</p>
              <h3 style={{ margin: "0 0 32px", fontSize: "clamp(26px,3vw,36px)", lineHeight: 1.1, letterSpacing: "-.03em", fontWeight: 600, wordBreak: "break-word" }}>{sourceLabel}</h3>
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 16 }}>
                {STAGE_LABELS.map((l, i) => { const done = i < stage, active = i === stage; return (
                  <li key={l} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 17 }}>
                    <span className={active ? "gc-spin" : undefined} style={done ? { width: 14, height: 14, borderRadius: "50%", background: BLUE, flex: "none" } : active ? { width: 12, height: 12, borderRadius: "50%", border: `2px solid ${BLUE}`, borderTopColor: "transparent", flex: "none" } : { width: 12, height: 12, borderRadius: "50%", border: `1.5px solid ${muted(0.2)}`, flex: "none" }} />
                    <span style={{ color: done || active ? INK : muted(0.4), fontWeight: active ? 600 : 400 }}>{l}</span>
                  </li>
                ); })}
              </ol>
            </div>
          )}

          {step === "results" && (
            <div className="gc-rise">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "baseline", fontSize: 13, color: muted(0.55), marginBottom: 32, fontFamily: MONO }}>
                <span>{sourceLabel}</span><span>·</span><span>{display.fws.length} frameworks</span><span>·</span><span>{fetchMessage || "just now"}</span><span>·</span>
                <button type="button" onClick={goHome} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: BLUE, font: "inherit" }}>Edit inputs</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "24px 60px", alignItems: "end", marginBottom: 64 }}>
                <div>
                  <p style={{ ...eyebrow, marginBottom: 4 }}>Readiness</p>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}><span aria-label={`Readiness ${display.readiness} out of 100`} style={{ fontSize: "clamp(96px,14vw,168px)", lineHeight: 0.9, letterSpacing: "-.06em", fontWeight: 600, fontFeatureSettings: "'tnum' 1", color: display.readiness >= 78 ? BLUE : INK }}>{display.readiness}</span><span style={{ fontSize: 22, color: muted(0.45) }}>/100</span></div>
                </div>
                <div>
                  <h3 style={{ margin: "0 0 12px", fontSize: "clamp(26px,3vw,40px)", lineHeight: 1.05, letterSpacing: "-.03em", fontWeight: 600, textWrap: "balance" }}>{display.verdict}</h3>
                  <p style={{ margin: "0 0 16px", fontSize: 16, color: muted(0.65), maxWidth: 440, textWrap: "pretty" }}>{display.fws.filter((f) => f.status === "Compatible").length} of {display.fws.length} frameworks show adequate evidence. {highCount ? `${highCount} high-severity gap${highCount > 1 ? "s" : ""} should be closed first.` : "No high-severity gaps were found."}</p>
                  <span title={smartStatus === "unavailable" ? smartReason : undefined} style={smartStatus === "success" ? tag("rgba(14,118,255,.1)", BLUE_DK) : tag(muted(0.06), INK)}>{analysisTag}</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "56px 64px" }}>
                <section>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, marginBottom: 8 }}><h3 style={{ margin: 0, fontSize: 26, letterSpacing: "-.03em", fontWeight: 600 }}>Fix first</h3><span style={{ fontFamily: MONO, fontSize: 12, color: muted(0.5) }}>{display.risks.length} findings · {highCount} high</span></div>
                  <p style={{ margin: "0 0 20px", fontSize: 14, color: muted(0.55) }}>Ordered by severity. Each has an owner and a due date.</p>
                  <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {display.risks.map((r, i) => (
                      <li key={r.title} style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: "6px 16px", padding: "20px 0", borderTop: `1px solid ${muted(0.08)}` }}>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: BLUE, paddingTop: 4 }}>{pad(i)}</span>
                        <div>
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 6 }}><span style={sevTag[r.severity]}>{r.severity}</span><span style={{ fontSize: 12, color: muted(0.5), fontFamily: MONO }}>{r.owner} · {r.due}</span></div>
                          <h4 style={{ margin: "0 0 6px", fontSize: 18, lineHeight: 1.25, letterSpacing: "-.02em", fontWeight: 600, textWrap: "pretty" }}>{r.title}</h4>
                          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: muted(0.65), textWrap: "pretty" }}>{r.mitigation}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
                <section>
                  <h3 style={{ margin: "0 0 8px", fontSize: 26, letterSpacing: "-.03em", fontWeight: 600 }}>Evidence by framework</h3>
                  <p style={{ margin: "0 0 20px", fontSize: 14, color: muted(0.55) }}>Select a framework to see which signals were found.</p>
                  {display.fws.map((f) => { const open = expanded === f.id; return (
                    <div key={f.id} style={{ borderTop: `1px solid ${muted(0.08)}` }}>
                      <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : f.id)} style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 16px", alignItems: "center", padding: "18px 0", background: "none", border: 0, textAlign: "left", cursor: "pointer", color: INK }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                          <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-.02em", color: open ? BLUE : INK }}>{f.label}</span>
                          <span style={{ height: 4, background: muted(0.1), borderRadius: 2, overflow: "hidden", display: "block" }}><span style={{ display: "block", height: "100%", width: `${f.score}%`, background: f.status === "Not ready" ? INK : BLUE, transition: "width .6s ease-out" }} /></span>
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}><span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-.03em", fontFeatureSettings: "'tnum' 1" }}>{f.score}</span><span style={statusTag(f.status)}>{f.status}</span></span>
                      </button>
                      {open && (
                        <div className="gc-rise" style={{ padding: "0 0 22px", display: "flex", flexDirection: "column", gap: 8 }}>
                          {f.found.map((s) => (
                            <div key={s.label} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 14 }}><span style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: s.present ? BLUE : "transparent", border: `1.5px solid ${s.present ? BLUE : muted(0.35)}` }} /><span style={{ color: s.present ? INK : muted(0.5) }}>{s.label}</span></div>
                          ))}
                          {f.sourceTitle && <p style={{ margin: "8px 0 0", fontSize: 13, color: muted(0.55) }}>Source: <a href={f.sourceUrl} target="_blank" rel="noreferrer" style={{ color: BLUE }}>{f.sourceTitle}</a> — {f.sourceStatus}</p>}
                        </div>
                      )}
                    </div>
                  ); })}
                </section>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 48 }}>
                <button type="button" className="gc-btn-solid" onClick={goHome} style={pill("solid")}>Run another check</button>
                <button type="button" className="gc-btn-outline" onClick={() => window.print()} style={pill("outline")}>Download summary</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* WHY */}
      <section id="why" style={{ padding: `clamp(80px,12vh,160px) ${gutter}`, scrollMarginTop: 70 }}>
        <div style={{ maxWidth: 760, marginBottom: 64 }}>
          <p style={eyebrow}>Why it works</p>
          <h2 style={h2}>Built for the teams who ship the models.</h2>
          <p style={lede}>Three things the checker does differently from a compliance questionnaire.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: "48px 40px" }}>
          {PROPS.map((p, i) => (
            <div key={p.kind} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ width: "100%", aspectRatio: "5/4", position: "relative", borderRadius: 20, overflow: "hidden" }}><PropIllo kind={p.kind} /></div>
              <span style={{ fontFamily: MONO, fontSize: 12, color: BLUE }}>{pad(i)}</span>
              <h3 style={{ margin: 0, fontSize: "clamp(26px,2.6vw,34px)", lineHeight: 1.05, letterSpacing: "-.03em", fontWeight: 600, textWrap: "balance" }}>{p.title}</h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: muted(0.65), textWrap: "pretty" }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FRAMEWORKS */}
      <section id="frameworks" style={{ padding: `0 ${gutter} clamp(80px,12vh,160px)`, scrollMarginTop: 70 }}>
        <div style={{ background: INK, color: PAPER, borderRadius: 24, padding: "clamp(32px,5vw,72px)" }}>
          <div style={{ maxWidth: 760, marginBottom: 56 }}>
            <p style={eyebrow}>Frameworks</p>
            <h2 style={h2}>Six frameworks. One evidence map.</h2>
            <p style={{ ...lede, color: "rgba(243,243,243,.6)" }}>Each signal in your source is mapped to the obligation it satisfies, and each gap to the article it misses. Every result links to the official text.</p>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "0 64px" }}>
            {frameworks.map((f, i) => { const src = sourcesForFrameworks([f.id])[0]; return (
              <li key={f.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: "8px 20px", padding: "22px 0", borderTop: "1px solid rgba(243,243,243,.12)", alignItems: "baseline" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: BLUE }}>{pad(i)}</span>
                <div><h3 style={{ margin: "0 0 4px", fontSize: 20, letterSpacing: "-.02em", fontWeight: 600 }}>{f.label}</h3><p style={{ margin: 0, fontSize: 14, color: "rgba(243,243,243,.6)" }}>{f.description}</p>{src && <a href={src.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, display: "inline-block", marginTop: 8, whiteSpace: "nowrap", color: BLUE }}>Official text ↗</a>}</div>
              </li>
            ); })}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: `0 ${gutter} clamp(80px,12vh,160px)`, scrollMarginTop: 70 }}>
        <div style={{ maxWidth: 760, marginBottom: 48 }}>
          <p style={eyebrow}>FAQ</p>
          <h2 style={h2}>Got more questions?</h2>
          <p style={lede}>The short answers. <a href={CONTACT_SALES_URL} style={{ color: BLUE }}>Reach us</a> for anything else.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 860 }}>
          {FAQS.map(([q, a], i) => { const open = faq === i; return (
            <div key={q} style={{ borderTop: `1px solid ${muted(0.1)}` }}>
              <button type="button" className="gc-faq" aria-expanded={open} onClick={() => setFaq(open ? -1 : i)} style={{ width: "100%", display: "grid", gridTemplateColumns: "32px 1fr 24px", gap: 20, alignItems: "baseline", padding: "22px 0", background: "none", border: 0, textAlign: "left", cursor: "pointer", color: INK }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: BLUE }}>{pad(i)}</span>
                <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-.02em" }}>{q}</span>
                <span style={{ fontSize: 22, lineHeight: 1, textAlign: "right", color: muted(0.5) }}>{open ? "−" : "+"}</span>
              </button>
              {open && <p className="gc-rise" style={{ margin: 0, padding: "0 0 24px 52px", fontSize: 15, lineHeight: 1.55, color: muted(0.65), maxWidth: 600 }}>{a}</p>}
            </div>
          ); })}
        </div>
      </section>

      {/* CTA + FOOTER */}
      <section style={{ padding: `0 ${gutter} 40px` }}>
        <p style={eyebrow}>Get started</p>
        <h2 style={{ margin: "0 0 32px", fontSize: "clamp(40px,7vw,96px)", lineHeight: 0.95, letterSpacing: "-.045em", fontWeight: 600, maxWidth: 1000, textWrap: "balance" }}>Compliance for everyone. <span style={{ color: BLUE }}>Engineered to ship.</span></h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <a href="#check" onClick={() => setStep("input")} className="gc-btn-solid" style={pill("solid")}>Run a free check</a>
          <button type="button" onClick={() => setShowPaywall(true)} className="gc-btn-outline" style={pill("outline")}>See Pro pricing</button>
        </div>
      </section>
      <footer style={{ marginTop: 80, background: BLUE, color: "#fff", padding: `56px ${gutter} 32px`, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 32, marginBottom: 64, fontSize: 14 }}>
          {[["Navigation", [["Checker", "#check"], ["Why", "#why"], ["Frameworks", "#frameworks"], ["FAQ", "#faq"]]], ["Sources", [["EUR-Lex", "https://eur-lex.europa.eu"], ["NIST", "https://www.nist.gov"], ["ISO", "https://www.iso.org"], ["OECD", "https://www.oecd.org"]]]].map(([h, links]) => (
            <div key={h as string}><p style={{ margin: "0 0 12px", fontFamily: MONO, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.7 }}>{h as string}</p><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{(links as string[][]).map(([l, href]) => <a key={l} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" style={{ color: "#fff", textDecoration: "none" }}>{l}</a>)}</div></div>
          ))}
          <div><p style={{ margin: "0 0 12px", fontFamily: MONO, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.7 }}>Account</p><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {auth.status === "signed-in" ? <a href={SIGN_OUT_HREF} style={{ color: "#fff", textDecoration: "none" }}>Sign out</a> : <a href={SIGN_IN_HREF} style={{ color: "#fff", textDecoration: "none" }}>Sign in with Google or Microsoft</a>}
            <a href={CONTACT_SALES_URL} style={{ color: "#fff", textDecoration: "none" }}>Contact</a><span style={{ opacity: 0.7 }}>Not legal advice</span></div></div>
        </div>
        <p aria-hidden="true" style={{ margin: 0, fontSize: "clamp(80px,18vw,260px)", lineHeight: 0.8, letterSpacing: "-.06em", fontWeight: 700, whiteSpace: "nowrap", opacity: 0.95 }}>GovCheck</p>
        <p style={{ margin: "24px 0 0", fontFamily: MONO, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 }}>© {new Date().getFullYear()} GovCheck · euactanalyzer.com</p>
      </footer>

      {/* PAYWALL */}
      {showPaywall && (
        <div onClick={() => setShowPaywall(false)} style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 20, background: "rgba(11,15,25,.55)", zIndex: 30, backdropFilter: "blur(6px)" }}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="gc-rise" style={{ width: "min(760px,100%)", background: "#fff", borderRadius: 24, padding: "clamp(24px,4vw,48px)", display: "flex", flexDirection: "column", gap: 32 }}>
            <div>
              <p style={{ ...eyebrow, marginBottom: 12 }}>Pricing</p>
              <h2 style={{ margin: "0 0 8px", fontSize: "clamp(28px,3.5vw,40px)", lineHeight: 1.05, letterSpacing: "-.03em", fontWeight: 600 }}>{remaining === 0 ? "You've used your free checks." : "Go unlimited with Pro."}</h2>
              <p style={{ margin: 0, fontSize: 16, color: muted(0.65) }}>Unlimited checks, AI-powered analysis and a history of every run.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16 }}>
              {[["Free", "$0", "3 checks a month · baseline heuristic", PAPER, INK], ["Pro", "$11", "Unlimited checks · AI analysis · history", BLUE, "#fff"], ["Team", "Custom", "Shared workspace · SSO · audit export", INK, "#fff"]].map(([n, price, d, bg, fg]) => (
                <div key={n} style={{ background: bg, color: fg, borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 6 }}><h3 style={{ margin: 0, fontSize: 14, fontFamily: MONO, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 500 }}>{n}</h3><p style={{ margin: 0, fontSize: 40, letterSpacing: "-.04em", fontWeight: 600, lineHeight: 1 }}>{price}{n === "Pro" && <span style={{ fontSize: 14, letterSpacing: 0, fontWeight: 400, opacity: 0.8 }}> / mo</span>}</p><p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.8 }}>{d}</p></div>
              ))}
            </div>
            {billingMessage && <p style={{ margin: 0, fontFamily: MONO, fontSize: 12, color: muted(0.55) }}>{billingMessage}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <a href={CONTACT_SALES_URL} className="gc-btn-outline" style={pill("outline", "md")}>Contact sales</a>
              <button type="button" className="gc-btn-outline" onClick={() => setShowPaywall(false)} style={pill("outline", "md")}>Not now</button>
              <button type="button" className="gc-btn-solid" onClick={handleUpgradeClick} disabled={checkoutStatus === "loading"} style={pill("solid", "md")}>{checkoutStatus === "loading" ? "Starting checkout…" : auth.status === "signed-in" ? "Upgrade to Pro" : "Sign in and upgrade"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
