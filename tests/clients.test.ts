import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOpenAIClient, getVisionModel } from "@/lib/openai";
import { getSupabaseClient } from "@/lib/supabase";

const VARS = [
  "OPENAI_API_KEY",
  "OPENAI_VISION_MODEL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

describe("lib clients", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_VISION_MODEL = "test-model";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable";
  });

  afterEach(() => {
    VARS.forEach((name) => delete process.env[name]);
  });

  it("builds the OpenAI client and reads the model from env", () => {
    expect(getOpenAIClient().models).toBeDefined();
    expect(getVisionModel()).toBe("test-model");
  });

  it("builds the Supabase client", () => {
    expect(getSupabaseClient().from).toBeTypeOf("function");
  });

  it("fails clearly when the OpenAI key is missing", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => getOpenAIClient()).toThrow("OPENAI_API_KEY");
  });

  it("fails clearly when the Supabase URL is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => getSupabaseClient()).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });
});
