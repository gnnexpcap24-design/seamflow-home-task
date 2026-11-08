import { NextResponse } from "next/server";
import { API_ERRORS, type ApiErrorCode } from "@/lib/analyze/errors";

type ErrorOptions = { headers?: HeadersInit; extra?: Record<string, unknown> };

// Every API error uses the same shape: { error: { code, message, ...extra } }.
export function errorResponse(code: ApiErrorCode, { headers, extra }: ErrorOptions = {}): NextResponse {
  const { status, message } = API_ERRORS[code];
  return NextResponse.json({ error: { code, message, ...extra } }, { status, headers });
}
