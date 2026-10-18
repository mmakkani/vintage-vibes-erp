import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { execFileSync } from 'child_process';
import { baileysManager } from './baileys.service.ts';
import {
  callGeminiUstad,
  normalizePhoneticScriptForSpeech,
  segmentFlatLayGarment,
  synthesizeVirtualTryOnModel,
  type TargetVoiceLanguage
} from '../../server/ustadShagirdAiEngine.ts';

export type ReelTargetLanguage = 'ROMAN_URDU' | 'DUBAI_ENGLISH' | 'GULF_ARABIC' | TargetVoiceLanguage;

export interface ReelGenerationInput {
  itemId: string;
  brandName?: string;
  itemName?: string;
  category?: string;
  size?: string;
  priceAED?: number;
  grade?: string;
  origin?: string;
  style?: string;
  frontImageUrl?: string | Buffer;
  language?: ReelTargetLanguage;
  targetLanguage?: ReelTargetLanguage;
  enableVtonModel?: boolean;
}

export interface ReelStoryScript {
  hookLine: string;
  rarityDetailLine: string;
  priceAndFitLine: string;
  ctaLine: string;
  fullSpokenScript: string;
  normalizedPhoneticScript: string;
  targetLanguage: string;
  hashtags: string[];
}

export interface GeneratedReelResult {
  success: boolean;
  itemId: string;
  videoBuffer?: Buffer;
  videoFilePath?: string;
  publicVideoUrl?: string;
  durationSeconds: number;
  resolution: '1080x1920';
  script: ReelStoryScript;
  captionWithHashtags: string;
  vtonEngineUsed?: string;
  vtonModelPrompt?: string;
  error?: string;
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class VideoMarketingService {
  private reelsOutputDir: string;

  constructor() {
    this.reelsOutputDir = path.join(process.cwd(), 'public', 'generated_reels');
    try {
      if (!fs.existsSync(this.reelsOutputDir)) {
        fs.mkdirSync(this.reelsOutputDir, { recursive: true });
      }
    } catch {}
  }

  /**
   * Resolves the canonical `targetLanguage` accent mode (`ROMAN_URDU` | `DUBAI_ENGLISH` | `GULF_ARABIC` | etc.)
   */
  public resolveTargetLanguageMode(inputLang?: string): string {
    const raw = String(inputLang || 'ROMAN_URDU').toUpperCase().trim();
    if (raw === 'AR' || raw.includes('ARABIC') || raw.includes('KHALEEJI') || raw === 'GULF_ARABIC') {
      return 'GULF_ARABIC';
    }
    if (raw === 'EN' || raw.includes('ENGLISH') || raw === 'DUBAI_ENGLISH') {
      return 'DUBAI_ENGLISH';
    }
    if (raw === 'UR' || raw === 'ROMAN' || raw.includes('URDU') || raw.includes('HINDI') || raw === 'ROMAN_URDU') {
      return 'ROMAN_URDU';
    }
    return raw;
  }

  /**
   * 1. Generate a 12-15 second Storytelling Hook Script (Gemini / DeepSeek-R1 / Ollama)
   *    with Intelligent Phonetic Script Preprocessor (`normalizePhoneticScriptForSpeech`)
   *    and Multi-Language / Accent Selector (`ROMAN_URDU` | `DUBAI_ENGLISH` | `GULF_ARABIC`).
   */
  public async generateStorytellingHookScript(input: ReelGenerationInput): Promise<ReelStoryScript> {
    const brand = String(input.brandName || 'Vintage Archive').trim();
    const item = String(input.itemName || input.category || '1-of-1 Piece').trim();
    const size = String(input.size || 'L').trim();
    const price = Number(input.priceAED || 150);
    const origin = String(input.origin || 'USA / UK').trim();
    const style = String(input.style || 'Rare 90s Vintage Aesthetic & Authentic Stitch').trim();
    const targetLang = this.resolveTargetLanguageMode(input.targetLanguage || input.language);

    const accentDirective =
      targetLang === 'GULF_ARABIC'
        ? 'Modern Khaleeji dialect for UAE locals (energetic Dubai streetwear boutique tone)'
        : targetLang === 'DUBAI_ENGLISH'
          ? 'Fast-paced, luxury Dubai expat streetwear concept store tone'
          : targetLang === 'ROMAN_URDU'
            ? 'Street-smart Pakistani / Karachi / Lahore streetwear host tone mixed naturally with English streetwear terms'
            : `Natural conversational ${targetLang} streetwear host tone`;

    const prompt = `You are a viral TikTok / Instagram Reels luxury vintage fashion scriptwriter for "Vintage Vibes Dubai" (Owner: Director Muhammad Akram).
Write a high-retention 12-15 second vertical video script for this 1-of-1 garment:
- Item ID: ${input.itemId}
- Brand & Title: ${brand} ${item}
- Size: ${size}
- Price: ${price} AED
- Authenticity / Rarity: 100% Authentic ${origin} • ${style}
- Target Language & Accent: ${accentDirective}

Return ONLY valid JSON with these exact keys:
{
  "hookLine": "3-second viral hook (max 9 words, e.g. 'Stop scrolling! Check this 1-of-1 ${brand} grail!')",
  "rarityDetailLine": "4-second rarity & texture detail (max 10 words, e.g. '100% Authentic ${origin} fabric, rare vintage patina & tag!')",
  "priceAndFitLine": "3-second size & AED price reveal (max 9 words, e.g. 'Size ${size} — locked at just ${price} AED!')",
  "ctaLine": "3-second call to action (max 9 words, e.g. 'Tap the WhatsApp link in bio before it sells!')",
  "hashtags": ["#VintageVibesDubai", "#${brand.replace(/[^a-zA-Z0-9]/g, '')}", "#DubaiStreetwear", "#ThriftUAE", "#1of1Vintage", "#FYP"]
}`;

    const buildFinalScript = (
      hookLine: string,
      rarityDetailLine: string,
      priceAndFitLine: string,
      ctaLine: string,
      hashtags: string[]
    ): ReelStoryScript => {
      const fullSpokenScript = `${hookLine}. ${rarityDetailLine}. ${priceAndFitLine}. ${ctaLine}`;
      const normalizedPhoneticScript = normalizePhoneticScriptForSpeech(fullSpokenScript, targetLang);
      return {
        hookLine,
        rarityDetailLine,
        priceAndFitLine,
        ctaLine,
        fullSpokenScript,
        normalizedPhoneticScript,
        targetLanguage: targetLang,
        hashtags
      };
    };

    try {
      const ustadRes = await callGeminiUstad({
        prompt,
        jsonMode: true,
        temperature: 0.35,
        maxOutputTokens: 260,
        timeoutMs: 8500
      });

      if (ustadRes.ok && ustadRes.text) {
        const cleaned = ustadRes.text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed?.hookLine && parsed?.rarityDetailLine && parsed?.ctaLine) {
          return buildFinalScript(
            String(parsed.hookLine).trim(),
            String(parsed.rarityDetailLine).trim(),
            String(parsed.priceAndFitLine || `Size ${size} • Only ${price} AED!`).trim(),
            String(parsed.ctaLine).trim(),
            Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0
              ? parsed.hashtags.map((h: any) => String(h).trim())
              : ['#VintageVibesDubai', '#DubaiThrift', '#1of1Grail', '#UAEFashion', '#VintageStreetwear', '#FYP']
          );
        }
      }
    } catch {}

    // Fallback scripts tailored specifically to GULF_ARABIC, DUBAI_ENGLISH, and ROMAN_URDU
    if (targetLang === 'GULF_ARABIC') {
      return buildFinalScript(
        `يا هلا بشباب دبي! شوفوا هالقطعة النادرة 1-of-1 من ${brand}!`,
        `أصلية 100% مستوردة من ${origin} بقصة ستريت وير فخمة!`,
        `المقاس ${size} — بسعر حصري ${price} AED فقط!`,
        `اضغط على رابط الواتساب في البايو واحجزها الحين!`,
        ['#VintageVibesDubai', `#${brand.replace(/[^a-zA-Z0-9]/g, '') || 'VintageArchive'}`, '#DubaiStreetwear', '#UAEThrift', '#KhaleejiStyle', '#1of1Piece']
      );
    }

    if (targetLang === 'DUBAI_ENGLISH') {
      return buildFinalScript(
        `Stop scrolling Dubai! Check this 1-of-1 ${brand} ${item}!`,
        `100% authentic ${origin} archive piece with rare 90s vintage stitch!`,
        `Verified Size ${size} — locked in at just ${price} AED!`,
        `Tap the WhatsApp link in bio to claim this 1-of-1 grail now!`,
        ['#VintageVibesDubai', `#${brand.replace(/[^a-zA-Z0-9]/g, '') || 'VintageArchive'}`, '#DubaiStreetwear', '#DubaiMarina', '#1of1Vintage', '#FYP']
      );
    }

    // Default: ROMAN_URDU (Street-smart Karachi/Lahore/Dubai streetwear tone)
    return buildFinalScript(
      `Assalam Alaikum dosto! Check karo yeh 1-of-1 ${brand} ${item}!`,
      `100% original ${origin} archive fabric aur shandaar 90s streetwear fit!`,
      `Size ${size} — Special VIP Price sirf ${price} AED!`,
      `Abhi bio mein WhatsApp link se foran lock karein!`,
      ['#VintageVibesDubai', `#${brand.replace(/[^a-zA-Z0-9]/g, '') || 'VintageArchive'}`, '#DubaiStreetwear', '#PakistanStreetwear', '#1of1Piece', '#ReelsUAE']
    );
  }

