import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOpenAIClient, getVisionModel } from "@/lib/openai";
import { getAdminClient } from "@/lib/supabase/admin";

const VARS = [
  "OPENAI_API_KEY",
  "OPENAI_VISION_MODEL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

describe("lib clients", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_VISION_MODEL = "test-model";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  });

  afterEach(() => {
    VARS.forEach((name) => delete process.env[name]);
  });

  it("builds the OpenAI client and reads the model from env", () => {
    expect(getOpenAIClient().models).toBeDefined();
    expect(getVisionModel()).toBe("test-model");
  });

  it("builds the admin Supabase client", () => {
    expect(getAdminClient().from).toBeTypeOf("function");
  });

  it("fails clearly when the OpenAI key is missing", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => getOpenAIClient()).toThrow("OPENAI_API_KEY");
  });

  it("fails clearly when the service role key is missing", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getAdminClient()).toThrow("SUPABASE_SERVICE_ROLE_KEY");
  });
});
