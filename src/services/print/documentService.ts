import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const PDF_TEMP_DIR = isProduction
  ? path.join(os.tmpdir(), 'contfast-temp-docs')
  : (process.env.PDF_TEMP_DIR || path.join(os.tmpdir(), 'contfast-temp-docs'));
const URL_SIGNATURE_SECRET = process.env.URL_SIGNATURE_SECRET || 'default_secret';

export class DocumentService {
  /**
   * Generates a signed URL for temporary file access.
   * @param documentId The UUID of the document
   * @param expiresInMinutes Expiration time in minutes
   */
  static generateSignedUrl(documentId: string, expiresInMinutes: number = 10, filename?: string): string {
    const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
    
    // Create HMAC SHA256 of the documentId and expiresAt
    const hmac = crypto.createHmac('sha256', URL_SIGNATURE_SECRET);
    hmac.update(`${documentId}:${expiresAt}`);
    const signature = hmac.digest('hex');

    // The endpoint will be /api/v1/documents/[uuid]/download?expiresAt=...&signature=...
    let url = `/api/v1/documents/${documentId}/download?expiresAt=${expiresAt}&signature=${signature}`;
    if (filename) {
      url += `&filename=${encodeURIComponent(filename)}`;
    }
    return url;
  }

  /**
   * Validates a signed URL's parameters
   * @param documentId The UUID of the document
   * @param expiresAt The expiration timestamp
   * @param signature The provided HMAC signature
   * @returns true if valid, false if invalid or expired
   */
  static validateSignature(documentId: string, expiresAt: string, signature: string): boolean {
    const expiresAtNum = parseInt(expiresAt, 10);
    if (isNaN(expiresAtNum) || Date.now() > expiresAtNum) {
      return false; // Expired or invalid format
    }

    const hmac = crypto.createHmac('sha256', URL_SIGNATURE_SECRET);
    hmac.update(`${documentId}:${expiresAt}`);
    const expectedSignature = hmac.digest('hex');

    // Prevent timing attacks by comparing lengths first, then timingSafeEqual if same length
    if (expectedSignature.length !== signature.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  }

  /**
   * Save buffer to a temporary file and return its UUID
   */
  static async saveTemporaryFile(buffer: Buffer, extension: 'pdf' | 'xlsx'): Promise<string> {
    const documentId = uuidv4();
    const fileName = `${documentId}.${extension}`;
    
    // Ensure directory exists
    await fs.mkdir(PDF_TEMP_DIR, { recursive: true });
    
    const filePath = path.join(/*turbopackIgnore: true*/ PDF_TEMP_DIR, fileName);
    await fs.writeFile(filePath, buffer);
    
    return documentId;
  }

  /**
   * Get file path for a document UUID
   */
  static getFilePath(documentId: string, extension: 'pdf' | 'xlsx'): string {
    // Prevent path traversal
    const safeDocId = path.basename(documentId);
    return path.join(/*turbopackIgnore: true*/ PDF_TEMP_DIR, `${safeDocId}.${extension}`);
  }

  /**
   * Checks if file exists
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deletes a temporary file
   */
  static async deleteTemporaryFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error(`Failed to delete temporary file ${filePath}:`, error);
    }
  }
}
