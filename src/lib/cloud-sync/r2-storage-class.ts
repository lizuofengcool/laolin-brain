/**
 * Cloudflare R2 存储适配器（类版本）
 * 支持多租户，每个实例有独立的配置
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ==================== 类型定义 ====================

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
}

// ==================== R2Storage 类 ====================

export class R2Storage {
  private client: S3Client;
  private config: R2Config;

  constructor(config: R2Config) {
    this.config = config;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * 上传对象到 R2
   */
  async uploadObject(
    key: string,
    data: Buffer,
    contentType?: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      Body: data,
      ContentType: contentType,
      Metadata: metadata,
    });
    await this.client.send(command);
  }

  /**
   * 从 R2 下载对象
   */
  async downloadObject(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
    });
    const response = await this.client.send(command);

    const body = response.Body;
    if (!body) {
      throw new Error("响应体为空");
    }

    // 转换为 Buffer
    if (body instanceof ReadableStream) {
      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    }

    if (typeof (body as any).arrayBuffer === "function") {
      const arrayBuffer = await (body as any).arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    throw new Error("无法读取响应体");
  }

  /**
   * 获取对象元数据
   */
  async headObject(key: string): Promise<StorageObject | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });
      const response = await this.client.send(command);
      return {
        key,
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? new Date(),
        etag: response.ETag,
      };
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 删除对象
   */
  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
    });
    await this.client.send(command);
  }

  /**
   * 列出指定前缀下的所有对象
   */
  async listObjects(prefix?: string): Promise<StorageObject[]> {
    const objects: StorageObject[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      const response = await this.client.send(command);

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            objects.push({
              key: obj.Key,
              size: obj.Size ?? 0,
              lastModified: obj.LastModified ?? new Date(),
              etag: obj.ETag,
            });
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  /**
   * 生成预签名 URL
   */
  async generatePresignedUrl(
    key: string,
    operation: "get" | "put",
    expiresIn: number = 3600
  ): Promise<string> {
    let command;
    if (operation === "get") {
      command = new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });
    } else {
      command = new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });
    }
    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        MaxKeys: 1,
      });
      await this.client.send(command);
      return true;
    } catch (error) {
      console.error("R2 连接测试失败:", error);
      return false;
    }
  }
}
