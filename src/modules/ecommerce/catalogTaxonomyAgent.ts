import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { withDb } from '../../db/pgPool.ts';

export interface AgentTaxonomyClassification {
  canonicalCategory: string;
  department: 'Men' | 'Ladies' | 'Unisex' | 'Children';
  marketSegment: 'Antique' | 'Vintage' | 'Brand' | 'Non-Brand';
  seasonBucket: 'Summer' | 'Winter' | 'Autumn' | 'Spring' | 'Archive';
  cleanedItemName?: string;
  source: 'VISION_LLM' | 'TEXT_LLM' | 'HERITAGE_AGENT';
}

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

// Canonical clean storefront categories (auto-created in public.product_categories when items exist, plus any new AI-discovered garment category)
export const CANONICAL_STOREFRONT_CATEGORIES = [
  'T-Shirts',
  'Polo Shirts',
  'Shirts',
  'Blouses & Tops',
  'Dresses',
  'Hoodies & Sweatshirts',
  'Jackets & Outerwear',
  'Vests & Gilets',
  'Pants & Denim',
  'Shorts',
  'Skirts',
  'Sportswear & Jerseys',
  'Knitwear & Cardigans',
  'Caps & Accessories'
];

// Synonyms map used by BOTH SQL (/api/ecommerce/products) and Frontend optimistic filtering so every category matches 100% accurately
export const CATEGORY_MATCH_KEYWORDS: Record<string, string[]> = {
  't-shirts': ['t-shirt', 't shirt', 'tshirt', 'tee', 'tees', 'graphic & band tees', 'band & tour tees', 'crew neck', 'single stitch'],
  'polo shirts': ['polo', 'pique polo', 'classic pique polos', 'polo shirt'],
  'shirts': ['button-down', 'button down', 'flannel', 'flannels', 'work & utility shirts', 'casual & button-down shirts', 'long sleeve shirt', 'dress shirt', 'oxford shirt', 'chambray'],
  'blouses & tops': ['blouse', 'casual tops', 'tank top', 'camisole', 'crop top', 'tunic', 'ladies top'],
  'dresses': ['dress', 'maxi dress', 'midi dress', 'mini dress', 'sundress', 'gown', 'frock'],
  'hoodies & sweatshirts': ['hoodie', 'sweatshirt', 'crewneck sweatshirt', 'pullover hoodie', 'zip hoodie', 'quarter zip', 'fleece pullover'],
  'jackets & outerwear': ['jacket', 'coat', 'windbreaker', 'trucker', 'bomber', 'puffer jacket', 'parka', 'blazer', 'anorak', 'leather jacket', 'track jacket', 'outerwear'],
  'vests & gilets': ['vest', 'gilet', 'puffer vest', 'utility vest', 'bodywarmer'],
  'pants & denim': ['pant', 'pants', 'trouser', 'jean', 'jeans', 'denim', 'cargo', 'chino', 'sweatpant', 'jogger', 'legging'],
  'shorts': ['short', 'shorts', 'boardshort', 'bermuda', 'athletic shorts'],
  'skirts': ['skirt', 'mini skirt', 'midi skirt', 'maxi skirt', 'denim skirt', 'pleated skirt'],
  'sportswear & jerseys': ['jersey', 'dri-fit', 'drifit', 'athletic', 'sportswear', 'track top', 'basketball', 'football', 'soccer', 'baseball'],
  'knitwear & cardigans': ['knit', 'knitwear', 'cardigan', 'sweater', 'jumper', 'pullover knit', 'wool'],
  'caps & accessories': ['cap', 'hat', 'beanie', 'bag', 'backpack', 'belt', 'scarf', 'tie', 'accessory']
};

