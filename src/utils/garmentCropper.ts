/**
 * Smart Garment & Apparel Auto-Isolation Utility
 * Isolates T-Shirts, Hoodies, Vintage Garments, and Clothing Tags from
 * background sorting tables, warehouse floors, and workers' hands/fingers.
 */

import { loadImage } from './documentCropper.ts';

/**
 * Detects human skin tone to filter out hands and fingers holding the apparel.
 */
function isSkin(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  return (
    r > 80 &&
    g > 35 &&
    b > 15 &&
    r > g &&
    g > b &&
    r - g >= 12 &&
    delta >= 15 &&
    r / (g + 0.001) < 2.5
  );
}

/**
 * Calculates Euclidean color distance
 */
function colorDiff(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);
}

/**
 * Automatically detects the bounding box of a garment/t-shirt within an image,
 * strips away surrounding floor/table/hands, and returns a tightly focused crop.
 */
export async function autoCropGarment(
  imageDataUrl: string,
  options: {
    targetWidth?: number;
    targetHeight?: number;
    paddingRatio?: number;
    minSubjectRatio?: number;
  } = {}
): Promise<{ croppedImageUrl: string; didCrop: boolean; bounds: { x: number; y: number; width: number; height: number } }> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { croppedImageUrl: imageDataUrl, didCrop: false, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  }

  const img = await loadImage(imageDataUrl);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  if (origW <= 50 || origH <= 50) {
    return { croppedImageUrl: imageDataUrl, didCrop: false, bounds: { x: 0, y: 0, width: origW, height: origH } };
  }

  // Downsample to fast analysis grid (max dimension 400px)
  const maxDim = 400;
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const workW = Math.round(origW * scale);
  const workH = Math.round(origH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = workW;
  canvas.height = workH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { croppedImageUrl: imageDataUrl, didCrop: false, bounds: { x: 0, y: 0, width: origW, height: origH } };
  }

  ctx.drawImage(img, 0, 0, workW, workH);
  const imgData = ctx.getImageData(0, 0, workW, workH);
  const data = imgData.data;

  // 1. Sample perimeter border pixels (top, bottom, left, right 3%) to model background
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  const borderSize = Math.max(2, Math.floor(Math.min(workW, workH) * 0.04));

  for (let y = 0; y < workH; y++) {
    for (let x = 0; x < workW; x++) {
      if (y < borderSize || y >= workH - borderSize || x < borderSize || x >= workW - borderSize) {
        const idx = (y * workW + x) * 4;
        // Don't include skin pixels in background calculation
        if (!isSkin(data[idx], data[idx + 1], data[idx + 2])) {
          bgR += data[idx];
          bgG += data[idx + 1];
          bgB += data[idx + 2];
          bgCount++;
        }
      }
    }
  }

  if (bgCount > 0) {
    bgR /= bgCount;
    bgG /= bgCount;
    bgB /= bgCount;
  } else {
    bgR = 40; bgG = 40; bgB = 40;
  }

  // 2. Identify Garment Foreground:
  // Foreground pixels are:
  // (a) Significantly different from the perimeter background (> 28 color distance)
  // (b) NOT human skin (hands/fingers holding the shirt)
  const fgMask = new Uint8Array(workW * workH);
  for (let y = 0; y < workH; y++) {
    for (let x = 0; x < workW; x++) {
      const idx = (y * workW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (isSkin(r, g, b)) {
        fgMask[y * workW + x] = 0; // Mask out hands/fingers
      } else {
        const diff = colorDiff(r, g, b, bgR, bgG, bgB);
        if (diff > 26) {
          fgMask[y * workW + x] = 1;
        }
      }
    }
  }

  // 3. Row and Column projections to isolate the main garment body
  const rowDensities = new Float32Array(workH);
  for (let y = 0; y < workH; y++) {
    let count = 0;
    for (let x = 0; x < workW; x++) {
      if (fgMask[y * workW + x] === 1) count++;
    }
    rowDensities[y] = count / workW;
  }

  const colDensities = new Float32Array(workW);
  for (let x = 0; x < workW; x++) {
    let count = 0;
    for (let y = 0; y < workH; y++) {
      if (fgMask[y * workW + x] === 1) count++;
    }
    colDensities[x] = count / workH;
  }

  // Garment presence threshold (at least 15% of width/height)
  const THRESHOLD = 0.15;

  let top = 0;
  for (let y = 0; y < workH; y++) {
    if (rowDensities[y] > THRESHOLD) {
      top = Math.max(0, y - 2);
      break;
    }
  }

  let bottom = workH - 1;
  for (let y = workH - 1; y >= 0; y--) {
    if (rowDensities[y] > THRESHOLD) {
      bottom = Math.min(workH - 1, y + 2);
      break;
    }
  }

  let left = 0;
  for (let x = 0; x < workW; x++) {
    if (colDensities[x] > THRESHOLD) {
      left = Math.max(0, x - 2);
      break;
    }
  }

  let right = workW - 1;
  for (let x = workW - 1; x >= 0; x--) {
    if (colDensities[x] > THRESHOLD) {
      right = Math.min(workW - 1, x + 2);
      break;
    }
  }

  // Check if detected subject covers a significant portion
  const subjectW = right - left;
  const subjectH = bottom - top;
  const minRatio = options.minSubjectRatio ?? 0.25;

  let cropX: number, cropY: number, cropW: number, cropH: number;

  if (subjectW < workW * minRatio || subjectH < workH * minRatio) {
    // If foreground detection is too ambiguous (e.g. solid white shirt on white background),
    // apply centered 88% crop to trim outer camera clutter
    const margin = 0.06;
    cropX = Math.round(origW * margin);
    cropY = Math.round(origH * margin);
    cropW = Math.round(origW * (1 - margin * 2));
    cropH = Math.round(origH * (1 - margin * 2));
  } else {
    // Add small padding margin (default: 3%)
    const pad = options.paddingRatio ?? 0.03;
    const padX = Math.round(subjectW * pad);
    const padY = Math.round(subjectH * pad);

    const safeLeft = Math.max(0, left - padX);
    const safeTop = Math.max(0, top - padY);
    const safeRight = Math.min(workW, right + padX);
    const safeBottom = Math.min(workH, bottom + padY);

    cropX = Math.round(safeLeft / scale);
    cropY = Math.round(safeTop / scale);
    cropW = Math.round((safeRight - safeLeft) / scale);
    cropH = Math.round((safeBottom - safeTop) / scale);
  }

  // Clamp within original image
  cropX = Math.max(0, Math.min(origW - 50, cropX));
  cropY = Math.max(0, Math.min(origH - 50, cropY));
  cropW = Math.max(50, Math.min(origW - cropX, cropW));
  cropH = Math.max(50, Math.min(origH - cropY, cropH));

  // Render cropped garment output
  const outW = options.targetWidth || (cropW > 1200 ? 1200 : cropW);
  const outH = options.targetHeight || Math.round(outW * (cropH / cropW));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    return { croppedImageUrl: imageDataUrl, didCrop: false, bounds: { x: cropX, y: cropY, width: cropW, height: cropH } };
  }

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  // Subtle vibrance / contrast polish for vintage textures & stitching
  try {
    const outData = outCtx.getImageData(0, 0, outW, outH);
    const d = outData.data;
    const contrast = 1.05;
    const intercept = 128 * (1 - contrast);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, d[i] * contrast + intercept));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] * contrast + intercept));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] * contrast + intercept));
    }
    outCtx.putImageData(outData, 0, 0);
  } catch (_) {}

  return {
    croppedImageUrl: outCanvas.toDataURL('image/jpeg', 0.90),
    didCrop: true,
    bounds: { x: cropX, y: cropY, width: cropW, height: cropH }
  };
}
