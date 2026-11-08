import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { z } from "zod";

export const VISITOR_COOKIE = "hdn_vid";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function readVisitorId(): Promise<string | null> {
  const value = (await cookies()).get(VISITOR_COOKIE)?.value;
  return z.uuid().safeParse(value).success ? (value as string) : null;
}

// The cookie holds only a random id. The scan count lives on the server, so it cannot be edited.
export function setVisitorCookie(response: NextResponse, visitorId: string): void {
  response.cookies.set(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}
