/**
 * AI Garment Background Removal & Auto-Framing Engine
 * Uses @imgly/background-removal (WebAssembly/ONNX) to isolate garments cleanly as transparent PNGs.
 */

export async function removeGarmentBackground(
  imageSource: string | Blob | File,
  options?: {
    onProgress?: (message: string) => void;
  }
): Promise<string> {
  try {
    if (options?.onProgress) {
      options.onProgress('🤖 Initializing AI Background Removal Engine...');
    }

    const { removeBackground } = await import('@imgly/background-removal');

    if (options?.onProgress) {
      options.onProgress('✂️ Isolating garment & creating transparent cutout...');
    }

    const blob = await removeBackground(imageSource, {
      output: {
        format: 'image/png',
        quality: 0.92
      }
    });

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert transparent PNG blob to data URL'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err: any) {
    console.warn('[AI Background Removal] Engine error or unavailable:', err?.message || err);
    throw err;
  }
}
