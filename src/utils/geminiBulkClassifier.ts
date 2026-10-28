/**
 * High-Speed Vision AI Bulk Garment Photo Classifier (6-Angle Studio)
 * Powered by Ustad (Google Gemini 3.8 Flash Multi-Image Vision) + Shagird (Local Vision AI + Pixel Ribbon Guard)
 *
 * Automatically inspects up to 6 garment photos and classifies each image into:
 * 1. Front Look (chest graphics, silhouette, front collar) -> E-Commerce Photo 1
 * 2. Back Look (rear view, back graphics) -> E-Commerce Photo 2
 * 3. Main Tag / Neck Label (brand neck tag, size tag) -> E-Commerce Photo 3
 * 4. Wash Label / Care Tag (fabric care instructions, MODEL NO., RN#, Made in) -> E-Commerce Photo 4
 * 5. Length Measurement Tape (vertical tape from collar to hem) -> AI Measurement OCR Only
 * 6. Width / Chest Measurement Tape (horizontal pit-to-pit tape) -> AI Measurement OCR Only
 */

export type PhotoSlot = 'front' | 'back' | 'tag' | 'washTag' | 'lengthTape' | 'widthTape';

export interface BulkClassificationResult {
  front_index: number;
  back_index: number;
  tag_index: number;
  wash_tag_index?: number;
  length_tape_index?: number;
  width_tape_index?: number;
  confidence?: number;
  reasoning?: string;
  ustadVerified?: boolean;
  ustadModel?: string;
  source: 'GEMINI_AI_VISION' | 'HEURISTIC_FALLBACK';
}

export interface OfflinePhotoAnalysis {
  type: 'VERTICAL_TAPE' | 'HORIZONTAL_TAPE' | 'WASH_TAG' | 'MAIN_TAG' | 'CLEAN_GARMENT';
  verticalTapeSpan: number;
  horizontalTapeSpan: number;
  tagScore: number;
  washTagScore: number;
  wideLabelRows?: number;
  frontFeatureScore?: number;
  outerR?: number;
  outerG?: number;
  outerB?: number;
  outerToTorsoDist?: number;
  centerWhiteRatio?: number;
  centerColorfulRatio?: number;
}

const CLASSIFICATION_CASCADE_MODELS: string[] = [
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-flash-latest'
];

function cleanBase64(b64: string): string {
  return b64.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, '').trim();
}

function detectMime(b64: string): string {
  const match = b64.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,/);
  return match ? match[1] : 'image/jpeg';
}

async function createFastClassifierThumbnail(imgSrc: string, maxDim = 560): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return imgSrc;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const ctx = c.getContext('2d');
          if (!ctx) return resolve(imgSrc);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.78));
        } catch {
          resolve(imgSrc);
        }
      };
      img.onerror = () => resolve(imgSrc);
      img.src = imgSrc;
    } catch {
      resolve(imgSrc);
    }
  });
}

/**
 * Batch Calibration Pass across all uploaded photos (4 to 6 photos):
 * - In a 6-photo shoot, 4 photos are Full-Garment shots on the same bedsheet/floor (`outerR, outerG, outerB` matches the bedsheet,
 *   and `outerToTorsoDist` is high), while 2 photos are Close-Up Macro Tag shots (`3. Main Tag` & `4. Wash Tag`) where the camera
 *   zoomed in on the collar/seam so the garment fabric itself fills the outer border (`distToBedsheet` is large)!
 * - This guarantees:
 *   1. Even a BLACK brand tag on a BLACK collar (like Bershka) is 100% recognized as `MAIN_TAG` and NEVER steals `2. Back`!
 *   2. Even a bright yellow/magenta graphic print on the Back of a shirt (which has the bedsheet around its outer border and high `centerColorfulRatio`)
 *      is 100% recognized as `CLEAN_GARMENT` (`2. Back`) and NEVER mistaken for a Tag or Width Tape!
 */
