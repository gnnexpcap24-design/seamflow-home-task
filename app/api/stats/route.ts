import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { requirePlan } from "@/lib/auth/require-plan";
import { getStats } from "@/lib/scans/repository";

export async function GET(): Promise<NextResponse> {
  try {
    const check = await requirePlan("pro");
    if ("response" in check) return check.response;
    return NextResponse.json(await getStats(check.identity.userId));
  } catch (error) {
    console.error("Could not load stats", { message: error instanceof Error ? error.message : "Unknown" });
    return errorResponse("server_error");
  }
}
