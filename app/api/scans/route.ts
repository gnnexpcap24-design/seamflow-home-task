import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-response";
import { requirePlan } from "@/lib/auth/require-plan";
import { decodeCursor } from "@/lib/scans/cursor";
import { listScans } from "@/lib/scans/repository";
import { HISTORY_MAX_PAGE_SIZE, HISTORY_PAGE_SIZE } from "@/lib/scans/shared";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).default(HISTORY_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
  verdict: z.enum(["hot_dog", "not_hot_dog"]).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const check = await requirePlan("pro");
    if ("response" in check) return check.response;

    const query = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return errorResponse("invalid_request");
    const cursor = query.data.cursor ? decodeCursor(query.data.cursor) : undefined;
    if (cursor === null) return errorResponse("invalid_request");

    const page = await listScans(check.identity.userId, {
      limit: Math.min(query.data.limit, HISTORY_MAX_PAGE_SIZE),
      cursor,
      verdict: query.data.verdict,
    });
    return NextResponse.json(page);
  } catch (error) {
    console.error("Could not list scans", { message: error instanceof Error ? error.message : "Unknown" });
    return errorResponse("server_error");
  }
}
