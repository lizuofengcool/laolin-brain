/**
 * config-crypto 单测
 *
 * 锁定 storageConfig.config 字段落库加密行为：
 *   - 加密结果带 "v1:" 前缀且非明文（不含原始 secretAccessKey）
 *   - 加解密往返一致
 *   - 相同输入每次产生不同密文（随机 IV）
 *   - 历史明文 JSON 行 decryptConfig 回退 JSON.parse（向后兼容）
 *   - 密文被篡改时解密抛错（GCM 认证失败）
 *   - production 未配置密钥时 encrypt/decrypt fail-closed 抛错
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { encryptConfig, decryptConfig } from "@/lib/cloud-sync/config-crypto";

const sampleConfig = {
  accountId: "acc-1",
  accessKeyId: "AKIAEXAMPLEKEY",
  secretAccessKey: "super-secret-key-do-not-leak",
  bucketName: "bucket-1",
};

describe("config-crypto（storageConfig.config 落库加密）", () => {
  beforeEach(() => {
    // 测试默认走 dev/test 回退密钥；逐用例覆盖 env 时再 stub
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("encryptConfig / decryptConfig 往返", () => {
    it("加密结果带 v1: 前缀且不含原始敏感字段", () => {
      const encrypted = encryptConfig(sampleConfig);
      expect(encrypted.startsWith("v1:")).toBe(true);
      // 明文敏感字段不得出现在密文里
      expect(encrypted).not.toContain(sampleConfig.secretAccessKey);
      expect(encrypted).not.toContain(sampleConfig.accessKeyId);
    });

    it("解密后与原对象深度相等", () => {
      const encrypted = encryptConfig(sampleConfig);
      const decrypted = decryptConfig(encrypted) as typeof sampleConfig;
      expect(decrypted).toEqual(sampleConfig);
    });

    it("相同输入每次产生不同密文（随机 IV）", () => {
      const a = encryptConfig(sampleConfig);
      const b = encryptConfig(sampleConfig);
      expect(a).not.toBe(b);
      // 但二者都能正确解密回同一对象
      expect(decryptConfig(a)).toEqual(sampleConfig);
      expect(decryptConfig(b)).toEqual(sampleConfig);
    });

    it("支持任意可 JSON 序列化对象", () => {
      const obj = { a: 1, b: "x", c: [1, 2, { d: true }], e: null };
      expect(decryptConfig(encryptConfig(obj))).toEqual(obj);
    });
  });

  describe("历史明文 JSON 向后兼容", () => {
    it("非 v1: 前缀的明文 JSON 行回退 JSON.parse", () => {
      const legacy = JSON.stringify(sampleConfig);
      expect(decryptConfig(legacy)).toEqual(sampleConfig);
    });

    it("加密写入后再次读取仍一致（迁移路径：旧明文 → 新密文）", () => {
      // 模拟存量明文行被读取
      const legacy = JSON.stringify(sampleConfig);
      const readOnce = decryptConfig(legacy);
      expect(readOnce).toEqual(sampleConfig);
      // 触发重新写入（加密）
      const reEncrypted = encryptConfig(readOnce);
      expect(reEncrypted.startsWith("v1:")).toBe(true);
      // 再次读取应走解密路径
      expect(decryptConfig(reEncrypted)).toEqual(sampleConfig);
    });
  });

  describe("完整性（GCM 认证标签）", () => {
    it("密文被篡改时解密抛错", () => {
      const encrypted = encryptConfig(sampleConfig);
      // 篡改 base64 载荷中的一个字符（跳过 "v1:" 前缀）
      const payload = encrypted.slice(3);
      const tamperedChar =
        payload.charAt(0) === "A" ? "B" : "A";
      const tampered = "v1:" + tamperedChar + payload.slice(1);
      expect(() => decryptConfig(tampered)).toThrow();
    });

    it("载荷过短时抛错", () => {
      // base64 解码后不足 iv(12)+tag(16) 长度
      expect(() => decryptConfig("v1:" + Buffer.from("short").toString("base64"))).toThrow();
    });

    it("非字符串入参抛错", () => {
      expect(() => decryptConfig(undefined as unknown as string)).toThrow();
    });
  });

  describe("生产环境 fail-closed", () => {
    it("production 未配置密钥时 encryptConfig 抛错", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("STORAGE_CONFIG_ENCRYPTION_KEY", "");
      expect(() => encryptConfig(sampleConfig)).toThrow(
        /STORAGE_CONFIG_ENCRYPTION_KEY 未配置/
      );
    });

    it("production 未配置密钥时 decryptConfig 抛错（密文路径）", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("STORAGE_CONFIG_ENCRYPTION_KEY", "");
      // 先在 dev 下生成一份密文，再切到 production 解密
      const encrypted = (() => {
        vi.unstubAllEnvs();
        const v = encryptConfig(sampleConfig);
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("STORAGE_CONFIG_ENCRYPTION_KEY", "");
        return v;
      })();
      expect(() => decryptConfig(encrypted)).toThrow(
        /STORAGE_CONFIG_ENCRYPTION_KEY 未配置/
      );
    });

    it("production 配置密钥后正常工作", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("STORAGE_CONFIG_ENCRYPTION_KEY", "prod-secret-key-32-chars-minimum-xxxxx");
      const encrypted = encryptConfig(sampleConfig);
      expect(decryptConfig(encrypted)).toEqual(sampleConfig);
    });

    it("不同密钥解密对方密文失败（GCM 认证）", () => {
      vi.stubEnv("STORAGE_CONFIG_ENCRYPTION_KEY", "key-A-32-chars-minimum-xxxxxxxxxxxxx");
      const encrypted = encryptConfig(sampleConfig);
      vi.stubEnv("STORAGE_CONFIG_ENCRYPTION_KEY", "key-B-32-chars-minimum-xxxxxxxxxxxxx");
      expect(() => decryptConfig(encrypted)).toThrow();
    });
  });
});
