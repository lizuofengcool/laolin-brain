/**
 * R2Storage 存储适配器直接单测
 *
 * 覆盖目标：src/lib/cloud-sync/r2-storage-class.ts 的 R2Storage 类。该类是
 * Cloudflare R2 适配器，封装 @aws-sdk/client-s3 的 S3Client，含 404→null 归一、
 * downloadObject 的 ReadableStream/arrayBuffer/空体/未知体四分支、listObjects
 * 分页循环（NextContinuationToken）、预签名 URL get/put 分支、连接测试吞错等
 * 关键控制流。此前零直接覆盖——r2-storage.test.ts 仅覆盖 R2 配置态
 * （isR2Configured/testR2Connection）且把 R2Storage 类整体桩化，未触达类方法。
 *
 * Mock 策略：
 * - `@aws-sdk/client-s3`：S3Client 桩为构造器函数返回 { send }；各 Command 类
 *   桩为构造器函数捕获 input 并返回 { input }（断言构造参数契约 + send 调用）
 * - `@aws-sdk/s3-request-presigner`：getSignedUrl 桩化，验证 get/put 分支与
 *   expiresIn 默认值（3600）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted 确保 mock 在 vi.mock 工厂执行时已初始化（避免 TDZ / 提升顺序问题）
const {
  mockS3Constructor,
  mockSend,
  mockPutCommand,
  mockGetCommand,
  mockHeadCommand,
  mockDeleteCommand,
  mockListCommand,
  mockGetSignedUrl,
} = vi.hoisted(() => ({
  mockS3Constructor: vi.fn(),
  mockSend: vi.fn(),
  mockPutCommand: vi.fn(),
  mockGetCommand: vi.fn(),
  mockHeadCommand: vi.fn(),
  mockDeleteCommand: vi.fn(),
  mockListCommand: vi.fn(),
  mockGetSignedUrl: vi.fn(),
}));

// Mock @aws-sdk/client-s3：S3Client 与各 Command 均为普通 function 以支持 `new` 调用
// （vi.fn 在 vitest 4 下不可作构造器 new 调用，与 aliyun-oss/saas-tenant 同范式）
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: function S3Client(this: unknown, config: unknown) {
    mockS3Constructor(config);
    return { send: (...args: unknown[]) => mockSend(...args) };
  },
  PutObjectCommand: function PutObjectCommand(this: unknown, input: unknown) {
    mockPutCommand(input);
    return { input };
  },
  GetObjectCommand: function GetObjectCommand(this: unknown, input: unknown) {
    mockGetCommand(input);
    return { input };
  },
  HeadObjectCommand: function HeadObjectCommand(this: unknown, input: unknown) {
    mockHeadCommand(input);
    return { input };
  },
  DeleteObjectCommand: function DeleteObjectCommand(this: unknown, input: unknown) {
    mockDeleteCommand(input);
    return { input };
  },
  ListObjectsV2Command: function ListObjectsV2Command(this: unknown, input: unknown) {
    mockListCommand(input);
    return { input };
  },
}));

// Mock @aws-sdk/s3-request-presigner：切断真实签名计算
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

import { R2Storage } from '@/lib/cloud-sync/r2-storage-class';

const baseConfig = {
  accountId: 'acc-1',
  accessKeyId: 'ak-id',
  secretAccessKey: 'sk-secret',
  bucketName: 'my-bucket',
};

describe('R2Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('以 region:auto + R2 endpoint + credentials 构造 S3Client', () => {
      new R2Storage(baseConfig);

      expect(mockS3Constructor).toHaveBeenCalledTimes(1);
      expect(mockS3Constructor).toHaveBeenCalledWith({
        region: 'auto',
        endpoint: 'https://acc-1.r2.cloudflarestorage.com',
        credentials: {
          accessKeyId: 'ak-id',
          secretAccessKey: 'sk-secret',
        },
      });
    });

    it('endpoint URL 随 accountId 变化', () => {
      new R2Storage({ ...baseConfig, accountId: 'acc-2' });

      expect(mockS3Constructor).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://acc-2.r2.cloudflarestorage.com',
        })
      );
    });
  });

  describe('uploadObject', () => {
    it('基础上传：PutObjectCommand 透传 Bucket/Key/Body', async () => {
      const data = Buffer.from('hello');
      mockSend.mockResolvedValue({});

      await new R2Storage(baseConfig).uploadObject('a/b.txt', data);

      expect(mockPutCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'a/b.txt',
        Body: data,
        ContentType: undefined,
        Metadata: undefined,
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('contentType 与 metadata 透传', async () => {
      const data = Buffer.from('x');
      mockSend.mockResolvedValue({});

      await new R2Storage(baseConfig).uploadObject('k', data, 'image/png', {
        foo: 'bar',
      });

      expect(mockPutCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'k',
        Body: data,
        ContentType: 'image/png',
        Metadata: { foo: 'bar' },
      });
    });

    it('返回 void（不返回 send 结果）', async () => {
      mockSend.mockResolvedValue({ ETag: 'e-1' });

      const result = await new R2Storage(baseConfig).uploadObject(
        'k',
        Buffer.from('x')
      );

      expect(result).toBeUndefined();
    });
  });

  describe('downloadObject', () => {
    it('空响应体抛出 "响应体为空"', async () => {
      mockSend.mockResolvedValue({ Body: null });

      await expect(
        new R2Storage(baseConfig).downloadObject('k')
      ).rejects.toThrow('响应体为空');
    });

    it('ReadableStream body：按 chunk 拼接为 Buffer', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5]));
          controller.close();
        },
      });
      mockSend.mockResolvedValue({ Body: stream });

      const result = await new R2Storage(baseConfig).downloadObject('k');

      expect(result).toEqual(Buffer.from([1, 2, 3, 4, 5]));
    });

    it('arrayBuffer 方法体：转换为 Buffer', async () => {
      const body = {
        arrayBuffer: async () => new Uint8Array([7, 8, 9]).buffer,
      };
      mockSend.mockResolvedValue({ Body: body });

      const result = await new R2Storage(baseConfig).downloadObject('k');

      expect(result).toEqual(Buffer.from([7, 8, 9]));
    });

    it('未知响应体类型抛出 "无法读取响应体"', async () => {
      mockSend.mockResolvedValue({ Body: 'a-string-is-not-supported' });

      await expect(
        new R2Storage(baseConfig).downloadObject('k')
      ).rejects.toThrow('无法读取响应体');
    });
  });

  describe('headObject', () => {
    it('成功：映射 ContentLength→size / LastModified / ETag / key', async () => {
      const lastMod = new Date('2026-01-02T03:04:05Z');
      mockSend.mockResolvedValue({
        ContentLength: 42,
        LastModified: lastMod,
        ETag: '"etag-1"',
      });

      const result = await new R2Storage(baseConfig).headObject('k');

      expect(result).toEqual({
        key: 'k',
        size: 42,
        lastModified: lastMod,
        etag: '"etag-1"',
      });
      expect(mockHeadCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'k',
      });
    });

    it('ContentLength/LastModified 缺失：回退 0 / new Date()', async () => {
      mockSend.mockResolvedValue({});

      const result = await new R2Storage(baseConfig).headObject('k');

      expect(result?.size).toBe(0);
      expect(result?.lastModified).toBeInstanceOf(Date);
      expect(result?.etag).toBeUndefined();
    });

    it('error.name === "NotFound" → 返回 null', async () => {
      const err = Object.assign(new Error('not found'), { name: 'NotFound' });
      mockSend.mockRejectedValue(err);

      const result = await new R2Storage(baseConfig).headObject('missing');

      expect(result).toBeNull();
    });

    it('error.$metadata.httpStatusCode === 404 → 返回 null', async () => {
      const err = Object.assign(new Error('gone'), {
        $metadata: { httpStatusCode: 404 },
      });
      mockSend.mockRejectedValue(err);

      const result = await new R2Storage(baseConfig).headObject('missing');

      expect(result).toBeNull();
    });

    it('其他错误 → rethrow', async () => {
      mockSend.mockRejectedValue(new Error('boom'));

      await expect(
        new R2Storage(baseConfig).headObject('k')
      ).rejects.toThrow('boom');
    });
  });

  describe('deleteObject', () => {
    it('DeleteObjectCommand 透传 Bucket/Key', async () => {
      mockSend.mockResolvedValue({});

      await new R2Storage(baseConfig).deleteObject('k');

      expect(mockDeleteCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'k',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('listObjects', () => {
    it('单页：Contents 映射为 StorageObject[]（Key/Size/LastModified/ETag 透传）', async () => {
      const date1 = new Date('2026-01-01T00:00:00Z');
      const date2 = new Date('2026-02-02T00:00:00Z');
      mockSend.mockResolvedValue({
        Contents: [
          { Key: 'a', Size: 10, LastModified: date1, ETag: '"e-a"' },
          { Key: 'b', Size: 20, LastModified: date2, ETag: '"e-b"' },
        ],
        // 无 NextContinuationToken → 循环终止
      });

      const result = await new R2Storage(baseConfig).listObjects('prefix');

      expect(result).toEqual([
        { key: 'a', size: 10, lastModified: date1, etag: '"e-a"' },
        { key: 'b', size: 20, lastModified: date2, etag: '"e-b"' },
      ]);
      expect(mockListCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Prefix: 'prefix',
        ContinuationToken: undefined,
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('Contents 缺失 → 返回空数组', async () => {
      mockSend.mockResolvedValue({});

      const result = await new R2Storage(baseConfig).listObjects();

      expect(result).toEqual([]);
      // prefix 未传 → undefined
      expect(mockListCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Prefix: undefined })
      );
    });

    it('Contents 中 Key 缺失的对象被跳过', async () => {
      mockSend.mockResolvedValue({
        Contents: [
          { Key: 'keep', Size: 1, LastModified: new Date() },
          { Size: 2, LastModified: new Date() }, // 无 Key
          { Key: undefined, Size: 3, LastModified: new Date() },
        ],
      });

      const result = await new R2Storage(baseConfig).listObjects();

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('keep');
    });

    it('Size/LastModified 缺失：回退 0 / new Date()', async () => {
      mockSend.mockResolvedValue({
        Contents: [{ Key: 'a' }],
      });

      const result = await new R2Storage(baseConfig).listObjects();

      expect(result[0].size).toBe(0);
      expect(result[0].lastModified).toBeInstanceOf(Date);
      expect(result[0].etag).toBeUndefined();
    });

    it('多页：按 NextContinuationToken 循环直到无 token', async () => {
      const date1 = new Date('2026-01-01T00:00:00Z');
      const date2 = new Date('2026-02-02T00:00:00Z');
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'a', Size: 1, LastModified: date1 }],
          NextContinuationToken: 'tok-1',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'b', Size: 2, LastModified: date2 }],
          // 无 NextContinuationToken → 循环终止
        });

      const result = await new R2Storage(baseConfig).listObjects('p');

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('a');
      expect(result[1].key).toBe('b');
      expect(mockSend).toHaveBeenCalledTimes(2);
      // 第二次请求携带 ContinuationToken
      expect(mockListCommand).toHaveBeenNthCalledWith(2, {
        Bucket: 'my-bucket',
        Prefix: 'p',
        ContinuationToken: 'tok-1',
      });
    });
  });

  describe('generatePresignedUrl', () => {
    it('operation=get：构造 GetObjectCommand 并以默认 expiresIn=3600 签名', async () => {
      mockGetSignedUrl.mockResolvedValue('https://signed-get');

      const result = await new R2Storage(baseConfig).generatePresignedUrl(
        'k',
        'get'
      );

      expect(result).toBe('https://signed-get');
      expect(mockGetCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'k',
      });
      expect(mockPutCommand).not.toHaveBeenCalled();
      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
      // 第二参数为 client 实例，第三参数为 { expiresIn }
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 }
      );
    });

    it('operation=put：构造 PutObjectCommand', async () => {
      mockGetSignedUrl.mockResolvedValue('https://signed-put');

      await new R2Storage(baseConfig).generatePresignedUrl('k', 'put');

      expect(mockPutCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'k',
      });
      expect(mockGetCommand).not.toHaveBeenCalled();
    });

    it('自定义 expiresIn 透传', async () => {
      mockGetSignedUrl.mockResolvedValue('https://signed');

      await new R2Storage(baseConfig).generatePresignedUrl('k', 'get', 7200);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 7200 }
      );
    });
  });

  describe('testConnection', () => {
    it('list 成功 → 返回 true（MaxKeys:1）', async () => {
      mockSend.mockResolvedValue({ Contents: [] });

      const result = await new R2Storage(baseConfig).testConnection();

      expect(result).toBe(true);
      expect(mockListCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        MaxKeys: 1,
      });
    });

    it('抛错 → 捕获并返回 false（不向上抛）', async () => {
      const err = new Error('network down');
      mockSend.mockRejectedValue(err);
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await new R2Storage(baseConfig).testConnection();

      expect(result).toBe(false);
      expect(spy).toHaveBeenCalledWith('R2 连接测试失败:', err);
      spy.mockRestore();
    });
  });
});
