/**
 * High-Speed Gemini Vision AI Bulk Garment Photo Classifier
 *
 * Automatically inspects up to 3 unorganized garment photos and intelligently
 * classifies each image into:
 * 1. Front Look (chest graphics, silhouette, front collar)
 * 2. Back Look (rear view, back graphics)
 * 3. Tag / Label (care instructions, brand neck tag, size tag, wash label)
 */

export interface BulkClassificationResult {
  front_index: number;
  back_index: number;
  tag_index: number;
  length_tape_index?: number;
  width_tape_index?: number;
  confidence?: number;
  reasoning?: string;
  source: 'GEMINI_AI_VISION' | 'HEURISTIC_FALLBACK';
}

function cleanBase64(b64: string): string {
  return b64.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, '').trim();
}

function detectMime(b64: string): string {
  const match = b64.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,/);
  return match ? match[1] : 'image/jpeg';
}

const CLASSIFICATION_CASCADE_MODELS: string[] = [
  'gemini-3.7-flash',
  'gemini-3-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-2.5-pro'
];

/**
 * Classifies an array of up to 5 garment images using Google Gemini Vision API:
 * 1. Clean Front Look (no measuring tape)
 * 2. Back Look
 * 3. Tag / Label
 * 4. Length Measurement Tape (vertical tape)
 * 5. Width / Chest Measurement Tape (horizontal tape)
 */
