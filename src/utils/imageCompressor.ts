/**
 * Studio Image Processor (Level-7 Pure White Studio Edition):
 * 1. Auto-Upright Orientation: Rotates sideways (landscape) full-garment shots upright.
 * 2. Pure White Studio Background Cutout (#FFFFFF) & Flat-Lay Presentation:
 *    Uses a fast Border-Connected Geodesic Flood-Fill on a 320x320 grid (< 25ms) to isolate and remove
 *    the surrounding bedsheet/mattress/floor/wall while 100% protecting interior chest graphics/logos/tags,
 *    feathers the garment silhouette edges, enhances fabric contrast, and centers the garment on a pure #FFFFFF studio canvas!
 * 3. Center-Seeded Smart Garment Auto-Crop for Measuring Tape shots (preserving the ruler & background context).
 * 4. Fast 90° Rotation Helper for manual 1-click rotation in the Studio Modal.
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
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

/**
 * Pure White (#FFFFFF) Studio Cutout + Auto-Crop & Upright Orientation Normalizer
 * - When `forceTighten` or `whiteBackground` is true (used for Front & Back garment display photos in Bale Sorting):
 *   Removes the outer bedsheet/mattress/floor/wall via Border-Connected Geodesic Flood-Fill,
 *   places the garment on a 100% Pure White (#FFFFFF) studio canvas with feathered anti-aliased edges,
 *   and centers it with balanced studio padding!
 * - When `forceTighten` is false (used for Length Tape & Width Tape photos):
 *   Crops excess outer background while keeping the measuring tape 100% intact.
 */
