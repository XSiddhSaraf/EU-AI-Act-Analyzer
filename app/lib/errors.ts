// The Razorpay Node SDK doesn't reject with a real `Error` instance — its
// internal API client (node_modules/razorpay/dist/api.js: normalizeError)
// throws a plain object shaped like `{ statusCode, error: { code,
// description, ... } }`. Checking `error instanceof Error` alone misses
// this entirely and silently collapses every Razorpay API failure down to
// "Unknown error", hiding the actual reason (e.g. "The id provided does
// not exist" for a plan/order id from the wrong mode). This helper checks
// that shape first, then falls back to normal Error/string handling.
type RazorpaySdkError = { error?: { description?: unknown } };

function isRazorpaySdkError(value: unknown): value is RazorpaySdkError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as RazorpaySdkError).error === "object" &&
    (value as RazorpaySdkError).error !== null
  );
}

/** Extracts the best available human-readable message from a thrown value. */
export function describeError(error: unknown): string {
  if (isRazorpaySdkError(error) && typeof error.error?.description === "string") {
    return error.error.description;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
