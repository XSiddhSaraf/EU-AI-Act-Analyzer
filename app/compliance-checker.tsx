"use client";

import type { CSSProperties, ChangeEvent } from "react";
import { useMemo, useState } from "react";

type FrameworkId = "euai" | "gdpr" | "iso42001" | "nist" | "oecd" | "soc2";
type Severity = "Critical" | "High" | "Medium" | "Low";

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
    { label: "International transfer safeguards", terms: ["standard contractual clauses", "scc", "transfer", "adequacy"], impact: 10 },
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
  ],
  soc2: [
    { label: "Access controls", terms: ["access control", "least privilege", "mfa", "authentication"], impact: 16 },
    { label: "Logging and monitoring", terms: ["logging", "monitoring", "alert", "audit log"], impact: 14 },
    { label: "Incident response", terms: ["incident response", "breach", "escalation", "runbook"], impact: 15 },
    { label: "Vendor and data retention controls", terms: ["vendor", "subprocessor", "retention", "backup"], impact: 13 },
    { label: "Security testing", terms: ["penetration test", "vulnerability", "encryption", "secure development"], impact: 15 },
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
];

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

  const sourceText = `${submittedUrl} ${submittedDocumentText}`.toLowerCase();
  const canRunCheck =
    mode === "website"
      ? url.trim().length > 0 || documentText.trim().length > 0
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

  function toggleFramework(id: FrameworkId) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDocumentText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function runCheck() {
    setSubmittedUrl(url.trim());
    setSubmittedDocumentText(documentText.trim());
    setSubmittedSelected(selected);
    setSubmittedIncludeSecurity(includeSecurity);
    setLastRunLabel(`Checked ${mode === "website" ? "website" : "document"} input just now`);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f4] text-[#121512]">
      <section className="hero-shell">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">AI governance compatibility workspace</p>
            <h1>Check a website or document against the EU AI Act.</h1>
            <p className="hero-text">
              Scan policy text, product pages, procurement notes, or website
              copy for AI governance readiness. The checker maps evidence to
              major frameworks, flags risks, and turns each gap into a practical
              mitigation.
            </p>
            <div className="hero-actions" aria-label="Assessment modes">
              <button
                className={mode === "website" ? "mode active" : "mode"}
                onClick={() => setMode("website")}
                type="button"
              >
                Website
              </button>
              <button
                className={mode === "document" ? "mode active" : "mode"}
                onClick={() => setMode("document")}
                type="button"
              >
                Document
              </button>
            </div>
          </div>

          <div className="verdict-panel" aria-live="polite">
            <div className="score-ring" style={{ "--score": assessment.readiness } as CSSProperties}>
              <span>{assessment.readiness}</span>
              <small>/100</small>
            </div>
            <div>
              <p className="panel-label">Compatibility verdict</p>
              <h2>{assessment.verdict}</h2>
              <p>
                Based on {assessment.frameworkResults.length} frameworks and{" "}
                {assessment.detectedRisks.length} active risk findings.
              </p>
              <p className="run-stamp">{lastRunLabel}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="input-panel" aria-label="Checker inputs">
          <div className="panel-heading">
            <span>1</span>
            <div>
              <h2>Source to check</h2>
              <p>Paste a URL, document text, or upload a plain-text file.</p>
            </div>
          </div>

          {mode === "website" ? (
            <label className="field">
              <span>Website URL</span>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://company.com/ai-policy"
              />
            </label>
          ) : null}

          <label className="field">
            <span>{mode === "website" ? "Page or policy text" : "Document text"}</span>
            <textarea
              value={documentText}
              onChange={(event) => setDocumentText(event.target.value)}
              placeholder="Paste AI policy, DPIA, model card, privacy notice, or product documentation..."
            />
          </label>

          <label className="upload-box">
            <input type="file" accept=".txt,.md,.csv,.json" onChange={handleFile} />
            <span>Upload text file</span>
            <small>.txt, .md, .csv, or .json</small>
          </label>

          <div className="example-row">
            {examples.map((example, index) => (
              <button key={example} type="button" onClick={() => setDocumentText(example)}>
                Example {index + 1}
              </button>
            ))}
          </div>

          <div className="submit-row">
            <button
              className="run-button"
              disabled={!canRunCheck}
              onClick={runCheck}
              type="button"
            >
              Run check
            </button>
            <p>
              Results update after you click. Paste the URL, add any policy text
              you have, then run the review.
            </p>
          </div>

          <div className="framework-box">
            <div className="panel-heading compact">
              <span>2</span>
              <div>
                <h2>Frameworks</h2>
                <p>Select the governance lens for this review.</p>
              </div>
            </div>
            <div className="framework-list">
              {frameworks
                .filter((framework) => framework.id !== "soc2")
                .map((framework) => (
                  <label key={framework.id} className="check-row">
                    <input
                      type="checkbox"
                      checked={selected.includes(framework.id)}
                      onChange={() => toggleFramework(framework.id)}
                    />
                    <span>
                      <strong>{framework.label}</strong>
                      <small>{framework.description}</small>
                    </span>
                  </label>
                ))}
              <label className="check-row switch">
                <input
                  type="checkbox"
                  checked={includeSecurity}
                  onChange={() => setIncludeSecurity((value) => !value)}
                />
                <span>
                  <strong>Include security controls</strong>
                  <small>SOC 2-style evidence for access, logging, and incidents</small>
                </span>
              </label>
            </div>
          </div>
        </aside>

        <section className="results-panel" aria-label="Compliance results">
          <div className="results-topline">
            <div>
              <p className="eyebrow">Assessment report</p>
              <h2>Compatibility by framework</h2>
            </div>
            <div className="status-pill">{assessment.verdict}</div>
          </div>

          <div className="framework-grid">
            {assessment.frameworkResults.map((framework) => (
              <article key={framework.id} className="framework-card">
                <div className="card-title">
                  <span>{framework.short}</span>
                  <strong>{framework.label}</strong>
                </div>
                <div className="meter" aria-label={`${framework.label} score ${framework.score}`}>
                  <i style={{ width: `${framework.score}%` }} />
                </div>
                <div className="score-line">
                  <b>{framework.score}%</b>
                  <em>{framework.status}</em>
                </div>
                <ul>
                  {framework.found.slice(0, 4).map((signal) => (
                    <li key={signal.label} className={signal.present ? "present" : "missing"}>
                      {signal.label}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="risk-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Risk register</p>
                <h2>Risks and mitigations</h2>
              </div>
              <span>{assessment.detectedRisks.length} findings</span>
            </div>

            <div className="risk-list">
              {assessment.detectedRisks.map((risk) => (
                <article key={risk.title} className="risk-item">
                  <div className={`severity ${risk.severity.toLowerCase()}`}>
                    {risk.severity}
                  </div>
                  <div>
                    <h3>{risk.title}</h3>
                    <p>{risk.mitigation}</p>
                    <div className="risk-meta">
                      <span>Owner: {risk.owner}</span>
                      <span>Target: {risk.due}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="mitigation-board">
            <article>
              <span>01</span>
              <h3>Evidence pack</h3>
              <p>
                Gather model purpose, data lineage, risk classification, privacy
                notice, DPIA, evaluation results, and monitoring logs.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Control owners</h3>
              <p>
                Assign named Legal, Security, Product, and AI Governance owners
                for every open finding.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Residual risk</h3>
              <p>
                Re-score after mitigations and record accepted residual risk
                before production or procurement approval.
              </p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
