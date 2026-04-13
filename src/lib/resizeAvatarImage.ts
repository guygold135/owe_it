const DEFAULT_MAX_EDGE = 512;
const DEFAULT_QUALITY = 0.88;

/** Downscale and encode as JPEG for predictable size and storage compatibility. */
export async function resizeImageToJpegBlob(
  file: File,
  maxEdge = DEFAULT_MAX_EDGE,
  quality = DEFAULT_QUALITY,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const w = bitmap.width;
    const h = bitmap.height;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare image.');
    ctx.drawImage(bitmap, 0, 0, tw, th);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    );
    if (!blob) throw new Error('Could not encode image.');
    return blob;
  } finally {
    bitmap.close();
  }
}