const PREMIUM_BRANDS = new Set([
  'lacoste', 'ralph lauren', 'polo ralph lauren', 'polo', 'polo sport', 'chaps', 'tommy hilfiger', 'tommy', 'tommy jeans',
  'hugo boss', 'boss', 'nike', 'adidas', 'jordan', 'air jordan', 'puma', 'reebok', 'champion', 'fila', 'kappa', 'umbro',
  'ellesse', 'under armour', 'new balance', 'asics', 'mizuno', 'converse', 'vans', 'oakley', 'quiksilver', 'billabong',
  'rip curl', 'stussy', 'supreme', 'bape', 'palace', 'obey', 'thrasher', 'element', 'volcom', 'dc shoes',
  'carhartt', 'carhartt wip', "levi's", 'levis', 'wrangler', 'lee', 'dickies', 'ben davis', 'red kap', 'oshkosh',
  'the north face', 'north face', 'columbia', 'patagonia', 'timberland', 'eddie bauer', 'll bean', 'l.l. bean', 'helly hansen', 'arcteryx',
  'nautica', 'izod', 'fred perry', 'ben sherman', 'lyle & scott', 'barbour', 'burberry', 'aquascutum',
  'calvin klein', 'guess', 'dkny', 'armani', 'armani exchange', 'emporio armani', 'versace', 'dolce & gabbana', 'gucci', 'prada', 'ysl', 'dior', 'givenchy',
  'diesel', 'replay', 'g-star', 'true religion', 'evisu', 'ed hardy', 'von dutch',
  'gap', 'banana republic', 'j.crew', 'j crew', 'old navy', 'uniqlo', 'muji', 'zara', 'massimo dutti', 'mango', 'cos',
  'h&m', 'bershka', 'pull&bear', 'stradivarius', 'topshop', 'river island', 'asos', 'urban outfitters',
  'abercrombie', 'abercrombie & fitch', 'hollister', 'american eagle', 'aeropostale', 'pacsun',
  'cotton on', 'cotton on loose fit', 'forever 21', 'jack & jones', 'jack and jones', 'celio', 'selected', 'only', 'vero moda',
  'esprit', 'mexx', 'benetton', 'united colors of benetton', 'sisley', 'next', 'marks & spencer', 'm&s', 'superdry', 'ted baker',
  'paul smith', 'all saints', 'allsaints', 'gant', 'us polo assn', 'u.s. polo assn.', 'beverly hills polo club', 'slazenger',
  'lonsdale', 'everlast', 'tapout', 'affliction', 'von dutch', 'juicy couture', 'bebe', 'express', 'mossimo',
  'fanatics', 'majestic', 'mitchell & ness', 'starter', 'russell athletic', 'jansport', 'eastpak',
  'harley-davidson', 'harley davidson', 'hard rock', 'hard rock cafe'
]);

const VINTAGE_CULTURE_OR_TAG_CUES = [
  /\b(?:198\d|199\d|80s|90s|y2k|single[\s-]*stitch|made\s+in\s+usa|brockum|giant|screen\s*stars|hanes\s+beefy|oneita|murina|all\s*sport|delta\s+pro|changes|nutmeg|salem|pro\s*player|logo\s*7|chalk\s*line|apex\s*one|starter|lee\s*sports)\b/i,
  /\b(?:star\s*wars|marvel|dc\s*comics|batman|superman|joker|spider[\s-]*man|x[\s-]*men|avengers|disney|mickey|minnie|looney\s*tunes|taz|bugs\s*bunny|simpsons|snoopy|peanuts|garfield|hello\s*kitty|sanrio|stranger\s*things|rick\s*and\s*morty|spongebob|scooby|jurassic|ghostbusters|mtv|nintendo|mario|playstation|pokemon|naruto|dragon\s*ball|anime|harley[\s-]*davidson|hard\s*rock|nascar|wwf|wwe|metallica|nirvana|ac\/dc|pink\s*floyd|rolling\s*stones|beatles|led\s*zeppelin|guns\s*n|iron\s*maiden|kiss|tupac|biggie|eazy[\s-]*e|wu[\s-]*tang|band\s*tee|tour\s*tee)\b/i
];

const ANTIQUE_CUES = [
  /\b(?:194\d|195\d|196\d|197\d|40s|50s|60s|70s|pre[\s-]*1970|pre[\s-]*80s|antique|selvedge\s+big\s*e|big\s*e|talon\s*zip|union\s*made|chain[\s-]*stitch|wwii|vietnam\s*era|korean\s*war|heritage\s*archive)\b/i
];

const GENERIC_NON_BRAND_NAMES = new Set([
  'gildan', 'fruit of the loom', 'jerzees', 'hanes', 'anvil', 'alstyle', 'port & company', 'port and company',
  'bella+canvas', 'bella canvas', 'next level', 'tultex', 'bay island', 'kirkland', 'george', 'faded glory',
  'no boundaries', 'arizona', 'sonoma', 'croft & barrow', 'st johns bay', "st. john's bay", 'apt. 9',
  '5 star', 'five star', 'vintage style', 'vintage archive', 'break point', 'terranova', 'patriotic',
  'over the top', 'lambeste', 'friking', 'no brand', 'unbranded', 'non-brand', 'non brand', 'unknown',
  'unspecified', 'imported', 'assorted', 'basic', 'fashion', 'classic', 'original', 'streetwear', 'custom'
]);

