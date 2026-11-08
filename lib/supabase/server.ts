import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";

// Cookie-based client acting as the signed-in user (publishable key, Row Level Security applies).
export async function getServerClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component, which cannot set cookies. The proxy refreshes the session.
          }
        },
      },
    },
  );
}