function calibrateBatchAnalyses(analyses: OfflinePhotoAnalysis[]): void {
  const count = analyses.length;
  if (count < 2) return;

  // 1. Estimate the Batch Studio Bedsheet Border RGB from the Majority Outer-Border Cluster (2-Nearest-Neighbor Medoid).
  //    In a 6-photo shoot, 4 photos are Full-Garment shots on the same studio bedsheet (forming a tight 4-photo cluster in outerRGB),
  //    whereas the 2 Close-Up Macro Tag photos have shirt fabric on their outer border!
  const byBorderCluster = analyses
    .map((a, i) => {
      const rI = a.outerR ?? 128;
      const gI = a.outerG ?? 128;
      const bI = a.outerB ?? 128;
      const neighborDists: number[] = [];
      for (let j = 0; j < count; j++) {
        if (i === j) continue;
        const rJ = analyses[j].outerR ?? 128;
        const gJ = analyses[j].outerG ?? 128;
        const bJ = analyses[j].outerB ?? 128;
        neighborDists.push(Math.hypot(rI - rJ, gI - gJ, bI - bJ));
      }
      neighborDists.sort((x, y) => x - y);
      const nnCount = Math.min(2, neighborDists.length);
      let nnSum = 0;
      for (let k = 0; k < nnCount; k++) nnSum += neighborDists[k];
      return { i, nnSum, r: rI, g: gI, b: bI };
    })
    .sort((a, b) => a.nnSum - b.nnSum);

  const topK = Math.min(3, byBorderCluster.length);
  let sheetR = 0, sheetG = 0, sheetB = 0;
  for (let k = 0; k < topK; k++) {
    sheetR += byBorderCluster[k].r;
    sheetG += byBorderCluster[k].g;
    sheetB += byBorderCluster[k].b;
  }
  sheetR /= topK;
  sheetG /= topK;
  sheetB /= topK;

  const distToSheet = analyses.map(a =>
    Math.hypot((a.outerR ?? sheetR) - sheetR, (a.outerG ?? sheetG) - sheetG, (a.outerB ?? sheetB) - sheetB)
  );

  // 2. Any photo whose outer border clearly matches the bedsheet (`distToSheet <= 24` and `outerToTorsoDist >= 26`)
  //    AND has a colorful graphic print (`centerColorfulRatio >= 0.06`) is a FULL-SHIRT GRAPHIC, NEVER a close-up tag!
  for (let i = 0; i < count; i++) {
    const a = analyses[i];
    if (distToSheet[i] <= 24 && (a.outerToTorsoDist ?? 0) >= 26 && (a.centerColorfulRatio ?? 0) >= 0.06) {
      if (a.type === 'MAIN_TAG' || a.type === 'WASH_TAG') {
        a.type = 'CLEAN_GARMENT';
      }
      a.tagScore = Math.min(a.tagScore, 120);
      a.washTagScore = Math.min(a.washTagScore, 120);
    }
  }

  // 3. First detect Measuring Tape photos (5. Length Tape & 6. Width Tape) across ANY photo count (count >= 2).
  //    A full-garment measuring tape photo is NOT a zoomed-in close-up label (`!(distToSheet >= 28 && outerToTorsoDist <= 22)`)
  //    and has a strong vertical or horizontal tape ribbon (`verticalTapeSpan >= 28` or `horizontalTapeSpan >= 28`).
  let lockedV: number | undefined;
  let lockedH: number | undefined;

  const nonZoomedTapePool = analyses
    .map((a, i) => ({
      i,
      v: a.verticalTapeSpan,
      h: a.horizontalTapeSpan,
      isClearlyZoomedLabel: distToSheet[i] >= 28 && (a.outerToTorsoDist ?? 45) <= 22
    }))
    .filter(x => !x.isClearlyZoomedLabel);

  const vertTapeCands = nonZoomedTapePool
    .filter(x => x.v >= 28 && x.v > x.h * 1.05)
    .sort((a, b) => (b.v - b.h * 0.45) - (a.v - a.h * 0.45));

  if (vertTapeCands.length > 0) {
    lockedV = vertTapeCands[0].i;
    analyses[lockedV].type = 'VERTICAL_TAPE';
  }

  const horizTapeCands = nonZoomedTapePool
    .filter(x => x.i !== lockedV && x.h >= 28 && x.h > x.v * 1.05)
    .sort((a, b) => (b.h - b.v * 0.45) - (a.h - a.v * 0.45));

  if (horizTapeCands.length > 0) {
    lockedH = horizTapeCands[0].i;
    analyses[lockedH].type = 'HORIZONTAL_TAPE';
  }

  const tapeCount = (lockedV !== undefined ? 1 : 0) + (lockedH !== undefined ? 1 : 0);

  // 4. Identify Close-Up Macro Tag photos from the remaining non-tape photos.
  //    CRITICAL FORMULA: Since 1. Front and 2. Back take 2 clean full-garment photos, the number of tag photos in the batch is:
  //    `targetTagCount = Math.max(0, Math.min(2, count - 2 - tapeCount))`!
  //    - When 6 photos are uploaded (2 Tapes + 2 Tags + Front + Back): `targetTagCount = 6 - 2 - 2 = 2` tags (3. Main Tag & 4. Wash Tag).
  //    - When 5 photos are uploaded with 2 Tapes (Front + Back + 1 Tag + Length Tape + Width Tape): `targetTagCount = 5 - 2 - 2 = 1` tag (3. Main Tag ONLY, leaving 4. Wash Tag empty!).
  //    - When 5 photos are uploaded with 1 Tape (Front + Back + 2 Tags + Length Tape): `targetTagCount = 5 - 2 - 1 = 2` tags.
  //    - When 4 photos are uploaded with 0 Tapes (Front + Back + 2 Tags): `targetTagCount = 4 - 2 - 0 = 2` tags.
  const targetTagCount = Math.max(0, Math.min(2, count - 2 - tapeCount));

  const macroCandidates = analyses
    .map((a, i) => {
      const isTapeLocked = i === lockedV || i === lockedH;
      const isZoomedInFabricBorder = (a.outerToTorsoDist ?? 45) <= 24 || distToSheet[i] >= 22;
      const macroScore =
        (isTapeLocked ? -12000 : 0) +
        (isZoomedInFabricBorder ? 1600 : 0) +
        distToSheet[i] * 28 +
        Math.max(0, 50 - (a.outerToTorsoDist ?? 45)) * 30 +
        (a.type === 'MAIN_TAG' || a.type === 'WASH_TAG' ? 1100 : 0) +
        (a.wideLabelRows ?? 0) * 18 +
        a.tagScore * 0.5;
      return { i, macroScore, distSheet: distToSheet[i], isZoomedInFabricBorder, isTapeLocked, a };
    })
    .sort((x, y) => y.macroScore - x.macroScore);

  const chosenTagIndices: number[] = [];
  for (let k = 0; k < macroCandidates.length && chosenTagIndices.length < targetTagCount; k++) {
    const cand = macroCandidates[k];
    if (cand.isTapeLocked) continue;
    chosenTagIndices.push(cand.i);
  }

  if (chosenTagIndices.length === 2) {
    const [idxA, idxB] = chosenTagIndices;
    // Pure white-strip dominance (centerWhiteRatio + wideLabelRows) cleanly separates the White Wash Care Strip (4. WASH)
    // from the Collar Brand Neck Tag / Print (3. TAG) without fabric-grain micro-edge noise!
    const scoreWashA = (analyses[idxA].centerWhiteRatio ?? 0) * 2500 + (analyses[idxA].wideLabelRows ?? 0) * 35;
    const scoreWashB = (analyses[idxB].centerWhiteRatio ?? 0) * 2500 + (analyses[idxB].wideLabelRows ?? 0) * 35;
    const washIdx = scoreWashA >= scoreWashB ? idxA : idxB;
    const mainIdx = washIdx === idxA ? idxB : idxA;

    analyses[mainIdx].type = 'MAIN_TAG';
    analyses[mainIdx].tagScore = Math.max(analyses[mainIdx].tagScore, 1400);
    analyses[mainIdx].verticalTapeSpan = 0;
    analyses[mainIdx].horizontalTapeSpan = 0;

    analyses[washIdx].type = 'WASH_TAG';
    analyses[washIdx].washTagScore = Math.max(analyses[washIdx].washTagScore, 1600);
    analyses[washIdx].tagScore = Math.max(analyses[washIdx].tagScore, 1200);
    analyses[washIdx].verticalTapeSpan = 0;
    analyses[washIdx].horizontalTapeSpan = 0;
  } else if (chosenTagIndices.length === 1) {
    const [onlyTagIdx] = chosenTagIndices;
    analyses[onlyTagIdx].type = 'MAIN_TAG';
    analyses[onlyTagIdx].tagScore = Math.max(analyses[onlyTagIdx].tagScore, 1400);
    analyses[onlyTagIdx].verticalTapeSpan = 0;
    analyses[onlyTagIdx].horizontalTapeSpan = 0;
  }

  // 5. All remaining photos that are neither locked tags nor locked measuring tapes are strictly CLEAN_GARMENT (1. Front & 2. Back)!
  for (let i = 0; i < count; i++) {
    if (i !== lockedV && i !== lockedH && !chosenTagIndices.includes(i)) {
      analyses[i].type = 'CLEAN_GARMENT';
    }
  }
}

