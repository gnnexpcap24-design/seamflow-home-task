const MAX_SIDE = 1500;
const TARGET_BYTES = 1024 * 1024;
const HARD_LIMIT_BYTES = 3.5 * 1024 * 1024;
const QUALITIES = [0.85, 0.7, 0.55];

export class CompressionError extends Error {}

export function scaleToFit(width: number, height: number, maxSide: number) {
  const ratio = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new CompressionError("Could not encode image"))),
      "image/jpeg",
      quality,
    );
  });
}

async function drawScaled(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = scaleToFit(bitmap.width, bitmap.height, MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new CompressionError("Canvas is not available");
  context.fillStyle = "#ffffff"; // JPEG has no transparency
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas;
}

// Resizes to at most 1500 px and re-encodes as JPEG, lowering quality until under 1 MB.
export async function compressImage(file: File): Promise<File> {
  let canvas: HTMLCanvasElement;
  try {
    canvas = await drawScaled(file);
  } catch (error) {
    if (error instanceof CompressionError) throw error;
    throw new CompressionError("This image could not be read");
  }
  let blob = await encodeJpeg(canvas, QUALITIES[0]);
  for (const quality of QUALITIES.slice(1)) {
    if (blob.size <= TARGET_BYTES) break;
    blob = await encodeJpeg(canvas, quality);
  }
  if (blob.size > HARD_LIMIT_BYTES) throw new CompressionError("This image is too large to upload");
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}
