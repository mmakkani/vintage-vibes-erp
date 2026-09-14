/**
 * High-Precision Document Edge Detection, Auto-Cropping & Resizing Utility
 * Automatically isolates Emirates ID, Passports, and Residency Visas from
 * background clutter (tables, desks, hands, fingers, clothes, scanner borders).
 */

export interface AutoCropOptions {
  docType?: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA' | 'AUTO_DETECT';
  targetWidth?: number;
  targetHeight?: number;
  enhanceContrast?: boolean;
}

export interface CardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

// UAE & Standard Document Specifications
export const DOC_SPECS = {
  // ISO/IEC 7810 ID-1 standard card format (85.60 mm × 53.98 mm) = ~1.5858
  EMIRATES_ID: {
    aspectRatio: 1.586,
    defaultWidth: 1200,
    defaultHeight: 757,
    name: 'UAE Emirates ID Card'
  },
  // ISO/IEC 7810 ID-3 standard passport bio page format (~125 mm × 88 mm) = ~1.42
  PASSPORT: {
    aspectRatio: 1.42,
    defaultWidth: 1200,
    defaultHeight: 845,
    name: 'International Passport'
  },
  // UAE Residency A4 / Visa format or card
  RESIDENCY_VISA: {
    aspectRatio: 1.414,
    defaultWidth: 1200,
    defaultHeight: 849,
    name: 'UAE Residency Visa'
  }
};

/**
 * Load an image data URL or URL into an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('Failed to load image for processing: ' + err));
    img.src = src;
  });
}

/**
 * Detects skin tone to mask out fingers, hands, and thumbs holding card edges.
 */
