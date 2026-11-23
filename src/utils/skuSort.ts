const naturalSkuCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
});

export const getPieceSku = (piece: any): string =>
  String(piece?.sku || piece?.barcode || piece?.piece_code || piece?.pieceCode || '').trim().toUpperCase();

export const compareSkuStringsDesc = (a: string, b: string): number => {
  const skuA = String(a || '').trim().toUpperCase();
  const skuB = String(b || '').trim().toUpperCase();
  if (!skuA && !skuB) return 0;
  if (!skuA) return 1;
  if (!skuB) return -1;
  return naturalSkuCollator.compare(skuB, skuA);
};

export const comparePiecesBySkuDesc = (a: any, b: any): number => {
  const skuCmp = compareSkuStringsDesc(getPieceSku(a), getPieceSku(b));
  if (skuCmp !== 0) return skuCmp;
  const timeA = new Date(a?.createdAt || a?.created_at || 0).getTime() || 0;
  const timeB = new Date(b?.createdAt || b?.created_at || 0).getTime() || 0;
  if (timeA !== timeB) return timeB - timeA;
  return String(b?.id || '').localeCompare(String(a?.id || ''));
};

export const sortPiecesBySkuDesc = <T>(items: T[]): T[] => {
  if (!Array.isArray(items) || items.length <= 1) return Array.isArray(items) ? [...items] : [];
  return [...items].sort(comparePiecesBySkuDesc);
};
