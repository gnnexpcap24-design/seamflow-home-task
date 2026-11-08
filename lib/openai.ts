import OpenAI from "openai";
import { requireEnv } from "@/lib/env";

const TIMEOUT_MS = 20_000;

// maxRetries is 0 because classifyImage owns the retry policy.
export function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY"), timeout: TIMEOUT_MS, maxRetries: 0 });
}

export function getVisionModel(): string {
  return requireEnv("OPENAI_VISION_MODEL");
}
