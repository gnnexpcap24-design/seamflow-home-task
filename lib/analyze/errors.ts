export type ApiErrorCode =
  | "missing_file"
  | "unsupported_type"
  | "file_too_large"
  | "image_rejected"
  | "rate_limited"
  | "model_error"
  | "timeout"
  | "quota_exceeded"
  | "unauthorized"
  | "pro_required"
  | "invalid_request"
  | "server_error";

export const API_ERRORS: Record<ApiErrorCode, { status: number; message: string }> = {
  missing_file: { status: 400, message: "No image was received. Choose an image and try again." },
  unsupported_type: {
    status: 415,
    message: "This file type is not supported. Use a JPEG, PNG or WebP image.",
  },
  file_too_large: { status: 413, message: "This image is too large. Choose a smaller image." },
  image_rejected: {
    status: 422,
    message: "We couldn't analyze this image. It may be unreadable or not allowed. Try a different image.",
  },
  rate_limited: {
    status: 429,
    message: "Too many requests. Wait a moment and try again.",
  },
  model_error: {
    status: 502,
    message: "The analysis service is unavailable right now. Please try again.",
  },
  timeout: { status: 504, message: "The analysis took too long. Please try again." },
  quota_exceeded: { status: 403, message: "You have used all the scans included in your plan." },
  unauthorized: { status: 401, message: "Sign in to continue." },
  pro_required: { status: 403, message: "This feature is part of the Pro plan." },
  invalid_request: {
    status: 400,
    message: "Some of the details are not valid. Check them and try again.",
  },
  server_error: { status: 500, message: "Something went wrong on our side. Please try again." },
};

export type AnalyzeErrorCode = Extract<ApiErrorCode, "image_rejected" | "model_error" | "timeout">;

export class AnalyzeError extends Error {
  constructor(public readonly code: AnalyzeErrorCode) {
    super(code);
    this.name = "AnalyzeError";
  }
}