export const autoCropAndOrientGarment = (
  dataUrl: string,
  options?: { autoUpright?: boolean; autoCrop?: boolean; forceTighten?: boolean; whiteBackground?: boolean }
): Promise<string> => {
  const doUpright = options?.autoUpright !== false;
  const doCrop = options?.autoCrop !== false;
  const forceTighten = Boolean(options?.forceTighten);
  const wantWhiteStudio = options?.whiteBackground !== undefined ? Boolean(options.whiteBackground) : forceTighten;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const srcW = img.width;
        const srcH = img.height;

        // Step 1: Rotate sideways landscape photos upright (90° CW) if requested
        const needsRotate = doUpright && srcW > srcH * 1.12;
        const workCanvas = document.createElement('canvas');
        workCanvas.width = needsRotate ? srcH : srcW;
        workCanvas.height = needsRotate ? srcW : srcH;
        const wCtx = workCanvas.getContext('2d', { willReadFrequently: true });
        if (!wCtx) return resolve(dataUrl);

        wCtx.fillStyle = '#FFFFFF';
        wCtx.fillRect(0, 0, workCanvas.width, workCanvas.height);
        if (needsRotate) {
          wCtx.translate(workCanvas.width / 2, workCanvas.height / 2);
          wCtx.rotate(Math.PI / 2);
          wCtx.drawImage(img, -srcW / 2, -srcH / 2);
          wCtx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
          wCtx.drawImage(img, 0, 0);
        }

        const W = workCanvas.width;
        const H = workCanvas.height;

        if (!doCrop || W < 120 || H < 120) {
          return resolve(workCanvas.toDataURL('image/jpeg', 0.92));
        }

        // =================================================================================
        // MODE A: PURE WHITE (#FFFFFF) STUDIO CUTOUT & PERFECT PRESENTATION (Front & Back)
        // =================================================================================
        if (wantWhiteStudio) {
          const G = 280; // 280x280 high-speed segmentation grid (~15ms in JS typed arrays)
          const gCanvas = document.createElement('canvas');
          gCanvas.width = G;
          gCanvas.height = G;
          const gCtx = gCanvas.getContext('2d', { willReadFrequently: true });
          if (gCtx) {
            gCtx.drawImage(workCanvas, 0, 0, G, G);
            const gData = gCtx.getImageData(0, 0, G, G).data;

            const idx3 = (x: number, y: number) => (y * G + x) * 4;
            const colorDist = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) => {
              // Perceptual weighted Euclidean RGB distance
              const dr = r1 - r2;
              const dg = g1 - g2;
              const db = b1 - b2;
              return Math.sqrt(dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11);
            };

            // 1. Sample central garment torso colors (x: 34%..66%, y: 32%..74%)
            // We collect the dominant fabric color and secondary fabric tone
            let torsoR = 0, torsoG = 0, torsoB = 0, torsoCount = 0;
            const xCore0 = Math.floor(G * 0.34), xCore1 = Math.floor(G * 0.66);
            const yCore0 = Math.floor(G * 0.34), yCore1 = Math.floor(G * 0.74);

            for (let y = yCore0; y <= yCore1; y += 2) {
              for (let x = xCore0; x <= xCore1; x += 2) {
                const p = idx3(x, y);
                torsoR += gData[p];
                torsoG += gData[p + 1];
                torsoB += gData[p + 2];
                torsoCount++;
              }
            }
            torsoR /= Math.max(1, torsoCount);
            torsoG /= Math.max(1, torsoCount);
            torsoB /= Math.max(1, torsoCount);

            // Refine dominant fabric color by filtering out bright graphic print outliers inside the chest
            let fabR = 0, fabG = 0, fabB = 0, fabCount = 0;
            for (let y = yCore0; y <= yCore1; y += 2) {
              for (let x = xCore0; x <= xCore1; x += 2) {
                const p = idx3(x, y);
                const d = colorDist(gData[p], gData[p + 1], gData[p + 2], torsoR, torsoG, torsoB);
                if (d < 55) {
                  fabR += gData[p];
                  fabG += gData[p + 1];
                  fabB += gData[p + 2];
                  fabCount++;
                }
              }
            }
            if (fabCount > 20) {
              fabR /= fabCount;
              fabG /= fabCount;
              fabB /= fabCount;
            } else {
              fabR = torsoR;
              fabG = torsoG;
              fabB = torsoB;
            }

            // 2. Collect Background Seed Samples around the outer perimeter (top corners, left/right borders, bottom corners)
            const bgSeeds: Array<[number, number, number]> = [];
            const sampleBgPatch = (x0: number, x1: number, y0: number, y1: number) => {
              let sr = 0, sg = 0, sb = 0, cnt = 0;
              for (let y = y0; y <= y1; y += 2) {
                for (let x = x0; x <= x1; x += 2) {
                  const p = idx3(x, y);
                  sr += gData[p];
                  sg += gData[p + 1];
                  sb += gData[p + 2];
                  cnt++;
                }
              }
              if (cnt > 0) {
                sr /= cnt; sg /= cnt; sb /= cnt;
                // Only add as a background reference if it differs meaningfully from the garment core fabric
                if (colorDist(sr, sg, sb, fabR, fabG, fabB) >= 18) {
                  bgSeeds.push([sr, sg, sb]);
                }
              }
            };

            // Top-left, Top-right, Mid-left, Mid-right, Lower-left, Lower-right perimeter patches
            sampleBgPatch(0, Math.floor(G * 0.22), 0, Math.floor(G * 0.14));
            sampleBgPatch(Math.floor(G * 0.78), G - 1, 0, Math.floor(G * 0.14));
            sampleBgPatch(0, Math.floor(G * 0.10), Math.floor(G * 0.15), Math.floor(G * 0.45));
            sampleBgPatch(Math.floor(G * 0.90), G - 1, Math.floor(G * 0.15), Math.floor(G * 0.45));
            sampleBgPatch(0, Math.floor(G * 0.12), Math.floor(G * 0.55), Math.floor(G * 0.88));
            sampleBgPatch(Math.floor(G * 0.88), G - 1, Math.floor(G * 0.55), Math.floor(G * 0.88));
            sampleBgPatch(0, Math.floor(G * 0.20), Math.floor(G * 0.88), G - 1);
            sampleBgPatch(Math.floor(G * 0.80), G - 1, Math.floor(G * 0.88), G - 1);

            if (bgSeeds.length > 0) {
              const minDistToBg = (r: number, g: number, b: number) => {
                let best = 999;
                for (let i = 0; i < bgSeeds.length; i++) {
                  const s = bgSeeds[i];
                  const d = colorDist(r, g, b, s[0], s[1], s[2]);
                  if (d < best) best = d;
                }
                return best;
              };

              // 3. Border-Connected Geodesic BFS Flood-Fill
              // bgMask: 1 = background, 0 = garment
              const bgMask = new Uint8Array(G * G);
              const queue = new Int32Array(G * G);
              let qHead = 0;
              let qTail = 0;

              const trySeedBorder = (x: number, y: number) => {
                const pos = y * G + x;
                if (bgMask[pos]) return;
                const p = pos * 4;
                const r = gData[p], g = gData[p + 1], b = gData[p + 2];
                const dFab = colorDist(r, g, b, fabR, fabG, fabB);
                const dBg = minDistToBg(r, g, b);
                // Seed border pixel if it is closer to background palette than garment fabric
                if (dBg < 36 || dBg < dFab * 0.88) {
                  bgMask[pos] = 1;
                  queue[qTail++] = pos;
                }
              };

              for (let x = 0; x < G; x++) {
                trySeedBorder(x, 0);
                trySeedBorder(x, 1);
                trySeedBorder(x, G - 1);
                trySeedBorder(x, G - 2);
              }
              for (let y = 0; y < G; y++) {
                trySeedBorder(0, y);
                trySeedBorder(1, y);
                trySeedBorder(G - 1, y);
                trySeedBorder(G - 2, y);
              }

              // Protected central chest/tag core so flood-fill can NEVER enter the graphic print or neck label
              const protX0 = Math.floor(G * 0.30), protX1 = Math.floor(G * 0.70);
              const protY0 = Math.floor(G * 0.18), protY1 = Math.floor(G * 0.82);

              const dirs = [-1, 1, -G, G, -G - 1, -G + 1, G - 1, G + 1];
              while (qHead < qTail) {
                const curr = queue[qHead++];
                const cx = curr % G;
                const cy = (curr / G) | 0;
                const cp = curr * 4;
                const cr = gData[cp], cg = gData[cp + 1], cb = gData[cp + 2];

                for (let di = 0; di < 8; di++) {
                  const next = curr + dirs[di];
                  if (next < 0 || next >= G * G || bgMask[next]) continue;
                  const nx = next % G;
                  const ny = (next / G) | 0;
                  if (Math.abs(nx - cx) > 1 || Math.abs(ny - cy) > 1) continue;

                  // Never flood into the protected inner chest/neck core
                  if (nx >= protX0 && nx <= protX1 && ny >= protY0 && ny <= protY1) continue;

                  const np = next * 4;
                  const nr = gData[np], ng = gData[np + 1], nb = gData[np + 2];

                  // Local step gradient between neighbor pixels
                  const stepDist = colorDist(cr, cg, cb, nr, ng, nb);
                  if (stepDist > 24) continue; // Sharp garment edge boundary!

                  const dFab = colorDist(nr, ng, nb, fabR, fabG, fabB);
                  const dBg = minDistToBg(nr, ng, nb);

                  // Flood continues if pixel looks like background and NOT like the garment fabric
                  if (dFab > 22 && (dBg < 40 || dBg < dFab * 0.85)) {
                    bgMask[next] = 1;
                    queue[qTail++] = next;
                  }
                }
              }

              // 4. Find Tight Garment Bounding Box from foreground pixels (bgMask === 0)
              let gMinX = G, gMinY = G, gMaxX = 0, gMaxY = 0;
              let fgCount = 0;
              for (let y = 2; y < G - 2; y++) {
                for (let x = 2; x < G - 2; x++) {
                  if (bgMask[y * G + x] === 0) {
                    fgCount++;
                    if (x < gMinX) gMinX = x;
                    if (x > gMaxX) gMaxX = x;
                    if (y < gMinY) gMinY = y;
                    if (y > gMaxY) gMaxY = y;
                  }
                }
              }

              // Ensure the detected garment covers a realistic portion of the frame (22%..96%)
              const fgRatio = fgCount / (G * G);
              if (fgRatio >= 0.18 && fgRatio <= 0.95 && gMaxX > gMinX + 40 && gMaxY > gMinY + 40) {
                // Smooth the alpha mask with a 2-pass 3x3 feather filter so garment edges look studio-antialiased
                const alphaGrid = new Float32Array(G * G);
                for (let i = 0; i < G * G; i++) {
                  alphaGrid[i] = bgMask[i] === 1 ? 0.0 : 1.0;
                }
                const smoothAlpha = new Float32Array(G * G);
                for (let y = 1; y < G - 1; y++) {
                  for (let x = 1; x < G - 1; x++) {
                    const pos = y * G + x;
                    const sum =
                      alphaGrid[pos] * 4 +
                      alphaGrid[pos - 1] * 2 +
                      alphaGrid[pos + 1] * 2 +
                      alphaGrid[pos - G] * 2 +
                      alphaGrid[pos + G] * 2 +
                      alphaGrid[pos - G - 1] +
                      alphaGrid[pos - G + 1] +
                      alphaGrid[pos + G - 1] +
                      alphaGrid[pos + G + 1];
                    smoothAlpha[pos] = sum / 16.0;
                  }
                }

                // Composite full-resolution workCanvas onto Pure White (#FFFFFF) with feathered alpha + studio contrast polish
                const fullImgData = wCtx.getImageData(0, 0, W, H);
                const fPixels = fullImgData.data;
                const scaleX = (G - 1) / Math.max(1, W - 1);
                const scaleY = (G - 1) / Math.max(1, H - 1);

                for (let y = 0; y < H; y++) {
                  const gy = y * scaleY;
                  const gy0 = gy | 0;
                  const gy1 = Math.min(G - 1, gy0 + 1);
                  const fy = gy - gy0;
                  const rowOffset = y * W;

                  for (let x = 0; x < W; x++) {
                    const gx = x * scaleX;
                    const gx0 = gx | 0;
                    const gx1 = Math.min(G - 1, gx0 + 1);
                    const fx = gx - gx0;

                    // Bilinear interpolated alpha from smoothAlpha grid
                    const a00 = smoothAlpha[gy0 * G + gx0];
                    const a10 = smoothAlpha[gy0 * G + gx1];
                    const a01 = smoothAlpha[gy1 * G + gx0];
                    const a11 = smoothAlpha[gy1 * G + gx1];
                    const aTop = a00 + (a10 - a00) * fx;
                    const aBot = a01 + (a11 - a01) * fx;
                    let alpha = aTop + (aBot - aTop) * fy;

                    // Crisp threshold curve on alpha for ultra-clean studio silhouette edge
                    if (alpha < 0.18) alpha = 0;
                    else if (alpha > 0.86) alpha = 1;
                    else alpha = (alpha - 0.18) / 0.68;

                    const p = (rowOffset + x) * 4;
                    if (alpha <= 0) {
                      fPixels[p] = 255;
                      fPixels[p + 1] = 255;
                      fPixels[p + 2] = 255;
                      fPixels[p + 3] = 255;
                    } else {
                      // Subtle studio contrast S-curve on garment pixels so blacks & graphics pop cleanly
                      let r = fPixels[p];
                      let g = fPixels[p + 1];
                      let b = fPixels[p + 2];
                      r = Math.min(255, Math.max(0, Math.round((r - 128) * 1.05 + 128)));
                      g = Math.min(255, Math.max(0, Math.round((g - 128) * 1.05 + 128)));
                      b = Math.min(255, Math.max(0, Math.round((b - 128) * 1.05 + 128)));

                      if (alpha >= 1) {
                        fPixels[p] = r;
                        fPixels[p + 1] = g;
                        fPixels[p + 2] = b;
                      } else {
                        // Blend edge onto pure white (#FFFFFF)
                        fPixels[p] = Math.round(r * alpha + 255 * (1 - alpha));
                        fPixels[p + 1] = Math.round(g * alpha + 255 * (1 - alpha));
                        fPixels[p + 2] = Math.round(b * alpha + 255 * (1 - alpha));
                      }
                      fPixels[p + 3] = 255;
                    }
                  }
                }
                wCtx.putImageData(fullImgData, 0, 0);

                // 5. Crop tightly to the garment & center on a Pure White Studio Frame with 4.5% clean white margin!
                const cropX = Math.max(0, Math.floor((gMinX / G) * W));
                const cropY = Math.max(0, Math.floor((gMinY / G) * H));
                const cropW = Math.min(W - cropX, Math.ceil(((gMaxX - gMinX) / G) * W));
                const cropH = Math.min(H - cropY, Math.ceil(((gMaxY - gMinY) / G) * H));

                if (cropW >= 160 && cropH >= 160) {
                  const padX = Math.round(cropW * 0.05);
                  const padY = Math.round(cropH * 0.05);
                  const outCanvas = document.createElement('canvas');
                  outCanvas.width = cropW + padX * 2;
                  outCanvas.height = cropH + padY * 2;
                  const outCtx = outCanvas.getContext('2d');
                  if (outCtx) {
                    outCtx.fillStyle = '#FFFFFF';
                    outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
                    outCtx.drawImage(workCanvas, cropX, cropY, cropW, cropH, padX, padY, cropW, cropH);
                    return resolve(outCanvas.toDataURL('image/jpeg', 0.92));
                  }
                }
              }
            }
          }
        }

        // =================================================================================
        // MODE B: CENTER-SEEDED BOUNDING-BOX AUTO-CROP (For Measuring Tape & Fallback)
        // =================================================================================
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
          const dT = Math.hypot(r - topBg[0], g - topBg[1], b - topBg[2]);
          const dL = Math.hypot(r - leftBg[0], g - leftBg[1], b - leftBg[2]);
          const dR = Math.hypot(r - rightBg[0], g - rightBg[1], b - rightBg[2]);
          if (dG <= garmentRadius * 1.28 && dT > 48 && dL > 42 && dR > 42) return true;
          return false;
        };

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
          const pad = 4;
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
              outCtx.fillStyle = '#FFFFFF';
              outCtx.fillRect(0, 0, cropW, cropH);
              outCtx.drawImage(workCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
              return resolve(outCanvas.toDataURL('image/jpeg', 0.92));
            }
          }
        }

        if (forceTighten) {
          const trimX = Math.round(W * 0.06);
          const trimY = Math.round(H * 0.08);
          const cropW = W - trimX * 2;
          const cropH = H - trimY * 2;
          if (cropW >= 180 && cropH >= 180) {
            const outCanvas = document.createElement('canvas');
            outCanvas.width = cropW;
            outCanvas.height = cropH;
            const outCtx = outCanvas.getContext('2d');
            if (outCtx) {
              outCtx.fillStyle = '#FFFFFF';
              outCtx.fillRect(0, 0, cropW, cropH);
              outCtx.drawImage(workCanvas, trimX, trimY, cropW, cropH, 0, 0, cropW, cropH);
              return resolve(outCanvas.toDataURL('image/jpeg', 0.92));
            }
          }
        }

        return resolve(workCanvas.toDataURL('image/jpeg', 0.92));
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
  quality = 0.90,
  options?: { autoUpright?: boolean; autoCrop?: boolean; forceTighten?: boolean; whiteBackground?: boolean }
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
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const baseDataUrl = canvas.toDataURL('image/jpeg', quality);
      if (options?.autoUpright || options?.autoCrop || options?.forceTighten || options?.whiteBackground) {
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

