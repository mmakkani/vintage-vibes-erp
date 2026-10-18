import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { GoogleGenAI } from '@google/genai';

export interface UstadAppraisalLesson {
  id: string;
  timestamp: string;
  brand: string;
  size: string;
  countryOfOrigin: string;
  category: string;
  primaryColor: string;
  modelNumber?: string;
  rnNumber?: string;
  fabricComposition?: string;
  pitToPitInches?: number;
  lengthInches?: number;
  garmentTitle: string;
  grailNotes: string;
  hqAddressIgnored?: string;
}

export interface UstadWhatsappLesson {
  id: string;
  timestamp: string;
  customerLang: string;
  customerMessage: string;
  ustadReplyText: string;
  action: string;
}

interface UstadShagirdMemoryStore {
  garmentAppraisals: UstadAppraisalLesson[];
  whatsappReplies: UstadWhatsappLesson[];
  totalUstadCalls: number;
  totalShagirdLessonsLearned: number;
  lastUpdatedAt: string;
}

const GEMINI_USTAD_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-flash-lite-latest',
  'gemini-3.8-flash',
  'gemma-4-26b-a4b-it'
];

const modelCooldownUntil = new Map<string, number>();
let lastPythonSyncAt = 0;
let cachedGenAiSdkClient: GoogleGenAI | null = null;
let cachedGenAiSdkKey = '';

const MEMORY_FILE_PATH = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? path.join(os.tmpdir(), 'ai_ustad_shagird_memory.json')
  : path.join(process.cwd(), 'data', 'ai_ustad_shagird_memory.json');

const OWNER_MEMORY_FILE_PATH = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? path.join(os.tmpdir(), 'ai_learned_memory.json')
  : path.join(process.cwd(), 'data', 'ai_learned_memory.json');

let memoryCache: UstadShagirdMemoryStore | null = null;

export function getGeminiUstadApiKey(): string {
  const envKey = (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();
  if (envKey && envKey.length > 15 && !envKey.includes('TestSecretKey') && envKey !== 'LOCAL_RTX_3070_TI_GPU_VISION') {
    return envKey;
  }
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^(?:VITE_)?GEMINI_API_KEY\s*=\s*(.+)$/);
        if (m && m[1]) {
          const val = m[1].trim().replace(/^["']|["']$/g, '');
          if (val.length > 15 && !val.includes('TestSecretKey') && val !== 'LOCAL_RTX_3070_TI_GPU_VISION') {
            return val;
          }
        }
      }
    }
  } catch (_) {}
  return '';
}

export function getGoogleGenAiSdkClient(): GoogleGenAI | null {
  const apiKey = getGeminiUstadApiKey();
  if (!apiKey) return null;
  if (!cachedGenAiSdkClient || cachedGenAiSdkKey !== apiKey) {
    cachedGenAiSdkClient = new GoogleGenAI({ apiKey });
    cachedGenAiSdkKey = apiKey;
  }
  return cachedGenAiSdkClient;
}

/**
 * Triggers the Python `google-genai` + `ollama` SDK trainer (`scripts/ustad_shagird_trainer.py --sync-modelfile`)
 * in the background to rebuild `vintage-shagird:latest` on the local RTX 3070 Ti GPU whenever new lessons are saved.
 */
export function triggerPythonShagirdTrainerSync(force = false): void {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return;
  const now = Date.now();
  if (!force && now - lastPythonSyncAt < 30_000) return;
  lastPythonSyncAt = now;

  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'ustad_shagird_trainer.py');
    if (!fs.existsSync(scriptPath)) return;

    const venvWinPython = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const venvPosixPython = path.join(process.cwd(), '.venv', 'bin', 'python');
    const pythonBin = fs.existsSync(venvWinPython)
      ? venvWinPython
      : fs.existsSync(venvPosixPython)
      ? venvPosixPython
      : 'python';

    const child = spawn(pythonBin, [scriptPath, '--sync-modelfile'], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
  } catch (_) {}
}