  /**
   * 2. Resolve garment image into a high-res Buffer
   */
  private async resolveGarmentPhotoBuffer(input: ReelGenerationInput): Promise<Buffer> {
    if (Buffer.isBuffer(input.frontImageUrl) && input.frontImageUrl.length > 100) {
      return input.frontImageUrl;
    }
    if (typeof input.frontImageUrl === 'string' && input.frontImageUrl.trim()) {
      const prep = await baileysManager.prepareJpegImageAndThumbnail(input.frontImageUrl.trim());
      if (prep?.imageBuffer) {
        return prep.imageBuffer;
      }
    }

    const fallbackSvg = `<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
      <rect width="1080" height="1350" fill="#111827"/>
      <rect x="60" y="60" width="960" height="1230" rx="32" fill="#1e293b" stroke="#f59e0b" stroke-width="6"/>
      <text x="540" y="560" text-anchor="middle" font-family="Arial, sans-serif" font-size="68" font-weight="bold" fill="#fde68a">${escapeXml(input.brandName || 'VINTAGE VIBES')}</text>
      <text x="540" y="660" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" fill="#ffffff">${escapeXml(input.itemName || '1-OF-1 ARCHIVE GARMENT')}</text>
      <text x="540" y="770" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="bold" fill="#f59e0b">SIZE ${escapeXml(input.size || 'L')} • ${Number(input.priceAED || 150)} AED</text>
      <text x="540" y="860" text-anchor="middle" font-family="monospace" font-size="32" fill="#94a3b8">SKU: ${escapeXml(input.itemId)}</text>
    </svg>`;
    return await sharp(Buffer.from(fallbackSvg)).jpeg({ quality: 92 }).toBuffer();
  }

