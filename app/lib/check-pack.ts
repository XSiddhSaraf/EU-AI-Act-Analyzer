// One-time "extra checks" pack sold via Razorpay's Orders API (Standard
// Checkout) — separate from the recurring $11/mo Pro subscription (Razorpay
// Subscriptions API, see app/lib/razorpay.ts and app/api/billing/*). Kept as
// shared constants so the server (order amount) and client (button copy,
// checkout modal) never drift apart.
export const CHECK_PACK_SIZE = 10;
export const CHECK_PACK_PRICE_USD_CENTS = 900; // $9.00 — Razorpay orders use the smallest currency unit.
export const CHECK_PACK_CURRENCY = "USD";