export function loadUstadShagirdMemory(): UstadShagirdMemoryStore {
  if (memoryCache) return memoryCache;
  try {
    if (fs.existsSync(MEMORY_FILE_PATH)) {
      const raw = fs.readFileSync(MEMORY_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      memoryCache = {
        garmentAppraisals: Array.isArray(parsed.garmentAppraisals) ? parsed.garmentAppraisals : [],
        whatsappReplies: Array.isArray(parsed.whatsappReplies) ? parsed.whatsappReplies : [],
        totalUstadCalls: Number(parsed.totalUstadCalls) || 0,
        totalShagirdLessonsLearned: Number(parsed.totalShagirdLessonsLearned) || 0,
        lastUpdatedAt: parsed.lastUpdatedAt || new Date().toISOString()
      };
      return memoryCache;
    }
  } catch (_) {}

  memoryCache = {
    garmentAppraisals: [],
    whatsappReplies: [],
    totalUstadCalls: 0,
    totalShagirdLessonsLearned: 0,
    lastUpdatedAt: new Date().toISOString()
  };
  return memoryCache;
}

function saveUstadShagirdMemory(store: UstadShagirdMemoryStore): void {
  try {
    const dir = path.dirname(MEMORY_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    store.lastUpdatedAt = new Date().toISOString();
    fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(store, null, 2), 'utf8');
    triggerPythonShagirdTrainerSync(false);
  } catch (_) {}
}

export function getOwnerLearnedRulesSummary(): string {
  try {
    if (!fs.existsSync(OWNER_MEMORY_FILE_PATH)) return '';
    const raw = JSON.parse(fs.readFileSync(OWNER_MEMORY_FILE_PATH, 'utf8'));
    const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    if (items.length === 0) return '';
    const lines = items
      .slice(0, 20)
      .map((item: any, idx: number) => `${idx + 1}. [${item.type || 'RULE'}] ${item.content}`)
      .join('\n');
    return `\nMANDATORY OWNER & CREATOR LEARNED BRAIN RULES:\n${lines}\n`;
  } catch (_) {
    return '';
  }
}

export function recordUstadAppraisalLesson(lesson: Omit<UstadAppraisalLesson, 'id' | 'timestamp'>): number {
  const store = loadUstadShagirdMemory();
  store.totalUstadCalls += 1;
  if (!lesson.brand || lesson.brand === 'Unbranded' || lesson.brand === 'Vintage Archive') {
    saveUstadShagirdMemory(store);
    return store.totalShagirdLessonsLearned;
  }
  const entry: UstadAppraisalLesson = {
    ...lesson,
    id: `ustad-apr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString()
  };
  store.garmentAppraisals = [
    entry,
    ...store.garmentAppraisals.filter(
      x => !(x.brand === entry.brand && x.countryOfOrigin === entry.countryOfOrigin && x.modelNumber === entry.modelNumber)
    )
  ].slice(0, 60);
  store.totalShagirdLessonsLearned += 1;
  saveUstadShagirdMemory(store);
  return store.totalShagirdLessonsLearned;
}

export function recordUstadWhatsappLesson(lesson: Omit<UstadWhatsappLesson, 'id' | 'timestamp'>): void {
  if (!lesson.customerMessage || !lesson.ustadReplyText || lesson.ustadReplyText.length < 6) return;
  const store = loadUstadShagirdMemory();
  const entry: UstadWhatsappLesson = {
    ...lesson,
    id: `ustad-wa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString()
  };
  store.whatsappReplies = [
    entry,
    ...store.whatsappReplies.filter(
      x => x.customerMessage.toLowerCase().trim() !== entry.customerMessage.toLowerCase().trim()
    )
  ].slice(0, 80);
  store.totalUstadCalls += 1;
  store.totalShagirdLessonsLearned += 1;
  saveUstadShagirdMemory(store);
}

export function getShagirdAppraisalMemoryPrompt(): string {
  const store = loadUstadShagirdMemory();
  if (!store.garmentAppraisals.length) return '';
  const examples = store.garmentAppraisals
    .slice(0, 8)
    .map(
      (a, idx) =>
        `Lesson #${idx + 1}: Brand="${a.brand}", Size="${a.size}", MadeIn="${a.countryOfOrigin}"` +
        (a.modelNumber ? `, WashTagModel="${a.modelNumber}"` : '') +
        (a.rnNumber ? `, RN="${a.rnNumber}"` : '') +
        (a.fabricComposition ? `, Fabric="${a.fabricComposition}"` : '') +
        ` -> Title="${a.garmentTitle}"`
    )
    .join('\n');
  return `\nRECENT LESSONS TAUGHT BY GEMINI USTAD TO LOCAL SHAGIRD AI:\n${examples}\n`;
}

export function getShagirdWhatsappMemoryPrompt(lang?: string): string {
  const store = loadUstadShagirdMemory();
  const filtered = lang
    ? store.whatsappReplies.filter(w => w.customerLang === lang)
    : store.whatsappReplies;
  const pool = filtered.length > 0 ? filtered : store.whatsappReplies;
  if (!pool.length) return '';
  const examples = pool
    .slice(0, 6)
    .map(
      (w, idx) =>
        `Ustad Example #${idx + 1} (${w.customerLang}): Customer="${w.customerMessage}" -> Reply="${w.ustadReplyText}" (Action=${w.action})`
    )
    .join('\n');
  return `\nRECENT SALESMAN REPLIES TAUGHT BY GEMINI USTAD:\n${examples}\n`;
}

function cleanBase64Image(raw: string): { mimeType: string; data: string } | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (match) {
    return {
      mimeType: match[1] || 'image/jpeg',
      data: match[2].replace(/\s/g, '')
    };
  }
  if (trimmed.length > 100 && !trimmed.startsWith('http')) {
    return {
      mimeType: 'image/jpeg',
      data: trimmed.replace(/\s/g, '')
    };
  }
  return null;
}

