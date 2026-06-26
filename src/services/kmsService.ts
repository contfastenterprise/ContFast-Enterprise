import crypto from 'crypto';

export interface KmsProvider {
  encrypt(plainText: string): Promise<string>;
  decrypt(cipherText: string): Promise<string>;
}

/**
 * Local AES-256-GCM Cryptographic Provider.
 * This serves as the fallback/local KMS provider.
 */
export class LocalKmsProvider implements KmsProvider {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor() {
    const encryptionKey = process.env.CERTIFICATE_ENCRYPTION_KEY || '';
    if (!encryptionKey) {
      throw new Error('CERTIFICATE_ENCRYPTION_KEY environment variable is not defined.');
    }
    // Generate a secure 32-byte key from the environment variable
    this.key = crypto.createHash('sha256').update(encryptionKey).digest();
  }

  async encrypt(plainText: string): Promise<string> {
    const iv = crypto.randomBytes(12); // GCM standard IV is 12 bytes
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Format: iv:authTag:cipherText
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  async decrypt(cipherText: string): Promise<string> {
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format for AES-GCM.');
    }

    const [ivHex, authTagHex, encryptedText] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encryptedBytes = Buffer.from(encryptedText, 'hex');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedBytes);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  }
}

/**
 * Global KMS orchestrator service.
 * Ready to integrate Cloud KMS providers (AWS KMS, GCP Key Management, HashiCorp Vault)
 * by swapping the provider instance based on environment configuration.
 */
export class KmsService {
  private static provider: KmsProvider | null = null;

  private static getProvider(): KmsProvider {
    if (!this.provider) {
      const providerType = process.env.KMS_PROVIDER || 'local';
      
      if (providerType === 'local') {
        this.provider = new LocalKmsProvider();
      } else {
        // Future extensions can be loaded here:
        // if (providerType === 'aws') this.provider = new AwsKmsProvider();
        throw new Error(`Unsupported KMS provider type: ${providerType}`);
      }
    }
    return this.provider;
  }

  /**
   * Encrypts sensitive data using the active KMS provider.
   */
  static async encrypt(plainText: string): Promise<string> {
    return this.getProvider().encrypt(plainText);
  }

  /**
   * Decrypts sensitive cipher text using the active KMS provider.
   */
  static async decrypt(cipherText: string): Promise<string> {
    return this.getProvider().decrypt(cipherText);
  }
}
