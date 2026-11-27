import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { withDb } from '../../db/pgPool.ts';

interface IndexedGarmentEntry {
  sku: string;
  id: string;
  title: string;
  brand: string;
  category: string;
  size: string;
  pitToPitInches: string;
  lengthInches: string;
  retailPriceAed: number;
  frontImageUrl: string;
  dhashHex: string;
  colorVec: number[]; // 48-element 4x4 normalized non-white RGB vector
}

interface VisualIndexFile {
  version: number;
  updatedAt: string;
  items: Record<string, IndexedGarmentEntry>;
}

const INDEX_FILE = path.join(process.cwd(), '.data', 'visual_garment_index.json');
let inMemoryIndex: VisualIndexFile = { version: 1, updatedAt: '', items: {} };
let indexLoaded = false;
let buildPromise: Promise<number> | null = null;
let lastBuildAt = '';

function loadIndexFromDisk(): void {
  if (indexLoaded) return;
  indexLoaded = true;
  try {
    if (fs.existsSync(INDEX_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      if (parsed && typeof parsed.items === 'object') {
        inMemoryIndex = parsed;
        lastBuildAt = parsed.updatedAt || '';
      }
    }
  } catch {}
}

function saveIndexToDisk(): void {
  try {
    const dir = path.dirname(INDEX_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    inMemoryIndex.updatedAt = new Date().toISOString();
    lastBuildAt = inMemoryIndex.updatedAt;
    const tmp = `${INDEX_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(inMemoryIndex), 'utf8');
    fs.renameSync(tmp, INDEX_FILE);
  } catch {}
}

function resolveLocalImagePath(urlStr: string): string | null {
  const clean = String(urlStr || '').split('?')[0].trim();
  if (!clean) return null;
  let rel = clean;
  if (/^https?:\/\//i.test(clean)) {
    try {
      rel = new URL(clean).pathname;
    } catch {
      return null;
    }
  }
  rel = rel.replace(/^\/+/, '');
  if (!rel || rel.includes('..')) return null;

  const candidatesRel = [rel];
  const stMatch = rel.match(/^storage\/v1\/(?:object|render\/image)\/public\/(.+)$/i);
  if (stMatch && stMatch[1]) {
    const afterPub = stMatch[1].replace(/^\/+/, '');
    candidatesRel.push(path.join('uploads', afterPub), afterPub);
  }

  for (const rPath of candidatesRel) {
    for (const base of ['public', 'dist', '.data']) {
      const cand = path.resolve(process.cwd(), base, rPath);
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
    }
  }
  return null;
}

/**
 * Pure CPU perceptual signature (64-bit center dHash + 4x4 foreground RGB histogram).
 * Zero GPU VRAM used! Masks near-white studio background pixels so live camera frames match studio cards cleanly.
 */
async function computeVisualSignature(
  input: Buffer,
  isLiveCameraFrame = false
): Promise<{ dhashHex: string; colorVec: number[] }> {
  const baseSharp = sharp(input).rotate();
  const meta = await baseSharp.metadata().catch(() => ({ width: 0, height: 0 }));
  let workBuf = input;

  // Center-crop camera frames slightly (middle 72%) to reduce background wall/table noise
  if (isLiveCameraFrame && meta.width && meta.height && meta.width >= 80 && meta.height >= 80) {
    const cw = Math.round(meta.width * 0.72);
    const ch = Math.round(meta.height * 0.72);
    const left = Math.round((meta.width - cw) / 2);
    const top = Math.round((meta.height - ch) / 2);
    workBuf = await sharp(input).rotate().extract({ left, top, width: cw, height: ch }).toBuffer();
  }

  // 1. 64-bit dHash (9x8 grayscale)
  const { data: gray } = await sharp(workBuf)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const idx = y * 9 + x;
      if (gray[idx] > gray[idx + 1]) {
        bits |= 1n << BigInt(y * 8 + x);
      }
    }
  }
  const dhashHex = bits.toString(16).padStart(16, '0');

  // 2. 16x16 foreground RGB -> pooled 4x4 grid (48 floats in [0,1]) skipping white studio background
  const { data: rgb } = await sharp(workBuf)
    .resize(16, 16, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const colorVec: number[] = [];
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let fgCount = 0;
      let allR = 0;
      let allG = 0;
      let allB = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const px = ((gy * 4 + dy) * 16 + (gx * 4 + dx)) * 3;
          const r = rgb[px];
          const g = rgb[px + 1];
          const b = rgb[px + 2];
          allR += r;
          allG += g;
          allB += b;
          if (!(r > 238 && g > 238 && b > 238)) {
            rSum += r;
            gSum += g;
            bSum += b;
            fgCount++;
          }
        }
      }
      if (fgCount >= 2) {
        colorVec.push(
          Math.round((rSum / (fgCount * 255)) * 1000) / 1000,
          Math.round((gSum / (fgCount * 255)) * 1000) / 1000,
          Math.round((bSum / (fgCount * 255)) * 1000) / 1000
        );
      } else {
        colorVec.push(
          Math.round((allR / (16 * 255)) * 1000) / 1000,
          Math.round((allG / (16 * 255)) * 1000) / 1000,
          Math.round((allB / (16 * 255)) * 1000) / 1000
        );
      }
    }
  }

  return { dhashHex, colorVec };
}

function hammingDistanceHex64(aHex: string, bHex: string): number {
  try {
    let x = BigInt('0x' + aHex) ^ BigInt('0x' + bHex);
    let dist = 0;
    while (x > 0n) {
      dist += Number(x & 1n);
      x >>= 1n;
    }
    return dist;
  } catch {
    return 64;
  }
}

export async function ensureVisualIndexBuilt(force = false): Promise<number> {
  loadIndexFromDisk();
  if (buildPromise) return buildPromise;

  buildPromise = (async () => {
    try {
      const rows = await withDb(async (client) => {
        const res = await client.query(
          `SELECT id, sku, brand_name, item_name, parent_category_name, sub_category, size_scanned,
                  pit_to_pit_inches, length_inches, retail_price_aed, front_image_url
             FROM public.inventory_pieces
            WHERE COALESCE(status, 'IN_STOCK') = 'IN_STOCK'
              AND front_image_url IS NOT NULL
              AND front_image_url <> ''
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
            LIMIT 1500`
        );
        return res.rows || [];
      });

      const activeSkus = new Set<string>();
      let addedOrUpdated = 0;

      for (const r of rows) {
        const sku = String(r.sku || r.id || '').trim();
        const frontUrl = String(r.front_image_url || '').trim();
        if (!sku || !frontUrl) continue;
        activeSkus.add(sku);

        const existing = inMemoryIndex.items[sku];
        if (!force && existing && existing.frontImageUrl === frontUrl && existing.dhashHex && Array.isArray(existing.colorVec)) {
          continue;
        }

        const localPath = resolveLocalImagePath(frontUrl);
        if (!localPath) continue;

        try {
          const buf = fs.readFileSync(localPath);
          const sig = await computeVisualSignature(buf, false);
          const brand = String(r.brand_name || 'Vintage').trim();
          const item = String(r.item_name || 'Vintage Garment').trim();
          const title = brand && !item.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${item}` : item;

          inMemoryIndex.items[sku] = {
            sku,
            id: String(r.id || sku),
            title,
            brand,
            category: String(r.sub_category || r.parent_category_name || 'Vintage').trim(),
            size: String(r.size_scanned || '').trim(),
            pitToPitInches: String(r.pit_to_pit_inches || '').trim(),
            lengthInches: String(r.length_inches || '').trim(),
            retailPriceAed: Number(r.retail_price_aed || 0),
            frontImageUrl: frontUrl,
            dhashHex: sig.dhashHex,
            colorVec: sig.colorVec
          };
          addedOrUpdated++;
        } catch {}
      }

      // Prune sold/archived SKUs from the live matcher index
      let pruned = 0;
      for (const k of Object.keys(inMemoryIndex.items)) {
        if (!activeSkus.has(k)) {
          delete inMemoryIndex.items[k];
          pruned++;
        }
      }

      if (addedOrUpdated > 0 || pruned > 0 || !inMemoryIndex.updatedAt) {
        saveIndexToDisk();
      }
      const total = Object.keys(inMemoryIndex.items).length;
      if (addedOrUpdated > 0 || pruned > 0) {
        console.log(`[VisualGarmentMatcher] Indexed ${addedOrUpdated} updated, ${pruned} pruned -> ${total} total IN_STOCK pieces ready.`);
      }
      return total;
    } catch (err: any) {
      console.warn('[VisualGarmentMatcher] Index notice:', err?.message);
      return Object.keys(inMemoryIndex.items).length;
    } finally {
      buildPromise = null;
    }
  })();

  return buildPromise;
}

