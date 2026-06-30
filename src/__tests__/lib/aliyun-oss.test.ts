/**
 * AliyunOSSStorage 存储适配器直接单测
 *
 * 覆盖目标：src/lib/cloud-sync/aliyun-oss.ts 的 AliyunOSSStorage 类与
 * createAliyunOSSStorage 工厂。该类是阿里云 OSS 适配器，封装 ali-oss 客户端，
 * 含端到端加解密集成、404→null 归一、空 keys 短路、list 结果映射、预签名 URL
 * 默认值、连接测试吞错等关键控制流。此前零直接覆盖（r2-storage.test.ts 仅覆盖
 * R2 配置态，未触达 OSS 类）。
 *
 * Mock 策略：
 * - `ali-oss` 默认导出桩化为构造器函数，返回 mock 客户端（put/get/head/delete/
 *   deleteMulti/list/signatureUrl），断言构造参数与各方法调用契约
 * - `./crypto` 的 encrypt/decrypt 桩化，验证加解密分支被正确串联（不依赖真实
 *   PBKDF2/AES-256-GCM 计算，交由 cloud-sync-crypto.test.ts 专测）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted 确保 mock 在 vi.mock 工厂执行时已初始化（避免 TDZ / 提升顺序问题）
const {
  mockPut,
  mockGet,
  mockHead,
  mockDelete,
  mockDeleteMulti,
  mockList,
  mockSignatureUrl,
  mockEncrypt,
  mockDecrypt,
  mockOSSConstructor,
} = vi.hoisted(() => ({
  mockPut: vi.fn(),
  mockGet: vi.fn(),
  mockHead: vi.fn(),
  mockDelete: vi.fn(),
  mockDeleteMulti: vi.fn(),
  mockList: vi.fn(),
  mockSignatureUrl: vi.fn(),
  mockEncrypt: vi.fn(),
  mockDecrypt: vi.fn(),
  mockOSSConstructor: vi.fn(),
}));

// Mock ali-oss 默认导出：普通 function 以支持 `new OSS(...)` 构造调用
// （vi.fn 在 vitest 4 下不可作构造器 new 调用）
vi.mock('ali-oss', () => ({
  default: function OSS(this: any, config: unknown) {
    mockOSSConstructor(config);
    return {
      put: (...args: unknown[]) => mockPut(...args),
      get: (...args: unknown[]) => mockGet(...args),
      head: (...args: unknown[]) => mockHead(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      deleteMulti: (...args: unknown[]) => mockDeleteMulti(...args),
      list: (...args: unknown[]) => mockList(...args),
      signatureUrl: (...args: unknown[]) => mockSignatureUrl(...args),
    };
  },
}));

// Mock ./crypto：仅桩化 encrypt/decrypt，切断真实 PBKDF2/AES 计算链
vi.mock('@/lib/cloud-sync/crypto', () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args),
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

import {
  AliyunOSSStorage,
  createAliyunOSSStorage,
} from '@/lib/cloud-sync/aliyun-oss';

const baseConfig = {
  accessKeyId: 'ak-id',
  accessKeySecret: 'ak-secret',
  bucket: 'my-bucket',
  region: 'oss-cn-hangzhou',
};

describe('AliyunOSSStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('以 secure:true 透传配置构造 ali-oss 客户端', () => {
      new AliyunOSSStorage(baseConfig);

      expect(mockOSSConstructor).toHaveBeenCalledTimes(1);
      expect(mockOSSConstructor).toHaveBeenCalledWith({
        accessKeyId: 'ak-id',
        accessKeySecret: 'ak-secret',
        bucket: 'my-bucket',
        region: 'oss-cn-hangzhou',
        endpoint: undefined,
        secure: true,
      });
    });

    it('endpoint 可选字段透传', () => {
      new AliyunOSSStorage({ ...baseConfig, endpoint: 'https://oss.example.com' });

      expect(mockOSSConstructor).toHaveBeenLastCalledWith(
        expect.objectContaining({
          endpoint: 'https://oss.example.com',
          secure: true,
        })
      );
    });
  });

  describe('uploadObject', () => {
    it('基础上传：透传 Buffer 与返回 {etag, size}', async () => {
      const data = Buffer.from('hello');
      mockPut.mockResolvedValue({ etag: 'etag-1', res: { size: 5 } });

      const result = await new AliyunOSSStorage(baseConfig).uploadObject(
        'a/b.txt',
        data
      );

      expect(result).toEqual({ etag: 'etag-1', size: 5 });
      expect(mockPut).toHaveBeenCalledWith('a/b.txt', data, {
        headers: undefined,
        meta: undefined,
      });
    });

    it('contentType → headers.Content-Type', async () => {
      mockPut.mockResolvedValue({ etag: 'e', res: { size: 1 } });

      await new AliyunOSSStorage(baseConfig).uploadObject('k', Buffer.from('x'), {
        contentType: 'image/png',
      });

      expect(mockPut).toHaveBeenCalledWith(
        'k',
        Buffer.from('x'),
        expect.objectContaining({ headers: { 'Content-Type': 'image/png' } })
      );
    });

    it('metadata → meta 字段透传', async () => {
      mockPut.mockResolvedValue({ etag: 'e', res: { size: 1 } });

      await new AliyunOSSStorage(baseConfig).uploadObject('k', Buffer.from('x'), {
        metadata: { foo: 'bar' },
      });

      expect(mockPut).toHaveBeenCalledWith(
        'k',
        Buffer.from('x'),
        expect.objectContaining({ meta: { foo: 'bar' } })
      );
    });

    it('encryptionPassword + Buffer data：先 encrypt 再上传密文', async () => {
      const data = Buffer.from('plain');
      const encrypted = Buffer.from('cipher-bytes');
      mockEncrypt.mockReturnValue(encrypted);
      mockPut.mockResolvedValue({ etag: 'e-enc', res: { size: 11 } });

      const result = await new AliyunOSSStorage(baseConfig).uploadObject(
        'k',
        data,
        { encryptionPassword: 'pw' }
      );

      expect(mockEncrypt).toHaveBeenCalledWith(data, 'pw');
      // uploadData = Buffer.from(encrypted)
      expect(mockPut).toHaveBeenCalledWith(
        'k',
        encrypted,
        expect.objectContaining({ headers: undefined, meta: undefined })
      );
      expect(result).toEqual({ etag: 'e-enc', size: 11 });
    });

    it('encryptionPassword + string data：先 Buffer.from 再 encrypt', async () => {
      const encrypted = Buffer.from('cipher');
      mockEncrypt.mockReturnValue(encrypted);
      mockPut.mockResolvedValue({ etag: 'e', res: { size: 6 } });

      await new AliyunOSSStorage(baseConfig).uploadObject('k', 'plaintext', {
        encryptionPassword: 'pw',
      });

      // string → Buffer.from('plaintext') → encrypt
      expect(mockEncrypt).toHaveBeenCalledWith(Buffer.from('plaintext'), 'pw');
      expect(mockPut).toHaveBeenCalledWith('k', encrypted, expect.anything());
    });
  });

  describe('downloadObject', () => {
    it('基础下载：返回 result.content', async () => {
      const content = Buffer.from('file-bytes');
      mockGet.mockResolvedValue({ content });

      const result = await new AliyunOSSStorage(baseConfig).downloadObject('k');

      expect(mockGet).toHaveBeenCalledWith('k');
      expect(result).toBe(content);
    });

    it('encryptionPassword：对 content 解密后返回', async () => {
      const cipher = Buffer.from('cipher');
      const plain = Buffer.from('plain');
      mockGet.mockResolvedValue({ content: cipher });
      mockDecrypt.mockReturnValue(plain);

      const result = await new AliyunOSSStorage(baseConfig).downloadObject('k', {
        encryptionPassword: 'pw',
      });

      expect(mockDecrypt).toHaveBeenCalledWith(cipher, 'pw');
      expect(result).toBe(plain);
    });
  });

  describe('headObject', () => {
    it('成功：映射 etag/size/lastModified/contentType(=type)/metadata(=meta)', async () => {
      const lastModified = new Date('2026-06-30T00:00:00Z');
      mockHead.mockResolvedValue({
        etag: 'etag-h',
        size: 42,
        lastModified,
        type: 'application/pdf',
        meta: { owner: 'u1' },
      });

      const result = await new AliyunOSSStorage(baseConfig).headObject('k');

      expect(mockHead).toHaveBeenCalledWith('k');
      expect(result).toEqual({
        etag: 'etag-h',
        size: 42,
        lastModified,
        contentType: 'application/pdf',
        metadata: { owner: 'u1' },
      });
    });

    it('error.code === NoSuchKey → null（不抛）', async () => {
      mockHead.mockRejectedValue(Object.assign(new Error('not found'), { code: 'NoSuchKey' }));

      const result = await new AliyunOSSStorage(baseConfig).headObject('k');

      expect(result).toBeNull();
    });

    it('error.status === 404 → null（不抛）', async () => {
      mockHead.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));

      const result = await new AliyunOSSStorage(baseConfig).headObject('k');

      expect(result).toBeNull();
    });

    it('其他错误向上抛出', async () => {
      mockHead.mockRejectedValue(new Error('boom'));

      await expect(
        new AliyunOSSStorage(baseConfig).headObject('k')
      ).rejects.toThrow('boom');
    });
  });

  describe('deleteObject', () => {
    it('调用 client.delete(key)', async () => {
      mockDelete.mockResolvedValue(undefined);

      await new AliyunOSSStorage(baseConfig).deleteObject('k');

      expect(mockDelete).toHaveBeenCalledWith('k');
    });
  });

  describe('deleteObjects', () => {
    it('空 keys 短路：不调用 deleteMulti', async () => {
      await new AliyunOSSStorage(baseConfig).deleteObjects([]);

      expect(mockDeleteMulti).not.toHaveBeenCalled();
    });

    it('非空 keys：调用 deleteMulti(keys)', async () => {
      mockDeleteMulti.mockResolvedValue(undefined);

      await new AliyunOSSStorage(baseConfig).deleteObjects(['a', 'b', 'c']);

      expect(mockDeleteMulti).toHaveBeenCalledWith(['a', 'b', 'c']);
    });
  });

  describe('listObjects', () => {
    it('映射 objects（name→key）并透传 isTruncated/nextMarker', async () => {
      const d1 = new Date('2026-06-28T00:00:00Z');
      const d2 = new Date('2026-06-29T00:00:00Z');
      mockList.mockResolvedValue({
        objects: [
          { name: 'a.txt', size: 10, lastModified: d1, etag: 'e1' },
          { name: 'b.txt', size: 20, lastModified: d2, etag: 'e2' },
        ],
        isTruncated: true,
        nextMarker: 'marker-1',
      });

      const result = await new AliyunOSSStorage(baseConfig).listObjects('pre/');

      expect(mockList).toHaveBeenCalledWith({ prefix: 'pre/', 'max-keys': undefined, marker: undefined });
      expect(result).toEqual({
        objects: [
          { key: 'a.txt', size: 10, lastModified: d1, etag: 'e1' },
          { key: 'b.txt', size: 20, lastModified: d2, etag: 'e2' },
        ],
        isTruncated: true,
        nextMarker: 'marker-1',
      });
    });

    it('result.objects 为 undefined → 空数组', async () => {
      mockList.mockResolvedValue({ isTruncated: false });

      const result = await new AliyunOSSStorage(baseConfig).listObjects();

      expect(result).toEqual({ objects: [], isTruncated: false, nextMarker: undefined });
    });

    it('maxKeys/marker 选项透传', async () => {
      mockList.mockResolvedValue({ objects: [], isTruncated: false });

      await new AliyunOSSStorage(baseConfig).listObjects('pre/', {
        maxKeys: 50,
        marker: 'm0',
      });

      expect(mockList).toHaveBeenCalledWith({ prefix: 'pre/', 'max-keys': 50, marker: 'm0' });
    });
  });

  describe('generatePresignedUrl', () => {
    it('默认 expires=3600 / method=GET', async () => {
      mockSignatureUrl.mockReturnValue('https://signed-default');

      const url = await new AliyunOSSStorage(baseConfig).generatePresignedUrl('k');

      expect(mockSignatureUrl).toHaveBeenCalledWith('k', { expires: 3600, method: 'GET' });
      expect(url).toBe('https://signed-default');
    });

    it('自定义 expires/method 透传', async () => {
      mockSignatureUrl.mockReturnValue('https://signed-put');

      await new AliyunOSSStorage(baseConfig).generatePresignedUrl('k', {
        expires: 7200,
        method: 'PUT',
      });

      expect(mockSignatureUrl).toHaveBeenCalledWith('k', { expires: 7200, method: 'PUT' });
    });

    it('expires=0 时回退默认值（|| 在 falsy 时回退，0 为 falsy → 3600）', async () => {
      // 锁定当前实现：`options?.expires || 3600`，0 会触发回退。文档化该 falsy 行为。
      mockSignatureUrl.mockReturnValue('u');

      await new AliyunOSSStorage(baseConfig).generatePresignedUrl('k', { expires: 0 });

      expect(mockSignatureUrl).toHaveBeenCalledWith('k', { expires: 3600, method: 'GET' });
    });
  });

  describe('testConnection', () => {
    it('list 成功 → true', async () => {
      mockList.mockResolvedValue({ objects: [] });

      const ok = await new AliyunOSSStorage(baseConfig).testConnection();

      expect(mockList).toHaveBeenCalledWith({ 'max-keys': 1 });
      expect(ok).toBe(true);
    });

    it('list 抛错 → 捕获返回 false（不向上抛）', async () => {
      mockList.mockRejectedValue(new Error('network down'));

      const ok = await new AliyunOSSStorage(baseConfig).testConnection();

      expect(ok).toBe(false);
    });
  });

  describe('createAliyunOSSStorage', () => {
    it('工厂返回 AliyunOSSStorage 实例并触发构造', () => {
      mockPut.mockResolvedValue({ etag: 'e', res: { size: 1 } });

      const instance = createAliyunOSSStorage(baseConfig);

      expect(instance).toBeInstanceOf(AliyunOSSStorage);
      expect(mockOSSConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'my-bucket', secure: true })
      );
    });
  });
});

