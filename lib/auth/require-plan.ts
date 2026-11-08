import type { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { getAuthUser, resolveIdentity, type Identity, type UserIdentity } from "@/lib/auth/identity";

type PlanCheck = { identity: UserIdentity } | { response: NextResponse };

// The 401 / 403 response for an identity that lacks the plan, or null when access is allowed.
export function planGate(identity: Identity, required: "pro"): NextResponse | null {
  if (identity.kind === "visitor") return errorResponse("unauthorized");
  return identity.plan === required ? null : errorResponse("pro_required");
}

// Returns the signed-in user, or the 401 / 403 response to send back.
export async function requirePlan(required: "pro"): Promise<PlanCheck> {
  const user = await getAuthUser();
  if (!user) return { response: errorResponse("unauthorized") };
  const identity = await resolveIdentity(user);
  const denied = planGate(identity, required);
  if (denied || identity.kind !== "user") return { response: denied ?? errorResponse("unauthorized") };
  return { identity };
}
