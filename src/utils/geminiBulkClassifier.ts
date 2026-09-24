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
 * Classifies an array of 2 or 3 garment images using Google Gemini Vision API.
 */
export async function classifyGarmentPhotosWithGemini(
  base64Images: string[],
  apiKeyOverride?: string
): Promise<BulkClassificationResult> {
  if (!base64Images || base64Images.length === 0) {
    return { front_index: 0, back_index: 1, tag_index: 2, source: 'HEURISTIC_FALLBACK' };
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
    const imagesToClassify = base64Images.slice(0, 3);

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
You have been provided with ${imagesToClassify.length} photos of a single clothing garment piece, with array indices 0, 1, and 2.

Carefully inspect each image and classify which array index corresponds to each slot:
1. "front_index": The FRONT view of the garment (shows the front chest, main graphic, front collar, buttons, or zipper).
2. "back_index": The BACK view of the garment (shows the reverse rear view, back graphic, or blank back side).
3. "tag_index": The CLOTHING TAG / LABEL (close-up photo showing brand label, care instructions, neck tag, size tag, or wash tag).

CRITICAL REQUIREMENTS:
- "front_index", "back_index", and "tag_index" MUST be distinct integer numbers (0, 1, or 2).
- Return ONLY a pure JSON object without markdown formatting or codeblocks:
{
  "front_index": 0,
  "back_index": 1,
  "tag_index": 2,
  "confidence": 0.95,
  "reasoning": "Image 1 has the chest logo, Image 0 shows the back, Image 2 is a close-up of the neck label"
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
          const cleanedText = text.replace(/```json\s*|```/g, '').trim();
          const parsed = JSON.parse(cleanedText);

          let f = Number(parsed.front_index);
          let b = Number(parsed.back_index);
          let t = Number(parsed.tag_index);

          // Validate indices
          if (!isNaN(f) && !isNaN(b) && !isNaN(t)) {
            // Ensure bounds [0, imagesToClassify.length - 1]
            f = Math.max(0, Math.min(imagesToClassify.length - 1, f));
            b = Math.max(0, Math.min(imagesToClassify.length - 1, b));
            t = Math.max(0, Math.min(imagesToClassify.length - 1, t));

            // If collision occurred, repair indices
            if (f === b || f === t || b === t) {
              const available = [0, 1, 2].slice(0, imagesToClassify.length);
              const used = new Set<number>();
              if (available.includes(f)) used.add(f);
              if (used.has(b) || !available.includes(b)) {
                b = available.find(x => !used.has(x)) ?? b;
              }
              used.add(b);
              if (used.has(t) || !available.includes(t)) {
                t = available.find(x => !used.has(x)) ?? t;
              }
            }

            return {
              front_index: f,
              back_index: b,
              tag_index: t,
              confidence: Number(parsed.confidence) || 0.95,
              reasoning: parsed.reasoning || 'Gemini Vision AI classified Front, Back & Tag successfully.',
              source: 'GEMINI_AI_VISION'
            };
          }
        }
      } catch (err: any) {
        console.warn(`[GeminiBulkClassifier] Model ${model} failed, trying cascade fallback:`, err?.message);
      }
    }
  }

  // 3. Fallback to default sequential order [0: Front, 1: Back, 2: Tag]
  return {
    front_index: 0,
    back_index: 1,
    tag_index: 2,
    confidence: 0.8,
    reasoning: 'Heuristic sequential assignment applied.',
    source: 'HEURISTIC_FALLBACK'
  };
}
