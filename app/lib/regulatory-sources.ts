/**
 * Canonical list of official regulatory sources this app checks against.
 * Single source of truth shared by:
 * - app/lib/knowledge-base.ts (fetches/refreshes these into the DB)
 * - app/compliance-checker.tsx (renders them in "Official Validation Agent")
 */

export type FrameworkId = "euai" | "gdpr" | "iso42001" | "nist" | "oecd" | "soc2";

export type RegulatorySource = {
  /** Stable id derived from the URL; used as the DB primary key. */
  id: string;
  frameworkId: FrameworkId;
  authority: string;
  title: string;
  url: string;
  domain: string;
  /** Lowercase terms used to gauge whether submitted text cites this source. */
  evidenceTerms: string[];
};

export const regulatorySources: RegulatorySource[] = [
  {
    id: "eur-lex-2024-1689",
    frameworkId: "euai",
    authority: "EUR-Lex",
    title: "Regulation (EU) 2024/1689, Artificial Intelligence Act",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    domain: "eur-lex.europa.eu",
    evidenceTerms: ["regulation (eu) 2024/1689", "artificial intelligence act", "high-risk", "human oversight", "conformity assessment"],
  },
  {
    id: "eur-lex-2016-679",
    frameworkId: "gdpr",
    authority: "EUR-Lex",
    title: "Regulation (EU) 2016/679, General Data Protection Regulation",
    url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
    domain: "eur-lex.europa.eu",
    evidenceTerms: ["regulation (eu) 2016/679", "gdpr", "lawful basis", "data subject", "automated decision-making"],
  },
  {
    id: "edpb-guidance",
    frameworkId: "gdpr",
    authority: "European Data Protection Board",
    title: "EDPB guidance and opinions on data protection compliance",
    url: "https://www.edpb.europa.eu/our-work-tools/our-documents_en",
    domain: "edpb.europa.eu",
    evidenceTerms: ["edpb", "data protection impact assessment", "profiling", "data subject rights", "automated individual decision-making"],
  },
  {
    id: "nist-ai-rmf",
    frameworkId: "nist",
    authority: "NIST",
    title: "AI Risk Management Framework",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
    domain: "nist.gov",
    evidenceTerms: ["nist ai rmf", "govern", "map", "measure", "manage", "trustworthy ai"],
  },
  {
    id: "iso-iec-42001",
    frameworkId: "iso42001",
    authority: "ISO",
    title: "ISO/IEC 42001 AI management systems",
    url: "https://www.iso.org/standard/42001",
    domain: "iso.org",
    evidenceTerms: ["iso/iec 42001", "artificial intelligence management system", "aims", "management system", "continual improvement"],
  },
  {
    id: "oecd-ai-principles",
    frameworkId: "oecd",
    authority: "OECD",
    title: "OECD AI Principles",
    url: "https://www.oecd.org/en/topics/ai-principles.html",
    domain: "oecd.org",
    evidenceTerms: ["oecd ai principles", "human-centred values", "transparency", "robustness", "accountability"],
  },
];

export function sourcesForFrameworks(frameworkIds: FrameworkId[]): RegulatorySource[] {
  const active = new Set(frameworkIds);
  return regulatorySources.filter((source) => active.has(source.frameworkId));
}
