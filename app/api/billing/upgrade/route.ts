import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-response";
import { getAuthUser } from "@/lib/auth/identity";
import { upgradeToPro } from "@/lib/billing";

const BodySchema = z.object({
  company: z.string().trim().min(1).max(100),
  billingEmail: z.email().max(254),
});

// Demo checkout. Idempotent: upgrading a Pro account again just refreshes the billing details.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getAuthUser();
    if (!user) return errorResponse("unauthorized");
    const body = BodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return errorResponse("invalid_request");
    await upgradeToPro(user.id, body.data);
    return NextResponse.json({ plan: "pro" });
  } catch (error) {
    console.error("Upgrade failed", { message: error instanceof Error ? error.message : "Unknown" });
    return errorResponse("server_error");
  }
}
