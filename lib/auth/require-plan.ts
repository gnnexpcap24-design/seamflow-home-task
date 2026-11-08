import type { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { getAuthUser, resolveIdentity, type UserIdentity } from "@/lib/auth/identity";

type PlanCheck = { identity: UserIdentity } | { response: NextResponse };

// Returns the signed-in user, or the 401 / 403 response to send back.
export async function requirePlan(required: "pro"): Promise<PlanCheck> {
  const user = await getAuthUser();
  if (!user) return { response: errorResponse("unauthorized") };
  const identity = await resolveIdentity(user);
  if (identity.kind !== "user" || identity.plan !== required) {
    return { response: errorResponse("pro_required") };
  }
  return { identity };
}