function normalizeCatSlug(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function expandCategorySearchTerms(rawCategory: string): string[] {
  const clean = String(rawCategory || '').trim().toLowerCase();
  if (!clean || clean === 'all') return [];

  // Normalize slug hyphens to spaces (e.g. "ladies-t-shirt" -> "ladies t shirt", "men-polo-shirts" -> "men polo shirts")
  const deSlugged = clean
    .replace(/^(?:sub|men|ladies|women|kids|unisex)-+/i, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [canonKey, synonyms] of Object.entries(CATEGORY_MATCH_KEYWORDS)) {
    if (
      clean === canonKey ||
      deSlugged === canonKey ||
      clean === normalizeCatSlug(canonKey) ||
      synonyms.some(s => s === clean || s === deSlugged)
    ) {
      return Array.from(new Set([canonKey, ...synonyms]));
    }
  }

  // Handle gendered category names like "Ladies T-Shirt", "Men T-Shirt", "Cotton Blouse", "Poly Blouse"
  if (/blouse/i.test(clean)) return ['blouse', 'casual tops', 'cotton blouse', 'poly blouse'];
  if (/t[\s-]*shirt|tee/i.test(clean)) return CATEGORY_MATCH_KEYWORDS['t-shirts'];
  if (/dress/i.test(clean)) return CATEGORY_MATCH_KEYWORDS['dresses'];
  if (/polo/i.test(clean)) return CATEGORY_MATCH_KEYWORDS['polo shirts'];
  if (/hoodie|sweatshirt/i.test(clean)) return CATEGORY_MATCH_KEYWORDS['hoodies & sweatshirts'];
  if (/vest|gilet/i.test(clean)) return CATEGORY_MATCH_KEYWORDS['vests & gilets'];
  if (/jacket|coat|trucker|windbreaker|bomber|puffer/i.test(clean)) return CATEGORY_MATCH_KEYWORDS['jackets & outerwear'];
  if (/pant|jean|denim|cargo|trouser/i.test(clean)) return CATEGORY_MATCH_KEYWORDS['pants & denim'];
  if (/short/i.test(clean)) return CATEGORY_MATCH_KEYWORDS['shorts'];
  if (/skirt/i.test(clean)) return CATEGORY_MATCH_KEYWORDS['skirts'];
  if (/jersey|dri[\s-]*fit|sportswear/i.test(clean)) return CATEGORY_MATCH_KEYWORDS['sportswear & jerseys'];
  if (/knit|cardigan|sweater/i.test(clean)) return CATEGORY_MATCH_KEYWORDS['knitwear & cardigans'];
  if (/shirt|flannel/i.test(clean)) return CATEGORY_MATCH_KEYWORDS['shirts'];

  const singular = deSlugged.endsWith('s') && deSlugged.length > 4 ? deSlugged.slice(0, -1) : deSlugged;
  return Array.from(new Set([clean, deSlugged, singular].filter(Boolean)));
}

export function inferCanonicalCategoryHeuristic(row: any): string {
  const brand = String(row.brand_name || row.brandName || '').trim().toLowerCase();
  // Strip brand name prefix from item_name so brand words like "Ritchie Jeans" or "Tommy Jeans" never hijack garment type (e.g. "Ritchie Jeans Men T-Shirt")
  let itemWithoutBrand = String(row.item_name || row.itemName || '').toLowerCase();
  if (brand && itemWithoutBrand.startsWith(brand)) {
    itemWithoutBrand = itemWithoutBrand.slice(brand.length).trim();
  }
  const combined = [
    row.sub_category || row.subCategory || '',
    itemWithoutBrand,
    row.ecommerce_description || row.ecommerceDescription || ''
  ]
    .join(' ')
    .toLowerCase();

  if (/\b(?:dress|dresses|maxi\s+dress|midi\s+dress|sundress|gown|frock)\b/i.test(combined)) return 'Dresses';
  if (/\b(?:skirt|skirts)\b/i.test(combined)) return 'Skirts';
  if (/\b(?:polo|pique)\b/i.test(combined)) return 'Polo Shirts';
  if (/\b(?:vest|vests|gilet|gilets|bodywarmer)\b/i.test(combined)) return 'Vests & Gilets';
  if (/\b(?:hoodie|hoodies|sweatshirt|sweatshirts|crewneck\s+sweat|quarter\s+zip|pullover\s+hood)\b/i.test(combined)) return 'Hoodies & Sweatshirts';
  if (/\b(?:jacket|jackets|coat|coats|trucker|windbreaker|bomber|parka|puffer|anorak|blazer|outerwear)\b/i.test(combined)) return 'Jackets & Outerwear';
  if (/\b(?:knit|knitwear|cardigan|cardigans|sweater|jumper)\b/i.test(combined)) return 'Knitwear & Cardigans';
  if (/\b(?:jersey|jerseys|dri[\s-]*fit|drifit|basketball|baseball|football|soccer\s+top|sportswear\s*&\s*(?:athletic|jerseys))\b/i.test(combined)) return 'Sportswear & Jerseys';
  if (/\b(?:t[\s-]*shirt|t[\s-]*shirts|tshirt|\btee\b|\btees\b|graphic\s*&\s*band|band\s*&\s*tour)\b/i.test(combined)) return 'T-Shirts';
  if (/\b(?:short|shorts|bermuda|boardshort)\b/i.test(combined)) return 'Shorts';
  if (/\b(?:pant|pants|jean|jeans|denim|cargo|trouser|chino|jogger|sweatpant)\b/i.test(combined)) return 'Pants & Denim';
  if (/\b(?:blouse|blouses|casual\s+top|casual\s+tops|camisole|tunic|crop\s+top|tank\s+top|\btop\b)\b/i.test(combined)) return 'Blouses & Tops';
  if (/\b(?:cap|caps|hat|hats|beanie|bag|backpack|belt|scarf)\b/i.test(combined)) return 'Caps & Accessories';
  if (/\b(?:flannel|button[\s-]*down|work\s*&\s*utility\s*shirt|long\s*sleeve|oxford|chambray|\bshirt\b|\bshirts\b)\b/i.test(combined)) return 'Shirts';

  return 'T-Shirts';
}

export function inferDepartmentHeuristic(row: any): 'Men' | 'Ladies' | 'Unisex' | 'Children' {
  const p = String(row.parent_category_name || row.parentCategoryName || '').trim().toLowerCase();
  const combined = `${p} ${row.item_name || row.itemName || ''} ${row.style || ''}`.toLowerCase();
  if (/\b(?:child|children|kid|kids|youth|boy|girl)\b/.test(combined)) return 'Children';
  if (/\b(?:ladies|lady|women|woman|female|blouse|dress|skirt)\b/.test(combined)) return 'Ladies';
  if (/\b(?:men|mens|man)\b/.test(combined)) return 'Men';
  return 'Unisex';
}

export function inferMarketSegmentHeuristic(row: any): 'Antique' | 'Vintage' | 'Brand' | 'Non-Brand' {
  const brand = String(row.brand_name || row.brandName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const era = String(row.era || row.global_insights?.era || '').toLowerCase();
  const price = Number(row.retail_price_aed || row.retailPriceAed || row.estimated_price || 0);
  const isGrail = Boolean(row.is_grail || row.isGrail);
  const fullText = [
    brand,
    era,
    row.item_name || row.itemName || '',
    row.style || '',
    row.label_grade || row.labelGrade || '',
    row.ecommerce_description || ''
  ].join(' ');

  // 1. Antique: Pre-1980s heritage archive or explicit Antique cues
  if (ANTIQUE_CUES.some(re => re.test(fullText)) || (isGrail && price >= 250 && /70s|60s|50s|heritage/i.test(fullText))) {
    return 'Antique';
  }

  // 2. Vintage pop-culture / single-stitch / 80s-90s-Y2K licensing & tags
  if (VINTAGE_CULTURE_OR_TAG_CUES.some(re => re.test(fullText))) {
    return 'Vintage';
  }

  // 3. Premium / Designer / Recognized Sportswear Brand
  if (
    PREMIUM_BRANDS.has(brand) ||
    Array.from(PREMIUM_BRANDS).some(b => b.length >= 4 && (brand === b || brand.startsWith(b + ' ') || brand.endsWith(' ' + b)))
  ) {
    // High-value vintage pieces from heritage brands (Levi's, Carhartt, Nike, Harley, Champion >= 85 AED or 90s era) -> Vintage, else Brand
    if (price >= 85 || /\b(?:80s|90s|y2k|vintage\s+trucker|vintage\s+sports)\b/i.test(fullText)) {
      return 'Vintage';
    }
    return 'Brand';
  }

  // 4. Explicit generic / blank / unbranded / house tags -> Non-Brand
  if (!brand || GENERIC_NON_BRAND_NAMES.has(brand)) {
    return 'Non-Brand';
  }

  // 5. High-price collector pieces (>= 75 AED or Grail) -> Vintage; unverified bale labels under 50 AED -> Non-Brand
  if (isGrail || price >= 75) {
    return 'Vintage';
  }
  return 'Non-Brand';
}

export function inferSeasonBucketHeuristic(
  canonicalCategory: string,
  row: any
): 'Summer' | 'Winter' | 'Autumn' | 'Spring' | 'Archive' {
  const price = Number(row.retail_price_aed || row.retailPriceAed || row.estimated_price || 0);
  const isGrail = Boolean(row.is_grail || row.isGrail);
  if (isGrail || price >= 150) return 'Archive';

  const cat = canonicalCategory.toLowerCase();
  if (cat.includes('hoodie') || cat.includes('vest') || cat.includes('knitwear')) return 'Winter';
  if (cat.includes('jacket')) {
    const txt = `${row.sub_category || ''} ${row.item_name || ''} ${row.style || ''}`.toLowerCase();
    if (/track|windbreaker|light/i.test(txt)) return 'Autumn';
    return 'Winter';
  }
  if (cat.includes('pants') || cat.includes('denim')) return 'Autumn';
  if (cat === 'shirts') {
    const txt = `${row.sub_category || ''} ${row.item_name || ''} ${row.style || ''}`.toLowerCase();
    if (/flannel|work|utility|heavy|corduroy/i.test(txt)) return 'Autumn';
    return 'Spring';
  }
  if (cat.includes('blouse') || cat.includes('skirt') || cat.includes('dress')) {
    const txt = `${row.item_name || ''} ${row.style || ''}`.toLowerCase();
    if (/long\s*sleeve|maxi/i.test(txt)) return 'Spring';
    return 'Summer';
  }
  // T-Shirts, Polo Shirts, Shorts, Sportswear & Jerseys, Caps
  return 'Summer';
}

function resolveLocalGarmentImagePath(urlRaw?: string | null): string | null {
  const s = String(urlRaw || '').trim();
  if (!s) return null;
  // Map /storage/v1/object/public/vintage-vibes-media/... or /uploads/... to C:\vintage-vibe\public\...
  let rel = s;
  const supaIdx = s.indexOf('/vintage-vibes-media/');
  if (supaIdx !== -1) {
    rel = 'uploads' + s.slice(supaIdx);
  } else if (s.startsWith('/')) {
    rel = s.slice(1);
  } else if (/^https?:\/\//i.test(s)) {
    return null;
  }
  const cands = [
    path.resolve(process.cwd(), 'public', rel),
    path.resolve(process.cwd(), rel)
  ];
  for (const c of cands) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {}
  }
  return null;
}

async function inspectAmbiguousGarmentWithVisionLlm(row: any): Promise<Partial<AgentTaxonomyClassification> | null> {
  const imgPath = resolveLocalGarmentImagePath(row.front_image_url) || resolveLocalGarmentImagePath(row.tag_image_url);
  try {
    const hasVisionImg = Boolean(imgPath);
    const model = hasVisionImg ? 'qwen2.5vl:7b' : 'qwen2.5:7b';
    const images = hasVisionImg && imgPath ? [fs.readFileSync(imgPath).toString('base64')] : undefined;

    const prompt = `You are an expert Vintage & Fashion Taxonomy AI Agent for Vintage Vibes UAE.
Inspect this garment${hasVisionImg ? ' photo and' : ''} metadata:
- Brand: ${row.brand_name || 'Unknown'}
- Current Title: ${row.item_name || ''}
- Current Subcategory/Style: ${row.sub_category || ''} / ${row.style || ''}
- Era/Grade/Price: ${row.era || ''} / ${row.label_grade || ''} / AED ${row.retail_price_aed || ''}

Classify accurately:
1. "category": Exact garment category in Title Case Plural (e.g., "T-Shirts", "Polo Shirts", "Shirts", "Blouses & Tops", "Dresses", "Hoodies & Sweatshirts", "Jackets & Outerwear", "Vests & Gilets", "Pants & Denim", "Shorts", "Skirts", "Sportswear & Jerseys", "Knitwear & Cardigans", "Jumpsuits & Rompers", "Caps & Accessories"). If it is a dress, output "Dresses".
2. "department": "Men", "Ladies", "Unisex", or "Children".
3. "marketSegment": "Antique" (pre-1980s rare archive), "Vintage" (80s/90s/Y2K or vintage pop-culture/band/single-stitch), "Brand" (authentic designer/sportswear brand like Nike, Lacoste, Ralph Lauren, Levi's, Zara), or "Non-Brand" (generic blank/unbranded/house label).
4. "season": "Summer", "Winter", "Autumn", "Spring", or "Archive".

Return ONLY valid JSON: {"category": string, "department": string, "marketSegment": string, "season": string}`;

    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        ...(images ? { images } : {}),
        stream: false,
        format: 'json',
        keep_alive: '15m',
        options: { temperature: 0, num_predict: 100 }
      }),
      signal: AbortSignal.timeout(hasVisionImg ? 9000 : 4000)
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const parsed = JSON.parse(String(data?.response || '{}'));
    const validSegs = ['Antique', 'Vintage', 'Brand', 'Non-Brand'];
    const validDepts = ['Men', 'Ladies', 'Unisex', 'Children'];
    const validSeasons = ['Summer', 'Winter', 'Autumn', 'Spring', 'Archive'];

    const catRaw = String(parsed.category || '').trim();
    return {
      ...(catRaw.length >= 3 && catRaw.length <= 40 ? { canonicalCategory: catRaw } : {}),
      ...(validDepts.includes(parsed.department) ? { department: parsed.department } : {}),
      ...(validSegs.includes(parsed.marketSegment) ? { marketSegment: parsed.marketSegment } : {}),
      ...(validSeasons.includes(parsed.season) ? { seasonBucket: parsed.season } : {}),
      source: hasVisionImg ? 'VISION_LLM' : 'TEXT_LLM'
    };
  } catch {
    return null;
  }
}

