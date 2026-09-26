// Shared between app/compliance-checker.tsx (visible FAQ accordion) and
// app/page.tsx (FAQPage JSON-LD structured data) so search engines' rich
// results always match what's actually shown on the page — Google penalizes
// structured data that doesn't reflect visible content.
export const FAQS: Array<[question: string, answer: string]> = [
  ["What can I check?", "A public web page by URL, or a document — paste text or upload .pdf, .docx, .pptx or .txt. Policies, DPIAs, model cards, privacy notices and product documentation all work."],
  ["Is this legal advice?", "No. The checker maps evidence in your text to framework obligations and flags gaps. It helps you prepare for a review; it does not replace counsel or a conformity assessment."],
  ["What is the free tier?", "Three checks a month with the baseline heuristic, no account needed. Pro adds unlimited checks, AI-powered analysis and a history of every run."],
  ["How current are the sources?", "Official texts are fetched and cached with a content hash. They refresh daily, and any source older than a week is refreshed before your next AI-powered check."],
  ["Do you store my documents?", "Website mode reads public page text only. Document text is used for the check and is not retained beyond it."],
];