export async function matchLiveCameraFrame(imageBase64: string, topK = 3, isCameraFrame = true) {
  const t0 = Date.now();
  loadIndexFromDisk();
  if (Object.keys(inMemoryIndex.items).length === 0) {
    await ensureVisualIndexBuilt(false);
  }

  const b64 = String(imageBase64 || '').replace(/^data:image\/[^;]+;base64,/i, '').trim();
  if (!b64) {
    throw new Error('imageBase64 is required');
  }
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 200) {
    throw new Error('Image buffer is empty or corrupted');
  }

  const probe = await computeVisualSignature(buf, isCameraFrame);
  const scored: Array<{ entry: IndexedGarmentEntry; score: number }> = [];

  for (const entry of Object.values(inMemoryIndex.items)) {
    if (!entry?.colorVec || entry.colorVec.length !== 48) continue;
    let absDiff = 0;
    for (let i = 0; i < 48; i++) {
      absDiff += Math.abs(probe.colorVec[i] - entry.colorVec[i]);
    }
    const colorSim = Math.max(0, 1 - absDiff / 20);
    const hashSim = 1 - hammingDistanceHex64(probe.dhashHex, entry.dhashHex) / 64;
    const score = colorSim * 0.65 + hashSim * 0.35;
    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const matches = scored.slice(0, Math.max(1, Math.min(8, topK))).map(({ entry, score }) => ({
    sku: entry.sku,
    id: entry.id,
    title: entry.title,
    brand: entry.brand,
    category: entry.category,
    size: entry.size,
    pitToPitInches: entry.pitToPitInches,
    lengthInches: entry.lengthInches,
    retailPriceAed: entry.retailPriceAed,
    frontImageUrl: entry.frontImageUrl,
    confidencePct: Math.max(1, Math.min(99, Math.round(score * 100)))
  }));

  return {
    matches,
    indexedCount: Object.keys(inMemoryIndex.items).length,
    elapsedMs: Date.now() - t0
  };
}

export function getVisualMatcherStatus() {
  loadIndexFromDisk();
  return {
    indexedCount: Object.keys(inMemoryIndex.items).length,
    building: Boolean(buildPromise),
    lastBuiltAt: lastBuildAt || inMemoryIndex.updatedAt || null
  };
}
