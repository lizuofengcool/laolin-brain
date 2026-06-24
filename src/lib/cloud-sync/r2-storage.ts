// Cloudflare R2 存储适配器
// 实现云存储接口，用于云端备份和同步
// R2 是 S3 兼容的对象存储，使用 AWS SDK 进行操作

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// R2 配置
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

// 存储对象信息
export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
}

let s3Client: S3Client | null = null;
let currentConfig: R2Config | null = null;

/**
 * 初始化 R2 客户端
 */
export function initR2Client(config: R2Config): void {
  currentConfig = config;
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/**
 * 获取 R2 客户端（如果已初始化）
 */
function getClient(): S3Client {
  if (!s3Client) {
    throw new Error("R2 客户端未初始化，请先配置云端同步");
  }
  return s3Client;
}

/**
 * 检查 R2 是否已配置
 */
export function isR2Configured(): boolean {
  return s3Client !== null;
}

/**
 * 上传对象到 R2
 */
export async function uploadObject(
  key: string,
  data: Buffer,
  contentType?: string,
  metadata?: Record<string, string>
): Promise<void> {
  const client = getClient();

  const command = new PutObjectCommand({
    Bucket: currentConfig!.bucketName,
    Key: key,
    Body: data,
    ContentType: contentType,
    Metadata: metadata,
  });

  await client.send(command);
}

/**
 * 从 R2 下载对象
 */
export async function downloadObject(key: string): Promise<Buffer> {
  const client = getClient();

  const command = new GetObjectCommand({
    Bucket: currentConfig!.bucketName,
    Key: key,
  });

  const response = await client.send(command);

  // 将 Body 转换为 Buffer
  // AWS SDK v3 的 Body 可能是 ReadableStream 或 Blob
  const body = response.Body;
  if (!body) {
    throw new Error("响应体为空");
  }

  // 使用 transformToString 或转换为 Uint8Array
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

  // 对于其他类型（如 Blob），尝试转换
  if (typeof (body as any).arrayBuffer === "function") {
    const arrayBuffer = await (body as any).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error("无法读取响应体");
}

/**
 * 获取对象元数据
 */
export async function headObject(key: string): Promise<StorageObject | null> {
  const client = getClient();

  try {
    const command = new HeadObjectCommand({
      Bucket: currentConfig!.bucketName,
      Key: key,
    });

    const response = await client.send(command);

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
export async function deleteObject(key: string): Promise<void> {
  const client = getClient();

  const command = new DeleteObjectCommand({
    Bucket: currentConfig!.bucketName,
    Key: key,
  });

  await client.send(command);
}

/**
 * 列出指定前缀下的所有对象
 */
export async function listObjects(prefix?: string): Promise<StorageObject[]> {
  const client = getClient();
  const objects: StorageObject[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: currentConfig!.bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const response = await client.send(command);

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
 * 生成预签名 URL（用于客户端直接上传/下载）
 */
export async function generatePresignedUrl(
  key: string,
  operation: "get" | "put",
  expiresIn: number = 3600
): Promise<string> {
  const client = getClient();

  let command;
  if (operation === "get") {
    command = new GetObjectCommand({
      Bucket: currentConfig!.bucketName,
      Key: key,
    });
  } else {
    command = new PutObjectCommand({
      Bucket: currentConfig!.bucketName,
      Key: key,
    });
  }

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * 测试 R2 连接是否正常
 */
export async function testR2Connection(): Promise<boolean> {
  try {
    // 尝试列出 bucket 中的对象（最多 1 个）
    const client = getClient();
    const command = new ListObjectsV2Command({
      Bucket: currentConfig!.bucketName,
      MaxKeys: 1,
    });
    await client.send(command);
    return true;
  } catch (error) {
    console.error("R2 连接测试失败:", error);
    return false;
  }
}