  /**
   * 3. Render 4 Luxury 9:16 Vertical Scene Frames (1080x1920) featuring:
   *    - AI Virtual Try-On (VTON) Model wearing the segmented garment in a luxury Dubai Streetwear Concept Store / Dubai Marina backdrop
   *    - Background-segmented garment cutout (ZERO bed/sheet/floor backgrounds!)
   *    - Burnt-in animated captions synced to the 4 story beats
   */
  private async renderVerticalVtonStoryFrames(
    rawPhotoBuffer: Buffer,
    input: ReelGenerationInput,
    script: ReelStoryScript
  ): Promise<{
    frames: Buffer[];
    vtonEngineUsed: string;
    vtonModelPrompt: string;
  }> {
    const W = 1080;
    const H = 1920;

    // Run Garment Segmentation + AI Virtual Try-On (VTON) Model Synthesis
    const vtonResult = await synthesizeVirtualTryOnModel({
      rawGarmentBuffer: rawPhotoBuffer,
      itemId: input.itemId,
      brandName: input.brandName,
      itemName: input.itemName,
      category: input.category,
      size: input.size,
      backdropStyle: 'DUBAI_STREETWEAR_STORE'
    });

    // Base VTON model image (charismatic 24-year-old model wearing the garment in Dubai streetwear store)
    const vtonBaseHero = await sharp(vtonResult.vtonModelFrameBuffer)
      .resize(W, H, { fit: 'cover' })
      .png()
      .toBuffer();

    // Dark luxury studio backdrop for the closeup detail frame (using the segmented cutout with zero bedsheet!)
    const darkDetailBg = await sharp(vtonBaseHero)
      .blur(28)
      .modulate({ brightness: 0.38, saturation: 1.15 })
      .png()
      .toBuffer();

    const scenes = [
      {
        stageLabel: '🔥 AI MODEL LOOKBOOK • 1-OF-1 DROP',
        subtitle: script.hookLine,
        mode: 'VTON_HERO_FULL',
        zoomScale: 1.0,
        yOffset: 0,
        accentColor: '#f59e0b'
      },
      {
        stageLabel: '✨ 100% AUTHENTIC ARCHIVE DETAIL',
        subtitle: script.rarityDetailLine,
        mode: 'SEGMENTED_CLOSEUP',
        zoomScale: 1.12,
        yOffset: -15,
        accentColor: '#fbbf24'
      },
      {
        stageLabel: `🏷️ SIZE ${String(input.size || 'L').toUpperCase()} • VIP STREETWEAR FIT`,
        subtitle: script.priceAndFitLine,
        mode: 'VTON_TORSO_FOCUS',
        zoomScale: 1.08,
        yOffset: 10,
        accentColor: '#34d399'
      },
      {
        stageLabel: '📲 INSTANT WHATSAPP LOCK',
        subtitle: script.ctaLine,
        mode: 'VTON_HERO_CTA',
        zoomScale: 1.04,
        yOffset: 0,
        accentColor: '#f59e0b'
      }
    ];

    const wrapSubtitle = (text: string, maxChars = 28): [string, string] => {
      const words = String(text || '').trim().split(/\s+/);
      let line1 = '';
      let line2 = '';
      for (const w of words) {
        if ((line1 + ' ' + w).trim().length <= maxChars) {
          line1 = (line1 + ' ' + w).trim();
        } else {
          line2 = (line2 + ' ' + w).trim();
        }
      }
      if (line2.length > maxChars + 6) {
        line2 = line2.slice(0, maxChars + 4) + '…';
      }
      return [line1, line2];
    };

    const frameBuffers: Buffer[] = [];
    const brandTitle = `${input.brandName || 'Vintage'} • ${input.itemName || 'Archive Piece'}`.slice(0, 34);
    const priceAed = Number(input.priceAED || 150);

    for (let i = 0; i < scenes.length; i++) {
      const sc = scenes[i];
      const [sub1, sub2] = wrapSubtitle(sc.subtitle, 26);

      let sceneCanvas: Buffer;
      if (sc.mode === 'SEGMENTED_CLOSEUP') {
        // Scene 2: High-res segmented garment cutout closeup (no bed/sheet!) over blurred Dubai boutique backdrop
        const closeupCutout = await sharp(vtonResult.segmentedCutoutBuffer)
          .resize(860, 980, { fit: 'inside', withoutEnlargement: false })
          .png()
          .toBuffer();
        const cMeta = await sharp(closeupCutout).metadata();
        const cw = cMeta.width || 800;
        const ch = cMeta.height || 900;
        sceneCanvas = await sharp(darkDetailBg)
          .composite([
            {
              input: closeupCutout,
              left: Math.max(0, Math.round((W - cw) / 2)),
              top: Math.max(260, Math.round(340 + (980 - ch) / 2))
            }
          ])
          .png()
          .toBuffer();
      } else if (sc.mode === 'VTON_TORSO_FOCUS') {
        // Scene 3: Cropped dolly-in on the AI Model's torso wearing the garment
        sceneCanvas = await sharp(vtonBaseHero)
          .extract({ left: 60, top: 140, width: W - 120, height: H - 280 })
          .resize(W, H, { fit: 'cover' })
          .png()
          .toBuffer();
      } else {
        // Scene 1 & Scene 4: Full-frame 9:16 AI Model in Luxury Dubai Streetwear Store
        sceneCanvas = vtonBaseHero;
      }

      const overlaySvg = Buffer.from(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#f59e0b"/>
            <stop offset="50%" stop-color="#fef08a"/>
            <stop offset="100%" stop-color="#d97706"/>
          </linearGradient>
        </defs>

        <!-- Luxury Outer Border -->
        <rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="36" fill="none" stroke="url(#goldGrad)" stroke-width="4" stroke-opacity="0.75"/>

        <!-- Top Header Pill -->
        <rect x="80" y="72" width="${W - 160}" height="128" rx="26" fill="#090d16" fill-opacity="0.88" stroke="#f59e0b" stroke-width="2"/>
        <text x="${W / 2}" y="126" text-anchor="middle" font-family="Georgia, serif" font-size="38" font-weight="900" fill="#fde68a" letter-spacing="3">VINTAGE VIBES DUBAI</text>
        <text x="${W / 2}" y="172" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#cbd5e1" letter-spacing="1">${escapeXml(brandTitle)} • SKU #${escapeXml(input.itemId)}</text>

        <!-- Price Floating Badge (Top Right) -->
        <rect x="${W - 330}" y="230" width="260" height="86" rx="20" fill="url(#goldGrad)"/>
        <text x="${W - 200}" y="286" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="900" fill="#090d16">AED ${priceAed}</text>

        <!-- Size Floating Badge (Top Left) -->
        <rect x="70" y="230" width="220" height="86" rx="20" fill="#090d16" fill-opacity="0.9" stroke="#f59e0b" stroke-width="2"/>
        <text x="180" y="286" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="900" fill="#fde68a">SIZE ${escapeXml(String(input.size || 'L').toUpperCase())}</text>

        <!-- Animated Burnt-In Subtitle Box (Bottom Third for TikTok/Reels Safe Zone) -->
        <rect x="160" y="1390" width="${W - 320}" height="64" rx="32" fill="${sc.accentColor}"/>
        <text x="${W / 2}" y="1433" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="900" fill="#090d16" letter-spacing="1.5">${escapeXml(sc.stageLabel)}</text>

        <rect x="64" y="1474" width="${W - 128}" height="210" rx="28" fill="#090d16" fill-opacity="0.92" stroke="url(#goldGrad)" stroke-width="3"/>
        <text x="${W / 2}" y="${sub2 ? '1558' : '1592'}" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="900" fill="#ffffff">${escapeXml(sub1)}</text>
        ${sub2 ? `<text x="${W / 2}" y="1626" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="900" fill="#fde68a">${escapeXml(sub2)}</text>` : ''}

        <!-- Footer CTA Bar -->
        <rect x="110" y="1720" width="${W - 220}" height="104" rx="22" fill="#0f172a" fill-opacity="0.95" stroke="#475569" stroke-width="1.5"/>
        <text x="${W / 2}" y="1766" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#34d399">📱 WHATSAPP CONCIERGE: +971 55 418 6086</text>
        <text x="${W / 2}" y="1804" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#e2e8f0">🌐 VINTAGEVIBESGK.COM • LINK IN BIO</text>
      </svg>`);

      const composedFrame = await sharp(sceneCanvas)
        .composite([{ input: overlaySvg, left: 0, top: 0 }])
        .jpeg({ quality: 92 })
        .toBuffer();

      frameBuffers.push(composedFrame);
    }

    return {
      frames: frameBuffers,
      vtonEngineUsed: vtonResult.engineUsed,
      vtonModelPrompt: vtonResult.modelPromptUsed
    };
  }

  /**
   * 4. Compile the 9:16 Vertical Video Reel (.mp4) with:
   *    - AI Virtual Try-On (VTON) Model Footage (replacing flat-lay bed photos)
   *    - 3D Parallax Camera Dolly-In synced to a subtle 90-BPM luxury streetwear bass beat
   *    - Phonetically normalized ElevenLabs Multilingual v2 / XTTS-v2 / Neural Streetwear Host Voiceover
   */
  public async generateGarmentReelMp4(input: ReelGenerationInput): Promise<GeneratedReelResult> {
    const tmpId = `vv_reel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpDir = path.join(os.tmpdir(), tmpId);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const targetLang = this.resolveTargetLanguageMode(input.targetLanguage || input.language);

      // Step A: Generate Storytelling Hook Script + Phonetic Script Normalization
      const script = await this.generateStorytellingHookScript({
        ...input,
        targetLanguage: targetLang
      });

      // Step B: Synthesize Natural Streetwear Host Voiceover (using phonetically normalized script!)
      const voiceBuffer = await baileysManager.synthesizeNeuralVoiceNoteBuffer(
        script.normalizedPhoneticScript,
        targetLang,
        'mp3'
      );
      const voicePath = path.join(tmpDir, 'voiceover.mp3');
      fs.writeFileSync(voicePath, voiceBuffer);

      // Step B2: Mix subtle 90-BPM luxury streetwear sub-bass beat underneath the voiceover so camera dolly-in is beat-synced
      const ffmpegBin = baileysManager.getFfmpegBinaryPath();
      const mixedAudioPath = path.join(tmpDir, 'mixed_audio.mp3');
      try {
        execFileSync(
          ffmpegBin,
          [
            '-y',
            '-i',
            voicePath,
            '-f',
            'lavfi',
            '-i',
            "aevalsrc='0.045*sin(2*PI*55*t)*(0.5+0.5*cos(2*PI*1.5*t))+0.02*sin(2*PI*110*t)*(0.5+0.5*cos(2*PI*3.0*t))':s=44100:d=12.8",
            '-filter_complex',
            '[0:a]volume=1.15[v];[1:a]lowpass=f=180[b];[v][b]amix=inputs=2:duration=longest:dropout_transition=2[aout]',
            '-map',
            '[aout]',
            '-c:a',
            'libmp3lame',
            '-b:a',
            '160k',
            mixedAudioPath
          ],
          { stdio: 'ignore', timeout: 10000 }
        );
      } catch {}
      const finalAudioPath = fs.existsSync(mixedAudioPath) ? mixedAudioPath : voicePath;

      // Step C: Resolve photo, segment flat-lay background, synthesize VTON Model & render 4 story beat frames
      const rawPhotoBuf = await this.resolveGarmentPhotoBuffer(input);
      const { frames: storyFrames, vtonEngineUsed, vtonModelPrompt } =
        await this.renderVerticalVtonStoryFrames(rawPhotoBuf, input, script);

      const framePaths: string[] = [];
      for (let i = 0; i < storyFrames.length; i++) {
        const fp = path.join(tmpDir, `scene_${i}.jpg`);
        fs.writeFileSync(fp, storyFrames[i]);
        framePaths.push(fp);
      }

      // Step D: Render 12.8-second 9:16 (1080x1920) MP4 with 3D Parallax Camera Dolly-In & Pan synced to beat
      const outFileName = `Vintage_Vibes_Reel_${String(input.itemId || 'ITEM').replace(/[^a-zA-Z0-9_-]/g, '')}_${Date.now().toString().slice(-5)}.mp4`;
      const outMp4Path = path.join(this.reelsOutputDir, outFileName);

      try {
        execFileSync(
          ffmpegBin,
          [
            '-y',
            '-loop', '1', '-t', '3.2', '-i', framePaths[0],
            '-loop', '1', '-t', '3.2', '-i', framePaths[1],
            '-loop', '1', '-t', '3.2', '-i', framePaths[2],
            '-loop', '1', '-t', '3.2', '-i', framePaths[3],
            '-i', finalAudioPath,
            '-filter_complex',
            // Scene 0: Smooth 3D Dolly-In towards model torso
            "[0:v]scale=1200:2134,zoompan=z='min(zoom+0.0016,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)-18':d=80:s=1080x1920:fps=25[v0];" +
            // Scene 1: Parallax pan across authentic segmented garment stitch
            "[1:v]scale=1200:2134,zoompan=z='min(zoom+0.0014,1.10)':x='iw/2-(iw/zoom/2)+sin(on/18)*14':y='ih/2-(ih/zoom/2)':d=80:s=1080x1920:fps=25[v1];" +
            // Scene 2: Beat-synced dolly-in on streetwear fit & price badge
            "[2:v]scale=1200:2134,zoompan=z='min(zoom+0.0018,1.14)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+12':d=80:s=1080x1920:fps=25[v2];" +
            // Scene 3: Pull-back hero lookbook pose with CTA
            "[3:v]scale=1200:2134,zoompan=z='if(eq(on,1),1.10,max(1.0,zoom-0.0012))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=80:s=1080x1920:fps=25[v3];" +
            '[v0][v1][v2][v3]concat=n=4:v=1:a=0,format=yuv420p[vout]',
            '-map', '[vout]',
            '-map', '4:a',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-t', '12.8',
            '-movflags', '+faststart',
            outMp4Path
          ],
          { stdio: 'ignore', timeout: 45000 }
        );
      } catch {
        execFileSync(
          ffmpegBin,
          [
            '-y',
            '-loop', '1', '-t', '3.2', '-i', framePaths[0],
            '-loop', '1', '-t', '3.2', '-i', framePaths[1],
            '-loop', '1', '-t', '3.2', '-i', framePaths[2],
            '-loop', '1', '-t', '3.2', '-i', framePaths[3],
            '-i', finalAudioPath,
            '-filter_complex',
            '[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0,format=yuv420p[vout]',
            '-map', '[vout]',
            '-map', '4:a',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-c:a', 'aac',
            '-t', '12.8',
            '-movflags', '+faststart',
            outMp4Path
          ],
          { stdio: 'ignore', timeout: 25000 }
        );
      }

      const videoBuffer = fs.readFileSync(outMp4Path);
      const captionWithHashtags =
        `🎬 *Vintage Vibes 9:16 AI VTON Model Reel Ready!*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏷️ *Item:* ${input.brandName || 'Vintage'} ${input.itemName || '1-of-1 Piece'} (\`${input.itemId}\`)\n` +
        `📏 *Size:* ${input.size || 'L'} | 💰 *Price:* ${input.priceAED || 150} AED\n` +
        `🕺 *VTON Studio:* ${vtonEngineUsed}\n` +
        `🗣️ *Accent Mode:* \`${targetLang}\`\n\n` +
        `🎙️ *Phonetic Voiceover Script:*\n` +
        `_"${script.normalizedPhoneticScript}"_\n\n` +
        `📋 *Ready-to-Copy Instagram / TikTok Caption & Hashtags:*\n` +
        `${script.hookLine} 🔥 ${script.rarityDetailLine} (${input.size || 'L'} — ${input.priceAED || 150} AED). ${script.ctaLine}\n\n` +
        `${script.hashtags.join(' ')}`;

      return {
        success: true,
        itemId: input.itemId,
        videoBuffer,
        videoFilePath: outMp4Path,
        publicVideoUrl: `/generated_reels/${outFileName}`,
        durationSeconds: 12.8,
        resolution: '1080x1920',
        script,
        captionWithHashtags,
        vtonEngineUsed,
        vtonModelPrompt
      };
    } catch (err: any) {
      console.warn('[VideoMarketingService] Reel generation error:', err?.message);
      return {
        success: false,
        itemId: input.itemId,
        durationSeconds: 0,
        resolution: '1080x1920',
        script: {
          hookLine: '',
          rarityDetailLine: '',
          priceAndFitLine: '',
          ctaLine: '',
          fullSpokenScript: '',
          normalizedPhoneticScript: '',
          targetLanguage: 'ROMAN_URDU',
          hashtags: []
        },
        captionWithHashtags: '',
        error: err?.message || 'Failed to generate 9:16 MP4 reel'
      };
    } finally {
      try {
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  /**
   * 5. Generate VTON Reel and Deliver Directly via WhatsApp to Director Muhammad Akram (+971 52 804 9351)
   */
  public async generateAndSendReelToDirector(
    input: ReelGenerationInput,
    options?: {
      userId?: string;
      replyJid?: string;
      alsoSendToDirectorPhone?: boolean;
    }
  ): Promise<GeneratedReelResult & { deliveredToWhatsApp: boolean }> {
    const result = await this.generateGarmentReelMp4(input);
    if (!result.success || !result.videoBuffer) {
      return { ...result, deliveredToWhatsApp: false };
    }

    const userId = options?.userId || 'usr-admin-1';
    const directorJid = '971528049351@s.whatsapp.net';
    let delivered = false;

    if (options?.replyJid) {
      try {
        await baileysManager.sendVideoReel(userId, options.replyJid, result.videoBuffer, result.captionWithHashtags);
        delivered = true;
      } catch (e: any) {
        console.warn('[VideoMarketingService] Reply JID video send notice:', e?.message);
      }
    }

    if (options?.alsoSendToDirectorPhone !== false && options?.replyJid !== directorJid) {
      try {
        await baileysManager.sendVideoReel(userId, directorJid, result.videoBuffer, result.captionWithHashtags);
        delivered = true;
      } catch (e: any) {
        console.warn('[VideoMarketingService] Director phone video send notice:', e?.message);
      }
    }

    return {
      ...result,
      deliveredToWhatsApp: delivered
    };
  }
}

export const videoMarketingService = new VideoMarketingService();
export { normalizePhoneticScriptForSpeech, segmentFlatLayGarment, synthesizeVirtualTryOnModel };
