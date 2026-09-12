/**
 * High-Precision Document Edge Detection, Auto-Cropping & Resizing Utility
 * Automatically isolates Emirates ID, Passports, and Residency Visas from
 * background clutter (tables, desks, hands, scanner borders).
 */

export interface AutoCropOptions {
  docType?: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA' | 'AUTO_DETECT';
  targetWidth?: number;
  targetHeight?: number;
  enhanceContrast?: boolean;
}

// UAE & Standard Document Specifications
const DOC_SPECS = {
  // ISO/IEC 7810 ID-1 standard card format (85.60 mm × 53.98 mm) = ~1.5858
  EMIRATES_ID: {
    aspectRatio: 1.586,
    defaultWidth: 1200,
    defaultHeight: 757,
  },
  // ISO/IEC 7810 ID-3 standard passport bio page format (~125 mm × 88 mm) = ~1.42
  PASSPORT: {
    aspectRatio: 1.42,
    defaultWidth: 1200,
    defaultHeight: 845,
  },
  // UAE Residency A4 / Visa format or card
  RESIDENCY_VISA: {
    aspectRatio: 1.414, // A4 ratio or card
    defaultWidth: 1200,
    defaultHeight: 849,
  }
};

/**
 * Load an image data URL or URL into an HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('Failed to load image for processing: ' + err));
    img.src = src;
  });
}

/**
 * Color distance helper (Euclidean in RGB space)
 */
function colorDiff(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);
}

/**
 * Auto-detects card bounding box by sampling background borders and edge contrast.
 * Strips away desks, tables, carpets, and background surroundings.
 */
