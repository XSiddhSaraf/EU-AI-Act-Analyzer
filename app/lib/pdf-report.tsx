import type { SmartAnalysisResponse } from "../api/analyze-smart/route";

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
    page: { padding: 40, paddingBottom: 56, fontSize: 10, fontFamily: "Helvetica", color: "#0b0f19" },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
    logo: { width: 28, height: 28, objectFit: "contain" },
    brand: { fontSize: 14, fontWeight: 700 },
    dateText: { fontSize: 9, color: "#666666" },
    title: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
    meta: { fontSize: 9, color: "#666666", marginBottom: 20 },
    scoreRow: { flexDirection: "row", gap: 16, marginBottom: 24 },
    scoreBox: { padding: 12, backgroundColor: "#f3f3f3", borderRadius: 6, flex: 1 },
    scoreValue: { fontSize: 26, fontWeight: 700 },
    scoreLabel: { fontSize: 9, textTransform: "uppercase", color: "#666666", marginBottom: 4 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: 700,
      marginTop: 16,
      marginBottom: 8,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: "#dddddd",
      borderBottomStyle: "solid",
    },
    frameworkBlock: { marginBottom: 10 },
    frameworkHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
    frameworkName: { fontSize: 11, fontWeight: 700 },
    finding: { flexDirection: "row", gap: 6, marginBottom: 3, paddingLeft: 8 },
    findingMark: { width: 28, fontWeight: 700 },
    riskRow: { marginBottom: 8, paddingLeft: 8 },
    riskTitle: { fontWeight: 700, marginBottom: 2 },
    riskMeta: { color: "#666666", marginTop: 2 },
    matchRow: { marginBottom: 6, paddingLeft: 8 },
    matchTitle: { fontWeight: 700 },
    matchTerms: { color: "#666666" },
    footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#999999", textAlign: "center" },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildComplianceReportPdf(pdf: any, styles: Record<string, unknown>, result: SmartAnalysisResponse, options: PdfReportOptions) {
  const { Document, Page, View, Text, Image } = pdf;
  const brand = options.companyName?.trim() || "GovCheck";
  const frameworkEntries = Object.entries(result.frameworkScores);
  const matchEntries = Object.entries(result.officialMatches);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
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
            <Text style={styles.scoreValue}>{Math.round(result.readiness)}</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Verdict</Text>
            <Text style={{ fontSize: 12, fontWeight: 700 }}>{result.verdict}</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Source confidence</Text>
            <Text style={styles.scoreValue}>{Math.round(result.officialConfidence)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Framework scores</Text>
        {frameworkEntries.map(([frameworkId, score]) => (
          <View key={frameworkId} wrap={false} style={styles.frameworkBlock}>
            <View style={styles.frameworkHeader}>
              <Text style={styles.frameworkName}>{FRAMEWORK_LABELS[frameworkId] ?? frameworkId}</Text>
              <Text>
                {score.status} · {Math.round(score.score)}/100
              </Text>
            </View>
            {score.findings.map((finding, i) => (
              <View key={i} style={styles.finding}>
                <Text style={styles.findingMark}>{finding.present ? "[OK]" : "[GAP]"}</Text>
                <Text>
                  {finding.label}
                  {finding.evidence ? ` — "${finding.evidence}"` : ""}
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
                <Text style={styles.riskTitle}>
                  {risk.title} — {risk.severity}
                </Text>
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
            <Text style={styles.sectionTitle}>Official source matches</Text>
            {matchEntries.map(([sourceId, match]) => (
              <View key={sourceId} style={styles.matchRow}>
                <Text style={styles.matchTitle}>
                  {sourceId} — {match.status}
                </Text>
                {match.matchedTerms.length > 0 && <Text style={styles.matchTerms}>{match.matchedTerms.join(", ")}</Text>}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer} fixed>
          Generated by {brand} · Not legal advice
        </Text>
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
