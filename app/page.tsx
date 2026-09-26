import type { Metadata } from "next";
import { ComplianceChecker } from "./compliance-checker";
import { FAQS } from "./lib/faq-data";

const CANONICAL_URL = "https://www.euactanalyzer.com/";

// The search phrase people actually type, not the product name twice —
// combines with the "%s | GovCheck" template in app/layout.tsx to render
// as "EU AI Act Compliance Checker – Free Readiness Score | GovCheck".
export const metadata: Metadata = {
  title: "EU AI Act Compliance Checker – Free Readiness Score",
  description: "Check websites, policies and documents against the EU AI Act, GDPR, ISO 42001 and NIST AI RMF.",
  alternates: { canonical: CANONICAL_URL },
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "GovCheck",
  alternateName: "EU AI Act Compliance Checker",
  url: CANONICAL_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Checks websites, policies and documents against the EU AI Act, GDPR, ISO 42001, NIST AI RMF, OECD AI Principles and SOC 2, with a readiness score, evidence-backed findings and a prioritised fix list.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free tier: 3 checks with the baseline heuristic, no account needed.",
  },
};

const faqPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(([question, answer]) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageJsonLd) }} />
      <ComplianceChecker />
    </>
  );
}