function isSkinPixel(r: number, g: number, b: number): boolean {
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
 * Detects whether a pixel belongs to a plastic/paper document card surface.
 * Emirates ID cards have high luminance (white/off-white plastic) with low-to-medium saturation.
 */
function isCardSurfacePixel(r: number, g: number, b: number): boolean {
  if (isSkinPixel(r, g, b)) return false;

  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Very bright surface (white card base, pale cream, light cyan pattern)
  if (lum > 175) return true;

  // Medium-bright surface with low saturation (gray/white printed areas, micro-patterns)
  if (lum > 130 && delta < 65) return true;

  return false;
}

/**
 * Core Algorithm: Detects the bounding rectangle of the document card
 * using skin-tone rejection, luminance segmentation, row/column projections,
 * Sobel edge refinement, and standard aspect-ratio normalization.
 */
export function detectDocumentBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  docType: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA' | 'AUTO_DETECT' = 'EMIRATES_ID'
): CardBounds {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Binary card mask
  const cardMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (isCardSurfacePixel(data[idx], data[idx + 1], data[idx + 2])) {
        cardMask[y * width + x] = 1;
      }
    }
  }

  // Row and column projections (exclude extreme 2% edges to prevent border noise)
  const marginX = Math.max(2, Math.floor(width * 0.02));
  const marginY = Math.max(2, Math.floor(height * 0.02));

  const rowDensities = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = marginX; x < width - marginX; x++) {
      if (cardMask[y * width + x] === 1) count++;
    }
    rowDensities[y] = count / (width - marginX * 2);
  }

  // Find continuous high-density spans for card presence (threshold: > 18% of line)
  const DENSITY_THRESHOLD = 0.18;

  // Find top edge
  let top = marginY;
  for (let y = marginY; y < height - marginY; y++) {
    if (rowDensities[y] > DENSITY_THRESHOLD) {
      const nextCheck = Math.min(height - 1, y + 5);
      let sustained = true;
      for (let k = y; k <= nextCheck; k++) {
        if (rowDensities[k] < DENSITY_THRESHOLD * 0.6) {
          sustained = false;
          break;
        }
      }
      if (sustained) {
        top = y;
        break;
      }
    }
  }

  // Find bottom edge
  let bottom = height - marginY;
  for (let y = height - marginY - 1; y >= top; y--) {
    if (rowDensities[y] > DENSITY_THRESHOLD) {
      const prevCheck = Math.max(0, y - 5);
      let sustained = true;
      for (let k = y; k >= prevCheck; k--) {
        if (rowDensities[k] < DENSITY_THRESHOLD * 0.6) {
          sustained = false;
          break;
        }
      }
      if (sustained) {
        bottom = y;
        break;
      }
    }
  }

  // Find left edge (within detected Y range)
  let left = marginX;
  for (let x = marginX; x < width - marginX; x++) {
    let countInY = 0;
    const sampleH = Math.max(1, bottom - top);
    for (let y = top; y <= bottom; y++) {
      if (cardMask[y * width + x] === 1) countInY++;
    }
    if (countInY / sampleH > DENSITY_THRESHOLD) {
      left = x;
      break;
    }
  }

  // Find right edge (within detected Y range)
  let right = width - marginX;
  for (let x = width - marginX - 1; x >= left; x--) {
    let countInY = 0;
    const sampleH = Math.max(1, bottom - top);
    for (let y = top; y <= bottom; y++) {
      if (cardMask[y * width + x] === 1) countInY++;
    }
    if (countInY / sampleH > DENSITY_THRESHOLD) {
      right = x;
      break;
    }
  }

  // Sobel Edge Refinement: snap to the sharpest contrast boundary within ±6px
  const getHorizontalGradient = (yCheck: number, x1: number, x2: number) => {
    if (yCheck <= 1 || yCheck >= height - 2) return 0;
    let sumGrad = 0;
    const step = Math.max(1, Math.floor((x2 - x1) / 30));
    for (let x = x1; x <= x2; x += step) {
      const idxAbove = ((yCheck - 1) * width + x) * 4;
      const idxBelow = ((yCheck + 1) * width + x) * 4;
      const lumAbove = 0.299 * data[idxAbove] + 0.587 * data[idxAbove + 1] + 0.114 * data[idxAbove + 2];
      const lumBelow = 0.299 * data[idxBelow] + 0.587 * data[idxBelow + 1] + 0.114 * data[idxBelow + 2];
      sumGrad += Math.abs(lumBelow - lumAbove);
    }
    return sumGrad;
  };

  // Fine-tune top boundary to sharpest gradient
  let bestTop = top;
  let maxTopGrad = -1;
  for (let dy = -6; dy <= 6; dy++) {
    const yCheck = top + dy;
    const g = getHorizontalGradient(yCheck, left, right);
    if (g > maxTopGrad) {
      maxTopGrad = g;
      bestTop = yCheck;
    }
  }
  top = Math.max(0, Math.min(height - 10, bestTop));

  // Fine-tune bottom boundary to sharpest gradient
  let bestBottom = bottom;
  let maxBottomGrad = -1;
  for (let dy = -6; dy <= 6; dy++) {
    const yCheck = bottom + dy;
    const g = getHorizontalGradient(yCheck, left, right);
    if (g > maxBottomGrad) {
      maxBottomGrad = g;
      bestBottom = yCheck;
    }
  }
  bottom = Math.max(top + 10, Math.min(height, bestBottom));

  let boxW = right - left;
  let boxH = bottom - top;

  // Validation: if detected card is too tiny (e.g. less than 15% of frame), fallback to centered 85% frame
  const isReasonable = boxW >= width * 0.25 && boxH >= height * 0.20;
  if (!isReasonable) {
    const spec = DOC_SPECS[docType === 'PASSPORT' ? 'PASSPORT' : docType === 'RESIDENCY_VISA' ? 'RESIDENCY_VISA' : 'EMIRATES_ID'];
    const r = spec.aspectRatio;
    let fallbackW = Math.round(width * 0.85);
    let fallbackH = Math.round(fallbackW / r);
    if (fallbackH > height * 0.85) {
      fallbackH = Math.round(height * 0.85);
      fallbackW = Math.round(fallbackH * r);
    }
    return {
      x: Math.round((width - fallbackW) / 2),
      y: Math.round((height - fallbackH) / 2),
      width: fallbackW,
      height: fallbackH,
      confidence: 0.5
    };
  }

  // Apply standard document aspect ratio centering
  const spec = DOC_SPECS[docType === 'PASSPORT' ? 'PASSPORT' : docType === 'RESIDENCY_VISA' ? 'RESIDENCY_VISA' : 'EMIRATES_ID'];
  const targetRatio = spec.aspectRatio;
  const currentRatio = boxW / boxH;

  if (Math.abs(currentRatio - targetRatio) > 0.05) {
    if (currentRatio > targetRatio) {
      const idealW = Math.round(boxH * targetRatio);
      if (idealW <= width) {
        left = Math.max(0, Math.min(width - idealW, Math.round(left + (boxW - idealW) / 2)));
        boxW = idealW;
      }
    } else {
      const idealH = Math.round(boxW / targetRatio);
      if (idealH <= height) {
        top = Math.max(0, Math.min(height - idealH, Math.round(top + (boxH - idealH) / 2)));
        boxH = idealH;
      }
    }
  }

  return {
    x: Math.max(0, left),
    y: Math.max(0, top),
    width: Math.min(width - Math.max(0, left), boxW),
    height: Math.min(height - Math.max(0, top), boxH),
    confidence: 0.95
  };
}

/**
 * Auto-detects card bounding box, filters out fingers & surrounding table/clothes,
 * and renders a high-definition normalized card image.
 */
