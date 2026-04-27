/**
 * camera.js — receipt photo capture + client-side image compression.
 *
 * iPhones produce ~4 MB HEIC/JPEG photos. We resize to max 1280px wide and
 * re-encode JPEG at 0.75 quality before uploading. Net effect: ~150 KB
 * receipts → faster upload, smaller storage, less of Tyler's data plan.
 *
 * Uses OffscreenCanvas where available (faster), falls back to <canvas>.
 */

const MAX_WIDTH = 1280;
const QUALITY = 0.75;

/**
 * Compress an image File/Blob to a JPEG Blob.
 * Returns the original blob unchanged if anything fails (better than nothing).
 *
 * @param {Blob} file — input image (any browser-decodable format)
 * @returns {Promise<Blob>} compressed JPEG
 */
export async function compressImage(file) {
  if (!file) throw new Error("No file provided");
  try {
    const bitmap = await loadBitmap(file);
    const ratio = Math.min(1, MAX_WIDTH / bitmap.width);
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);

    let blob;
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, w, h);
      blob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: QUALITY,
      });
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, w, h);
      blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          "image/jpeg",
          QUALITY,
        ),
      );
    }
    return blob;
  } catch (e) {
    console.warn("[camera] compress failed, using original:", e);
    return file;
  }
}

/**
 * Build a data URL preview for the sheet UI.
 * Used right after capture, before upload completes.
 */
export function makePreview(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function loadBitmap(file) {
  // createImageBitmap handles HEIC on iOS via the system decoder
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }
  // Fallback via HTMLImageElement
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
