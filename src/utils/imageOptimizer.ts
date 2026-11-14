/**
 * Image Optimizer & Thumbnail Utilities
 * Ensures heavy garment photos (2MB-5MB) do not choke mobile memory or bandwidth.
 */

export interface ImageOptimizerOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png' | 'auto';
}

const DEFAULT_GARMENT_FALLBACK = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23cbd5e1" stroke-width="1.5"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';

export function bucketThumbWidth(width = 120): number {
  const w = Number(width) || 120;
  if (w <= 100) return 96;
  if (w <= 180) return 160;
  if (w <= 340) return 320;
  if (w <= 480) return 440;
  if (w <= 680) return 640;
  return 800;
}

export function toThumbUrl(rawUrl?: string | null, width = 440, quality = 74): string {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return '';
  }
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || /\.svg(\?|$)/i.test(trimmed)) {
    return trimmed;
  }

  const tierW = bucketThumbWidth(width);
  const clampedQ = Math.min(85, Math.max(55, Math.round(Number(quality) || 74)));

  try {
    if (trimmed.includes('/storage/v1/object/public/') || trimmed.includes('/storage/v1/render/image/public/')) {
      const normalized = trimmed.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/');
      const idx = normalized.indexOf('/storage/v1/object/public/');
      if (idx !== -1) {
        const cleanPath = normalized.slice(idx).split('?')[0];
        if (/\.(jpe?g|png|webp)$/i.test(cleanPath)) {
          return `${cleanPath}?w=${tierW}&q=${clampedQ}`;
        }
        return cleanPath;
      }
    }

    const uploadsMatch = trimmed.match(/^(?:https?:\/\/[^/]+)?(\/uploads\/[^?]+)$/i);
    if (uploadsMatch && /\.(jpe?g|png|webp)$/i.test(uploadsMatch[1])) {
      return `${uploadsMatch[1]}?w=${tierW}&q=${clampedQ}`;
    }

    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
      const cleanLocal = trimmed.split('?')[0];
      if (/\.(jpe?g|png|webp)$/i.test(cleanLocal)) {
        return `${cleanLocal}?w=${tierW}&q=${clampedQ}`;
      }
    }
  } catch (_) {}

  return trimmed;
}

export class ImageOptimizer {
  /**
   * Resolves an optimized WebP thumbnail URL served by server.ts sharp cache (.data/thumbs).
   * If URL is already a data URL or SVG, returns it directly.
   */
  public static getThumbnailUrl(rawUrl?: string | null, width = 120, quality = 72): string {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return DEFAULT_GARMENT_FALLBACK;
    }
    return toThumbUrl(rawUrl, width, quality) || DEFAULT_GARMENT_FALLBACK;
  }

  /**
   * Standardized image props for zero-lag rendering.
   */
  public static getLazyProps(alt = 'Garment Photo') {
    return {
      alt,
      loading: 'lazy' as const,
      decoding: 'async' as const,
      onError: (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        const target = e.currentTarget;
        if (target.src !== DEFAULT_GARMENT_FALLBACK) {
          target.src = DEFAULT_GARMENT_FALLBACK;
        }
      }
    };
  }
}
