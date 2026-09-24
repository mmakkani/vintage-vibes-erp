/**
 * String Sanitization Utility for Database Protection
 * Prevents PostgreSQL 22001 (String Data Right Truncation) errors
 * by strictly constraining VARCHAR lengths before database insertion.
 */

export const sanitizeString = (val: unknown, max: number = 128): string => {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  return str.length > max ? str.slice(0, max).trim() : str;
};

export const sanitizeNullableString = (val: unknown, max: number = 128): string | null => {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str) return null;
  return str.length > max ? str.slice(0, max).trim() : str;
};
