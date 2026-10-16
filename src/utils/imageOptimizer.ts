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

export class ImageOptimizer {
  /**
   * Resolves an optimized thumbnail URL for Supabase storage or cloud CDNs.
   * If URL is already a small thumbnail or data URL, returns it directly.
   */
  public static getThumbnailUrl(rawUrl?: string | null, width = 120, quality = 70): string {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return DEFAULT_GARMENT_FALLBACK;
    }

    const trimmed = rawUrl.trim();

    // Data URLs or SVGs don't need cloud resizing
    if (trimmed.startsWith('data:') || trimmed.endsWith('.svg')) {
      return trimmed;
    }

    try {
      // Normalize any cloud or render storage URLs to local /storage/v1/object/public/ route
      if (trimmed.includes('/storage/v1/object/public/') || trimmed.includes('/storage/v1/render/image/public/')) {
        const normalized = trimmed.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/');
        const idx = normalized.indexOf('/storage/v1/object/public/');
        if (idx !== -1) {
          return normalized.slice(idx).split('?')[0];
        }
      }
    } catch (_) {}

    return trimmed;
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
