const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = 'C:/Users/DELL/.gemini/antigravity/brain/11c24315-e278-4d3f-b474-c52f81ed18b2/.user_uploaded/media_1788819887662.jpg';

async function processImages() {
  const cx = 514;
  const cy = 510;
  const size = 852;
  const half = Math.round(size / 2);
  const left = cx - half;
  const top = cy - half;

  console.log('Extracting square:', { left, top, size });

  // 1. Full Cutout Medal (with transparent background)
  const croppedMedal = await sharp(inputPath)
    .extract({ left, top, width: size, height: size })
    .toBuffer();

  const circleMaskSvg = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${half}" cy="${half}" r="${half - 2}" fill="white" /></svg>`
  );

  await sharp(croppedMedal)
    .composite([{ input: circleMaskSvg, blend: 'dest-in' }])
    .png({ quality: 100 })
    .toFile('public/vintage_medal_3d.png');
  console.log('Saved public/vintage_medal_3d.png');

  // 2. Outer Dial Ring with hole inside the silver bezel (hole radius 248)
  const holeR = 248;
  const outerDialMaskSvg = Buffer.from(
    `<svg width="${size}" height="${size}">
      <mask id="h">
        <rect width="${size}" height="${size}" fill="white" />
        <circle cx="${half}" cy="${half}" r="${holeR}" fill="black" />
      </mask>
      <circle cx="${half}" cy="${half}" r="${half - 2}" fill="white" mask="url(#h)" />
    </svg>`
  );

  await sharp(croppedMedal)
    .composite([{ input: outerDialMaskSvg, blend: 'dest-in' }])
    .png({ quality: 100 })
    .toFile('public/vintage_outer_dial_3d.png');
  console.log('Saved public/vintage_outer_dial_3d.png');

  // 3. Central Golden V and Circular Badge (radius ~192)
  const vRadius = 192;
  const vSize = vRadius * 2;
  const vLeft = half - vRadius;
  const vTop = half - vRadius;

  const vMaskSvg = Buffer.from(
    `<svg width="${vSize}" height="${vSize}"><circle cx="${vRadius}" cy="${vRadius}" r="${vRadius - 1}" fill="white" /></svg>`
  );

  const rawCentralV = await sharp(croppedMedal)
    .extract({ left: vLeft, top: vTop, width: vSize, height: vSize })
    .composite([{ input: vMaskSvg, blend: 'dest-in' }])
    .png({ quality: 100 })
    .toBuffer();

  await sharp(rawCentralV).toFile('public/vintage_central_v_3d.png');
  console.log('Saved public/vintage_central_v_3d.png');

  // 4. Isolated Gold V with Transparent Background around the arms & inside the ring
  const { data: vData, info: vInfo } = await sharp(rawCentralV).raw().toBuffer({ resolveWithObject: true });
  const isolatedVBuffer = Buffer.from(vData);
  const vCenter = vRadius;

  for (let y = 0; y < vInfo.height; y++) {
    for (let x = 0; x < vInfo.width; x++) {
      const idx = (y * vInfo.width + x) * 4;
      const dist = Math.hypot(x - vCenter, y - vCenter);
      if (dist > vRadius - 2) {
        isolatedVBuffer[idx + 3] = 0;
        continue;
      }
      const r = vData[idx], g = vData[idx + 1], b = vData[idx + 2];
      const warmDiff = r - b;
      // Gold elements in this medal have warm amber/gold hues (r substantially greater than b)
      // Whereas silver globe background is neutral grey (r ~ b)
      if (warmDiff < 14) {
        isolatedVBuffer[idx + 3] = 0;
      } else if (warmDiff < 26) {
        const alphaFactor = (warmDiff - 14) / 12;
        isolatedVBuffer[idx + 3] = Math.round(vData[idx + 3] * alphaFactor);
      }
    }
  }

  await sharp(isolatedVBuffer, { raw: { width: vInfo.width, height: vInfo.height, channels: 4 } })
    .png({ quality: 100 })
    .toFile('public/vintage_v_isolated_gold.png');
  console.log('Saved public/vintage_v_isolated_gold.png');

  // 5. Copy to dist if dist directory exists
  if (fs.existsSync('dist')) {
    fs.copyFileSync('public/vintage_medal_3d.png', 'dist/vintage_medal_3d.png');
    fs.copyFileSync('public/vintage_outer_dial_3d.png', 'dist/vintage_outer_dial_3d.png');
    fs.copyFileSync('public/vintage_central_v_3d.png', 'dist/vintage_central_v_3d.png');
    fs.copyFileSync('public/vintage_v_isolated_gold.png', 'dist/vintage_v_isolated_gold.png');
  }

  console.log('All 3D assets generated successfully!');
}

processImages().catch(console.error);
