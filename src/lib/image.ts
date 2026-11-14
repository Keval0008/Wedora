/**
 * Shrinks a phone photo before upload: longest side 1600 px, JPEG ~0.75.
 * A 4 MB camera photo becomes roughly 200–400 KB, still sharp enough to read
 * a slip or a UPI screenshot.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.75): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  if (!bitmap) {
    // The browser can't decode it (e.g. HEIC on desktop Chrome): send as is if small enough.
    if (file.size <= 3 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    throw new Error("This photo format can't be read here. Take a screenshot of it and attach that instead.");
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  // JPEG has no transparency: paint white first so PNG screenshots don't turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  return blob ?? file;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === "function") {
    try {
      // Respect the camera's rotation so portrait slips don't come out sideways.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to <img>, which some Safari versions decode better.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally {
    // Revoked after decoding; the image element keeps its pixels.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
