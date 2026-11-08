import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-response";
import { requirePlan } from "@/lib/auth/require-plan";
import { deleteScan } from "@/lib/scans/repository";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Context): Promise<NextResponse> {
  try {
    const check = await requirePlan("pro");
    if ("response" in check) return check.response;

    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return errorResponse("invalid_request");
    // Someone else's scan looks exactly like a scan that does not exist.
    if (!(await deleteScan(check.identity.userId, id.data))) return errorResponse("not_found");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Could not delete scan", { message: error instanceof Error ? error.message : "Unknown" });
    return errorResponse("server_error");
  }
}
