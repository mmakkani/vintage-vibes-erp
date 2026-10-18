import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { execFileSync } from 'child_process';
import { baileysManager } from './baileys.service.ts';
import { callGeminiUstad } from '../../server/ustadShagirdAiEngine.ts';

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
  language?: string;
}

export interface ReelStoryScript {
  hookLine: string;
  rarityDetailLine: string;
  priceAndFitLine: string;
  ctaLine: string;
  fullSpokenScript: string;
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
   * 1. Generate a 12-15 second Storytelling Hook Script (Gemini / DeepSeek-R1 / Ollama)
   * Structure: Hook -> Rarity Detail -> Price & Fit in AED -> Call to Action ("WhatsApp link in bio")
   */
  public async generateStorytellingHookScript(input: ReelGenerationInput): Promise<ReelStoryScript> {
    const brand = String(input.brandName || 'Vintage Archive').trim();
    const item = String(input.itemName || input.category || '1-of-1 Piece').trim();
    const size = String(input.size || 'L').trim();
    const price = Number(input.priceAED || 150);
    const origin = String(input.origin || 'USA/UK Import').trim();
    const style = String(input.style || 'Rare 90s Vintage Aesthetic & Authentic Stitch').trim();
    const lang = String(input.language || 'URDU').toUpperCase().trim();

    const prompt = `You are a viral TikTok / Instagram Reels luxury vintage fashion scriptwriter for "Vintage Vibes Dubai" (Owner: Director Muhammad Akram).
Write a high-retention 12-15 second vertical video script for this 1-of-1 garment:
- Item ID: ${input.itemId}
- Brand & Title: ${brand} ${item}
- Size: ${size}
- Price: ${price} AED
- Authenticity / Rarity: ${origin} • ${style}
- Language: ${
      lang.includes('ARABIC')
        ? 'Natural UAE/Gulf Arabic'
        : lang.includes('FILIPINO') || lang.includes('TAGALOG')
          ? 'Natural Tagalog / Filipino'
          : lang.includes('BENGALI') || lang.includes('BANGLA')
            ? 'Natural Bengali'
            : lang.includes('NEPALI')
              ? 'Natural Nepali'
              : lang.includes('RUSSIAN')
                ? 'Natural Russian'
                : lang.includes('URDU') || lang.includes('HINDI')
                  ? 'Sweet, conversational Roman Urdu mixed with English fashion terms (Dubai/Pakistan style)'
                  : 'Punchy Luxury Streetwear English'
    }

Return ONLY valid JSON with these exact keys:
{
  "hookLine": "3-second viral hook (max 9 words, e.g. 'Stop scrolling! Check this 1-of-1 ${brand} grail!')",
  "rarityDetailLine": "4-second rarity & texture detail (max 10 words, e.g. 'Authentic ${origin} fabric, rare vintage patina & tag!')",
  "priceAndFitLine": "3-second size & AED price reveal (max 9 words, e.g. 'Size ${size} — locked at just ${price} AED!')",
  "ctaLine": "3-second call to action (max 9 words, e.g. 'Tap the WhatsApp link in bio before it sells!')",
  "hashtags": ["#VintageVibesDubai", "#${brand.replace(/[^a-zA-Z0-9]/g, '')}", "#DubaiStreetwear", "#ThriftUAE", "#1of1Vintage", "#FYP"]
}`;

    try {
      const ustadRes = await callGeminiUstad({
        prompt,
        jsonMode: true,
        temperature: 0.35,
        maxOutputTokens: 260,
        timeoutMs: 9000
      });

      if (ustadRes.ok && ustadRes.text) {
        const cleaned = ustadRes.text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed?.hookLine && parsed?.rarityDetailLine && parsed?.ctaLine) {
          const hookLine = String(parsed.hookLine).trim();
          const rarityDetailLine = String(parsed.rarityDetailLine).trim();
          const priceAndFitLine = String(parsed.priceAndFitLine || `Size ${size} • Only ${price} AED!`).trim();
          const ctaLine = String(parsed.ctaLine).trim();
          const hashtags = Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0
            ? parsed.hashtags.map((h: any) => String(h).trim())
            : ['#VintageVibesDubai', '#DubaiThrift', '#1of1Grail', '#UAEFashion', '#VintageStreetwear', '#FYP'];
          return {
            hookLine,
            rarityDetailLine,
            priceAndFitLine,
            ctaLine,
            fullSpokenScript: `${hookLine}. ${rarityDetailLine}. ${priceAndFitLine}. ${ctaLine}`,
            hashtags
          };
        }
      }
    } catch {}

