const MAX_LENGTH = 100;
const FALLBACK = "image";

// File names come from users: strip path and control characters and limit the length.
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_LENGTH)
    .trim();
  return cleaned || FALLBACK;
}
