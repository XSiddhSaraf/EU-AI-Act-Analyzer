import { Auth } from "@auth/core";
import { getAuthConfig } from "../../../auth";

// Handles every Auth.js action under /api/auth/* (signin, signout, callback,
// session, csrf, providers, error). Reads per-request cookies/headers, so it
// must always run dynamically rather than being statically optimized.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return Auth(request, getAuthConfig());
}

export async function POST(request: Request) {
  return Auth(request, getAuthConfig());
}
