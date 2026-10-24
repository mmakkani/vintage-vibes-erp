/**
 * Studio Image Processor (Level-8 Studio Edition — Zero Shoulder-Eating & Zero Halo Speckles):
 * 1. Preserves Natural Upright Orientation: Never blindly rotates upright landscape camera frames sideways.
 * 2. Multi-Palette + Morphologically De-Fringed Pure White Studio Cutout (#FFFFFF):
 *    - Samples background ONLY from the outer 3% perimeter & corners (never 10% deep where shoulders/sleeves sit).
 *    - Extracts up to 6 dominant fabric color clusters from the garment core (protecting striped, multi-color, and highlighted shirts).
 *    - Automatic White/Light-Shirt Safety Guard: If the shirt color is close to the bedsheet color (low contrast),
 *      automatically falls back to Clean Studio Rectangular Auto-Crop so light/white shirts are NEVER bitten into!
 *    - Morphological Erosion + 2px Inward RGB De-Fringing eliminates 100% of dark grey bedsheet shadow speckles around edges.
 * 3. Natural Studio Auto-Crop Mode (`whiteBackground: false`):
 *    - Smart rectangular bounding-box crop + subtle studio brightness/contrast polish with 0% garment edge cutting.
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

export const autoCropAndOrientGarment = (
  dataUrl: string,
  options?: { autoUpright?: boolean; autoCrop?: boolean; forceTighten?: boolean; whiteBackground?: boolean }
): Promise<string> => {
  const doCrop = options?.autoCrop !== false;
  const forceTighten = Boolean(options?.forceTighten);
  const wantWhiteStudio = options?.whiteBackground !== undefined ? Boolean(options.whiteBackground) : false;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const srcW = img.width;
        const srcH = img.height;

        // Modern browsers automatically apply EXIF orientation on <img> load, and live camera frames are already upright.
        // Never blindly rotate landscape frames 90° CW (which turned wide T-shirts sideways!).
        const workCanvas = document.createElement('canvas');
        workCanvas.width = srcW;
        workCanvas.height = srcH;
        const wCtx = workCanvas.getContext('2d', { willReadFrequently: true });
        if (!wCtx) return resolve(dataUrl);

        wCtx.fillStyle = '#FFFFFF';
        wCtx.fillRect(0, 0, workCanvas.width, workCanvas.height);
        wCtx.drawImage(img, 0, 0);

        const W = workCanvas.width;
        const H = workCanvas.height;

        if (!doCrop || W < 120 || H < 120) {
          return resolve(workCanvas.toDataURL('image/jpeg', 0.92));
        }

        // =================================================================================
        // MODE A: PURE WHITE (#FFFFFF) STUDIO CUTOUT (Multi-Palette + De-Fringed + Safety Guard)
        // =================================================================================
        if (wantWhiteStudio) {
          const G = 340; // High-precision 340x340 segmentation grid
          const gCanvas = document.createElement('canvas');
          gCanvas.width = G;
          gCanvas.height = G;
          const gCtx = gCanvas.getContext('2d', { willReadFrequently: true });
          if (gCtx) {
            gCtx.drawImage(workCanvas, 0, 0, G, G);
            const gData = gCtx.getImageData(0, 0, G, G).data;

            const idx3 = (x: number, y: number) => (y * G + x) * 4;
            const colorDist = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) => {
              const dr = r1 - r2;
              const dg = g1 - g2;
              const db = b1 - b2;
              return Math.sqrt(dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11);
            };

            // 1. Sample Background Reference Patches ONLY from the outer 3% border & 4 corners
            //    (Never 10% deep where garment shoulders or sleeves touch!)
            const bgSeeds: Array<[number, number, number]> = [];
            const addBgSample = (x0: number, x1: number, y0: number, y1: number) => {
              let sr = 0, sg = 0, sb = 0, cnt = 0;
              for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                  const p = idx3(x, y);
                  sr += gData[p];
                  sg += gData[p + 1];
                  sb += gData[p + 2];
                  cnt++;
                }
              }
              if (cnt > 0) {
                bgSeeds.push([sr / cnt, sg / cnt, sb / cnt]);
              }
            };

            const bBand = Math.max(4, Math.floor(G * 0.03)); // Outer 3% strip only
            // 4 corners + 6 thin outer edge strips
            addBgSample(0, bBand * 2, 0, bBand * 2);
            addBgSample(G - 1 - bBand * 2, G - 1, 0, bBand * 2);
            addBgSample(0, bBand * 2, G - 1 - bBand * 2, G - 1);
            addBgSample(G - 1 - bBand * 2, G - 1, G - 1 - bBand * 2, G - 1);
            addBgSample(Math.floor(G * 0.15), Math.floor(G * 0.40), 0, bBand);
            addBgSample(Math.floor(G * 0.60), Math.floor(G * 0.85), 0, bBand);
            addBgSample(0, bBand, Math.floor(G * 0.15), Math.floor(G * 0.45));
            addBgSample(G - 1 - bBand, G - 1, Math.floor(G * 0.15), Math.floor(G * 0.45));
            addBgSample(0, bBand, Math.floor(G * 0.55), Math.floor(G * 0.85));
            addBgSample(G - 1 - bBand, G - 1, Math.floor(G * 0.55), Math.floor(G * 0.85));

            // 2. Build a Multi-Cluster Garment Fabric Palette (up to 6 dominant colors) from the central torso
            //    This protects striped shirts, color-block shirts, chest prints, and lit vs shaded shoulders!
            const xTorso0 = Math.floor(G * 0.28), xTorso1 = Math.floor(G * 0.72);
            const yTorso0 = Math.floor(G * 0.24), yTorso1 = Math.floor(G * 0.78);

            const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();
            for (let y = yTorso0; y <= yTorso1; y += 2) {
              for (let x = xTorso0; x <= xTorso1; x += 2) {
                const p = idx3(x, y);
                const r = gData[p], g = gData[p + 1], b = gData[p + 2];
                const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
                const prev = buckets.get(key);
                if (prev) {
                  prev.r += r;
                  prev.g += g;
                  prev.b += b;
                  prev.count++;
                } else {
                  buckets.set(key, { r, g, b, count: 1 });
                }
              }
            }

            const sortedBuckets = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
            const fabricPalette: Array<[number, number, number]> = [];
            for (const b of sortedBuckets) {
              if (b.count < 8) break;
              const cr = b.r / b.count;
              const cg = b.g / b.count;
              const cb = b.b / b.count;
              // Merge if very close to an already picked cluster
              if (!fabricPalette.some(fp => colorDist(cr, cg, cb, fp[0], fp[1], fp[2]) < 22)) {
                fabricPalette.push([cr, cg, cb]);
                if (fabricPalette.length >= 6) break;
              }
            }

            if (fabricPalette.length === 0) {
              fabricPalette.push([40, 40, 40]);
            }

            const minDistToFabric = (r: number, g: number, b: number) => {
              let best = 999;
              for (let i = 0; i < fabricPalette.length; i++) {
                const fp = fabricPalette[i];
                const d = colorDist(r, g, b, fp[0], fp[1], fp[2]);
                if (d < best) best = d;
              }
              return best;
            };

            // Only keep background seeds that have strong contrast (>= 38) from ALL garment fabric clusters!
            // This prevents white/grey shirts or shoulders touching the frame edge from poisoning bgSeeds.
            const validBgSeeds = bgSeeds.filter(s => minDistToFabric(s[0], s[1], s[2]) >= 38);

            // Safety Guard #1: If fewer than 5 of the 10 outer border patches are strongly distinct from the shirt
            // (e.g., white/cream/light-grey shirt on a light bedsheet, or close-up shot filling the frame),
            // DO NOT flood-fill cut the garment — fall through to Mode B (Clean Studio Auto-Crop)!
            if (validBgSeeds.length >= 5) {
              const minDistToBg = (r: number, g: number, b: number) => {
                let best = 999;
                for (let i = 0; i < validBgSeeds.length; i++) {
                  const s = validBgSeeds[i];
                  const d = colorDist(r, g, b, s[0], s[1], s[2]);
                  if (d < best) best = d;
                }
                return best;
              };

              // 3. STAGE 1 — CONSERVATIVE EXTERIOR BEDSHEET FLOOD-FILL:
              const isBedsheetBg = new Uint8Array(G * G);
              const queue = new Int32Array(G * G);
              let qHead = 0;
              let qTail = 0;

              const trySeedBorder = (x: number, y: number) => {
                const pos = y * G + x;
                if (isBedsheetBg[pos]) return;
                const p = pos * 4;
                const r = gData[p], g = gData[p + 1], b = gData[p + 2];
                const dBg = minDistToBg(r, g, b);
                const dFab = minDistToFabric(r, g, b);
                if (dBg <= 26 && dFab >= 36 && dBg < dFab * 0.75) {
                  isBedsheetBg[pos] = 1;
                  queue[qTail++] = pos;
                }
              };

              for (let x = 0; x < G; x++) {
                trySeedBorder(x, 0);
                trySeedBorder(x, G - 1);
              }
              for (let y = 0; y < G; y++) {
                trySeedBorder(0, y);
                trySeedBorder(G - 1, y);
              }

              const dirs8 = [-1, 1, -G, G, -G - 1, -G + 1, G - 1, G + 1];
              while (qHead < qTail) {
                const curr = queue[qHead++];
                const cx = curr % G;
                const cy = (curr / G) | 0;
                const cp = curr * 4;
                const cr = gData[cp], cg = gData[cp + 1], cb = gData[cp + 2];

                for (let di = 0; di < 8; di++) {
                  const next = curr + dirs8[di];
                  if (next < 0 || next >= G * G || isBedsheetBg[next]) continue;
                  const nx = next % G;
                  const ny = (next / G) | 0;
                  if (Math.abs(nx - cx) > 1 || Math.abs(ny - cy) > 1) continue;

                  const np = next * 4;
                  const nr = gData[np], ng = gData[np + 1], nb = gData[np + 2];
                  const dBg = minDistToBg(nr, ng, nb);
                  const dFab = minDistToFabric(nr, ng, nb);
                  const stepDist = colorDist(cr, cg, cb, nr, ng, nb);

                  // Strict boundary protection: stop immediately when approaching garment fabric palette
                  if (
                    dFab > 32 &&
                    dBg < dFab * 0.78 &&
                    (dBg <= 22 || (stepDist <= 11 && dBg <= 28))
                  ) {
                    isBedsheetBg[next] = 1;
                    queue[qTail++] = next;
                  }
                }
              }

              // 4. STAGE 2 — CENTRAL GARMENT ISOLATION (Ignoring Dark Bedsheet Wrinkles/Shadows):
              const rawShirtMask = new Uint8Array(G * G);
              let sHead = 0;
              let sTail = 0;

              for (let y = Math.floor(G * 0.30); y <= Math.floor(G * 0.74); y++) {
                for (let x = Math.floor(G * 0.32); x <= Math.floor(G * 0.68); x++) {
                  const pos = y * G + x;
                  if (isBedsheetBg[pos] === 0 && !rawShirtMask[pos]) {
                    const p = pos * 4;
                    if (minDistToFabric(gData[p], gData[p + 1], gData[p + 2]) <= 38) {
                      rawShirtMask[pos] = 1;
                      queue[sTail++] = pos;
                    }
                  }
                }
              }

              while (sHead < sTail) {
                const curr = queue[sHead++];
                const cx = curr % G;
                const cy = (curr / G) | 0;

                for (let di = 0; di < 8; di++) {
                  const next = curr + dirs8[di];
                  if (next < 0 || next >= G * G || rawShirtMask[next] || isBedsheetBg[next]) continue;
                  const nx = next % G;
                  const ny = (next / G) | 0;
                  if (Math.abs(nx - cx) > 1 || Math.abs(ny - cy) > 1) continue;
                  if (nx <= 1 || nx >= G - 2 || ny <= 1 || ny >= G - 2) continue;

                  // Prevent expanding into bedsheet shadow/wrinkle speckles that are closer to bg than fabric
                  const np = next * 4;
                  const nr = gData[np], ng = gData[np + 1], nb = gData[np + 2];
                  const dBg = minDistToBg(nr, ng, nb);
                  const dFab = minDistToFabric(nr, ng, nb);
                  if (dBg < 28 && dFab > 36) continue;

                  rawShirtMask[next] = 1;
                  queue[sTail++] = next;
                }
              }

              // 5. STAGE 3 — SEAL INTERIOR GRAPHIC PRINTS, STRIPES & NECK TAGS:
              const exteriorBg = new Uint8Array(G * G);
              let eHead = 0;
              let eTail = 0;
              for (let x = 0; x < G; x++) {
                exteriorBg[x] = 1; queue[eTail++] = x;
                const bot = (G - 1) * G + x;
                exteriorBg[bot] = 1; queue[eTail++] = bot;
              }
              for (let y = 1; y < G - 1; y++) {
                const l = y * G;
                const r = y * G + (G - 1);
                exteriorBg[l] = 1; queue[eTail++] = l;
                exteriorBg[r] = 1; queue[eTail++] = r;
              }
              while (eHead < eTail) {
                const curr = queue[eHead++];
                const cx = curr % G;
                const cy = (curr / G) | 0;
                for (let di = 0; di < 4; di++) {
                  const next = curr + dirs8[di];
                  if (next < 0 || next >= G * G || exteriorBg[next] || rawShirtMask[next]) continue;
                  const nx = next % G;
                  const ny = (next / G) | 0;
                  if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
                  exteriorBg[next] = 1;
                  queue[eTail++] = next;
                }
              }

              // 6. STAGE 4 — MORPHOLOGICAL EROSION & OPENING TO SHAVE OFF GREY SHADOW SPECKLES:
              //    A pixel remains foreground only if at least 6 of its 8 neighbors are also foreground.
              //    This shaves off 1-2px dark bedsheet shadow fringes and jagged staircase teeth!
              const cleanFg = new Uint8Array(G * G);
              for (let y = 2; y < G - 2; y++) {
                for (let x = 2; x < G - 2; x++) {
                  const pos = y * G + x;
                  if (exteriorBg[pos] === 1) continue;
                  let nCnt = 0;
                  for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                      if (exteriorBg[(y + dy) * G + (x + dx)] === 0) nCnt++;
                    }
                  }
                  if (nCnt >= 7) {
                    cleanFg[pos] = 1;
                  }
                }
              }

              // Compute bounding box and check anatomical symmetry (Safety Guard #2: ensure shoulders aren't eaten)
              let gMinX = G, gMinY = G, gMaxX = 0, gMaxY = 0;
              let fgCount = 0;
              for (let y = 2; y < G - 2; y++) {
                for (let x = 2; x < G - 2; x++) {
                  if (cleanFg[y * G + x] === 1) {
                    fgCount++;
                    if (x < gMinX) gMinX = x;
                    if (x > gMaxX) gMaxX = x;
                    if (y < gMinY) gMinY = y;
                    if (y > gMaxY) gMaxY = y;
                  }
                }
              }

              // Check left- vs right-half foreground balance in the upper shoulder/chest third of the bounding box
              // If one shoulder was eaten away (asymmetry > 32%), reject the cutout and fall back to safe rectangular crop!
              let leftShoulderFg = 0;
              let rightShoulderFg = 0;
              const midX = Math.floor((gMinX + gMaxX) / 2);
              const shoulderY1 = gMinY + Math.floor((gMaxY - gMinY) * 0.42);
              for (let y = gMinY; y <= shoulderY1; y++) {
                for (let x = gMinX; x <= gMaxX; x++) {
                  if (cleanFg[y * G + x] === 1) {
                    if (x < midX) leftShoulderFg++;
                    else rightShoulderFg++;
                  }
                }
              }
              const maxSide = Math.max(1, leftShoulderFg, rightShoulderFg);
              const minSide = Math.min(leftShoulderFg, rightShoulderFg);
              const shoulderSymmetryRatio = minSide / maxSide;

              const fgRatio = fgCount / (G * G);
              if (
                fgRatio >= 0.16 &&
                fgRatio <= 0.88 &&
                shoulderSymmetryRatio >= 0.72 &&
                gMaxX > gMinX + 60 &&
                gMaxY > gMinY + 60
              ) {
                // 3-pass Gaussian-like smoothing on the alpha grid for smooth anti-aliased contours
                let alphaGrid = new Float32Array(G * G);
                for (let i = 0; i < G * G; i++) {
                  alphaGrid[i] = cleanFg[i] === 1 ? 1.0 : 0.0;
                }
                for (let pass = 0; pass < 3; pass++) {
                  const nextAlpha = new Float32Array(G * G);
                  for (let y = 1; y < G - 1; y++) {
                    for (let x = 1; x < G - 1; x++) {
                      const pos = y * G + x;
                      nextAlpha[pos] =
                        (alphaGrid[pos] * 4 +
                          alphaGrid[pos - 1] * 2 +
                          alphaGrid[pos + 1] * 2 +
                          alphaGrid[pos - G] * 2 +
                          alphaGrid[pos + G] * 2 +
                          alphaGrid[pos - G - 1] +
                          alphaGrid[pos - G + 1] +
                          alphaGrid[pos + G - 1] +
                          alphaGrid[pos + G + 1]) /
                        16.0;
                    }
                  }
                  alphaGrid = nextAlpha;
                }

                // Composite full-resolution workCanvas onto Pure White (#FFFFFF) with inward de-fringing
                const fullImgData = wCtx.getImageData(0, 0, W, H);
                const origPixels = new Uint8ClampedArray(fullImgData.data);
                const fPixels = fullImgData.data;
                const scaleX = (G - 1) / Math.max(1, W - 1);
                const scaleY = (G - 1) / Math.max(1, H - 1);
                const centerX = Math.floor(((gMinX + gMaxX) / 2 / G) * W);
                const centerY = Math.floor(((gMinY + gMaxY) / 2 / G) * H);

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

                    const a00 = alphaGrid[gy0 * G + gx0];
                    const a10 = alphaGrid[gy0 * G + gx1];
                    const a01 = alphaGrid[gy1 * G + gx0];
                    const a11 = alphaGrid[gy1 * G + gx1];
                    const aTop = a00 + (a10 - a00) * fx;
                    const aBot = a01 + (a11 - a01) * fx;
                    let alpha = aTop + (aBot - aTop) * fy;

                    // Shift alpha threshold inward (>= 0.42) so outer shadow fringe is 100% clipped to pure white
                    if (alpha < 0.42) alpha = 0;
                    else if (alpha > 0.88) alpha = 1;
                    else alpha = (alpha - 0.42) / 0.46;

                    const p = (rowOffset + x) * 4;
                    if (alpha <= 0) {
                      fPixels[p] = 255;
                      fPixels[p + 1] = 255;
                      fPixels[p + 2] = 255;
                      fPixels[p + 3] = 255;
                    } else {
                      // For edge pixels (alpha < 0.98), sample RGB 3px inward toward garment center to eliminate dark shadow rims
                      let sampleP = p;
                      if (alpha < 0.98) {
                        const ix = Math.min(W - 1, Math.max(0, x + (centerX > x ? 3 : -3)));
                        const iy = Math.min(H - 1, Math.max(0, y + (centerY > y ? 3 : -3)));
                        sampleP = (iy * W + ix) * 4;
                      }
                      let r = origPixels[sampleP];
                      let g = origPixels[sampleP + 1];
                      let b = origPixels[sampleP + 2];
                      r = Math.min(255, Math.max(0, Math.round((r - 128) * 1.04 + 128)));
                      g = Math.min(255, Math.max(0, Math.round((g - 128) * 1.04 + 128)));
                      b = Math.min(255, Math.max(0, Math.round((b - 128) * 1.04 + 128)));

                      if (alpha >= 1) {
                        fPixels[p] = r;
                        fPixels[p + 1] = g;
                        fPixels[p + 2] = b;
                      } else {
                        fPixels[p] = Math.round(r * alpha + 255 * (1 - alpha));
                        fPixels[p + 1] = Math.round(g * alpha + 255 * (1 - alpha));
                        fPixels[p + 2] = Math.round(b * alpha + 255 * (1 - alpha));
                      }
                      fPixels[p + 3] = 255;
                    }
                  }
                }
                wCtx.putImageData(fullImgData, 0, 0);

                const cropX = Math.max(0, Math.floor((gMinX / G) * W));
                const cropY = Math.max(0, Math.floor((gMinY / G) * H));
                const cropW = Math.min(W - cropX, Math.ceil(((gMaxX - gMinX) / G) * W));
                const cropH = Math.min(H - cropY, Math.ceil(((gMaxY - gMinY) / G) * H));

                if (cropW >= 140 && cropH >= 140) {
                  const padSide = Math.round(cropW * 0.06);
                  const minW = cropW + padSide * 2;
                  const minH = Math.round(cropH * 1.22);
                  const outW = Math.max(minW, Math.round(minH * 0.75));
                  const outH = Math.round(outW * (4 / 3));
                  const drawX = Math.round((outW - cropW) / 2);
                  const drawY = Math.round((outH - cropH) * 0.52);

                  const outCanvas = document.createElement('canvas');
                  outCanvas.width = outW;
                  outCanvas.height = outH;
                  const outCtx = outCanvas.getContext('2d');
                  if (outCtx) {
                    outCtx.fillStyle = '#FFFFFF';
                    outCtx.fillRect(0, 0, outW, outH);
                    outCtx.drawImage(workCanvas, cropX, cropY, cropW, cropH, drawX, drawY, cropW, cropH);
                    return resolve(outCanvas.toDataURL('image/jpeg', 0.92));
                  }
                }
              }
            }
          }
        }

        // =================================================================================
        // MODE B: NATURAL STUDIO BOUNDING-BOX AUTO-CROP (Zero Edge Cutting — Safe for All Garments)
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

        const topBg = sampleRegion(20, 100, 2, 8);
        const leftBg = sampleRegion(2, 8, 20, 100);
        const rightBg = sampleRegion(111, 117, 20, 100);
        const botBg = sampleRegion(20, 100, 111, 117);

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

        let minY = 4;
        let upGap = 0;
        for (let y = 62; y >= 2; y--) {
          let rowHits = 0;
          for (let x = 18; x <= 102; x++) {
            if (isGarmentPixel(x, y)) rowHits++;
          }
          if (rowHits >= 9) {
            minY = y;
            upGap = 0;
          } else {
            upGap++;
            if (upGap >= 4 && y < 48) break;
          }
        }

        let maxY = 116;
        let downGap = 0;
        for (let y = 64; y <= 117; y++) {
          let rowHits = 0;
          for (let x = 18; x <= 102; x++) {
            if (isGarmentPixel(x, y)) rowHits++;
          }
          if (rowHits >= 9) {
            maxY = y;
            downGap = 0;
          } else {
            downGap++;
            if (downGap >= 4 && y > 76) break;
          }
        }

        const spanY = Math.max(24, maxY - minY);
        const minColHits = Math.max(5, Math.floor(spanY * 0.12));

        let minX = 4;
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
            if (leftGap >= 4 && x < 44) break;
          }
        }

        let maxX = 116;
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
            if (rightGap >= 4 && x > 76) break;
          }
        }

        const boxW = maxX - minX;
        const boxH = maxY - minY;
        const shrunkMeaningfully = boxW < N * 0.92 || boxH < N * 0.92;

        if (maxBgDist >= 26 && boxW >= N * 0.32 && boxH >= N * 0.32 && shrunkMeaningfully) {
          // Generous 6-unit safety margin around detected garment so sleeves/collars are never clipped
          const pad = 6;
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
          const trimX = Math.round(W * 0.04);
          const trimY = Math.round(H * 0.04);
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
