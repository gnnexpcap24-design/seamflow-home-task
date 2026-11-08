export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedType = (typeof ALLOWED_TYPES)[number];

export const MAX_PICK_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAGIC_BYTES_LENGTH = 12;

export type FileProblem = "unsupported_type" | "file_too_large";

export function isAllowedType(type: string): type is AllowedType {
  return (ALLOWED_TYPES as readonly string[]).includes(type);
}

// Works in the browser and on the server: checks only what the file object reports.
export function validateFileMeta(
  file: { type: string; size: number },
  maxBytes: number,
): FileProblem | null {
  if (!isAllowedType(file.type)) return "unsupported_type";
  if (file.size > maxBytes) return "file_too_large";
  return null;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

// Checks that the leading bytes really are the claimed image type.
export function matchesMagicBytes(bytes: Uint8Array, type: AllowedType): boolean {
  if (type === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (type === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  return startsWith(bytes, riff) && startsWith(bytes, webp, 8);
}
