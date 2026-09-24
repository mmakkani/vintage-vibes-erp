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
    cleanBackground?: boolean;
    cleanTolerance?: number;
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

  // Lightweight Studio Background Cleaner:
  // Converts external table/floor background and holding fingers to crisp studio white (#FFFFFF)
  if (options.cleanBackground !== false) {
    try {
      cleanGarmentCanvasBackground(outCtx, outW, outH, options.cleanTolerance ?? 28);
    } catch (_) {}
  }

  return {
    croppedImageUrl: outCanvas.toDataURL('image/jpeg', 0.90),
    didCrop: true,
    bounds: { x: cropX, y: cropY, width: cropW, height: cropH }
  };
}

/**
 * Lightweight Canvas Studio Background Cleaner
 * Isolates the garment by flood-filling external background pixels and holding fingers
 * from the outer edges and brightening them to a clean high-key studio white (#FFFFFF).
 */
export function cleanGarmentCanvasBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tolerance: number = 28
): void {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // 1. Sample perimeter border pixels (outer 3%) to establish the ambient surface color
    let bgR = 0, bgG = 0, bgB = 0, count = 0;
    const border = Math.max(2, Math.floor(Math.min(width, height) * 0.03));

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (y < border || y >= height - border || x < border || x >= width - border) {
          const idx = (y * width + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          if (!isSkin(r, g, b)) {
            bgR += r;
            bgG += g;
            bgB += b;
            count++;
          }
        }
      }
    }

    if (count > 0) {
      bgR /= count;
      bgG /= count;
      bgB /= count;
    } else {
      bgR = 240; bgG = 240; bgB = 240;
    }

    // 2. BFS flood fill starting strictly from all 4 image borders
    const isBg = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;

    const pushSeed = (x: number, y: number) => {
      const pIdx = y * width + x;
      if (isBg[pIdx] === 0) {
        const dIdx = pIdx * 4;
        const r = data[dIdx], g = data[dIdx + 1], b = data[dIdx + 2];
        if (isSkin(r, g, b) || colorDiff(r, g, b, bgR, bgG, bgB) <= tolerance) {
          isBg[pIdx] = 1;
          queue[tail++] = pIdx;
        }
      }
    };

    // Push top & bottom borders
    for (let x = 0; x < width; x++) {
      pushSeed(x, 0);
      pushSeed(x, height - 1);
    }
    // Push left & right borders
    for (let y = 0; y < height; y++) {
      pushSeed(0, y);
      pushSeed(width - 1, y);
    }

    // Expand flood fill inwards (4-way connectivity)
    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % width;
      const cy = Math.floor(curr / width);

      const neighbors = [
        cx > 0 ? curr - 1 : -1,
        cx < width - 1 ? curr + 1 : -1,
        cy > 0 ? curr - width : -1,
        cy < height - 1 ? curr + width : -1
      ];

      for (let i = 0; i < 4; i++) {
        const n = neighbors[i];
        if (n !== -1 && isBg[n] === 0) {
          const nD = n * 4;
          const nr = data[nD], ng = data[nD + 1], nb = data[nD + 2];
          if (isSkin(nr, ng, nb) || colorDiff(nr, ng, nb, bgR, bgG, bgB) <= tolerance) {
            isBg[n] = 1;
            queue[tail++] = n;
          }
        }
      }
    }

    // 3. Convert all detected exterior background pixels to clean studio white with subtle edge feather
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pIdx = y * width + x;
        const dIdx = pIdx * 4;

        if (isBg[pIdx] === 1) {
          // Direct background pixel -> crisp clean studio white
          data[dIdx] = 255;
          data[dIdx + 1] = 255;
          data[dIdx + 2] = 255;
        } else {
          // Check if adjacent to background for soft anti-aliased edge
          const hasBgNeighbor =
            (x > 0 && isBg[pIdx - 1] === 1) ||
            (x < width - 1 && isBg[pIdx + 1] === 1) ||
            (y > 0 && isBg[pIdx - width] === 1) ||
            (y < height - 1 && isBg[pIdx + width] === 1);

          if (hasBgNeighbor) {
            const r = data[dIdx], g = data[dIdx + 1], b = data[dIdx + 2];
            const diff = colorDiff(r, g, b, bgR, bgG, bgB);
            if (diff <= tolerance + 10) {
              const alpha = Math.max(0, Math.min(1, (diff - (tolerance - 5)) / 15));
              data[dIdx] = Math.round(r * alpha + 255 * (1 - alpha));
              data[dIdx + 1] = Math.round(g * alpha + 255 * (1 - alpha));
              data[dIdx + 2] = Math.round(b * alpha + 255 * (1 - alpha));
            }
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  } catch (err) {
    console.warn('[GarmentCropper] Background cleanup notice:', err);
  }
}

/**
 * Direct Image URL / Base64 Background Cleaning Utility
 */
export async function cleanGarmentBackground(
  imageDataUrl: string,
  tolerance: number = 28
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return imageDataUrl;
  }
  try {
    const img = await loadImage(imageDataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w <= 20 || h <= 20) return imageDataUrl;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return imageDataUrl;

    ctx.drawImage(img, 0, 0, w, h);
    cleanGarmentCanvasBackground(ctx, w, h, tolerance);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return imageDataUrl;
  }
}