export async function classifyGarmentPhotosWithGemini(
  base64Images: string[],
  apiKeyOverride?: string
): Promise<BulkClassificationResult> {
  if (!base64Images || base64Images.length === 0) {
    return { front_index: 0, back_index: 1, tag_index: 2, length_tape_index: 3, width_tape_index: 4, source: 'HEURISTIC_FALLBACK' };
  }

  if (base64Images.length === 1) {
    return { front_index: 0, back_index: 0, tag_index: 0, source: 'HEURISTIC_FALLBACK' };
  }

  if (base64Images.length === 2) {
    return { front_index: 0, back_index: 1, tag_index: 0, source: 'HEURISTIC_FALLBACK' };
  }

  // 1. Resolve Gemini API Key
  const apiKey =
    (apiKeyOverride || '').trim() ||
    (typeof process !== 'undefined' && (process.env?.GEMINI_API_KEY || process.env?.VITE_GEMINI_API_KEY)) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
    (typeof window !== 'undefined' && (window as any).__ENV__?.VITE_GEMINI_API_KEY) ||
    (typeof localStorage !== 'undefined' ? (localStorage.getItem('vintage_gemini_api_key') || '').trim() : '');

  // 2. Direct browser execution via Gemini Vision API
  if (apiKey && apiKey.length > 10) {
    const parts: any[] = [];
    const imagesToClassify = base64Images.slice(0, 5);

    imagesToClassify.forEach((img, idx) => {
      const mime = detectMime(img);
      const data = cleanBase64(img);
      parts.push({
        text: `--- GARMENT PHOTO [ARRAY INDEX ${idx}] ---`
      });
      parts.push({
        inlineData: {
          mimeType: mime,
          data: data
        }
      });
    });

    parts.push({
      text: `You are an expert AI garment cataloguer and archivist for a vintage thrift enterprise.
You have been provided with ${imagesToClassify.length} photos of a single clothing garment piece, with array indices 0 to ${imagesToClassify.length - 1}.

Carefully inspect each image and classify which array index corresponds to each slot:
1. "front_index": The CLEAN FRONT view of the garment (shows the front chest, main graphic, front collar, buttons, or zipper WITHOUT any measuring tape placed over it).
2. "back_index": The BACK view of the garment (shows the reverse rear view, back graphic, or blank back side).
3. "tag_index": The CLOTHING TAG / LABEL (close-up photo showing brand label, care instructions, neck tag, size tag, or wash tag).
4. "length_tape_index": The LENGTH MEASUREMENT TAPE photo (shows a measuring tape placed VERTICALLY down the length of the garment from collar/shoulder seam to bottom hem).
5. "width_tape_index": The WIDTH / CHEST / PIT-TO-PIT MEASUREMENT TAPE photo (shows a measuring tape placed HORIZONTALLY across the chest from armpit to armpit).

CRITICAL ANTI-CONFUSION RULES:
- DO NOT assign an image that has a measuring tape on it as "front_index" if a clean front image without tape exists!
- If an image has a measuring tape running vertically (top-to-bottom), it is "length_tape_index".
- If an image has a measuring tape running horizontally (left-to-right across the chest), it is "width_tape_index".
- All assigned indices MUST be distinct integer numbers within [0, ${imagesToClassify.length - 1}].
- Return ONLY a pure JSON object without markdown formatting or codeblocks:
{
  "front_index": 0,
  "back_index": 1,
  "tag_index": 2,
  "length_tape_index": 3,
  "width_tape_index": 4,
  "confidence": 0.95,
  "reasoning": "Image 0 has clean front look without tape, Image 1 is back view, Image 2 is neck label, Image 3 has vertical length tape, Image 4 has horizontal width tape"
}`
    });

    const preferredModel = (typeof localStorage !== 'undefined' ? (localStorage.getItem('vintage_gemini_model') || '').trim() : '') || 'gemini-3.7-flash';
    const models = Array.from(new Set([
      preferredModel,
      ...CLASSIFICATION_CASCADE_MODELS
    ]));

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.1,
              response_mime_type: 'application/json'
            }
          })
        });

        if (!response.ok) {
          continue;
        }

        const json = await response.json();
        const candidate = json.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;

        if (text) {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            let f = Number(parsed.front_index ?? parsed.frontIndex ?? parsed.front);
            let b = Number(parsed.back_index ?? parsed.backIndex ?? parsed.back);
            let t = Number(parsed.tag_index ?? parsed.tagIndex ?? parsed.tag ?? parsed.label_index);
            let l = parsed.length_tape_index !== undefined ? Number(parsed.length_tape_index) : undefined;
            let w = parsed.width_tape_index !== undefined ? Number(parsed.width_tape_index) : undefined;

            // Normalize 1-based indexing if LLM generated 1, 2, 3...
            const vals = [f, b, t, l, w].filter((v): v is number => v !== undefined && !isNaN(v));
            if (Math.min(...vals) === 1 && Math.max(...vals) === imagesToClassify.length) {
              f -= 1;
              b -= 1;
              t -= 1;
              if (l !== undefined) l -= 1;
              if (w !== undefined) w -= 1;
            }

            // Validate and collision-repair across all provided images
            const total = imagesToClassify.length;
            const available = Array.from({ length: total }, (_, i) => i);
            const assigned = new Set<number>();

            const assignSlot = (candidateVal?: number, fallbackIndex = 0): number => {
              if (candidateVal !== undefined && !isNaN(candidateVal) && candidateVal >= 0 && candidateVal < total && !assigned.has(candidateVal)) {
                assigned.add(candidateVal);
                return candidateVal;
              }
              const nextAvail = available.find(x => !assigned.has(x)) ?? fallbackIndex;
              assigned.add(nextAvail);
              return nextAvail;
            };

            const fClean = assignSlot(f, 0);
            const bClean = assignSlot(b, 1 % total);
            const tClean = assignSlot(t, 2 % total);
            const lClean = total >= 4 ? assignSlot(l, 3 % total) : undefined;
            const wClean = total >= 5 ? assignSlot(w, 4 % total) : undefined;

            return {
              front_index: fClean,
              back_index: bClean,
              tag_index: tClean,
              length_tape_index: lClean,
              width_tape_index: wClean,
              confidence: Number(parsed.confidence) || 0.95,
              reasoning: parsed.reasoning || 'Gemini Vision AI classified clean front, back, tag and tape measurements.',
              source: 'GEMINI_AI_VISION'
            };
          }
        }
      } catch (err: any) {
        console.warn(`[GeminiBulkClassifier] Model ${model} failed, trying cascade fallback:`, err?.message);
      }
    }
  }

  // 3. Fallback to server endpoint POST /api/purchase/classify-garment-photos (when running in browser without direct API key)
  if (typeof fetch !== 'undefined') {
    try {
      const serverRes = await fetch('/api/purchase/classify-garment-photos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
        },
        body: JSON.stringify({ images: base64Images })
      });

      if (serverRes.ok) {
        const serverData = await serverRes.json();
        if (serverData && serverData.success && serverData.front_index !== undefined) {
          return {
            front_index: Number(serverData.front_index),
            back_index: Number(serverData.back_index),
            tag_index: Number(serverData.tag_index),
            length_tape_index: serverData.length_tape_index !== undefined ? Number(serverData.length_tape_index) : undefined,
            width_tape_index: serverData.width_tape_index !== undefined ? Number(serverData.width_tape_index) : undefined,
            confidence: Number(serverData.confidence) || 0.95,
            reasoning: serverData.reasoning || 'Gemini Vision AI classified via backend',
            source: 'GEMINI_AI_VISION'
          };
        }
      }
    } catch (srvErr: any) {
      console.warn('[GeminiBulkClassifier] Server proxy classification notice:', srvErr?.message);
    }
  }

  // 4. Fallback to default sequential order [0: Front, 1: Back, 2: Tag, 3: Length Tape, 4: Width Tape]
  const count = base64Images.length;
  return {
    front_index: 0,
    back_index: count > 1 ? 1 : 0,
    tag_index: count > 2 ? 2 : 0,
    length_tape_index: count > 3 ? 3 : undefined,
    width_tape_index: count > 4 ? 4 : undefined,
    confidence: 0.8,
    reasoning: 'Heuristic sequential assignment applied.',
    source: 'HEURISTIC_FALLBACK'
  };
}
