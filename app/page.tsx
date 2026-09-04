import type { Metadata } from "next";
import { ComplianceChecker } from "./compliance-checker";

export const metadata: Metadata = {
  title: "GovCheck — AI governance with an edge",
  description: "Check websites, policies and documents against the EU AI Act, GDPR, ISO 42001 and NIST AI RMF.",
};

export default function Home() {
  return <ComplianceChecker />;
}
