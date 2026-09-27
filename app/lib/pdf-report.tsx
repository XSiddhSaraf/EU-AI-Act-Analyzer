import type { SmartAnalysisResponse } from "../api/analyze-smart/route";
import { regulatorySources } from "./regulatory-sources";

// Kept local (not imported from compliance-checker.tsx, a client component)
// so this module stays server-only and doesn't pull in browser-only code.
const FRAMEWORK_LABELS: Record<string, string> = {
  euai: "EU AI Act",
  gdpr: "GDPR",
  iso42001: "ISO/IEC 42001",
  nist: "NIST AI RMF",
  oecd: "OECD AI Principles",
  soc2: "SOC 2 / Security",
};

// Human-readable authority/title/url for each official source id (the API
// only returns the raw slug, e.g. "eur-lex-2024-1689" — showing that
// directly in a client-facing PDF looked unprofessional).
const SOURCE_LOOKUP = new Map(regulatorySources.map((s) => [s.id, s]));

const BLUE = "#0e76ff";
const INK = "#0b0f19";
const GREY_BG = "#eeeeee";
const GREY_TEXT = "#555555";

// Mirrors the web UI's statusTag color scheme (compliance-checker.tsx) so
// the PDF and site read consistently.
const FRAMEWORK_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Compatible: { bg: "rgba(14,118,255,.12)", fg: "#0a54b8" },
  Partial: { bg: GREY_BG, fg: INK },
  "Not ready": { bg: INK, fg: "#ffffff" },
};
const MATCH_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  "Strong source match": { bg: "rgba(14,118,255,.12)", fg: "#0a54b8" },
  "Partial source match": { bg: GREY_BG, fg: INK },
  "No direct source evidence": { bg: "#ffffff", fg: GREY_TEXT },
};
const SEVERITY_STYLE: Record<string, { bg: string; fg: string }> = {
  Critical: { bg: INK, fg: "#ffffff" },
  High: { bg: BLUE, fg: "#ffffff" },
  Medium: { bg: "#ffffff", fg: INK },
  Low: { bg: "#ffffff", fg: GREY_TEXT },
};
// Colors the verdict's plain text (sitting directly on the light score box
// background), matching the web UI's readiness-number color logic.
function verdictTextColor(readiness: number): string {
  return readiness >= 78 ? "#0a54b8" : INK;
}

export type PdfReportOptions = {
  label: string;
  createdAt: string;
  companyName?: string;
  logoUrl?: string;
};

// @react-pdf/renderer pulls in pdfkit's standard-font loading, which uses
// Node's package.json "imports" self-reference (`#standard-fonts/...`) to
// find its bundled AFM font metrics files. Vite's SSR bundler mangles that
// self-reference when this module is statically imported and inlined into
// the worker bundle ("Cannot find module '#standard-fonts/Helvetica'" at
// runtime). Loading it via a computed dynamic import instead — the same
// workaround db/index.ts uses for better-sqlite3 — keeps it out of the
// static bundle graph so Node resolves it normally at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedPdfModule: any = null;
async function loadPdfModule() {
  if (cachedPdfModule) return cachedPdfModule;
  const specifier = "@react-pdf/renderer";
  cachedPdfModule = await import(/* @vite-ignore */ specifier);
  return cachedPdfModule;
}