/**
 * Core call to Google Gemini 3.8 Flash ("Ustad" / Master Teacher Engine)
 * Uses thinkingConfig: { thinkingBudget: 0 } and generous maxOutputTokens (4096)
 * so Gemini 3.8 Flash NEVER truncates JSON output due to internal thinking tokens!
 */
export async function callGeminiUstad(options: {
  prompt: string;
  systemInstruction?: string;
  imagesBase64?: string[];
  jsonMode?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<{ ok: boolean; text: string; modelUsed: string }> {
  const apiKey = getGeminiUstadApiKey();
  if (!apiKey) {
    return { ok: false, text: '', modelUsed: 'none' };
  }

  const parts: any[] = [];
  if (Array.isArray(options.imagesBase64)) {
    for (const img of options.imagesBase64) {
      const parsed = cleanBase64Image(img);
      if (parsed && parsed.data.length > 100) {
        parts.push({
          inlineData: {
            mimeType: parsed.mimeType,
            data: parsed.data
          }
        });
      }
    }
  }
  parts.push({ text: options.prompt });

  const safeMaxTokens = Math.max(options.maxOutputTokens ?? 4096, 2048);
  const now = Date.now();

  for (const modelName of GEMINI_USTAD_MODELS) {
    const cooldownExp = modelCooldownUntil.get(modelName) || 0;
    if (cooldownExp > now) {
      continue;
    }

    const isGemmaModel = modelName.startsWith('gemma-');
    const thinkingAttempts = isGemmaModel ? [false] : [true, false];

    for (const useThinkingZero of thinkingAttempts) {
      try {
        const payload: any = {
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: options.temperature ?? 0.1,
            maxOutputTokens: safeMaxTokens,
            ...(!isGemmaModel && options.jsonMode ? { responseMimeType: 'application/json' } : {}),
            ...(useThinkingZero ? { thinkingConfig: { thinkingBudget: 0 } } : {})
          }
        };

        if (options.systemInstruction && !isGemmaModel) {
          payload.systemInstruction = {
            parts: [{ text: options.systemInstruction }]
          };
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(options.timeoutMs ?? 24000)
        });

        if (!resp.ok) {
          if (resp.status === 403) {
            return { ok: false, text: '', modelUsed: 'none' };
          }
          if (resp.status === 429) {
            // Put this specific model bucket on 15-minute cooldown and immediately rotate to the next Gemini 3.x model!
            modelCooldownUntil.set(modelName, Date.now() + 15 * 60 * 1000);
            break;
          }
          if (resp.status === 404) {
            modelCooldownUntil.set(modelName, Date.now() + 60 * 60 * 1000);
            break;
          }
          if (useThinkingZero && resp.status === 400) {
            // If a specific model doesn't support thinkingConfig, retry immediately without thinkingConfig
            continue;
          }
          break;
        }

        const data: any = await resp.json();
        const candParts = data?.candidates?.[0]?.content?.parts || [];
        const textOut = candParts
          .filter((p: any) => !p?.thought)
          .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
          .join('')
          .trim();

        if (textOut) {
          return { ok: true, text: textOut, modelUsed: modelName };
        }
      } catch (_) {
        break;
      }
    }
  }

  return { ok: false, text: '', modelUsed: 'none' };
}

