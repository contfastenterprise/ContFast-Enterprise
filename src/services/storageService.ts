import { createClient } from '@supabase/supabase-js';
import { Logger } from '@/utils/logger';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export class StorageService {
  private static client = (supabaseUrl && supabaseServiceKey)
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          persistSession: false,
        },
      })
    : null;

  /**
   * Ensures the given bucket exists, creating it if it does not.
   */
  private static async ensureBucket(bucketName: string, isPublic: boolean = false) {
    if (!this.client) {
      Logger.error('[StorageService] Supabase client is not initialized because environment variables are missing.');
      throw new Error('Supabase client not initialized.');
    }
    
    try {
      const { data: buckets, error: listError } = await this.client.storage.listBuckets();
      if (listError) throw listError;

      const exists = buckets?.some((b) => b.name === bucketName);
      if (!exists) {
        const { error: createError } = await this.client.storage.createBucket(bucketName, {
          public: isPublic,
          fileSizeLimit: 10 * 1024 * 1024, // 10MB
        });
        if (createError) throw createError;
        Logger.info(`[StorageService] Created bucket: ${bucketName}`);
      }
    } catch (err: any) {
      Logger.error(`[StorageService] Error ensuring bucket ${bucketName}:`, err);
    }
  }

  /**
   * Uploads a file (Buffer, string, etc.) to Supabase Storage.
   * Returns the clean logic file path (excluding the bucket name prefix).
   */
  static async uploadFile(
    bucketName: string,
    filePath: string,
    content: Buffer | string,
    contentType?: string
  ): Promise<string> {
    if (!this.client) {
      Logger.error('[StorageService] Supabase client is not initialized because environment variables are missing.');
      throw new Error('Supabase client not initialized.');
    }

    await this.ensureBucket(bucketName);

    // Clean leading slashes or dots from filePath
    const cleanPath = filePath.replace(/^[./\\]+/, '').replace(/\\/g, '/');

    const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;

    const { error } = await this.client.storage
      .from(bucketName)
      .upload(cleanPath, body, {
        contentType,
        upsert: true,
      });

    if (error) {
      Logger.error(`[StorageService] Upload failed for ${cleanPath} in ${bucketName}:`, error.message);
      throw error;
    }

    return cleanPath;
  }

  /**
   * Downloads a file from Supabase Storage and returns it as a Buffer.
   */
  static async downloadFile(bucketName: string, filePath: string): Promise<Buffer> {
    if (!this.client) {
      Logger.error('[StorageService] Supabase client is not initialized because environment variables are missing.');
      throw new Error('Supabase client not initialized.');
    }

    const cleanPath = filePath.replace(/^[./\\]+/, '').replace(/\\/g, '/');

    const { data, error } = await this.client.storage
      .from(bucketName)
      .download(cleanPath);

    if (error) {
      Logger.error(`[StorageService] Download failed for ${cleanPath} in ${bucketName}:`, error.message);
      throw error;
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Deletes a file from Supabase Storage.
   */
  static async deleteFile(bucketName: string, filePath: string): Promise<void> {
    if (!this.client) {
      Logger.error('[StorageService] Supabase client is not initialized because environment variables are missing.');
      throw new Error('Supabase client not initialized.');
    }

    const cleanPath = filePath.replace(/^[./\\]+/, '').replace(/\\/g, '/');

    const { error } = await this.client.storage
      .from(bucketName)
      .remove([cleanPath]);

    if (error) {
      Logger.error(`[StorageService] Delete failed for ${cleanPath} in ${bucketName}:`, error.message);
      throw error;
    }
  }

  /**
   * Gets the public URL of a file.
   */
  static getPublicUrl(bucketName: string, filePath: string): string {
    if (!this.client) {
      Logger.error('[StorageService] Supabase client is not initialized because environment variables are missing.');
      throw new Error('Supabase client not initialized.');
    }

    const cleanPath = filePath.replace(/^[./\\]+/, '').replace(/\\/g, '/');

    const { data } = this.client.storage
      .from(bucketName)
      .getPublicUrl(cleanPath);

    return data.publicUrl;
  }

  /**
   * Parses a full database path like "invoices/company_123/ncf.xml" into bucketName and filePath.
   */
  static parseDbPath(dbPath: string): { bucketName: string; filePath: string } {
    const clean = dbPath.replace(/^[./\\]+/, '').replace(/\\/g, '/');
    const parts = clean.split('/');
    
    const invoicesIdx = parts.indexOf('invoices');
    if (invoicesIdx !== -1 && parts.length > invoicesIdx + 2) {
      const bucketName = 'invoices';
      const filePath = parts.slice(invoicesIdx + 1).join('/');
      return { bucketName, filePath };
    }

    if (parts.length === 2) {
      return { bucketName: 'invoices', filePath: clean };
    }

    const bucketName = parts[0] || 'invoices';
    const filePath = parts.slice(1).join('/');
    return { bucketName, filePath };
  }
}
