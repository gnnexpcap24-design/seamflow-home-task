import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { getAuthUser } from "@/lib/auth/identity";
import { downgradeToFree } from "@/lib/billing";

// Demo action only: lets testers go back to the free plan and repeat the upgrade flow.
export async function POST(): Promise<NextResponse> {
  try {
    const user = await getAuthUser();
    if (!user) return errorResponse("unauthorized");
    await downgradeToFree(user.id);
    return NextResponse.json({ plan: "free" });
  } catch (error) {
    console.error("Downgrade failed", { message: error instanceof Error ? error.message : "Unknown" });
    return errorResponse("server_error");
  }
}