export async function classifyGarmentPieceAgentic(
  row: any,
  useDeepVisionForAmbiguous = true
): Promise<AgentTaxonomyClassification> {
  let canonicalCategory = inferCanonicalCategoryHeuristic(row);
  let department = inferDepartmentHeuristic(row);
  let marketSegment = inferMarketSegmentHeuristic(row);
  let seasonBucket = inferSeasonBucketHeuristic(canonicalCategory, row);
  let source: AgentTaxonomyClassification['source'] = 'HERITAGE_AGENT';

  const isAmbiguous =
    !row.sub_category ||
    /unspecified|unknown|vintage garment|assorted|casual tops/i.test(
      `${row.sub_category || ''} ${row.item_name || ''}`
    );

  if (useDeepVisionForAmbiguous && isAmbiguous) {
    const aiRes = await inspectAmbiguousGarmentWithVisionLlm(row);
    if (aiRes) {
      if (aiRes.canonicalCategory) canonicalCategory = aiRes.canonicalCategory;
      if (aiRes.department) department = aiRes.department;
      if (aiRes.marketSegment) marketSegment = aiRes.marketSegment;
      if (aiRes.seasonBucket) seasonBucket = aiRes.seasonBucket;
      if (aiRes.source) source = aiRes.source;
    }
  }

  return {
    canonicalCategory,
    department,
    marketSegment,
    seasonBucket,
    source
  };
}

