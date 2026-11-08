import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-response";
import { requirePlan } from "@/lib/auth/require-plan";
import { toggleFlag } from "@/lib/scans/repository";

type Context = { params: Promise<{ id: string }> };

// Marks or unmarks "this result was wrong" on the owner's scan.
export async function POST(_request: Request, { params }: Context): Promise<NextResponse> {
  try {
    const check = await requirePlan("pro");
    if ("response" in check) return check.response;

    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return errorResponse("invalid_request");
    const flagged = await toggleFlag(check.identity.userId, id.data);
    if (flagged === null) return errorResponse("not_found");
    return NextResponse.json({ flagged });
  } catch (error) {
    console.error("Could not flag scan", { message: error instanceof Error ? error.message : "Unknown" });
    return errorResponse("server_error");
  }
}
