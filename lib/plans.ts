export const PLANS = {
  visitor: { scanLimit: 3, history: false, batch: false, insights: false },
  free: { scanLimit: 5, history: false, batch: false, insights: false },
  pro: { scanLimit: null, history: true, batch: true, insights: true },
} as const;

export type PlanName = keyof typeof PLANS;
export type UserPlan = Exclude<PlanName, "visitor">;
export type UpgradeTarget = "account" | "pro";

export type Quota = {
  plan: PlanName;
  used: number;
  limit: number | null;
  remaining: number | null;
};

export function buildQuota(plan: PlanName, used: number): Quota {
  const limit = PLANS[plan].scanLimit;
  return { plan, used, limit, remaining: limit === null ? null : Math.max(limit - used, 0) };
}

export function upgradeTarget(plan: PlanName): UpgradeTarget | null {
  if (plan === "visitor") return "account";
  if (plan === "free") return "pro";
  return null;
}

export function quotaLabel(quota: Quota): string {
  if (quota.remaining === null) return "Pro · unlimited";
  const noun = quota.plan === "visitor" ? "free scan" : "scan";
  return `${quota.remaining} ${noun}${quota.remaining === 1 ? "" : "s"} left`;
}
