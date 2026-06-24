import OSS from 'ali-oss';
import { encrypt, decrypt } from './crypto';

export interface AliyunOSSConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint?: string;
}

export class AliyunOSSStorage {
  private client: OSS;
  private config: AliyunOSSConfig;

  constructor(config: AliyunOSSConfig) {
    this.config = config;
    this.client = new OSS({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint,
      secure: true,
    });
  }

  /**
   * 上传文件到 OSS
   */
  async uploadObject(
    key: string,
    data: Buffer | string,
    options?: {
      contentType?: string;
      encryptionPassword?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<{ etag: string; size: number }> {
    let uploadData = data;

    // 如果需要加密
    if (options?.encryptionPassword) {
      const buffer = typeof data === 'string' ? Buffer.from(data) : data;
      const encrypted = await encrypt(buffer, options.encryptionPassword);
      uploadData = Buffer.from(encrypted);
    }

    const result = await this.client.put(key, uploadData, {
      headers: options?.contentType
        ? { 'Content-Type': options.contentType }
        : undefined,
      meta: options?.metadata,
    });

    return {
      etag: result.etag,
      size: result.res.size,
    };
  }

  /**
   * 从 OSS 下载文件
   */
  async downloadObject(
    key: string,
    options?: {
      encryptionPassword?: string;
    }
  ): Promise<Buffer> {
    const result = await this.client.get(key);
    let buffer = result.content as Buffer;

    // 如果需要解密
    if (options?.encryptionPassword) {
      buffer = await decrypt(buffer, options.encryptionPassword);
    }

    return buffer;
  }

  /**
   * 获取文件元信息
   */
  async headObject(key: string): Promise<{
    etag: string;
    size: number;
    lastModified: Date;
    contentType?: string;
    metadata?: Record<string, string>;
  } | null> {
    try {
      const result = await this.client.head(key);
      return {
        etag: result.etag,
        size: result.size,
        lastModified: result.lastModified,
        contentType: result.type,
        metadata: result.meta,
      };
    } catch (error: any) {
      if (error.code === 'NoSuchKey' || error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 删除文件
   */
  async deleteObject(key: string): Promise<void> {
    await this.client.delete(key);
  }

  /**
   * 批量删除文件
   */
  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.deleteMulti(keys);
  }

  /**
   * 列出文件
   */
  async listObjects(
    prefix?: string,
    options?: {
      maxKeys?: number;
      marker?: string;
    }
  ): Promise<{
    objects: Array<{
      key: string;
      size: number;
      lastModified: Date;
      etag: string;
    }>;
    isTruncated: boolean;
    nextMarker?: string;
  }> {
    const result = await this.client.list({
      prefix,
      'max-keys': options?.maxKeys,
      marker: options?.marker,
    });

    return {
      objects: (result.objects || []).map((obj: any) => ({
        key: obj.name,
        size: obj.size,
        lastModified: obj.lastModified,
        etag: obj.etag,
      })),
      isTruncated: result.isTruncated,
      nextMarker: result.nextMarker,
    };
  }

  /**
   * 生成预签名 URL
   */
  async generatePresignedUrl(
    key: string,
    options?: {
      expires?: number; // 秒
      method?: string;
    }
  ): Promise<string> {
    const expires = options?.expires || 3600;
    const method = options?.method || 'GET';

    const url = this.client.signatureUrl(key, {
      expires,
      method,
    });

    return url;
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      // 尝试列出少量文件来测试连接
      await this.client.list({ 'max-keys': 1 });
      return true;
    } catch (error) {
      console.error('Aliyun OSS connection test failed:', error);
      return false;
    }
  }
}

/**
 * 创建阿里云 OSS 存储实例
 */
export function createAliyunOSSStorage(config: AliyunOSSConfig): AliyunOSSStorage {
  return new AliyunOSSStorage(config);
}
