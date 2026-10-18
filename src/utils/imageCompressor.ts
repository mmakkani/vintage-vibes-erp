/**
 * Studio Image Processor:
 * 1. Auto-Upright Orientation: Rotates sideways (landscape) full-garment shots upright to portrait.
 * 2. Center-Seeded Smart Garment Auto-Crop: Scans outward from the center garment torso and stops at the collar, hem, and sleeves,
 *    cutting off excess bedsheet/mattress/floor/wall background even when rooms have multi-colored borders.
 * 3. Fast 90° Rotation Helper for manual 1-click rotation in the Studio Modal.
 */

export const rotateImageDataUrl = (
  dataUrl: string,
  degrees: 90 | -90 | 180 = 90
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      if (degrees === 90 || degrees === -90) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL('image/jpeg', 0.90));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

/**
 * Center-Seeded Smart Garment Auto-Crop & Upright Orientation Normalizer
 * - If `autoUpright` is true and the image is sideways (width > height * 1.08), rotates 90° clockwise so the shirt stands upright.
 * - Samples the central garment torso color and scans outward (Up to collar, Down to hem, Left/Right to sleeves),
 *   stopping as soon as 3 consecutive rows/columns of background (mattress/bedsheet/floor) are reached.
 */
export const autoCropAndOrientGarment = (
  dataUrl: string,
  options?: { autoUpright?: boolean; autoCrop?: boolean; forceTighten?: boolean }
): Promise<string> => {
  const doUpright = options?.autoUpright !== false;
  const doCrop = options?.autoCrop !== false;
  const forceTighten = Boolean(options?.forceTighten);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const srcW = img.width;
        const srcH = img.height;

        // Step 1: Rotate sideways landscape photos upright (90° CW) if requested
        const needsRotate = doUpright && srcW > srcH * 1.08;
        const workCanvas = document.createElement('canvas');
        workCanvas.width = needsRotate ? srcH : srcW;
        workCanvas.height = needsRotate ? srcW : srcH;
        const wCtx = workCanvas.getContext('2d', { willReadFrequently: true });
        if (!wCtx) return resolve(dataUrl);

        if (needsRotate) {
          wCtx.translate(workCanvas.width / 2, workCanvas.height / 2);
          wCtx.rotate(Math.PI / 2);
          wCtx.drawImage(img, -srcW / 2, -srcH / 2);
        } else {
          wCtx.drawImage(img, 0, 0);
        }

        const W = workCanvas.width;
        const H = workCanvas.height;

        if (!doCrop || W < 120 || H < 120) {
          return resolve(workCanvas.toDataURL('image/jpeg', 0.90));
        }

        // Step 2: Center-Seeded Outward Garment Bounding-Box Scan on a 120x120 grid
        const N = 120;
        const sCanvas = document.createElement('canvas');
        sCanvas.width = N;
        sCanvas.height = N;
        const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
        if (!sCtx) return resolve(workCanvas.toDataURL('image/jpeg', 0.90));
        sCtx.drawImage(workCanvas, 0, 0, N, N);
        const pixels = sCtx.getImageData(0, 0, N, N).data;

        const getRGB = (x: number, y: number): [number, number, number] => {
          const i = (y * N + x) * 4;
          return [pixels[i], pixels[i + 1], pixels[i + 2]];
        };

        // Sample garment core (center 36%..64% X, 40%..70% Y), ignoring bright tape/flash pixels
        let gR = 0, gG = 0, gB = 0, gCount = 0;
        for (let y = 48; y <= 82; y++) {
          for (let x = 44; x <= 76; x++) {
            const [r, g, b] = getRGB(x, y);
            const isBrightTape = (r > 185 && g > 170) || (r > 150 && g > 135 && r - b > 45);
            if (!isBrightTape) {
              gR += r;
              gG += g;
              gB += b;
              gCount++;
            }
          }
        }
        if (gCount === 0) {
          for (let y = 48; y <= 82; y++) {
            for (let x = 44; x <= 76; x++) {
              const [r, g, b] = getRGB(x, y);
              gR += r; gG += g; gB += b; gCount++;
            }
          }
        }
        gR /= Math.max(1, gCount);
        gG /= Math.max(1, gCount);
        gB /= Math.max(1, gCount);

        // Sample Top, Left, and Right background strips (where mattress/bedsheet/wall is visible)
        const sampleRegion = (x0: number, x1: number, y0: number, y1: number): [number, number, number] => {
          let sr = 0, sg = 0, sb = 0, cnt = 0;
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const [r, g, b] = getRGB(x, y);
              sr += r; sg += g; sb += b; cnt++;
            }
          }
          return [sr / Math.max(1, cnt), sg / Math.max(1, cnt), sb / Math.max(1, cnt)];
        };

        const topBg = sampleRegion(20, 100, 3, 14);
        const leftBg = sampleRegion(2, 12, 20, 100);
        const rightBg = sampleRegion(108, 117, 20, 100);
        const botBg = sampleRegion(20, 100, 106, 117);

        const dTopGarment = Math.hypot(topBg[0] - gR, topBg[1] - gG, topBg[2] - gB);
        const dLeftGarment = Math.hypot(leftBg[0] - gR, leftBg[1] - gG, leftBg[2] - gB);
        const dRightGarment = Math.hypot(rightBg[0] - gR, rightBg[1] - gG, rightBg[2] - gB);
        const dBotGarment = Math.hypot(botBg[0] - gR, botBg[1] - gG, botBg[2] - gB);
        const maxBgDist = Math.max(dTopGarment, dLeftGarment, dRightGarment, dBotGarment);

        const garmentRadius = Math.max(44, Math.min(76, maxBgDist * 0.56));

        const isGarmentPixel = (x: number, y: number): boolean => {
          const [r, g, b] = getRGB(x, y);
          const dG = Math.hypot(r - gR, g - gG, b - gB);
          if (dG <= garmentRadius) return true;
          // Also include measuring tape or chest print pixels inside the garment that differ strongly from the outer background
          const dT = Math.hypot(r - topBg[0], g - topBg[1], b - topBg[2]);
          const dL = Math.hypot(r - leftBg[0], g - leftBg[1], b - leftBg[2]);
          const dR = Math.hypot(r - rightBg[0], g - rightBg[1], b - rightBg[2]);
          if (dG <= garmentRadius * 1.28 && dT > 48 && dL > 42 && dR > 42) return true;
          return false;
        };

        // Scan UP from center (y = 62 -> 2)
        let minY = 6;
        let upGap = 0;
        for (let y = 62; y >= 2; y--) {
          let rowHits = 0;
          for (let x = 22; x <= 98; x++) {
            if (isGarmentPixel(x, y)) rowHits++;
          }
          if (rowHits >= 11) {
            minY = y;
            upGap = 0;
          } else {
            upGap++;
            if (upGap >= 3 && y < 52) break;
          }
        }

        // Scan DOWN from center (y = 64 -> 117)
        let maxY = 114;
        let downGap = 0;
        for (let y = 64; y <= 117; y++) {
          let rowHits = 0;
          for (let x = 22; x <= 98; x++) {
            if (isGarmentPixel(x, y)) rowHits++;
          }
          if (rowHits >= 11) {
            maxY = y;
            downGap = 0;
          } else {
            downGap++;
            if (downGap >= 3 && y > 74) break;
          }
        }

        const spanY = Math.max(24, maxY - minY);
        const minColHits = Math.max(5, Math.floor(spanY * 0.14));

        // Scan LEFT from center (x = 58 -> 2)
        let minX = 6;
        let leftGap = 0;
        for (let x = 58; x >= 2; x--) {
          let colHits = 0;
          for (let y = minY; y <= maxY; y++) {
            if (isGarmentPixel(x, y)) colHits++;
          }
          if (colHits >= minColHits) {
            minX = x;
            leftGap = 0;
          } else {
            leftGap++;
            if (leftGap >= 3 && x < 48) break;
          }
        }

        // Scan RIGHT from center (x = 62 -> 117)
        let maxX = 114;
        let rightGap = 0;
        for (let x = 62; x <= 117; x++) {
          let colHits = 0;
          for (let y = minY; y <= maxY; y++) {
            if (isGarmentPixel(x, y)) colHits++;
          }
          if (colHits >= minColHits) {
            maxX = x;
            rightGap = 0;
          } else {
            rightGap++;
            if (rightGap >= 3 && x > 72) break;
          }
        }

        const boxW = maxX - minX;
        const boxH = maxY - minY;
        const shrunkMeaningfully = boxW < N * 0.91 || boxH < N * 0.91;

        if (maxBgDist >= 26 && boxW >= N * 0.30 && boxH >= N * 0.30 && shrunkMeaningfully) {
          const pad = 4; // ~3.3% studio margin around the shirt
          const cMinX = Math.max(0, minX - pad);
          const cMinY = Math.max(0, minY - pad);
          const cMaxX = Math.min(N, maxX + pad);
          const cMaxY = Math.min(N, maxY + pad);

          const cropX = Math.round((cMinX / N) * W);
          const cropY = Math.round((cMinY / N) * H);
          const cropW = Math.round(((cMaxX - cMinX) / N) * W);
          const cropH = Math.round(((cMaxY - cMinY) / N) * H);

          if (cropW >= 180 && cropH >= 180) {
            const outCanvas = document.createElement('canvas');
            outCanvas.width = cropW;
            outCanvas.height = cropH;
            const outCtx = outCanvas.getContext('2d');
            if (outCtx) {
              outCtx.drawImage(workCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
              return resolve(outCanvas.toDataURL('image/jpeg', 0.90));
            }
          }
        }

        // If user clicked manual "Auto-Crop" button and background contrast was subtle, perform a clean 10% border trim
        if (forceTighten) {
          const trimX = Math.round(W * 0.08);
          const trimY = Math.round(H * 0.10);
          const cropW = W - trimX * 2;
          const cropH = H - trimY * 2;
          if (cropW >= 180 && cropH >= 180) {
            const outCanvas = document.createElement('canvas');
            outCanvas.width = cropW;
            outCanvas.height = cropH;
            const outCtx = outCanvas.getContext('2d');
            if (outCtx) {
              outCtx.drawImage(workCanvas, trimX, trimY, cropW, cropH, 0, 0, cropW, cropH);
              return resolve(outCanvas.toDataURL('image/jpeg', 0.90));
            }
          }
        }

        return resolve(workCanvas.toDataURL('image/jpeg', 0.90));
      } catch {
        return resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

export const compressImage = (
  fileOrDataUrl: File | string,
  maxDimension = 1280,
  quality = 0.88,
  options?: { autoUpright?: boolean; autoCrop?: boolean }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const baseDataUrl = canvas.toDataURL('image/jpeg', quality);
      if (options?.autoUpright || options?.autoCrop) {
        const processed = await autoCropAndOrientGarment(baseDataUrl, options);
        resolve(processed);
      } else {
        resolve(baseDataUrl);
      }
    };
    img.onerror = (e) => reject(e);

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
};
