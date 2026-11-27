import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { withDb } from '../../db/pgPool.ts';

export interface VirtualTryOnRequest {
  personImageBase64: string;
  garmentImageUrl?: string;
  garmentSku?: string;
  garmentTitle?: string;
}

export interface VirtualTryOnResult {
  success: boolean;
  imageDataUrl?: string;
  engine?: string;
  garmentSku?: string;
  elapsedMs?: number;
  error?: string;
}

async function resolveGarmentBuffer(garmentImageUrl?: string, garmentSku?: string): Promise<{ buf: Buffer; resolvedSku: string; title: string }> {
  let url = String(garmentImageUrl || '').trim();
  let title = '';
  const sku = String(garmentSku || '').trim();

  if ((!url || !title) && sku) {
    try {
      const row = await withDb(async (c) => {
        const res = await c.query(
          `SELECT sku, brand_name, item_name, front_image_url
             FROM public.inventory_pieces
            WHERE UPPER(sku) = UPPER($1)
            LIMIT 1`,
          [sku]
        );
        return res.rows?.[0] || null;
      });
      if (row) {
        if (!url && row.front_image_url) url = String(row.front_image_url);
        title = [row.brand_name, row.item_name].filter(Boolean).join(' ').trim();
      }
    } catch {}
  }

  if (!url) {
    throw new Error('Garment photo or valid SKU is required for Virtual Try-On.');
  }

  // Try resolving local public/dist file first (zero HTTP latency)
  let rel = url.split('?')[0].trim();
  if (/^https?:\/\//i.test(rel)) {
    try {
      const u = new URL(rel);
      if (/vintagevibesgk\.com|127\.0\.0\.1|localhost/i.test(u.hostname)) {
        rel = u.pathname;
      }
    } catch {}
  }
  if (!/^https?:\/\//i.test(rel)) {
    const cleanRel = rel.replace(/^\/+/, '');
    if (!cleanRel.includes('..')) {
      const relCands = [cleanRel];
      const stM = cleanRel.match(/^storage\/v1\/(?:object|render\/image)\/public\/(.+)$/i);
      if (stM && stM[1]) {
        const afterPub = stM[1].replace(/^\/+/, '');
        relCands.push(path.join('uploads', afterPub), afterPub);
      }
      for (const rPath of relCands) {
        for (const base of ['public', 'dist']) {
          const localPath = path.resolve(process.cwd(), base, rPath);
          if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
            const buf = await sharp(fs.readFileSync(localPath))
              .rotate()
              .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 88 })
              .toBuffer();
            return { buf, resolvedSku: sku, title };
          }
        }
      }
    }
  }

  const absUrl = /^https?:\/\//i.test(url)
    ? url
    : `http://127.0.0.1:${process.env.PORT || 3000}/${url.replace(/^\/+/, '')}`;
  const resp = await fetch(absUrl, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) {
    throw new Error(`Could not fetch garment image (HTTP ${resp.status})`);
  }
  const raw = Buffer.from(await resp.arrayBuffer());
  const buf = await sharp(raw)
    .rotate()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return { buf, resolvedSku: sku, title };
}

async function resolveActiveGeminiApiKey(): Promise<string> {
  try {
    const dbKey = await withDb(async (c) => {
      const res = await c.query(
        `SELECT api_key FROM public.gemini_api_config WHERE id = 'default' LIMIT 1`
      );
      return String(res.rows?.[0]?.api_key || '').trim();
    });
    if (dbKey) return dbKey;
  } catch {}
  return String(process.env.GEMINI_API_KEY || '').trim();
}

