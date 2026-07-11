import type { Metadata } from "next";
import { ComplianceChecker } from "./compliance-checker";

export const metadata: Metadata = {
  title: "AI Governance Compatibility Checker",
  description:
    "Check websites, policies, and document text against the EU AI Act and other AI governance frameworks.",
};

export default function Home() {
  return <ComplianceChecker />;
}
