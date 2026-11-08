import { describe, expect, it } from "vitest";
import {
  MAX_PICK_BYTES,
  MAX_UPLOAD_BYTES,
  matchesMagicBytes,
  validateFileMeta,
} from "@/lib/validation/file";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const PDF = new TextEncoder().encode("%PDF-1.7 fake");

describe("validateFileMeta", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (type) => {
    expect(validateFileMeta({ type, size: 1000 }, MAX_UPLOAD_BYTES)).toBeNull();
  });

  it.each(["image/gif", "application/pdf", "text/plain", ""])("rejects %s", (type) => {
    expect(validateFileMeta({ type, size: 1000 }, MAX_UPLOAD_BYTES)).toBe("unsupported_type");
  });

  it("rejects files over the limit and accepts files at the limit", () => {
    expect(validateFileMeta({ type: "image/png", size: MAX_UPLOAD_BYTES + 1 }, MAX_UPLOAD_BYTES)).toBe("file_too_large");
    expect(validateFileMeta({ type: "image/png", size: MAX_UPLOAD_BYTES }, MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("allows picking up to 10 MB in the browser", () => {
    expect(validateFileMeta({ type: "image/jpeg", size: MAX_PICK_BYTES }, MAX_PICK_BYTES)).toBeNull();
    expect(validateFileMeta({ type: "image/jpeg", size: MAX_PICK_BYTES + 1 }, MAX_PICK_BYTES)).toBe("file_too_large");
  });
});

describe("matchesMagicBytes", () => {
  it("accepts real signatures", () => {
    expect(matchesMagicBytes(JPEG, "image/jpeg")).toBe(true);
    expect(matchesMagicBytes(PNG, "image/png")).toBe(true);
    expect(matchesMagicBytes(WEBP, "image/webp")).toBe(true);
  });

  it("rejects a PNG whose bytes are not PNG", () => {
    expect(matchesMagicBytes(PDF, "image/png")).toBe(false);
    expect(matchesMagicBytes(JPEG, "image/png")).toBe(false);
  });

  it("rejects a RIFF file that is not WebP", () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]);
    expect(matchesMagicBytes(wav, "image/webp")).toBe(false);
  });
});
