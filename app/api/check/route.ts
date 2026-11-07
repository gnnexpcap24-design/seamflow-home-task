import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

type CheckResult = { ok: boolean; detail: string };

async function checkOpenAI(): Promise<CheckResult> {
  try {
    const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY"), timeout: 10_000 });
    const model = await client.models.retrieve(requireEnv("OPENAI_VISION_MODEL"));
    return { ok: true, detail: `Model available: ${model.id}` };
  } catch (error) {
    console.error("OpenAI check failed:", error instanceof Error ? error.message : error);
    return { ok: false, detail: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function checkSupabase(): Promise<CheckResult> {
  try {
    const supabase = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    );
    const { error } = await supabase.from("scans").select("id", { head: true, count: "exact" });
    if (error?.code === "PGRST205") {
      return { ok: true, detail: "Connected, but table 'scans' does not exist yet" };
    }
    if (error) throw new Error(`${error.message} | ${error.details}`);
    return { ok: true, detail: "Connected, table 'scans' reachable" };
  } catch (error) {
    console.error("Supabase check failed:", error instanceof Error ? error.message : error);
    return { ok: false, detail: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function GET() {
  const [openai, supabase] = await Promise.all([checkOpenAI(), checkSupabase()]);
  return Response.json({ openai, supabase }, { status: openai.ok && supabase.ok ? 200 : 503 });
}