export async function autoCropAndResizeDocument(
  imageDataUrl: string,
  options: AutoCropOptions = {}
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

  // Use a downsampled canvas for fast edge analysis
  const maxAnalysisDim = 800;
  const scale = Math.min(1, maxAnalysisDim / Math.max(origW, origH));
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

  // 1. Sample the 4 perimeter corner patches to determine background color
  const samplePatch = (startX: number, startY: number, size: number) => {
    let r = 0, g = 0, b = 0, count = 0;
    for (let y = startY; y < Math.min(workH, startY + size); y++) {
      for (let x = startX; x < Math.min(workW, startX + size); x++) {
        const idx = (y * workW + x) * 4;
        r += data[idx];
        g += data[idx + 1];
        b += data[idx + 2];
        count++;
      }
    }
    return count > 0 ? { r: r / count, g: g / count, b: b / count } : { r: 240, g: 240, b: 240 };
  };

  const patchSize = Math.max(5, Math.floor(Math.min(workW, workH) * 0.04));
  const cTL = samplePatch(0, 0, patchSize);
  const cTR = samplePatch(workW - patchSize, 0, patchSize);
  const cBL = samplePatch(0, workH - patchSize, patchSize);
  const cBR = samplePatch(workW - patchSize, workH - patchSize, patchSize);

  // Background reference color (average of 4 corners)
  const bgR = (cTL.r + cTR.r + cBL.r + cBR.r) / 4;
  const bgG = (cTL.g + cTR.g + cBL.g + cBR.g) / 4;
  const bgB = (cTL.b + cTR.b + cBL.b + cBR.b) / 4;

  // 2. Scan lines inward from all 4 borders to detect card edges
  const diffThreshold = 22; // Contrast delta needed to trigger document boundary
  const edgeRatioThreshold = 0.22; // Fraction of line that must differ from background

  // TOP Scan
  let topBoundary = 0;
  for (let y = 0; y < Math.floor(workH * 0.45); y++) {
    let diffCount = 0;
    for (let x = Math.floor(workW * 0.1); x < Math.floor(workW * 0.9); x += 2) {
      const idx = (y * workW + x) * 4;
      const d = colorDiff(data[idx], data[idx + 1], data[idx + 2], bgR, bgG, bgB);
      if (d > diffThreshold) diffCount++;
    }
    const ratio = diffCount / (workW * 0.4);
    if (ratio > edgeRatioThreshold) {
      topBoundary = Math.max(0, y - 2);
      break;
    }
  }

  // BOTTOM Scan
  let bottomBoundary = workH - 1;
  for (let y = workH - 1; y > Math.floor(workH * 0.55); y--) {
    let diffCount = 0;
    for (let x = Math.floor(workW * 0.1); x < Math.floor(workW * 0.9); x += 2) {
      const idx = (y * workW + x) * 4;
      const d = colorDiff(data[idx], data[idx + 1], data[idx + 2], bgR, bgG, bgB);
      if (d > diffThreshold) diffCount++;
    }
    const ratio = diffCount / (workW * 0.4);
    if (ratio > edgeRatioThreshold) {
      bottomBoundary = Math.min(workH - 1, y + 2);
      break;
    }
  }

  // LEFT Scan
  let leftBoundary = 0;
  for (let x = 0; x < Math.floor(workW * 0.45); x++) {
    let diffCount = 0;
    for (let y = Math.floor(workH * 0.1); y < Math.floor(workH * 0.9); y += 2) {
      const idx = (y * workW + x) * 4;
      const d = colorDiff(data[idx], data[idx + 1], data[idx + 2], bgR, bgG, bgB);
      if (d > diffThreshold) diffCount++;
    }
    const ratio = diffCount / (workH * 0.4);
    if (ratio > edgeRatioThreshold) {
      leftBoundary = Math.max(0, x - 2);
      break;
    }
  }

  // RIGHT Scan
  let rightBoundary = workW - 1;
  for (let x = workW - 1; x > Math.floor(workW * 0.55); x--) {
    let diffCount = 0;
    for (let y = Math.floor(workH * 0.1); y < Math.floor(workH * 0.9); y += 2) {
      const idx = (y * workW + x) * 4;
      const d = colorDiff(data[idx], data[idx + 1], data[idx + 2], bgR, bgG, bgB);
      if (d > diffThreshold) diffCount++;
    }
    const ratio = diffCount / (workH * 0.4);
    if (ratio > edgeRatioThreshold) {
      rightBoundary = Math.min(workW - 1, x + 2);
      break;
    }
  }

  // Map detected work-canvas coordinates back to original image dimensions
  let cropX = Math.round(leftBoundary / scale);
  let cropY = Math.round(topBoundary / scale);
  let cropW = Math.round((rightBoundary - leftBoundary) / scale);
  let cropH = Math.round((bottomBoundary - topBoundary) / scale);

  // Safety validations: The detected document must be at least 35% of original dimensions
  const isReasonableCrop =
    cropW >= origW * 0.35 &&
    cropH >= origH * 0.35 &&
    (cropX > origW * 0.02 || cropY > origH * 0.02 || (origW - (cropX + cropW)) > origW * 0.02 || (origH - (cropY + cropH)) > origH * 0.02);

  // If boundary wasn't significantly distinct from corners, use centered document crop
  if (!isReasonableCrop) {
    // If user's camera was tightly framed, apply subtle edge trim (3% margin cleanup)
    const marginX = Math.round(origW * 0.025);
    const marginY = Math.round(origH * 0.025);
    cropX = marginX;
    cropY = marginY;
    cropW = origW - marginX * 2;
    cropH = origH - marginY * 2;
  }

  // Target aspect ratio enforcement for Emirates ID or standard documents
  const docType = options.docType || 'EMIRATES_ID';
  const targetSpec = DOC_SPECS[docType === 'PASSPORT' ? 'PASSPORT' : docType === 'RESIDENCY_VISA' ? 'RESIDENCY_VISA' : 'EMIRATES_ID'];
  const targetRatio = targetSpec.aspectRatio;

  // Normalize crop rectangle according to expected document aspect ratio
  const currentRatio = cropW / cropH;
  if (Math.abs(currentRatio - targetRatio) > 0.08) {
    if (currentRatio > targetRatio) {
      // Too wide -> adjust width to match target aspect ratio centered
      const newW = Math.round(cropH * targetRatio);
      if (newW <= origW) {
        cropX = Math.max(0, Math.min(origW - newW, Math.round(cropX + (cropW - newW) / 2)));
        cropW = newW;
      }
    } else {
      // Too tall -> adjust height to match target aspect ratio centered
      const newH = Math.round(cropW / targetRatio);
      if (newH <= origH) {
        cropY = Math.max(0, Math.min(origH - newH, Math.round(cropY + (cropH - newH) / 2)));
        cropH = newH;
      }
    }
  }

  // Ensure crop remains strictly within original image bounds
  cropX = Math.max(0, Math.min(origW - 50, cropX));
  cropY = Math.max(0, Math.min(origH - 50, cropY));
  cropW = Math.max(50, Math.min(origW - cropX, cropW));
  cropH = Math.max(50, Math.min(origH - cropY, cropH));

  // Render the high-resolution cropped & normalized card
  const outW = options.targetWidth || targetSpec.defaultWidth;
  const outH = options.targetHeight || Math.round(outW / targetRatio);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    return { croppedImageUrl: imageDataUrl, didCrop: false, bounds: { x: 0, y: 0, width: origW, height: origH } };
  }

  // Smooth rendering for crisp text/MRZ reading
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';

  // Draw ONLY the cropped document boundary onto the canvas
  outCtx.drawImage(
    img,
    cropX, cropY, cropW, cropH,
    0, 0, outW, outH
  );

  // Optional subtle contrast & sharpness enhancement for OCR readability
  if (options.enhanceContrast !== false) {
    try {
      const outData = outCtx.getImageData(0, 0, outW, outH);
      const d = outData.data;
      // Slight contrast boost: factor 1.08
      const contrast = 1.08;
      const intercept = 128 * (1 - contrast);
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, Math.max(0, d[i] * contrast + intercept));
        d[i + 1] = Math.min(255, Math.max(0, d[i + 1] * contrast + intercept));
        d[i + 2] = Math.min(255, Math.max(0, d[i + 2] * contrast + intercept));
      }
      outCtx.putImageData(outData, 0, 0);
    } catch (e) {
      // Ignore if canvas manipulation restricted
    }
  }

  const croppedDataUrl = outCanvas.toDataURL('image/jpeg', 0.94);

  return {
    croppedImageUrl: croppedDataUrl,
    didCrop: true,
    bounds: { x: cropX, y: cropY, width: cropW, height: cropH }
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

  const validX = Math.max(0, Math.min(origW - 10, rect.x));
  const validY = Math.max(0, Math.min(origH - 10, rect.y));
  const validW = Math.max(10, Math.min(origW - validX, rect.width));
  const validH = Math.max(10, Math.min(origH - validY, rect.height));

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
