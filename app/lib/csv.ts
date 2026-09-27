import type { SmartAnalysisResponse } from "../api/analyze-smart/route";

function csvField(value: string | number | boolean): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function csvRow(values: Array<string | number | boolean>): string {
  return values.map(csvField).join(",");
}

/** Serializes a full analysis result into a simple two-table CSV: one row
 * per finding, followed by one row per risk. Kept dependency-free since the
 * shape is small and fixed. */
export function reportToCsv(result: SmartAnalysisResponse): string {
  const lines: string[] = [];

  lines.push(csvRow(["Section", "Readiness", "Verdict", "Official confidence"]));
  lines.push(csvRow(["Summary", Math.round(result.readiness), result.verdict, Math.round(result.officialConfidence)]));
  lines.push("");

  lines.push(csvRow(["Framework", "Score", "Status", "Finding", "Present", "Evidence"]));
  for (const [frameworkId, score] of Object.entries(result.frameworkScores)) {
    for (const finding of score.findings) {
      lines.push(csvRow([frameworkId, Math.round(score.score), score.status, finding.label, finding.present, finding.evidence]));
    }
  }
  lines.push("");

  lines.push(csvRow(["Risk", "Severity", "Mitigation", "Owner", "Due"]));
  for (const risk of result.risks) {
    lines.push(csvRow([risk.title, risk.severity, risk.mitigation, risk.owner, risk.due]));
  }

  return lines.join("\n");
}