let agentRunning = false;
let lastAgentSummary: any = { status: 'IDLE', updatedPieces: 0, autoCreatedCategories: [] };

export function getCatalogTaxonomyAgentStatus() {
  return lastAgentSummary;
}

/**
 * Full Autonomous Agentic Catalog Sync:
 * 1) Ensures seasonal collections exist & resolves UUIDs for Summer, Winter, Autumn, Spring, Archive.
 * 2) Classifies all IN_STOCK inventory_pieces (using Heritage Rules + Local RTX 3070 Ti Vision/LLM on ambiguous items).
 * 3) Auto-creates any missing garment categories in public.product_categories (e.g., Dresses, Polo Shirts, Vests & Gilets).
 * 4) Updates sub_category, parent_category_name, market_segment, collection_id, and collection_name cleanly via DML.
 */
export async function runCatalogTaxonomyAgentPass(options?: {
  onlyUnclassified?: boolean;
  maxVisionCalls?: number;
  onInvalidateCache?: () => void;
}): Promise<any> {
  if (agentRunning) return lastAgentSummary;
  agentRunning = true;
  const startedAt = Date.now();
  const maxVision = options?.maxVisionCalls ?? 25;

  try {
    const summary = await withDb(async (client) => {
      // 1. Load active collections to map seasonBucket -> (collection_id, collection_name)
      const colRes = await client.query(
        `SELECT id, name, code, season FROM public.collections WHERE is_active = true ORDER BY display_order ASC, created_at ASC`
      );
      const colRows = colRes.rows || [];

      const findCol = (re: RegExp) =>
        colRows.find(c => re.test(`${c.name || ''} ${c.code || ''} ${c.season || ''}`)) || colRows[0] || null;

      const seasonColMap: Record<string, { id: string; name: string } | null> = {
        Summer: findCol(/summer\s*edition|summer-26/i),
        Winter: findCol(/winter\s*maazi|winter-26/i),
        Autumn: findCol(/autumn|heritage/i),
        Spring: findCol(/spring/i),
        Archive: findCol(/core\s*archive|core-vault/i)
      };

      // Fix accidental "Winter Edition 2026" season='Summer' typo in collections if present
      await client
        .query(`UPDATE public.collections SET is_active = false WHERE code = 'WINTER-EDITION-2026' AND season = 'Summer'`)
        .catch(() => {});

      // 2. Load existing product_categories
      const catRes = await client.query(`SELECT id, name, slug, is_active FROM public.product_categories`);
      const existingBySlug = new Map<string, any>();
      const existingByNameLower = new Map<string, any>();
      for (const c of catRes.rows || []) {
        if (c.slug) existingBySlug.set(String(c.slug).toLowerCase(), c);
        if (c.name) existingByNameLower.set(String(c.name).trim().toLowerCase(), c);
      }

      const autoCreatedCategories: string[] = [];
      const ensureCategoryInDb = async (catName: string, dept: string) => {
        const cleanName = String(catName || '').trim();
        if (!cleanName) return;
        const lower = cleanName.toLowerCase();
        const slug = normalizeCatSlug(cleanName);
        if (existingByNameLower.has(lower) || existingBySlug.has(slug)) {
          const existing = existingByNameLower.get(lower) || existingBySlug.get(slug);
          if (existing && existing.is_active === false) {
            await client.query(`UPDATE public.product_categories SET is_active = true WHERE id = $1`, [existing.id]).catch(() => {});
          }
          return;
        }
        const newId = crypto.randomUUID();
        const deptCode = dept === 'Ladies' ? 'LAD' : dept === 'Men' ? 'MEN' : dept === 'Children' ? 'KID' : 'UNI';
        await client.query(
          `INSERT INTO public.product_categories (id, name, slug, is_active, department_code, level, display_order, taxonomy_level)
           VALUES ($1, $2, $3, true, $4, 2, 15, 'CATEGORY')`,
          [newId, cleanName, slug, deptCode]
        );
        const rec = { id: newId, name: cleanName, slug, is_active: true };
        existingByNameLower.set(lower, rec);
        existingBySlug.set(slug, rec);
        autoCreatedCategories.push(cleanName);
      };

      // Ensure core garment categories (including Dresses, Polo Shirts, Blouses & Tops, etc.) exist in product_categories
      for (const baseCat of CANONICAL_STOREFRONT_CATEGORIES) {
        await ensureCategoryInDb(baseCat, baseCat === 'Dresses' || baseCat === 'Skirts' || baseCat === 'Blouses & Tops' ? 'Ladies' : 'Unisex');
      }

      // 3. Fetch IN_STOCK pieces
      const whereClause = options?.onlyUnclassified
        ? `WHERE is_sold = false AND status = 'IN_STOCK' AND (collection_id IS NULL OR sub_category IS NULL OR sub_category = '' OR sub_category ILIKE '%unspecified%' OR market_segment IS NULL)`
        : `WHERE is_sold = false AND status = 'IN_STOCK'`;

      const piecesRes = await client.query(
        `SELECT id, barcode, brand_name, item_name, style, parent_category_name, sub_category, era, label_grade, retail_price_aed, estimated_price, is_grail, market_segment, collection_id, collection_name, front_image_url, tag_image_url, global_insights
         FROM public.inventory_pieces
         ${whereClause}
         ORDER BY created_at DESC`
      );

      let visionUsed = 0;
      let updatedCount = 0;
      const segmentBreakdown: Record<string, number> = { Antique: 0, Vintage: 0, Brand: 0, 'Non-Brand': 0 };
      const categoryBreakdown: Record<string, number> = {};
      const seasonBreakdown: Record<string, number> = {};

      for (const row of piecesRes.rows || []) {
        const isAmbiguous =
          !row.sub_category ||
          /unspecified|unknown|vintage garment|assorted|casual tops/i.test(`${row.sub_category || ''} ${row.item_name || ''}`);
        const allowVision = isAmbiguous && visionUsed < maxVision;
        if (allowVision) visionUsed += 1;

        const cls = await classifyGarmentPieceAgentic(row, allowVision);
        await ensureCategoryInDb(cls.canonicalCategory, cls.department);

        const targetCol = seasonColMap[cls.seasonBucket] || seasonColMap.Summer;
        const newColId = targetCol?.id || row.collection_id || null;
        const newColName = targetCol?.name || row.collection_name || 'Summer Edition 2026';

        // Store canonical storefront category directly in sub_category so sidebar counts & SQL filtering match 1-to-1!
        const nextSub = cls.canonicalCategory;

        const needsUpdate =
          row.market_segment !== cls.marketSegment ||
          String(row.collection_id || '') !== String(newColId || '') ||
          row.collection_name !== newColName ||
          row.sub_category !== nextSub ||
          !row.parent_category_name;

        if (needsUpdate) {
          await client.query(
            `UPDATE public.inventory_pieces
             SET market_segment = $1,
                 collection_id = $2,
                 collection_name = $3,
                 sub_category = $4,
                 parent_category_name = COALESCE(NULLIF(parent_category_name, ''), $5)
             WHERE id = $6`,
            [cls.marketSegment, newColId, newColName, nextSub, cls.department, row.id]
          );
          updatedCount += 1;
        }

        segmentBreakdown[cls.marketSegment] = (segmentBreakdown[cls.marketSegment] || 0) + 1;
        categoryBreakdown[cls.canonicalCategory] = (categoryBreakdown[cls.canonicalCategory] || 0) + 1;
        seasonBreakdown[newColName] = (seasonBreakdown[newColName] || 0) + 1;
      }

      return {
        status: 'COMPLETED',
        scannedPieces: (piecesRes.rows || []).length,
        updatedPieces: updatedCount,
        visionInspectionsUsed: visionUsed,
        autoCreatedCategories,
        segmentBreakdown,
        categoryBreakdown,
        seasonBreakdown,
        durationMs: Date.now() - startedAt,
        completedAt: new Date().toISOString()
      };
    });

    lastAgentSummary = summary;
    if (summary.updatedPieces > 0 && options?.onInvalidateCache) {
      options.onInvalidateCache();
    }
    console.log(
      `[CatalogTaxonomyAgent] 🤖 Scanned=${summary.scannedPieces} Updated=${summary.updatedPieces} AutoCreatedCats=${summary.autoCreatedCategories.length} Segments=${JSON.stringify(summary.segmentBreakdown)}`
    );
    return summary;
  } catch (err: any) {
    lastAgentSummary = {
      status: 'ERROR',
      error: err?.message || String(err),
      completedAt: new Date().toISOString()
    };
    console.warn('[CatalogTaxonomyAgent] Run warning:', err?.message);
    return lastAgentSummary;
  } finally {
    agentRunning = false;
  }
}

let watcherTimer: ReturnType<typeof setInterval> | null = null;
export function startCatalogTaxonomyAgent(onInvalidateCache: () => void): void {
  if (watcherTimer) return;
  // Initial full pass 3s after server boot
  setTimeout(() => {
    runCatalogTaxonomyAgentPass({ onlyUnclassified: false, maxVisionCalls: 30, onInvalidateCache }).catch(() => {});
  }, 3000);

  // Continuous watcher every 45s for newly sorted bale pieces
  watcherTimer = setInterval(() => {
    runCatalogTaxonomyAgentPass({ onlyUnclassified: true, maxVisionCalls: 10, onInvalidateCache }).catch(() => {});
  }, 45000);
  watcherTimer.unref?.();
}
