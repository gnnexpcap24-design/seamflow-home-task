import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { getAuthUser, resolveIdentity } from "@/lib/auth/identity";
import { getQuota } from "@/lib/quota";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getAuthUser();
    const identity = await resolveIdentity(user);
    return NextResponse.json({
      authenticated: user !== null,
      plan: identity.plan,
      quota: await getQuota(identity),
    });
  } catch (error) {
    console.error("Could not load /api/me", { message: error instanceof Error ? error.message : "Unknown" });
    return errorResponse("server_error");
  }
}