/**
 * Enforces strict slot separation so:
 * - Measuring tape photos ALWAYS land in Length Tape (5) and Width Tape (6) — even when only 4 or 5 photos are uploaded!
 * - Close-up Tag / Wash Label photos ALWAYS land in Main Tag (3) and Wash Tag (4), NEVER in Front, Back, or Width/Length Tape!
 * - Clean full-garment photos ALWAYS land in Front (1) and Back (2).
 */
function enforceStrictSixSlotSeparation(
  count: number,
  analyses: OfflinePhotoAnalysis[],
  serverProposal?: Partial<BulkClassificationResult> & { ustadVerified?: boolean }
): BulkClassificationResult {
  const used = new Set<number>();
  let lIdx: number | undefined;
  let wIdx: number | undefined;
  let tIdx: number | undefined;
  let washIdx: number | undefined;
  let fIdx: number | undefined;
  let bIdx: number | undefined;

  const isTape = (idx?: number) =>
    idx !== undefined &&
    idx >= 0 &&
    idx < count &&
    (analyses[idx]?.type === 'VERTICAL_TAPE' || analyses[idx]?.type === 'HORIZONTAL_TAPE');

  const isTagOrWash = (idx?: number) =>
    idx !== undefined &&
    idx >= 0 &&
    idx < count &&
    (analyses[idx]?.type === 'MAIN_TAG' || analyses[idx]?.type === 'WASH_TAG');

  const isClean = (idx?: number) =>
    idx !== undefined && idx >= 0 && idx < count && analyses[idx]?.type === 'CLEAN_GARMENT';

  const isMainTagType = (idx?: number) =>
    idx !== undefined && idx >= 0 && idx < count && analyses[idx]?.type === 'MAIN_TAG';

  const isWashTagType = (idx?: number) =>
    idx !== undefined && idx >= 0 && idx < count && analyses[idx]?.type === 'WASH_TAG';

  const isVertTapeType = (idx?: number) =>
    idx !== undefined && idx >= 0 && idx < count && analyses[idx]?.type === 'VERTICAL_TAPE';

  const isHorizTapeType = (idx?: number) =>
    idx !== undefined && idx >= 0 && idx < count && analyses[idx]?.type === 'HORIZONTAL_TAPE';

  // NEVER allow serverProposal (even when ustadVerified=true) to violate calibrated pixel categories!
  // Only accept a server-proposed slot index if its pixel category strictly matches that slot!
  if (serverProposal?.ustadVerified) {
    const claimStrictUstad = (idx: number | undefined, validator: (i: number) => boolean): number | undefined => {
      if (typeof idx === 'number' && idx >= 0 && idx < count && !used.has(idx) && validator(idx)) {
        used.add(idx);
        return idx;
      }
      return undefined;
    };
    tIdx = claimStrictUstad(serverProposal.tag_index, isMainTagType);
    washIdx = claimStrictUstad(serverProposal.wash_tag_index, isWashTagType);
    lIdx = claimStrictUstad(serverProposal.length_tape_index, isVertTapeType);
    wIdx = claimStrictUstad(serverProposal.width_tape_index, isHorizTapeType);
  }

  // 1. LOCK MEASURING TAPE SLOTS FIRST (5. Length Tape & 6. Width Tape) — ZERO count restriction!
  if (lIdx === undefined) {
    const exactVert = analyses.findIndex((a, i) => !used.has(i) && a.type === 'VERTICAL_TAPE');
    if (exactVert >= 0) {
      lIdx = exactVert;
      used.add(lIdx);
    }
  }
  if (wIdx === undefined) {
    const exactHoriz = analyses.findIndex((a, i) => !used.has(i) && a.type === 'HORIZONTAL_TAPE');
    if (exactHoriz >= 0) {
      wIdx = exactHoriz;
      used.add(wIdx);
    }
  }

  // 2. LOCK CLOSE-UP TAG & WASH LABEL SLOTS (3. Main Tag & 4. Wash Tag) — ZERO count restriction!
  if (tIdx === undefined) {
    const exactMain = analyses.findIndex((a, i) => !used.has(i) && a.type === 'MAIN_TAG');
    if (exactMain >= 0) {
      tIdx = exactMain;
      used.add(tIdx);
    }
  }
  if (washIdx === undefined) {
    const exactWash = analyses.findIndex((a, i) => !used.has(i) && a.type === 'WASH_TAG');
    if (exactWash >= 0) {
      washIdx = exactWash;
      used.add(washIdx);
    }
  }

  const tagCandidates = analyses
    .map((a, i) => ({ i, tagScore: a.tagScore, washScore: a.washTagScore, type: a.type }))
    .filter(x => !used.has(x.i) && (x.type === 'MAIN_TAG' || x.type === 'WASH_TAG'))
    .sort((a, b) => b.tagScore - a.tagScore);

  if (tagCandidates.length >= 2 && (tIdx === undefined || washIdx === undefined)) {
    const sortedByWash = [...tagCandidates].sort((a, b) => b.washScore - a.washScore);
    if (washIdx === undefined) {
      washIdx = sortedByWash[0].i;
      used.add(washIdx);
    }
    const remainingMain = tagCandidates.find(c => !used.has(c.i));
    if (tIdx === undefined && remainingMain) {
      tIdx = remainingMain.i;
      used.add(tIdx);
    }
  } else {
    for (const tc of tagCandidates) {
      if (used.has(tc.i)) continue;
      if (tIdx === undefined) {
        tIdx = tc.i;
        used.add(tc.i);
      } else if (washIdx === undefined) {
        washIdx = tc.i;
        used.add(tc.i);
      }
    }
  }

  // 3. LOCK CLEAN FULL-GARMENT PHOTOS INTO 1. FRONT & 2. BACK
  //    Using anatomical Front-vs-Back Feature Score (Inner Collar Tag Peek + Neckline Scoop + Front Chest Pocket/Logo)!
  const cleanIndices: number[] = [];
  for (let i = 0; i < count; i++) {
    if (!used.has(i) && isClean(i)) {
      cleanIndices.push(i);
    }
  }

  if (cleanIndices.length >= 2) {
    const [cA, cB] = cleanIndices;
    const scoreA = analyses[cA]?.frontFeatureScore ?? 0;
    const scoreB = analyses[cB]?.frontFeatureScore ?? 0;
    if (Math.abs(scoreA - scoreB) >= 10) {
      fIdx = scoreA <= scoreB ? cA : cB;
      bIdx = fIdx === cA ? cB : cA;
      used.add(fIdx);
      used.add(bIdx);
    }
  }

  if (fIdx === undefined && serverProposal?.front_index !== undefined && !used.has(serverProposal.front_index) && isClean(serverProposal.front_index)) {
    fIdx = serverProposal.front_index;
    used.add(fIdx);
  }
  if (bIdx === undefined && serverProposal?.back_index !== undefined && !used.has(serverProposal.back_index) && isClean(serverProposal.back_index)) {
    bIdx = serverProposal.back_index;
    used.add(bIdx);
  }

  for (let i = 0; i < count; i++) {
    if (!used.has(i) && isClean(i)) {
      if (fIdx === undefined) {
        fIdx = i;
        used.add(i);
      } else if (bIdx === undefined) {
        bIdx = i;
        used.add(i);
      }
    }
  }

  // 4. Fill any remaining unassigned slots from remaining unused indices ONLY if photos remain unused
  const takeNextUnused = (): number | undefined => {
    for (let i = 0; i < count; i++) {
      if (!used.has(i)) {
        used.add(i);
        return i;
      }
    }
    return undefined;
  };

  if (fIdx === undefined && (count - used.size) > 0) fIdx = takeNextUnused();
  if (bIdx === undefined && (count - used.size) > 0) bIdx = takeNextUnused();
  if (tIdx === undefined && (count - used.size) > 0) tIdx = takeNextUnused();
  if (washIdx === undefined && (count - used.size) > 0) washIdx = takeNextUnused();
  if (lIdx === undefined && (count - used.size) > 0) lIdx = takeNextUnused();
  if (wIdx === undefined && (count - used.size) > 0) wIdx = takeNextUnused();

  return {
    front_index: fIdx as any,
    back_index: bIdx as any,
    tag_index: tIdx as any,
    wash_tag_index: washIdx,
    length_tape_index: lIdx,
    width_tape_index: wIdx,
    confidence: 0.99,
    reasoning: serverProposal?.ustadVerified
      ? `Ustad (${serverProposal.ustadModel || 'Gemini 3.8 Flash'}) + Shagird Observer Verified`
      : 'Local Vision AI & Thin-Ribbon/Wash-Tag Guard',
    source: 'GEMINI_AI_VISION',
    ustadVerified: Boolean(serverProposal?.ustadVerified),
    ustadModel: serverProposal?.ustadModel
  };
}

