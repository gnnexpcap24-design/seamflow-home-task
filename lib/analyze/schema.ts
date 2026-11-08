import { z } from "zod";

export const LOW_CONFIDENCE_THRESHOLD = 0.7;
export const MAX_REASON_LENGTH = 200;

// Sent to OpenAI. Plain types only: structured outputs may ignore range and length keywords.
export const ModelOutputSchema = z.object({
  verdict: z.enum(["hot_dog", "not_hot_dog"]),
  confidence: z.number(),
  reason: z.string(),
});

// Applied to the parsed output. This is the contract from Spec 01.
export const AnalysisSchema = z.object({
  verdict: z.enum(["hot_dog", "not_hot_dog"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(MAX_REASON_LENGTH),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export type Verdict = Analysis["verdict"];

export type AnalyzeResponse = Analysis & {
  lowConfidence: boolean;
  analyzedAt: string;
  saved: boolean;
  scanId?: string;
};
