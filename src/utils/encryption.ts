import crypto from 'crypto';

const RAW_KEY = process.env.ENCRYPTION_KEY || process.env.BOOTH_CREDENTIAL_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'vintage-vibes-dubai-aes-256-secret-key-2026';
const SALT = 'vintage-vibes-broadcaster-salt-2026';

// Derive 32-byte key for AES-256
function getDerivedKey(): Buffer {
  return crypto.scryptSync(RAW_KEY, SALT, 32);
}

/**
 * Encrypt a string using AES-256-GCM
 * Output format: enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */
export function encryptCredential(plainText: string): string {
  if (!plainText) return '';
  if (plainText.startsWith('enc:v1:')) {
    return plainText; // already encrypted
  }

  try {
    const key = getDerivedKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('[Encryption] Error encrypting credential:', err);
    return plainText;
  }
}

/**
 * Decrypt a string encrypted with AES-256-GCM
 */
export function decryptCredential(cipherText: string): string {
  if (!cipherText) return '';
  if (!cipherText.startsWith('enc:v1:')) {
    return cipherText; // Return as-is if not in encrypted format (backward compatible)
  }

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 5) return cipherText;

    const [_, version, ivHex, authTagHex, encryptedHex] = parts;
    const key = getDerivedKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('[Encryption] Failed to decrypt credential; returning empty:', (err as Error).message);
    return '';
  }
}

/**
 * Mask credential for client responses (e.g. ••••••••)
 */
export function maskCredential(val?: string | null): string {
  if (!val) return '';
  return '••••••••';
}