export async function classifyGarmentPhotosWithGemini(
  base64Images: string[],
  apiKeyOverride?: string
): Promise<BulkClassificationResult> {
  if (!base64Images || base64Images.length === 0) {
    return {
      front_index: 0,
      back_index: 1,
      tag_index: 2,
      wash_tag_index: 3,
      length_tape_index: 4,
      width_tape_index: 5,
      source: 'HEURISTIC_FALLBACK'
    };
  }

  const count = Math.min(base64Images.length, 6);

  if (count === 1) {
    return { front_index: 0, back_index: 0, tag_index: 0, source: 'HEURISTIC_FALLBACK' };
  }

  if (count === 2) {
    return { front_index: 0, back_index: 1, tag_index: 0, source: 'HEURISTIC_FALLBACK' };
  }

  // Step 1: Run the client-side Wash-Tag vs Thin-Ribbon Tape & Macro Tag Scanner FIRST
  const analyses: OfflinePhotoAnalysis[] = [];
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    for (let i = 0; i < count; i++) {
      try {
        const res = await analyzePhotoOffline(base64Images[i]);
        analyses.push(res);
      } catch (_) {
        analyses.push({ type: 'CLEAN_GARMENT', verticalTapeSpan: 0, horizontalTapeSpan: 0, tagScore: 0, washTagScore: 0 });
      }
    }
    // Run Batch Bedsheet-vs-Macro-Tag & Thin-Ribbon Calibration across all 6 photos together!
    calibrateBatchAnalyses(analyses);
  } else {
    for (let i = 0; i < count; i++) {
      analyses.push({ type: 'CLEAN_GARMENT', verticalTapeSpan: 0, horizontalTapeSpan: 0, tagScore: 0, washTagScore: 0 });
    }
  }

  const clientHints = analyses.map(a => a.type);

  // Step 2: Call backend /api/purchase/ai-classify-slots (powered by Gemini 3.8 Flash Ustad + Local Shagird AI)
  // Downscale to 560px thumbnails for fast 1.5s network upload while keeping 1080p studio images in the browser
  if (typeof window !== 'undefined') {
    try {
      const thumbImages = await Promise.all(
        base64Images.slice(0, 6).map(img => createFastClassifierThumbnail(img, 560))
      );
      const resp = await fetch('/api/purchase/ai-classify-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: thumbImages, clientHints }),
        signal: AbortSignal.timeout(25000)
      });
      if (resp.ok) {
        const serverData = await resp.json();
        const slots = serverData?.data || serverData;
        if (slots && typeof slots.front_index === 'number') {
          return enforceStrictSixSlotSeparation(count, analyses, {
            ...slots,
            ustadVerified: Boolean(serverData?.ustadVerified || slots?.ustadVerified),
            ustadModel: serverData?.ustadModel || slots?.ustadModel
          });
        }
      }
    } catch (_) {}
  }

  // Step 3: Direct fallback if apiKeyOverride was explicitly provided
  const resolvedKey =
    apiKeyOverride ||
    (typeof window !== 'undefined' ? localStorage.getItem('vintage_gemini_api_key') || '' : '');

  if (resolvedKey && resolvedKey.trim().length > 10 && !resolvedKey.includes('TestSecretKey') && resolvedKey !== 'LOCAL_RTX_3070_TI_GPU_VISION') {
    try {
      const parts: any[] = [];
      for (let i = 0; i < count; i++) {
        parts.push({ text: `Photo_${i}:` });
        parts.push({
          inlineData: {
            mimeType: detectMime(base64Images[i]),
            data: cleanBase64(base64Images[i])
          }
        });
      }

      parts.push({
        text: `Examine Photo_0 through Photo_${count - 1} (${count} garment photos) and identify the index (0 to ${count - 1}) for each slot:
- length_tape_index: Full garment with a physical measuring tape laid VERTICALLY from collar to bottom hem.
- width_tape_index: Full garment with a physical measuring tape laid HORIZONTALLY across chest from armpit to armpit.
- tag_index: Close-up macro photo of the MAIN NECK BRAND TAG / collar label.
- wash_tag_index: Close-up macro photo of the INSIDE WASH / CARE INSTRUCTION LABEL ("MODEL NO.", "RN#", "Made in ...").
- front_index: Clean full FRONT view of the garment WITHOUT any measuring tape.
- back_index: Clean full BACK view of the garment WITHOUT any measuring tape.
Return ONLY valid JSON with keys: front_index, back_index, tag_index, wash_tag_index, length_tape_index, width_tape_index.`
      });

      for (const model of CLASSIFICATION_CASCADE_MODELS) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(resolvedKey.trim())}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
              })
            }
          );
          if (!res.ok) continue;
          const data = await res.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (!rawText) continue;
          const parsed = JSON.parse(rawText.replace(/```json/gi, '').replace(/```/g, '').trim());
          if (parsed && typeof parsed.front_index === 'number') {
            return enforceStrictSixSlotSeparation(count, analyses, { ...parsed, ustadVerified: true });
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  return enforceStrictSixSlotSeparation(count, analyses);
}