export async function autoCropAndResizeDocument(
  imageDataUrl: string,
  options: AutoCropOptions = {}
): Promise<{
  croppedImageUrl: string;
  didCrop: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  originalImageUrl: string;
}> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      croppedImageUrl: imageDataUrl,
      didCrop: false,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      originalImageUrl: imageDataUrl
    };
  }

  const img = await loadImage(imageDataUrl);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  if (origW <= 50 || origH <= 50) {
    return {
      croppedImageUrl: imageDataUrl,
      didCrop: false,
      bounds: { x: 0, y: 0, width: origW, height: origH },
      originalImageUrl: imageDataUrl
    };
  }

  // Downsample to fast analysis canvas (max dimension 500px)
  const maxDim = 500;
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const workW = Math.round(origW * scale);
  const workH = Math.round(origH * scale);

  const workCanvas = document.createElement('canvas');
  workCanvas.width = workW;
  workCanvas.height = workH;
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!workCtx) {
    return {
      croppedImageUrl: imageDataUrl,
      didCrop: false,
      bounds: { x: 0, y: 0, width: origW, height: origH },
      originalImageUrl: imageDataUrl
    };
  }

  workCtx.drawImage(img, 0, 0, workW, workH);

  const docType = options.docType || 'EMIRATES_ID';
  const boundsAnalysis = detectDocumentBounds(workCtx, workW, workH, docType);

  // Map coordinates back to original full resolution
  let cropX = Math.round(boundsAnalysis.x / scale);
  let cropY = Math.round(boundsAnalysis.y / scale);
  let cropW = Math.round(boundsAnalysis.width / scale);
  let cropH = Math.round(boundsAnalysis.height / scale);

  // Ensure within original boundaries
  cropX = Math.max(0, Math.min(origW - 50, cropX));
  cropY = Math.max(0, Math.min(origH - 50, cropY));
  cropW = Math.max(50, Math.min(origW - cropX, cropW));
  cropH = Math.max(50, Math.min(origH - cropY, cropH));

  // Render high-definition output canvas
  const spec = DOC_SPECS[docType === 'PASSPORT' ? 'PASSPORT' : docType === 'RESIDENCY_VISA' ? 'RESIDENCY_VISA' : 'EMIRATES_ID'];
  const outW = options.targetWidth || spec.defaultWidth;
  const outH = options.targetHeight || Math.round(outW / spec.aspectRatio);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    return {
      croppedImageUrl: imageDataUrl,
      didCrop: false,
      bounds: { x: cropX, y: cropY, width: cropW, height: cropH },
      originalImageUrl: imageDataUrl
    };
  }

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';

  // Draw ONLY the detected card rectangle
  outCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  // Contrast & sharpness boost for clear OCR extraction
  if (options.enhanceContrast !== false) {
    try {
      const outData = outCtx.getImageData(0, 0, outW, outH);
      const d = outData.data;
      const contrast = 1.08;
      const intercept = 128 * (1 - contrast);
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, Math.max(0, d[i] * contrast + intercept));
        d[i + 1] = Math.min(255, Math.max(0, d[i + 1] * contrast + intercept));
        d[i + 2] = Math.min(255, Math.max(0, d[i + 2] * contrast + intercept));
      }
      outCtx.putImageData(outData, 0, 0);
    } catch (_) {}
  }

  const croppedDataUrl = outCanvas.toDataURL('image/jpeg', 0.94);

  return {
    croppedImageUrl: croppedDataUrl,
    didCrop: true,
    bounds: { x: cropX, y: cropY, width: cropW, height: cropH },
    originalImageUrl: imageDataUrl
  };
}

/**
 * Perform manual crop to specific pixel rectangle coordinates
 */
export async function manualCropDocument(
  imageDataUrl: string,
  rect: { x: number; y: number; width: number; height: number },
  targetWidth = 1200
): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  const validX = Math.max(0, Math.min(origW - 10, Math.round(rect.x)));
  const validY = Math.max(0, Math.min(origH - 10, Math.round(rect.y)));
  const validW = Math.max(10, Math.min(origW - validX, Math.round(rect.width)));
  const validH = Math.max(10, Math.min(origH - validY, Math.round(rect.height)));

  const outW = targetWidth;
  const outH = Math.round(targetWidth * (validH / validW));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return imageDataUrl;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, validX, validY, validW, validH, 0, 0, outW, outH);

  return canvas.toDataURL('image/jpeg', 0.94);
}

/**
 * Returns detected card corners in original image space for magnetic edge-snapping in UI
 */
export async function getCardSnapAnchors(
  imageDataUrl: string,
  docType: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA' = 'EMIRATES_ID'
): Promise<CardBounds> {
  const img = await loadImage(imageDataUrl);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  const maxDim = 500;
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const workW = Math.round(origW * scale);
  const workH = Math.round(origH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = workW;
  canvas.height = workH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { x: 0, y: 0, width: origW, height: origH, confidence: 0 };
  }

  ctx.drawImage(img, 0, 0, workW, workH);
  const b = detectDocumentBounds(ctx, workW, workH, docType);

  return {
    x: Math.round(b.x / scale),
    y: Math.round(b.y / scale),
    width: Math.round(b.width / scale),
    height: Math.round(b.height / scale),
    confidence: b.confidence
  };
}