/**
 * 1. USTAD-SHAGIRD 6-PHOTO SLOT CLASSIFIER
 * Uses Gemini 3.8 Flash Multi-Image Vision (Ustad) to inspect all 6 photos simultaneously
 * and map each photo to its exact slot (Front, Back, Main Tag, Wash Tag, Length Tape, Width Tape).
 */
export async function classifyGarmentSlotsWithUstad(imagesBase64: string[]): Promise<{
  ok: boolean;
  classification?: {
    front_index: number;
    back_index: number;
    tag_index: number;
    wash_tag_index: number;
    length_tape_index: number;
    width_tape_index: number;
    per_photo_types?: string[];
  };
  modelUsed?: string;
}> {
  const count = imagesBase64.length;
  if (count === 0) return { ok: false };

  const prompt = `You are evaluating ${count} photos (indexed 0 to ${count - 1}) of a single garment for a 6-slot studio sorting station.
Inspect each photo carefully in order (Image 0, Image 1, ..., Image ${count - 1}) and classify each photo into ONE of these 6 categories:

1. "FRONT": Full view of the FRONT of the garment (collar neckline curving downward, front chest logo/buttons/pocket, NO measuring tape on it, NOT a macro close-up of a label).
2. "BACK": Full view of the BACK of the garment (high back collar, plain back or back graphic, NO measuring tape on it, NOT a macro close-up of a label).
3. "MAIN_TAG": Macro close-up photo of the MAIN NECK / COLLAR BRAND TAG sewn inside the collar showing Brand logo and Size (S, M, L, XL, XXL).
4. "WASH_TAG": Macro close-up photo of the INNER WASH / CARE LABEL (often a white or black satin/paper strip showing fabric composition like "100% Cotton", washing symbols, RN#, MODEL NO., corporate address, and "Made in [Country]").
   CRITICAL RULE: Do NOT confuse a white vertical wash tag close-up with a measuring tape! A wash tag has printed text paragraphs ("MODEL NO.", "RN#", "Made in...", care symbols), whereas a measuring tape has ruler inch/cm tick marks stretched across a full shirt.
5. "LENGTH_TAPE": A photo showing a thin TAILOR MEASURING TAPE (yellow, white, or silver ruler with inch/cm numbers) stretched VERTICALLY (top-to-bottom from collar shoulder to bottom hem) to measure garment length.
6. "WIDTH_TAPE": A photo showing a thin TAILOR MEASURING TAPE (yellow, white, or silver ruler with inch/cm numbers) stretched HORIZONTALLY (left-to-right across the chest from armpit to armpit) to measure chest width.

Return ONLY valid JSON with this exact structure (every index must be an integer between 0 and ${count - 1}, and when ${count} >= 6 all 6 indices must be distinct integers 0..5):
{
  "per_photo_types": ["FRONT" | "BACK" | "MAIN_TAG" | "WASH_TAG" | "LENGTH_TAPE" | "WIDTH_TAPE", ...],
  "front_index": number,
  "back_index": number,
  "tag_index": number,
  "wash_tag_index": number,
  "length_tape_index": number,
  "width_tape_index": number
}`;

  const ustadRes = await callGeminiUstad({
    prompt,
    imagesBase64,
    jsonMode: true,
    temperature: 0.05,
    maxOutputTokens: 2048,
    timeoutMs: 24000
  });

  if (!ustadRes.ok) {
    return { ok: false };
  }

  try {
    const cleaned = ustadRes.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const types: string[] = Array.isArray(parsed?.per_photo_types)
      ? parsed.per_photo_types.map((t: any) => String(t || '').toUpperCase())
      : [];

    const used = new Set<number>();
    const claimValid = (idx: any, matchTypeKeyword?: string): number | undefined => {
      if (typeof idx === 'number' && idx >= 0 && idx < count && !used.has(idx)) {
        used.add(idx);
        return idx;
      }
      if (matchTypeKeyword && types.length > 0) {
        for (let i = 0; i < count; i++) {
          if (!used.has(i) && types[i]?.includes(matchTypeKeyword)) {
            used.add(i);
            return i;
          }
        }
      }
      return undefined;
    };

    const nextUnused = (): number => {
      for (let i = 0; i < count; i++) {
        if (!used.has(i)) {
          used.add(i);
          return i;
        }
      }
      return 0;
    };

    const lIdx = count >= 5 ? claimValid(parsed.length_tape_index, 'LENGTH') : undefined;
    const wIdx = count >= 6 ? claimValid(parsed.width_tape_index, 'WIDTH') : undefined;
    const washIdx = count >= 4 ? claimValid(parsed.wash_tag_index, 'WASH') : undefined;
    const tIdx = count >= 3 ? claimValid(parsed.tag_index, 'TAG') : undefined;
    const fIdx = claimValid(parsed.front_index, 'FRONT') ?? nextUnused();
    const bIdx = count >= 2 ? (claimValid(parsed.back_index, 'BACK') ?? nextUnused()) : 0;

    const finalClassification = {
      per_photo_types: types,
      front_index: fIdx,
      back_index: bIdx,
      tag_index: count >= 3 ? (tIdx ?? nextUnused()) : 0,
      wash_tag_index: count >= 4 ? (washIdx ?? nextUnused()) : 0,
      length_tape_index: count >= 5 ? (lIdx ?? nextUnused()) : 0,
      width_tape_index: count >= 6 ? (wIdx ?? nextUnused()) : 0
    };

    console.log(`[Ustad 6-Slot Classifier] Model: ${ustadRes.modelUsed} | Slots:`, JSON.stringify(finalClassification));
    return {
      ok: true,
      classification: finalClassification,
      modelUsed: ustadRes.modelUsed
    };
  } catch (err: any) {
    console.warn('[Ustad 6-Slot Parse Notice]:', err?.message);
  }

  return { ok: false };
}