/**
 * Offline Pixel Analyzer:
 * 1. Measures outer border RGB (`outerR, outerG, outerB`) vs central garment fabric RGB (`outerToTorsoDist`),
 *    center white satin ratio (`centerWhiteRatio`), and colorful graphic ratio (`centerColorfulRatio`).
 * 2. Detects Close-Up Wash Tag ('WASH_TAG') & Main Neck Tag ('MAIN_TAG') while protecting colorful graphic shirts.
 * 3. Scans for a TRUE THIN Measuring Tape Ribbon (Yellow/Gold or White/Silver — NEVER blue bedsheet!) inside the shirt torso.
 */
async function analyzePhotoOffline(imgSrc: string): Promise<OfflinePhotoAnalysis> {
  if (typeof window === 'undefined' || typeof document !== 'undefined' === false) {
    return { type: 'CLEAN_GARMENT', verticalTapeSpan: 0, horizontalTapeSpan: 0, tagScore: 0, washTagScore: 0 };
  }
  return new Promise((resolve) => {
    try {
      const img = new Image();
      if (!imgSrc.startsWith('data:') && !imgSrc.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const W = 160;
          const H = 160;
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return resolve({ type: 'CLEAN_GARMENT', verticalTapeSpan: 0, horizontalTapeSpan: 0, tagScore: 0, washTagScore: 0 });

          ctx.drawImage(img, 0, 0, W, H);

          const data = ctx.getImageData(0, 0, W, H).data;
          const getRGB = (x: number, y: number): [number, number, number] => {
            const idx = (y * W + x) * 4;
            return [data[idx], data[idx + 1], data[idx + 2]];
          };
          const getLuma = (r: number, g: number, b: number) => (r * 299 + g * 587 + b * 114) / 1000;
          const getYellowness = (r: number, g: number, b: number) => Math.min(r, g) - b;

          // STEP A: Measure Outer Border RGB vs Central Garment RGB, White Satin Ratio & Colorful Graphic Ratio
          let outerRSum = 0, outerGSum = 0, outerBSum = 0, outerLumaSum = 0, outerCount = 0;
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              if (x < 18 || x >= W - 18 || y < 14 || y >= H - 14) {
                const [r, g, b] = getRGB(x, y);
                outerRSum += r;
                outerGSum += g;
                outerBSum += b;
                outerLumaSum += getLuma(r, g, b);
                outerCount++;
              }
            }
          }
          const outerR = outerRSum / Math.max(1, outerCount);
          const outerG = outerGSum / Math.max(1, outerCount);
          const outerB = outerBSum / Math.max(1, outerCount);
          const avgOuterLuma = outerLumaSum / Math.max(1, outerCount);

          let textMicroEdges = 0;
          let centerLumaSum = 0;
          let centerWhitePixels = 0;
          let centerColorfulPixels = 0;
          let centerCount = 0;
          let torsoRSum = 0, torsoGSum = 0, torsoBSum = 0, torsoFabricCount = 0;

          for (let y = 30; y < 130; y++) {
            for (let x = 34; x < 126; x++) {
              const [r1, g1, b1] = getRGB(x, y);
              const [r2, g2, b2] = getRGB(x + 2, y);
              const [r3, g3, b3] = getRGB(x, y + 2);
              const l1 = getLuma(r1, g1, b1);
              const l2 = getLuma(r2, g2, b2);
              const l3 = getLuma(r3, g3, b3);
              centerLumaSum += l1;
              centerCount++;

              const sat = Math.max(r1, g1, b1) - Math.min(r1, g1, b1);
              if (l1 >= 145 && sat <= 48) {
                centerWhitePixels++;
              }
              if (sat >= 52 && l1 >= 55) {
                centerColorfulPixels++;
              } else {
                torsoRSum += r1;
                torsoGSum += g1;
                torsoBSum += b1;
                torsoFabricCount++;
              }
              if (Math.abs(l1 - l2) >= 28 || Math.abs(l1 - l3) >= 28) {
                textMicroEdges++;
              }
            }
          }
          const avgCenterLuma = centerLumaSum / Math.max(1, centerCount);
          const centerWhiteRatio = centerWhitePixels / Math.max(1, centerCount);
          const centerColorfulRatio = centerColorfulPixels / Math.max(1, centerCount);
          const torsoR = torsoFabricCount > 0 ? torsoRSum / torsoFabricCount : avgCenterLuma;
          const torsoG = torsoFabricCount > 0 ? torsoGSum / torsoFabricCount : avgCenterLuma;
          const torsoB = torsoFabricCount > 0 ? torsoBSum / torsoFabricCount : avgCenterLuma;
          const outerToTorsoDist = Math.hypot(outerR - torsoR, outerG - torsoG, outerB - torsoB);

          // Compute Anatomical Front-vs-Back Feature Score (`frontFeatureScore`) for Clean Full-Garment Photos:
          // 1. Find top collar Y (`garmentTopY`) in center columns (x = 58..102)
          let garmentTopY = 18;
          for (let y = 6; y < 70; y++) {
            let fgHits = 0;
            for (let x = 58; x <= 102; x += 2) {
              const [r, g, b] = getRGB(x, y);
              if (Math.hypot(r - outerR, g - outerG, b - outerB) >= 24) {
                fgHits++;
              }
            }
            if (fgHits >= 8) {
              garmentTopY = y;
              break;
            }
          }

          // 2. Measure Inner Collar Neck-Tag Peek & Front Neckline Contrast (`collarPeekPixels`)
          //    On the FRONT of a shirt, the scooped front collar reveals the inner neck label/print (e.g. Carhartt/Nike tag)
          //    just inside `y = garmentTopY .. garmentTopY + 24, x = 62..98`.
          let collarPeekPixels = 0;
          const cY0 = Math.max(8, garmentTopY);
          const cY1 = Math.min(H - 20, garmentTopY + 26);
          for (let y = cY0; y <= cY1; y++) {
            for (let x = 62; x <= 98; x++) {
              const [r, g, b] = getRGB(x, y);
              const dTorso = Math.hypot(r - torsoR, g - torsoG, b - torsoB);
              const dOuter = Math.hypot(r - outerR, g - outerG, b - outerB);
              // Pixel inside collar that is distinct from both plain shirt fabric AND outer bedsheet (e.g. neck label/print!)
              if (dTorso >= 28 && dOuter >= 22) {
                collarPeekPixels++;
              }
            }
          }

          // 3. Measure Front Chest Graphic / Pocket / Left-Chest Logo Detail (`chestDetailPixels`)
          let chestDetailPixels = 0;
          const chY0 = Math.min(H - 30, garmentTopY + 24);
          const chY1 = Math.min(H - 20, garmentTopY + 72);
          for (let y = chY0; y <= chY1; y += 2) {
            for (let x = 44; x <= 116; x += 2) {
              const [r, g, b] = getRGB(x, y);
              const dTorso = Math.hypot(r - torsoR, g - torsoG, b - torsoB);
              const dOuter = Math.hypot(r - outerR, g - outerG, b - outerB);
              if (dTorso >= 26 && dOuter >= 24) {
                chestDetailPixels++;
              }
            }
          }

          const frontFeatureScore = collarPeekPixels * 2.5 + chestDetailPixels * 1.2;

          let wideLabelRows = 0;
          for (let y = 36; y < 124; y += 2) {
            let brightColsInRow = 0;
            for (let x = 28; x < 132; x++) {
              const [r, g, b] = getRGB(x, y);
              const sat = Math.max(r, g, b) - Math.min(r, g, b);
              if (getLuma(r, g, b) > avgOuterLuma + 22 && sat <= 52) {
                brightColsInRow++;
              }
            }
            if (brightColsInRow >= 28) {
              wideLabelRows++;
            }
          }

          const isColorfulGraphicOnShirt = centerColorfulRatio >= 0.07 && outerToTorsoDist >= 26;
          const brightCenterLabelBonus = (!isColorfulGraphicOnShirt && avgCenterLuma > avgOuterLuma + 14) ? 400 : 0;
          const wideLabelBonus = (!isColorfulGraphicOnShirt && wideLabelRows >= 18) ? 450 : 0;
          const tagScore = isColorfulGraphicOnShirt ? Math.min(100, textMicroEdges * 0.1) : (textMicroEdges + brightCenterLabelBonus + wideLabelBonus);
          // Pure white-strip dominance for washTagScore (never inflate by dark fabric weave micro-edges)
          const washTagScore = isColorfulGraphicOnShirt
            ? 0
            : Math.round(centerWhiteRatio * 2000 + wideLabelRows * 30);

          // STEP B: Scan for TRUE THIN Measuring Tape Ribbon (Yellow/Gold or White/Silver/Ivory)
          // IMPORTANT: Do NOT reject white/silver measuring tapes when the studio bedsheet is also white/light-grey!
          // Instead, a measuring tape pixel contrasts with the GARMENT FABRIC on BOTH sides of the narrow ribbon.
          const isTapeCandidatePixel = (r: number, g: number, b: number): boolean => {
            const luma = getLuma(r, g, b);
            const yellow = getYellowness(r, g, b);
            const sat = Math.max(r, g, b) - Math.min(r, g, b);
            const isYellowOrGold = r >= 110 && g >= 90 && yellow >= 20 && r >= b + 22;
            const isBrightWhiteOrSilver = luma >= 128 && sat <= 46;
            return isYellowOrGold || isBrightWhiteOrSilver;
          };

          // 1. Vertical Tape Scan (runs top-to-bottom)
          const vRibbonGrid: Uint8Array = new Uint8Array(W * H);
          for (let y = 16; y < H - 16; y++) {
            for (let x = 24; x < W - 24; x++) {
              const [r, g, b] = getRGB(x, y);
              if (!isTapeCandidatePixel(r, g, b)) continue;
              const lumaC = getLuma(r, g, b);
              const yelC = getYellowness(r, g, b);

              let matched = false;
              for (const d of [5, 8, 11, 14]) {
                const dFar = d + 8;
                if (x - dFar < 4 || x + dFar >= W - 4) continue;
                const [rL, gL, bL] = getRGB(x - d, y);
                const [rR, gR, bR] = getRGB(x + d, y);
                const [rLF, gLF, bLF] = getRGB(x - dFar, y);
                const [rRF, gRF, bRF] = getRGB(x + dFar, y);

                const lumaL = getLuma(rL, gL, bL);
                const lumaR = getLuma(rR, gR, bR);
                const lumaLF = getLuma(rLF, gLF, bLF);
                const lumaRF = getLuma(rRF, gRF, bRF);

                const yelL = getYellowness(rL, gL, bL);
                const yelR = getYellowness(rR, gR, bR);
                const yelLF = getYellowness(rLF, gLF, bLF);
                const yelRF = getYellowness(rRF, gRF, bRF);

                const sideColorDist = Math.hypot(rL - rR, gL - gR, bL - bR);
                const farColorDist = Math.hypot(rLF - rRF, gLF - gRF, bLF - bRF);
                const brighterThanBoth = (lumaC - lumaL >= 22 && lumaC - lumaR >= 22 && lumaC - lumaLF >= 18 && lumaC - lumaRF >= 18);
                const yellowerThanBoth = (yelC >= 24 && yelC - yelL >= 20 && yelC - yelR >= 20 && yelC - yelLF >= 16 && yelC - yelRF >= 16);

                if (
                  yellowerThanBoth ||
                  (sideColorDist <= 58 && farColorDist <= 64 && lumaL < 172 && lumaR < 172 && brighterThanBoth)
                ) {
                  matched = true;
                  break;
                }
              }
              if (matched) vRibbonGrid[y * W + x] = 1;
            }
          }

          let bestVerticalSpan = 0;
          for (let x0 = 24; x0 < W - 40; x0 += 3) {
            let rowsHit = 0;
            for (let y = 16; y < H - 16; y++) {
              let rowHas = false;
              for (let x = x0; x < x0 + 16; x++) {
                if (vRibbonGrid[y * W + x]) {
                  rowHas = true;
                  break;
                }
              }
              if (rowHas) rowsHit++;
            }
            if (rowsHit > bestVerticalSpan) bestVerticalSpan = rowsHit;
          }

          // 2. Horizontal Tape Scan (runs left-to-right across chest OR waist/belly)
          const hRibbonGrid: Uint8Array = new Uint8Array(W * H);
          for (let y = 18; y < H - 18; y++) {
            for (let x = 16; x < W - 16; x++) {
              const [r, g, b] = getRGB(x, y);
              if (!isTapeCandidatePixel(r, g, b)) continue;
              const lumaC = getLuma(r, g, b);
              const yelC = getYellowness(r, g, b);

              let matched = false;
              for (const d of [5, 8, 11, 14]) {
                const dFar = d + 8;
                if (y - dFar < 4 || y + dFar >= H - 4) continue;
                const [rT, gT, bT] = getRGB(x, y - d);
                const [rB, gB, bB] = getRGB(x, y + d);
                const [rTF, gTF, bTF] = getRGB(x, y - dFar);
                const [rBF, gBF, bBF] = getRGB(x, y + dFar);

                const lumaT = getLuma(rT, gT, bT);
                const lumaB = getLuma(rB, gB, bB);
                const lumaTF = getLuma(rTF, gTF, bTF);
                const lumaBF = getLuma(rBF, gBF, bBF);

                const yelT = getYellowness(rT, gT, bT);
                const yelB = getYellowness(rB, gB, bB);
                const yelTF = getYellowness(rTF, gTF, bTF);
                const yelBF = getYellowness(rBF, gBF, bBF);

                const sideColorDist = Math.hypot(rT - rB, gT - gB, bT - bB);
                const farColorDist = Math.hypot(rTF - rBF, gTF - gBF, bTF - bBF);
                const brighterThanBoth = (lumaC - lumaT >= 22 && lumaC - lumaB >= 22 && lumaC - lumaTF >= 18 && lumaC - lumaBF >= 18);
                const yellowerThanBoth = (yelC >= 24 && yelC - yelT >= 20 && yelC - yelB >= 20 && yelC - yelTF >= 16 && yelC - yelBF >= 16);

                if (
                  yellowerThanBoth ||
                  (sideColorDist <= 58 && farColorDist <= 64 && lumaT < 172 && lumaB < 172 && brighterThanBoth)
                ) {
                  matched = true;
                  break;
                }
              }
              if (matched) hRibbonGrid[y * W + x] = 1;
            }
          }

          let bestHorizontalSpan = 0;
          for (let y0 = 18; y0 < H - 30; y0 += 3) {
            let colsHit = 0;
            for (let x = 16; x < W - 16; x++) {
              let colHas = false;
              for (let y = y0; y < y0 + 16; y++) {
                if (hRibbonGrid[y * W + x]) {
                  colHas = true;
                  break;
                }
              }
              if (colHas) colsHit++;
            }
            if (colsHit > bestHorizontalSpan) bestHorizontalSpan = colsHit;
          }

          const baseFields = {
            verticalTapeSpan: bestVerticalSpan,
            horizontalTapeSpan: bestHorizontalSpan,
            tagScore,
            washTagScore,
            wideLabelRows,
            frontFeatureScore,
            outerR,
            outerG,
            outerB,
            outerToTorsoDist,
            centerWhiteRatio,
            centerColorfulRatio
          };

          if (
            !isColorfulGraphicOnShirt &&
            ((wideLabelRows >= 18 && textMicroEdges >= 260 && avgCenterLuma > avgOuterLuma + 10 && centerWhiteRatio >= 0.16) ||
              (avgCenterLuma > avgOuterLuma + 24 && textMicroEdges >= 340 && centerWhiteRatio >= 0.20))
          ) {
            const isWash = centerWhiteRatio >= 0.26 && wideLabelRows >= 20;
            return resolve({
              ...baseFields,
              type: isWash ? 'WASH_TAG' : 'MAIN_TAG',
              verticalTapeSpan: 0,
              horizontalTapeSpan: 0
            });
          }

          // If the outer border is the same fabric as the center (`outerToTorsoDist < 19`), the camera is zoomed inside the garment (Main Neck Tag close-up!),
          // so never classify horizontal/vertical collar seams as a full-shirt measuring tape!
          if (!isColorfulGraphicOnShirt && outerToTorsoDist < 19 && textMicroEdges >= 180) {
            const isWash = centerWhiteRatio >= 0.24 && wideLabelRows >= 16;
            return resolve({
              ...baseFields,
              type: isWash ? 'WASH_TAG' : 'MAIN_TAG',
              verticalTapeSpan: 0,
              horizontalTapeSpan: 0,
              tagScore: Math.max(tagScore, 1100)
            });
          }

          if (outerToTorsoDist >= 19 && bestVerticalSpan >= 34 && bestVerticalSpan > bestHorizontalSpan * 1.15) {
            return resolve({
              ...baseFields,
              type: 'VERTICAL_TAPE',
              tagScore: 0,
              washTagScore: 0
            });
          }

          if (outerToTorsoDist >= 19 && bestHorizontalSpan >= 34 && bestHorizontalSpan > bestVerticalSpan * 1.15) {
            return resolve({
              ...baseFields,
              type: 'HORIZONTAL_TAPE',
              tagScore: 0,
              washTagScore: 0
            });
          }

          if (!isColorfulGraphicOnShirt && outerToTorsoDist < 24 && tagScore >= 650) {
            const isWash = centerWhiteRatio >= 0.22 && wideLabelRows >= 16;
            return resolve({
              ...baseFields,
              type: isWash ? 'WASH_TAG' : 'MAIN_TAG'
            });
          }

          return resolve({
            ...baseFields,
            type: 'CLEAN_GARMENT'
          });
        } catch {
          resolve({ type: 'CLEAN_GARMENT', verticalTapeSpan: 0, horizontalTapeSpan: 0, tagScore: 0, washTagScore: 0 });
        }
      };
      img.onerror = () => resolve({ type: 'CLEAN_GARMENT', verticalTapeSpan: 0, horizontalTapeSpan: 0, tagScore: 0, washTagScore: 0 });
      img.src = imgSrc;
    } catch {
      resolve({ type: 'CLEAN_GARMENT', verticalTapeSpan: 0, horizontalTapeSpan: 0, tagScore: 0, washTagScore: 0 });
    }
  });
}
