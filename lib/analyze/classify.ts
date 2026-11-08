import OpenAI, { type APIError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIClient, getVisionModel } from "@/lib/openai";
import { AnalyzeError } from "@/lib/analyze/errors";
import { SYSTEM_PROMPT, USER_PROMPT } from "@/lib/analyze/prompt";
import { AnalysisSchema, ModelOutputSchema, type Analysis } from "@/lib/analyze/schema";

export type ImageInput = { buffer: Buffer; mimeType: string };
type Deps = { client?: OpenAI; retryDelayMs?: number };

const IMAGE_DETAIL = "auto" as const;
const DEFAULT_RETRY_DELAY_MS = 500;

class InvalidModelOutputError extends Error {}

export async function classifyImage(image: ImageInput, deps: Deps = {}): Promise<Analysis> {
  const client = deps.client ?? getOpenAIClient();
  const model = getVisionModel();
  try {
    return await requestVerdict(client, model, image);
  } catch (firstError) {
    if (!isRetryable(firstError)) throw toAnalyzeError(firstError);
    await sleep(deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    try {
      return await requestVerdict(client, model, image);
    } catch (secondError) {
      throw toAnalyzeError(secondError);
    }
  }
}

async function requestVerdict(client: OpenAI, model: string, image: ImageInput): Promise<Analysis> {
  const dataUrl = `data:${image.mimeType};base64,${image.buffer.toString("base64")}`;
  const response = await client.responses.parse({
    model,
    instructions: SYSTEM_PROMPT,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: USER_PROMPT },
          { type: "input_image", image_url: dataUrl, detail: IMAGE_DETAIL },
        ],
      },
    ],
    text: { format: zodTextFormat(ModelOutputSchema, "hot_dog_analysis") },
  });
  if (hasRefusal(response.output)) throw new AnalyzeError("image_rejected");
  const parsed = AnalysisSchema.safeParse(response.output_parsed);
  if (!parsed.success) throw new InvalidModelOutputError("Model output failed validation");
  return parsed.data;
}

function hasRefusal(output: OpenAI.Responses.ResponseOutputItem[]): boolean {
  return output.some(
    (item) => item.type === "message" && item.content.some((part) => part.type === "refusal"),
  );
}

function isTimeout(error: unknown): boolean {
  return error instanceof OpenAI.APIConnectionTimeoutError;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof InvalidModelOutputError) return true;
  if (isTimeout(error)) return false;
  if (error instanceof OpenAI.APIConnectionError) return true;
  return error instanceof OpenAI.APIError && (error.status === 429 || (error.status ?? 0) >= 500);
}

function isImageProblem(error: APIError): boolean {
  return error.status === 400 && /image|content_policy/i.test(error.code ?? "");
}

function toAnalyzeError(error: unknown): AnalyzeError {
  if (error instanceof AnalyzeError) return error;
  logFailure(error);
  if (isTimeout(error)) return new AnalyzeError("timeout");
  if (error instanceof OpenAI.APIError && isImageProblem(error)) {
    return new AnalyzeError("image_rejected");
  }
  return new AnalyzeError("model_error");
}

// Logs the failure type only. Never the image, the data URL, or secrets.
function logFailure(error: unknown): void {
  const details =
    error instanceof OpenAI.APIError
      ? { name: error.name, status: error.status, code: error.code }
      : { name: error instanceof Error ? error.name : "Unknown" };
  console.error("Image classification failed", details);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