/**
 * 2. USTAD-SHAGIRD COMPLETE GARMENT TAG + WASH TAG + ORIGIN + MEASUREMENT APPRAISAL
 * Consolidates Main Tag + Wash Tag + Front + Back + Length Tape + Width Tape in ONE Gemini 3.8 Flash call,
 * extracts Wash Tag details (Model No, RN#, Fabric %, Care, True Made-In Country ignoring P.O. Box HQ address)
 * for Description & Title, and teaches Local Shagird AI!
 */
export async function appraiseGarmentWithUstad(params: {
  mainTagImageBase64?: string;
  washTagImageBase64?: string;
  frontImageBase64?: string;
  backImageBase64?: string;
  lengthTapeImageBase64?: string;
  widthTapeImageBase64?: string;
  fallbackImagesBase64?: string[];
}): Promise<{
  ok: boolean;
  data?: {
    brand: string;
    size: string;
    countryOfOrigin: string;
    gender: string;
    category: string;
    primaryColor: string;
    era: string;
    stitchType: string;
    modelNumber: string;
    rnNumber: string;
    fabricComposition: string;
    pitToPitInches: number;
    lengthInches: number;
    conditionGrade: string;
    conditionScore: number;
    garmentTitle: string;
    grailNotes: string;
    estimatedMarketValueAed: number;
    recommendedRetailPriceAed: number;
    shagirdLessonsLearned: number;
  };
  modelUsed?: string;
}> {
  const labeledImages: { label: string; base64: string }[] = [];
  if (params.mainTagImageBase64) labeledImages.push({ label: 'MAIN_NECK_TAG', base64: params.mainTagImageBase64 });
  if (params.washTagImageBase64) labeledImages.push({ label: 'WASH_CARE_TAG', base64: params.washTagImageBase64 });
  if (params.frontImageBase64) labeledImages.push({ label: 'FRONT_GARMENT', base64: params.frontImageBase64 });
  if (params.backImageBase64) labeledImages.push({ label: 'BACK_GARMENT', base64: params.backImageBase64 });
  if (params.lengthTapeImageBase64) labeledImages.push({ label: 'LENGTH_TAPE_PHOTO', base64: params.lengthTapeImageBase64 });
  if (params.widthTapeImageBase64) labeledImages.push({ label: 'WIDTH_TAPE_PHOTO', base64: params.widthTapeImageBase64 });

  if (labeledImages.length === 0 && Array.isArray(params.fallbackImagesBase64)) {
    params.fallbackImagesBase64.slice(0, 6).forEach((img, idx) => {
      if (img) labeledImages.push({ label: `PHOTO_${idx + 1}`, base64: img });
    });
  }

  if (labeledImages.length === 0) {
    return { ok: false };
  }

  const imageOrderDesc = labeledImages.map((item, idx) => `Image #${idx + 1}: ${item.label}`).join('\n');
  const shagirdMemory = getShagirdAppraisalMemoryPrompt();

  const prompt = `You are the Master Vintage & Branded Apparel Appraiser ("Ustad") for Vintage Vibes Luxury Apparel in Dubai, UAE.
You are inspecting ${labeledImages.length} photos of the SAME garment in this exact order:
${imageOrderDesc}
${shagirdMemory}

CRITICAL MULTI-PHOTO CONSOLIDATION RULES:
1. CONSOLIDATE MAIN TAG + WASH TAG + FRONT CHEST LOGO:
   - Check BOTH the MAIN_NECK_TAG and WASH_CARE_TAG (and Front Chest Logo) for the true Brand name.
   - Often the Wash Tag has the exact Brand name, Model Number (e.g., "MODEL NO. TK6532-M"), RN Number (e.g., "RN#14806"), and Fabric Composition (e.g., "100% Cotton" or "60% Cotton / 40% Polyester").
   - Extract "modelNumber", "rnNumber", and "fabricComposition" from the Wash Tag and include them in "grailNotes" (the product description) so buyers see full authentic details!

2. TRUE SIZE EXTRACTION:
   - Read the exact garment size from MAIN_NECK_TAG or WASH_CARE_TAG (normalize to S, M, L, XL, 2XL, 3XL, XS, or numeric waist like 32x30).
   - Hint: On some wash tags (like Carhartt), the model number ends with a size letter after a hyphen (e.g., "MODEL NO. TK6532-M" -> Size "M") or is printed near the top/bottom of the label.

3. TRUE COUNTRY OF ORIGIN ("Made in ...") — NEVER CONFUSE WITH CORPORATE HQ ADDRESS!
   - Many US/EU brands print their company headquarters address on the wash tag, such as:
     "Carhartt, Inc. P.O. Box 600 Dearborn, MI 48121 USA" or "Nike Beaverton, OR USA".
   - NEVER use a P.O. Box, Street, City, State, or ZIP code address as the Country of Origin!
   - Look strictly for the line that explicitly says:
     "Made in [Country]" / "Fabriqué au/en [Country]" / "Hecho en [Country]" / "Fabricado em [Country]"
     (for example, right below "carhartt.com" it says "Made in Guatemala" -> countryOfOrigin MUST be "Guatemala", NOT "USA"!).
   - If no "Made in [Country]" line is legible anywhere on the tags, return "Imported".

4. MEASURING TAPE READINGS (INCHES):
   - In WIDTH_TAPE_PHOTO (horizontal chest pit-to-pit tape), read the inch mark where the shirt's edge ends (typically 18 to 27 inches for adult tops).
   - In LENGTH_TAPE_PHOTO (vertical collar-to-hem tape), read the inch mark at the bottom hem (typically 25 to 33 inches for adult tops).
   - Ensure width and length are realistic for the detected size (e.g., Size M is ~20-21.5" wide and ~28-29" long; Size L is ~22-23" wide and ~29.5-30.5" long; Size XL is ~24-25" wide and ~31" long).

Return ONLY valid JSON matching this exact structure:
{
  "brand": "Exact Brand Name (or Unbranded)",
  "size": "S | M | L | XL | 2XL | 3XL | XS",
  "countryOfOrigin": "Exact Country after 'Made in' (e.g. Guatemala, Mexico, Honduras, Vietnam, Bangladesh, Pakistan, USA) or Imported",
  "gender": "Men's | Ladies | Unisex | Kids",
  "category": "T-Shirt | Pocket T-Shirt | Polo Shirt | Hoodie | Sweatshirt | Jacket | Shirt | Jeans | Trousers | Shorts | Dress",
  "primaryColor": "Actual dominant fabric color of the garment (e.g. Dark Green, Brown, Black, Navy Blue, White, Grey, Burgundy)",
  "era": "Modern | 2010s | 2000s Y2K | 1990s | 1980s",
  "stitchType": "Double Stitch | Single Stitch | Heavyweight Workwear",
  "modelNumber": "Model/Style code from wash tag if visible (e.g. TK6532-M) or empty string",
  "rnNumber": "RN# or CA# from wash tag if visible (e.g. RN#14806) or empty string",
  "fabricComposition": "Fabric % from wash tag if visible (e.g. 100% Cotton) or empty string",
  "pitToPitInches": 21,
  "lengthInches": 29,
  "conditionGrade": "Grade A+ | Grade A | Grade B",
  "conditionScore": 9,
  "garmentTitle": "Concise authentic title: [Brand] [Gender] [Category] [PrimaryColor] (include Model No if notable)",
  "grailNotes": "2-sentence authentic description combining Brand, Category, Color, Wash Tag details (Model No, RN#, Fabric composition), Made in [Country], and measurements.",
  "estimatedMarketValueAed": 120,
  "recommendedRetailPriceAed": 95
}`;

  const ustadRes = await callGeminiUstad({
    prompt,
    imagesBase64: labeledImages.map(x => x.base64),
    jsonMode: true,
    temperature: 0.1,
    maxOutputTokens: 4096,
    timeoutMs: 26000
  });

  if (!ustadRes.ok) {
    return { ok: false };
  }

  try {
    const cleaned = ustadRes.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      const brand = String(parsed.brand || 'Unbranded').trim();
      const size = String(parsed.size || 'L').trim();
      const countryOfOrigin = String(parsed.countryOfOrigin || 'Imported')
        .replace(/^made\s+in\s+/i, '')
        .trim() || 'Imported';
      const category = String(parsed.category || 'T-Shirt').trim();
      const primaryColor = String(parsed.primaryColor || '').trim();
      const modelNumber = String(parsed.modelNumber || '').trim();
      const rnNumber = String(parsed.rnNumber || '').trim();
      const fabricComposition = String(parsed.fabricComposition || '').trim();

      // Build rich description incorporating Wash Tag details if not already present
      const washMetaParts: string[] = [];
      if (modelNumber) washMetaParts.push(`Model: ${modelNumber}`);
      if (rnNumber) washMetaParts.push(`${rnNumber.startsWith('RN') ? rnNumber : `RN#${rnNumber}`}`);
      if (fabricComposition) washMetaParts.push(`Fabric: ${fabricComposition}`);
      const washMetaStr = washMetaParts.length > 0 ? ` [${washMetaParts.join(' • ')}]` : '';

      let grailNotes = String(parsed.grailNotes || '').trim();
      if (washMetaStr && !grailNotes.includes(modelNumber || rnNumber || fabricComposition)) {
        grailNotes = `${grailNotes}${washMetaStr}`.trim();
      }

      const resultData = {
        brand,
        size,
        countryOfOrigin,
        gender: String(parsed.gender || "Men's").trim(),
        category,
        primaryColor,
        era: String(parsed.era || 'Modern').trim(),
        stitchType: String(parsed.stitchType || 'Double Stitch').trim(),
        modelNumber,
        rnNumber,
        fabricComposition,
        pitToPitInches: Number(parsed.pitToPitInches) || 0,
        lengthInches: Number(parsed.lengthInches) || 0,
        conditionGrade: String(parsed.conditionGrade || 'Grade A').trim(),
        conditionScore: Number(parsed.conditionScore) || 9,
        garmentTitle: String(parsed.garmentTitle || `${brand} ${primaryColor} ${category}`).replace(/\s+/g, ' ').trim(),
        grailNotes,
        estimatedMarketValueAed: Number(parsed.estimatedMarketValueAed) || 110,
        recommendedRetailPriceAed: Number(parsed.recommendedRetailPriceAed) || 85,
        shagirdLessonsLearned: 0
      };

      // Teach Local Shagird AI by recording this Ustad appraisal lesson!
      const totalLessons = recordUstadAppraisalLesson({
        brand: resultData.brand,
        size: resultData.size,
        countryOfOrigin: resultData.countryOfOrigin,
        category: resultData.category,
        primaryColor: resultData.primaryColor,
        modelNumber: resultData.modelNumber,
        rnNumber: resultData.rnNumber,
        fabricComposition: resultData.fabricComposition,
        pitToPitInches: resultData.pitToPitInches,
        lengthInches: resultData.lengthInches,
        garmentTitle: resultData.garmentTitle,
        grailNotes: resultData.grailNotes
      });
      resultData.shagirdLessonsLearned = totalLessons;

      console.log(`[Ustad Appraisal Complete] Model: ${ustadRes.modelUsed} | Brand: ${brand} | Size: ${size} | Origin: ${countryOfOrigin} | ModelNo: ${modelNumber} | Lessons: ${totalLessons}`);
      return {
        ok: true,
        data: resultData,
        modelUsed: ustadRes.modelUsed
      };
    }
  } catch (err: any) {
    console.warn('[Ustad Appraisal Parse Notice]:', err?.message);
  }

  return { ok: false };
}
