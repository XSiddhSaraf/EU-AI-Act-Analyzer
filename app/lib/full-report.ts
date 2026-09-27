// One-time "Full Report" purchase — a single all-6-framework check with a
// complete evidence map, fix list, and a branded PDF, regardless of the
// buyer's regular plan. Sold via Razorpay Orders (India, INR) or a Stripe
// one-off Checkout Session (international, USD). Separate from the older
// check-pack feature (app/lib/check-pack.ts, 10 bonus checks for $9), which
// is untouched and still not wired into the UI.
export const FULL_REPORT_PRICE_USD_CENTS = 1900; // $19.00 — Stripe smallest currency unit.
export const FULL_REPORT_PRICE_INR_PAISE = 79900; // ₹799.00 — Razorpay smallest currency unit.