function buildStyles(StyleSheet: { create: (styles: Record<string, unknown>) => Record<string, unknown> }) {
  return StyleSheet.create({
    page: { padding: 40, paddingBottom: 56, fontSize: 10, fontFamily: "Helvetica", color: INK },
    accentBar: { position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: BLUE },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24, marginTop: 4 },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
    logo: { width: 28, height: 28, objectFit: "contain" },
    brand: { fontSize: 14, fontWeight: 700 },
    dateText: { fontSize: 9, color: GREY_TEXT },
    title: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
    meta: { fontSize: 9, color: GREY_TEXT, marginBottom: 20 },
    scoreRow: { flexDirection: "row", gap: 16, marginBottom: 24 },
    scoreBox: { padding: 12, backgroundColor: "#f3f3f3", borderRadius: 6, flex: 1 },
    scoreValue: { fontSize: 26, fontWeight: 700 },
    scoreLabel: { fontSize: 9, textTransform: "uppercase", color: GREY_TEXT, marginBottom: 4 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: 700,
      marginTop: 16,
      marginBottom: 4,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: "#dddddd",
      borderBottomStyle: "solid",
    },
    sectionCaption: { fontSize: 9, color: GREY_TEXT, marginBottom: 10, lineHeight: 1.4 },
    frameworkBlock: { marginBottom: 12 },
    frameworkHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    frameworkName: { fontSize: 11, fontWeight: 700, flex: 1, paddingRight: 8 },
    frameworkScoreText: { fontSize: 10, fontWeight: 700 },
    pill: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, fontSize: 8, fontWeight: 700, textTransform: "uppercase" },
    finding: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4, paddingLeft: 8 },
    findingMarkPill: { width: 40, paddingVertical: 2, borderRadius: 4, fontSize: 7, fontWeight: 700, textAlign: "center", textTransform: "uppercase" },
    findingLabel: { flex: 1 },
    findingEvidence: { color: GREY_TEXT, fontStyle: "italic" },
    riskRow: { marginBottom: 10, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: "#dddddd", borderLeftStyle: "solid" },
    riskHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
    riskTitle: { fontWeight: 700, fontSize: 11, flex: 1, paddingRight: 8 },
    riskMeta: { color: GREY_TEXT, marginTop: 4, fontSize: 9 },
    matchRow: { marginBottom: 10, paddingLeft: 8 },
    matchHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
    matchTitle: { fontWeight: 700, fontSize: 10, flex: 1, paddingRight: 8 },
    matchLink: { fontSize: 8, color: BLUE, marginBottom: 2 },
    matchTerms: { color: GREY_TEXT, fontSize: 9 },
    footer: {
      position: "absolute",
      bottom: 24,
      left: 40,
      right: 40,
      fontSize: 8,
      color: "#999999",
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: "#eeeeee",
      borderTopStyle: "solid",
      paddingTop: 6,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildComplianceReportPdf(pdf: any, styles: Record<string, unknown>, result: SmartAnalysisResponse, options: PdfReportOptions) {
  const { Document, Page, View, Text, Image, Link } = pdf;
  const brand = options.companyName?.trim() || "GovCheck";
  const frameworkEntries = Object.entries(result.frameworkScores);
  const matchEntries = Object.entries(result.officialMatches);

  const Pill = ({ label, tone }: { label: string; tone: { bg: string; fg: string } }) => (
    <Text style={{ ...(styles.pill as object), backgroundColor: tone.bg, color: tone.fg }}>{label}</Text>
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.accentBar} fixed />
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop; it renders into a PDF, not the DOM */}
            {options.logoUrl ? <Image src={options.logoUrl} style={styles.logo} /> : null}
            <Text style={styles.brand}>{brand}</Text>
          </View>
          <Text style={styles.dateText}>{new Date(options.createdAt).toLocaleDateString()}</Text>
        </View>

        <Text style={styles.title}>AI Governance Compliance Report</Text>
        <Text style={styles.meta}>{options.label || "Untitled check"}</Text>

        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Readiness</Text>
            <Text style={styles.scoreValue}>{Math.round(result.readiness)}/100</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Verdict</Text>
            <Text style={{ fontSize: 12, fontWeight: 700, color: verdictTextColor(result.readiness) }}>{result.verdict}</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Source confidence</Text>
            <Text style={styles.scoreValue}>{Math.round(result.officialConfidence)}/100</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Framework scores</Text>
        <Text style={styles.sectionCaption}>
          Each finding is checked against the submitted content. PRESENT means the requirement is evidenced in the text; GAP
          means it wasn&apos;t found and should be addressed.
        </Text>
        {frameworkEntries.map(([frameworkId, score]) => (
          <View key={frameworkId} wrap={false} style={styles.frameworkBlock}>
            <View style={styles.frameworkHeader}>
              <Text style={styles.frameworkName}>{FRAMEWORK_LABELS[frameworkId] ?? frameworkId}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={styles.frameworkScoreText}>{Math.round(score.score)}/100</Text>
                <Pill label={score.status} tone={FRAMEWORK_STATUS_STYLE[score.status] ?? FRAMEWORK_STATUS_STYLE.Partial} />
              </View>
            </View>
            {score.findings.map((finding, i) => (
              <View key={i} style={styles.finding}>
                <Text
                  style={{
                    ...(styles.findingMarkPill as object),
                    backgroundColor: finding.present ? "rgba(14,118,255,.12)" : GREY_BG,
                    color: finding.present ? "#0a54b8" : GREY_TEXT,
                  }}
                >
                  {finding.present ? "Present" : "Gap"}
                </Text>
                <Text style={styles.findingLabel}>
                  {finding.label}
                  {finding.evidence ? <Text style={styles.findingEvidence}>{` — "${finding.evidence}"`}</Text> : null}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {result.risks.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Risks &amp; mitigations</Text>
            {result.risks.map((risk, i) => (
              <View key={i} style={styles.riskRow} wrap={false}>
                <View style={styles.riskHeader}>
                  <Text style={styles.riskTitle}>{risk.title}</Text>
                  <Pill label={risk.severity} tone={SEVERITY_STYLE[risk.severity] ?? SEVERITY_STYLE.Medium} />
                </View>
                <Text>{risk.mitigation}</Text>
                <Text style={styles.riskMeta}>
                  Owner: {risk.owner} · Due: {risk.due}
                </Text>
              </View>
            ))}
          </View>
        )}

        {matchEntries.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Regulatory source grounding</Text>
            <Text style={styles.sectionCaption}>
              Shows whether the submitted content cites language from each official source below. &quot;No direct source
              evidence&quot; means no such citation was detected in this specific check — on its own, it does not indicate
              non-compliance.
            </Text>
            {matchEntries.map(([sourceId, match]) => {
              const source = SOURCE_LOOKUP.get(sourceId);
              return (
                <View key={sourceId} style={styles.matchRow} wrap={false}>
                  <View style={styles.matchHeader}>
                    <Text style={styles.matchTitle}>{source ? `${source.authority} — ${source.title}` : sourceId}</Text>
                    <Pill label={match.status} tone={MATCH_STATUS_STYLE[match.status] ?? MATCH_STATUS_STYLE["No direct source evidence"]} />
                  </View>
                  {source && (
                    <Link src={source.url} style={styles.matchLink}>
                      {source.url}
                    </Link>
                  )}
                  {match.matchedTerms.length > 0 && (
                    <Text style={styles.matchTerms}>Matched terms: {match.matchedTerms.join(", ")}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>Generated by {brand} · Not legal advice</Text>
          <Text render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Renders a full compliance analysis result to a PDF byte buffer. */
export async function renderComplianceReportPdf(
  result: SmartAnalysisResponse,
  options: PdfReportOptions,
): Promise<Buffer> {
  const pdf = await loadPdfModule();
  const styles = buildStyles(pdf.StyleSheet);
  const doc = buildComplianceReportPdf(pdf, styles, result, options);
  return pdf.renderToBuffer(doc);
}
