import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.CERTIFICATE_ENCRYPTION_KEY || '';

// Generate a 32-byte key from the environment variable (hashing it to guarantee length)
function getSecretKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error('CERTIFICATE_ENCRYPTION_KEY environment variable is not defined.');
  }
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

/**
 * Encrypts clear text using AES-256-CBC.
 * Returns a string formatted as "ivHex:encryptedHex".
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getSecretKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts text encrypted by the encrypt function.
 */
export function decrypt(encryptedData: string): string {
  const [ivHex, encryptedText] = encryptedData.split(':');
  if (!ivHex || !encryptedText) {
    throw new Error('Invalid encrypted data format.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const encryptedBytes = Buffer.from(encryptedText, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getSecretKey(), iv);
  let decrypted = decipher.update(encryptedBytes);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Encrypts binary buffer (useful for .p12 certificate binary files).
 * Returns a string formatted as "ivHex:encryptedHex".
 */
export function encryptBuffer(buffer: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts text encrypted by encryptBuffer back into a binary Buffer.
 */
export function decryptToBuffer(encryptedData: string): Buffer {
  const [ivHex, encryptedText] = encryptedData.split(':');
  if (!ivHex || !encryptedText) {
    throw new Error('Invalid encrypted buffer format.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const encryptedBytes = Buffer.from(encryptedText, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getSecretKey(), iv);
  const decrypted = Buffer.concat([decipher.update(encryptedBytes), decipher.final()]);
  return decrypted;
}

import { KmsService } from '@/services/kmsService';

export async function encryptAsync(text: string): Promise<string> {
  return KmsService.encrypt(text);
}

export async function decryptAsync(cipherText: string): Promise<string> {
  return KmsService.decrypt(cipherText);
}