    // Fallback to local Ollama DeepSeek-R1 / Qwen2.5
    try {
      const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
      const resp = await fetch(`${ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OLLAMA_TEXT_MODEL || 'qwen2.5:7b',
          prompt,
          format: 'json',
          stream: false,
          options: { temperature: 0.3, num_predict: 200 }
        }),
        signal: AbortSignal.timeout(8000)
      }).catch(() => null);

      if (resp && resp.ok) {
        const data: any = await resp.json().catch(() => ({}));
        if (data?.response) {
          const parsed = JSON.parse(String(data.response));
          if (parsed?.hookLine && parsed?.ctaLine) {
            const hookLine = String(parsed.hookLine).trim();
            const rarityDetailLine = String(parsed.rarityDetailLine || `100% Authentic ${origin} ${brand} ${item}`).trim();
            const priceAndFitLine = String(parsed.priceAndFitLine || `Size ${size} — Sirf ${price} AED!`).trim();
            const ctaLine = String(parsed.ctaLine).trim();
            return {
              hookLine,
              rarityDetailLine,
              priceAndFitLine,
              ctaLine,
              fullSpokenScript: `${hookLine}. ${rarityDetailLine}. ${priceAndFitLine}. ${ctaLine}`,
              hashtags: ['#VintageVibesDubai', `#${brand.replace(/\W+/g, '') || 'Vintage'}`, '#DubaiStreetwear', '#ThriftUAE', '#1of1Archive', '#FYP']
            };
          }
        }
      }
    } catch {}

    // Deterministic high-converting multilingual fallback script
    if (lang.includes('ARABIC')) {
      const hookLine = `يا هلا! شوف هالقطعة النادرة من ${brand} ${item}!`;
      const rarityDetailLine = `أصلي ١٠٠٪ مستورد من أمريكا وأوروبا بجودة فاخرة!`;
      const priceAndFitLine = `المقاس ${size} — السعر الخاص فقط ${price} درهم إماراتي!`;
      const ctaLine = `اضغط على رابط الواتساب في البايو واحجزها فوراً!`;
      return {
        hookLine,
        rarityDetailLine,
        priceAndFitLine,
        ctaLine,
        fullSpokenScript: `${hookLine} ${rarityDetailLine} ${priceAndFitLine} ${ctaLine}`,
        hashtags: ['#VintageVibesDubai', `#${brand.replace(/[^a-zA-Z0-9]/g, '') || 'VintageArchive'}`, '#DubaiStreetwear', '#UAEThriftStore', '#AlAinVintage', '#1of1Piece', '#ReelsUAE', '#TikTokDubai']
      };
    }

    if (lang.includes('FILIPINO') || lang.includes('TAGALOG')) {
      const hookLine = `Tingnan mo ito! Rare 1-of-1 ${brand} ${item} sa Dubai!`;
      const rarityDetailLine = `100% Authentic ${origin} fabric at original vintage stitch!`;
      const priceAndFitLine = `Size ${size} — Special VIP Price ${price} AED lang po!`;
      const ctaLine = `I-click ang WhatsApp link sa bio para ma-reserve agad!`;
      return {
        hookLine,
        rarityDetailLine,
        priceAndFitLine,
        ctaLine,
        fullSpokenScript: `${hookLine} ${rarityDetailLine} ${priceAndFitLine} ${ctaLine}`,
        hashtags: ['#VintageVibesDubai', `#${brand.replace(/[^a-zA-Z0-9]/g, '') || 'VintageArchive'}`, '#PinoyUAE', '#DubaiStreetwear', '#1of1Piece', '#ReelsUAE']
      };
    }

    const hookLine =
      lang.includes('URDU') || lang.includes('HINDI')
        ? `Assalam Alaikum dosto! Yeh 1-of-1 ${brand} ${item} dekhiye!`
        : `Stop scrolling! Check this 1-of-1 ${brand} ${item}!`;
    const rarityDetailLine =
      lang.includes('URDU') || lang.includes('HINDI')
        ? `100 percent original ${origin} fabric aur शानदार vintage stitch!`
        : `Authentic ${origin} archive texture & vintage tag!`;
    const priceAndFitLine =
      lang.includes('URDU') || lang.includes('HINDI')
        ? `Size ${size} — Special VIP Price sirf ${price} AED!`
        : `Verified Size ${size} — Yours for just ${price} AED!`;
    const ctaLine =
      lang.includes('URDU') || lang.includes('HINDI')
        ? `Abhi bio mein WhatsApp link se foran book karein!`
        : `Tap the WhatsApp link in bio to lock this 1-of-1 piece!`;

    return {
      hookLine,
      rarityDetailLine,
      priceAndFitLine,
      ctaLine,
      fullSpokenScript: `${hookLine} ${rarityDetailLine} ${priceAndFitLine} ${ctaLine}`,
      hashtags: [
        '#VintageVibesDubai',
        `#${brand.replace(/[^a-zA-Z0-9]/g, '') || 'VintageArchive'}`,
        '#DubaiStreetwear',
        '#UAEThriftStore',
        '#AlAinVintage',
        '#1of1Piece',
        '#ReelsUAE',
        '#TikTokDubai'
      ]
    };
  }

  /**
   * 2. Resolve garment image into a high-res Buffer (with fallback studio card if no photo URL exists)
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

    // Fallback: synthesize a clean luxury product placeholder image via Sharp SVG
    const fallbackSvg = `<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
      <rect width="1080" height="1350" fill="#111827"/>
      <rect x="60" y="60" width="960" height="1230" rx="32" fill="#1e293b" stroke="#f59e0b" stroke-width="6"/>
      <text x="540" y="560" text-anchor="middle" font-family="Arial, sans-serif" font-size="68" font-weight="bold" fill="#fde68a">${escapeXml(input.brandName || 'VINTAGE VIBES')}</text>
      <text x="540" y="660" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" fill="#ffffff">${escapeXml(input.itemName || '1-OF-1 ARCHIVE GARMENT')}</text>
      <text x="540" y="770" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="bold" fill="#f59e0b">SIZE ${escapeXml(input.size || 'L')} • ${Number(input.priceAED || 150)} AED</text>
      <text x="540" y="860" text-anchor="middle" font-family=" monospace" font-size="32" fill="#94a3b8">SKU: ${escapeXml(input.itemId)}</text>
    </svg>`;
    return await sharp(Buffer.from(fallbackSvg)).jpeg({ quality: 92 }).toBuffer();
  }

  /**
   * 3. Render 4 Luxury 9:16 Vertical Scene Frames (1080x1920) with Blurred Vintage Aesthetic Backdrop,
   *    Studio-Lit Product Cutout, and Burnt-In Animated Subtitle Captions synced to the 4 story beats!
   */
  private async renderVerticalStoryFrames(
    rawPhotoBuffer: Buffer,
    input: ReelGenerationInput,
    script: ReelStoryScript
  ): Promise<Buffer[]> {
    const W = 1080;
    const H = 1920;

    // Create blurred vintage dark-gold aesthetic background from the garment photo itself
    const blurredBg = await sharp(rawPhotoBuffer)
      .resize(W, H, { fit: 'cover' })
      .blur(35)
      .modulate({ brightness: 0.35, saturation: 1.2 })
      .png()
      .toBuffer();

    // Create crisp, studio-enhanced foreground garment image (with progressive zoom per scene for Ken Burns feel)
    const scenes = [
      {
        stageLabel: '🔥 1-OF-1 VINTAGE DROP',
        subtitle: script.hookLine,
        zoomScale: 1.0,
        yOffset: 0,
        accentColor: '#f59e0b'
      },
      {
        stageLabel: '✨ AUTHENTIC ARCHIVE DETAIL',
        subtitle: script.rarityDetailLine,
        zoomScale: 1.08,
        yOffset: -20,
        accentColor: '#fbbf24'
      },
      {
        stageLabel: `🏷️ SIZE ${String(input.size || 'L').toUpperCase()} • VIP PRICE`,
        subtitle: script.priceAndFitLine,
        zoomScale: 1.15,
        yOffset: 15,
        accentColor: '#34d399'
      },
      {
        stageLabel: '📲 INSTANT WHATSAPP LOCK',
        subtitle: script.ctaLine,
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
      const targetW = Math.round(880 * sc.zoomScale);
      const targetH = Math.round(1060 * sc.zoomScale);

      const fgGarment = await sharp(rawPhotoBuffer)
        .rotate()
        .resize(targetW, targetH, { fit: 'inside', withoutEnlargement: false })
        .modulate({ brightness: 1.04, saturation: 1.1 })
        .sharpen()
        .png()
        .toBuffer();

      const fgMeta = await sharp(fgGarment).metadata();
      const fw = fgMeta.width || 840;
      const fh = fgMeta.height || 960;
      const left = Math.max(0, Math.round((W - fw) / 2));
      const top = Math.max(220, Math.round(290 + (1060 - fh) / 2 + sc.yOffset));

      const [sub1, sub2] = wrapSubtitle(sc.subtitle, 26);

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

        <!-- Price & Size Floating Badge (Top Right) -->
        <rect x="${W - 330}" y="230" width="260" height="86" rx="20" fill="url(#goldGrad)"/>
        <text x="${W - 200}" y="286" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="900" fill="#090d16">AED ${priceAed}</text>

        <!-- Size Floating Badge (Top Left) -->
        <rect x="70" y="230" width="220" height="86" rx="20" fill="#090d16" fill-opacity="0.9" stroke="#f59e0b" stroke-width="2"/>
        <text x="180" y="286" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="900" fill="#fde68a">SIZE ${escapeXml(String(input.size || 'L').toUpperCase())}</text>

        <!-- Animated Burnt-In Subtitle Box (Bottom Third for TikTok/Reels Safe Zone) -->
        <rect x="180" y="1390" width="${W - 360}" height="64" rx="32" fill="${sc.accentColor}"/>
        <text x="${W / 2}" y="1433" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" font-weight="900" fill="#090d16" letter-spacing="1.5">${escapeXml(sc.stageLabel)}</text>

        <rect x="64" y="1474" width="${W - 128}" height="210" rx="28" fill="#090d16" fill-opacity="0.92" stroke="url(#goldGrad)" stroke-width="3"/>
        <text x="${W / 2}" y="${sub2 ? '1558' : '1592'}" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="900" fill="#ffffff">${escapeXml(sub1)}</text>
        ${sub2 ? `<text x="${W / 2}" y="1626" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="900" fill="#fde68a">${escapeXml(sub2)}</text>` : ''}

        <!-- Footer CTA Bar -->
        <rect x="110" y="1720" width="${W - 220}" height="104" rx="22" fill="#0f172a" fill-opacity="0.95" stroke="#475569" stroke-width="1.5"/>
        <text x="${W / 2}" y="1766" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#34d399">📱 WHATSAPP CONCIERGE: +971 55 418 6086</text>
        <text x="${W / 2}" y="1804" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#e2e8f0">🌐 VINTAGEVIBESGK.COM • LINK IN BIO</text>
      </svg>`);

      const composedFrame = await sharp(blurredBg)
        .composite([
          { input: fgGarment, left, top },
          { input: overlaySvg, left: 0, top: 0 }
        ])
        .jpeg({ quality: 92 })
        .toBuffer();

      frameBuffers.push(composedFrame);
    }

    return frameBuffers;
  }

  /**
   * 4. Compile the 9:16 Vertical Video Reel (.mp4) with Dynamic Ken Burns Zoom/Pan,
   *    Edge-TTS Voiceover, and Burnt-In Animated Captions!
   */
  public async generateGarmentReelMp4(input: ReelGenerationInput): Promise<GeneratedReelResult> {
    const tmpId = `vv_reel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpDir = path.join(os.tmpdir(), tmpId);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      // Step A: Generate Storytelling Hook Script
      const script = await this.generateStorytellingHookScript(input);

      // Step B: Synthesize Edge-TTS Male Voiceover (MP3)
      const voiceBuffer = await baileysManager.synthesizeNeuralVoiceNoteBuffer(
        script.fullSpokenScript,
        input.language || 'URDU',
        'mp3'
      );
      const audioPath = path.join(tmpDir, 'voiceover.mp3');
      fs.writeFileSync(audioPath, voiceBuffer);

      // Step C: Resolve photo & render 4 story beat frames (Hook, Rarity Detail, Price/Size, CTA)
      const rawPhotoBuf = await this.resolveGarmentPhotoBuffer(input);
      const storyFrames = await this.renderVerticalStoryFrames(rawPhotoBuf, input, script);

      const framePaths: string[] = [];
      for (let i = 0; i < storyFrames.length; i++) {
        const fp = path.join(tmpDir, `scene_${i}.jpg`);
        fs.writeFileSync(fp, storyFrames[i]);
        framePaths.push(fp);
      }

      // Step D: Render 12-second 9:16 (1080x1920) MP4 with smooth Ken Burns zoompan + synced voiceover via FFmpeg
      const ffmpegBin = baileysManager.getFfmpegBinaryPath();
      const outFileName = `Vintage_Vibes_Reel_${String(input.itemId || 'ITEM').replace(/[^a-zA-Z0-9_-]/g, '')}_${Date.now().toString().slice(-5)}.mp4`;
      const outMp4Path = path.join(this.reelsOutputDir, outFileName);

      // Each of the 4 scenes plays for 3.2 seconds (total ~12.8 seconds) with smooth Ken Burns zoompan filter
      try {
        execFileSync(
          ffmpegBin,
          [
            '-y',
            '-loop', '1', '-t', '3.2', '-i', framePaths[0],
            '-loop', '1', '-t', '3.2', '-i', framePaths[1],
            '-loop', '1', '-t', '3.2', '-i', framePaths[2],
            '-loop', '1', '-t', '3.2', '-i', framePaths[3],
            '-i', audioPath,
            '-filter_complex',
            '[0:v]scale=1160:2062,zoompan=z=\'min(zoom+0.0012,1.08)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=80:s=1080x1920:fps=25[v0];' +
            '[1:v]scale=1160:2062,zoompan=z=\'min(zoom+0.0012,1.08)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=80:s=1080x1920:fps=25[v1];' +
            '[2:v]scale=1160:2062,zoompan=z=\'min(zoom+0.0012,1.08)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=80:s=1080x1920:fps=25[v2];' +
            '[3:v]scale=1160:2062,zoompan=z=\'min(zoom+0.0012,1.08)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=80:s=1080x1920:fps=25[v3];' +
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
        // Ultra-fast concat fallback if zoompan times out on low-CPU environments
        execFileSync(
          ffmpegBin,
          [
            '-y',
            '-loop', '1', '-t', '3.2', '-i', framePaths[0],
            '-loop', '1', '-t', '3.2', '-i', framePaths[1],
            '-loop', '1', '-t', '3.2', '-i', framePaths[2],
            '-loop', '1', '-t', '3.2', '-i', framePaths[3],
            '-i', audioPath,
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
        `🎬 *Vintage Vibes 9:16 Viral Reel Ready!*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏷️ *Item:* ${input.brandName || 'Vintage'} ${input.itemName || '1-of-1 Piece'} (\`${input.itemId}\`)\n` +
        `📏 *Size:* ${input.size || 'L'} | 💰 *Price:* ${input.priceAED || 150} AED\n\n` +
        `🎙️ *AI Voiceover Script:*\n` +
        `_"${script.fullSpokenScript}"_\n\n` +
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
        captionWithHashtags
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
   * 5. Generate Reel and Deliver Directly via WhatsApp to Director Muhammad Akram (+971 52 804 9351)
   *    (and/or the requesting WhatsApp JID)
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
