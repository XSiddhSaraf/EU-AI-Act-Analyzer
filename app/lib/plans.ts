import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { accountPlans } from "../../db/schema";

export type PlanId = "free" | "pro" | "team" | "agency";
export type BillingInterval = "monthly" | "yearly";

export type PlanLimits = {
  /** Checks allowed per calendar month (UTC). See monthlyCheckLimitOverride
   * for negotiated custom deals that don't fit this fixed table. */
  monthlyChecks: number;
  maxFrameworksPerCheck: number;
  exportPdf: boolean;
  exportCsv: boolean;
  history: boolean;
  whiteLabel: boolean;
  apiAccess: boolean;
  /** Marketing/label only — no real multi-seat enforcement exists yet. */
  seatsLabel: number;
};

// Single source of truth for what each tier includes. Keep in sync with the
// pricing copy in app/compliance-checker.tsx and README.md.
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    monthlyChecks: 3,
    maxFrameworksPerCheck: 1,
    exportPdf: false,
    exportCsv: false,
    history: false,
    whiteLabel: false,
    apiAccess: false,
    seatsLabel: 1,
  },
  pro: {
    monthlyChecks: 60,
    maxFrameworksPerCheck: 6,
    exportPdf: true,
    exportCsv: true,
    history: true,
    whiteLabel: false,
    apiAccess: false,
    seatsLabel: 1,
  },
  team: {
    monthlyChecks: 300,
    maxFrameworksPerCheck: 6,
    exportPdf: true,
    exportCsv: true,
    history: true,
    whiteLabel: false,
    apiAccess: false,
    seatsLabel: 5,
  },
  agency: {
    monthlyChecks: 1000,
    maxFrameworksPerCheck: 6,
    exportPdf: true,
    exportCsv: true,
    history: true,
    whiteLabel: true,
    apiAccess: true,
    seatsLabel: 1,
  },
};

/** Sentinel for monthlyCheckLimitOverride meaning "no cap" (custom Enterprise deals). */
export const UNLIMITED_OVERRIDE = -1;

export function isPlanId(value: string): value is PlanId {
  return value === "free" || value === "pro" || value === "team" || value === "agency";
}

export type PlanContext = {
  subject: string;
  plan: PlanId;
  paymentProvider: string;
  billingInterval: "" | BillingInterval;
  bonusChecks: number;
  pendingFullReports: number;
  monthlyCheckLimitOverride: number | null;
  limits: PlanLimits;
  /** Resolved monthly cap before adding bonusChecks: override (or -1 for
   * unlimited) takes precedence over the plan's default. */
  monthlyLimit: number;
  unlimited: boolean;
  whiteLabelCompanyName: string;
  whiteLabelLogoUrl: string;
};

/**
 * Resolves everything needed to gate/report usage for a subject in one
 * place, so usage routes, analyze-smart, reports/export, and api-keys don't
 * each re-derive plan semantics independently.
 */
export async function resolvePlanContext(subject: string): Promise<PlanContext> {
  const db = await getDb();
  const rows: (typeof accountPlans.$inferSelect)[] = await db
    .select()
    .from(accountPlans)
    .where(eq(accountPlans.subject, subject))
    .limit(1);
  const row = rows[0];

  const plan: PlanId = row && isPlanId(row.plan) ? row.plan : "free";
  const limits = PLAN_LIMITS[plan];
  const monthlyCheckLimitOverride =
    typeof row?.monthlyCheckLimitOverride === "number" ? row.monthlyCheckLimitOverride : null;
  const unlimited = monthlyCheckLimitOverride === UNLIMITED_OVERRIDE;
  const monthlyLimit = unlimited
    ? 0
    : (monthlyCheckLimitOverride ?? limits.monthlyChecks);

  return {
    subject,
    plan,
    paymentProvider: row?.paymentProvider ?? "",
    billingInterval: row?.billingInterval === "monthly" || row?.billingInterval === "yearly" ? row.billingInterval : "",
    bonusChecks: row?.bonusChecks ?? 0,
    pendingFullReports: row?.pendingFullReports ?? 0,
    monthlyCheckLimitOverride,
    limits,
    monthlyLimit,
    unlimited,
    whiteLabelCompanyName: row?.whiteLabelCompanyName ?? "",
    whiteLabelLogoUrl: row?.whiteLabelLogoUrl ?? "",
  };
}

/** Start of the current calendar month in UTC, as an ISO string, for
 * scoping monthly usage windows in usage_events queries. */
export function startOfCurrentUtcMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