export async function renderVirtualTryOn(req: VirtualTryOnRequest): Promise<VirtualTryOnResult> {
  const t0 = Date.now();
  try {
    const rawPersonB64 = String(req.personImageBase64 || '').replace(/^data:image\/[^;]+;base64,/i, '').trim();
    if (!rawPersonB64) {
      return { success: false, error: 'Please upload your photo first.' };
    }
    const rawPersonBuf = Buffer.from(rawPersonB64, 'base64');
    if (rawPersonBuf.length < 300 || rawPersonBuf.length > 9 * 1024 * 1024) {
      return { success: false, error: 'Photo must be between 1 KB and 8 MB.' };
    }

    const personJpg = await sharp(rawPersonBuf)
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();

    const { buf: garmentJpg, resolvedSku, title } = await resolveGarmentBuffer(req.garmentImageUrl, req.garmentSku);
    const displayTitle = String(req.garmentTitle || title || 'Vintage Archive Garment').trim();

    // Path A: Optional self-hosted CatVTON / IDM-VTON worker if configured
    const localCatVtonUrl = String(process.env.LOCAL_CATVTON_URL || '').trim();
    if (localCatVtonUrl) {
      try {
        const r = await fetch(localCatVtonUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            person_image_base64: personJpg.toString('base64'),
            garment_image_base64: garmentJpg.toString('base64'),
            garment_description: displayTitle
          }),
          signal: AbortSignal.timeout(35000)
        });
        if (r.ok) {
          const d: any = await r.json().catch(() => null);
          const outB64 = String(d?.image_base64 || d?.imageBase64 || '').replace(/^data:image\/[^;]+;base64,/i, '');
          if (outB64.length > 500) {
            return {
              success: true,
              imageDataUrl: `data:image/jpeg;base64,${outB64}`,
              engine: 'CatVTON-Local',
              garmentSku: resolvedSku,
              elapsedMs: Date.now() - t0
            };
          }
        }
      } catch {}
    }

    // Path B: Cloud Gemini Interactions Image Try-On (Zero Dubai RTX 3070 Ti GPU VRAM usage)
    const apiKey = await resolveActiveGeminiApiKey();
    if (!apiKey) {
      return { success: false, error: 'GEMINI_API_KEY is not configured in Global Setup -> Gemini API Key.' };
    }

    const prompt =
      `Photorealistic e-commerce virtual try-on: Dress the person from the FIRST photo naturally in the exact vintage garment shown in the SECOND photo (${displayTitle}). ` +
      `Preserve the person's exact face, skin tone, hair, pose, body proportions, and lighting/background from the first photo. ` +
      `Faithfully preserve the garment's exact color, pattern, print/graphic logo, collar/sleeves, and vintage drape on the person. Return a single realistic photo.`;

    const modelCandidates = ['gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image'];
    let lastErrMsg = 'Virtual try-on image generation failed.';

    for (const modelName of modelCandidates) {
      try {
        const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
            'Api-Revision': '2026-05-20'
          },
          body: JSON.stringify({
            model: modelName,
            input: [
              { type: 'text', text: prompt },
              { type: 'image', mime_type: 'image/jpeg', data: personJpg.toString('base64') },
              { type: 'image', mime_type: 'image/jpeg', data: garmentJpg.toString('base64') }
            ]
          }),
          signal: AbortSignal.timeout(45000)
        });

        const data: any = await resp.json().catch(() => null);
        if (!resp.ok) {
          const rawMsg = String(data?.error?.message || data?.message || `Gemini HTTP ${resp.status}`);
          if (
            resp.status === 401 ||
            resp.status === 403 ||
            /bound service account|API key not valid|API_KEY_INVALID/i.test(rawMsg)
          ) {
            return {
              success: false,
              error: `Gemini API Key expired/disabled (${rawMsg}). Please paste a fresh active AIza... Gemini API key in ERP Global Setup -> Gemini API Key.`,
              elapsedMs: Date.now() - t0
            };
          }
          lastErrMsg = rawMsg;
          continue;
        }

        let imgData = '';
        let imgMime = 'image/png';
        const steps = Array.isArray(data?.steps) ? data.steps : [];
        for (let i = steps.length - 1; i >= 0; i--) {
          if (steps[i]?.type === 'model_output' && Array.isArray(steps[i]?.content)) {
            const imgPart = [...steps[i].content].reverse().find((p: any) => p?.type === 'image' && p?.data);
            if (imgPart?.data) {
              imgData = String(imgPart.data);
              imgMime = String(imgPart.mime_type || 'image/png');
              break;
            }
          }
        }
        if (!imgData && data?.output_image?.data) {
          imgData = String(data.output_image.data);
          imgMime = String(data.output_image.mime_type || 'image/png');
        }

        if (imgData) {
          return {
            success: true,
            imageDataUrl: `data:${imgMime};base64,${imgData}`,
            engine: `Gemini-VTON (${modelName})`,
            garmentSku: resolvedSku,
            elapsedMs: Date.now() - t0
          };
        }
        const textParts = steps
          .filter((s: any) => s?.type === 'model_output' && Array.isArray(s?.content))
          .flatMap((s: any) => s.content)
          .filter((p: any) => p?.type === 'text' && p?.text)
          .map((p: any) => String(p.text));
        if (textParts.length) lastErrMsg = textParts.join(' ').slice(0, 180);
      } catch (mErr: any) {
        lastErrMsg = mErr?.message || lastErrMsg;
      }
    }

    return {
      success: false,
      error: lastErrMsg,
      elapsedMs: Date.now() - t0
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Virtual Try-On error',
      elapsedMs: Date.now() - t0
    };
  }
}
