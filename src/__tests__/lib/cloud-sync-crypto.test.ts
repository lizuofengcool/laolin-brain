/**
 * cloud-sync/crypto 单测
 *
 * 锁定云端同步端到端加密模块（AES-256-GCM + PBKDF2）的纯函数行为：
 *   - deriveKey：PBKDF2 派生密钥长度 32、同输入确定性、盐/密码变化均改变派生密钥
 *   - generateSalt / generateIV：长度固定（16/12）、随机性（两次调用不同）
 *   - encrypt：输出格式 salt(16)+iv(12)+tag(16)+ciphertext、长度 = 44+明文长度、
 *     随机盐/IV 导致同输入每次密文不同、密文不含明文片段
 *   - encryptString：base64 编码、与 decryptString 往返一致
 *   - decrypt：往返一致、错误密码 GCM 认证失败抛错、tag/密文被篡改抛错、
 *     数据过短抛 "加密数据格式无效：数据太短"、空 Buffer 往返
 *   - decryptString：往返一致、unicode 文本往返、错误密码抛错
 *   - hashFileContent：sha256 64 位 hex、确定性、不同内容不同哈希
 *   - verifyPassword：正确密码 true、错误密码 false（不抛错）
 *   - createPasswordVerifier：base64 串、经 verifyPassword 校验通过/失败
 *
 * 该模块此前仅被 cloud-sync-engine-tenant.test.ts 以 vi.mock 整体替换，
 * 无真实实现的单测覆盖；本轮补齐纯函数层覆盖。
 */
import { describe, it, expect } from "vitest";
import nodeCrypto from "crypto";
import {
  deriveKey,
  generateSalt,
  generateIV,
  encrypt,
  encryptString,
  decrypt,
  decryptString,
  hashFileContent,
  verifyPassword,
  createPasswordVerifier,
} from "@/lib/cloud-sync/crypto";

// 模块内部常量（与源码保持一致，作为长度断言的契约）
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const OVERHEAD = SALT_LENGTH + IV_LENGTH + TAG_LENGTH; // 44
const KEY_LENGTH = 32;

const PASSWORD = "correct-horse-battery-staple";
const WRONG_PASSWORD = "different-password-12345";

describe("cloud-sync/crypto（端到端加密纯函数）", () => {
  describe("deriveKey（PBKDF2 密钥派生）", () => {
    it("返回长度为 32 的 Buffer", () => {
      const salt = generateSalt();
      const key = deriveKey(PASSWORD, salt);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(KEY_LENGTH);
    });

    it("相同密码 + 相同盐 → 相同密钥（确定性）", () => {
      const salt = Buffer.from("0123456789abcdef");
      const a = deriveKey(PASSWORD, salt);
      const b = deriveKey(PASSWORD, salt);
      expect(a.equals(b)).toBe(true);
    });

    it("盐不同 → 派生密钥不同", () => {
      const saltA = Buffer.from("0123456789abcdef");
      const saltB = Buffer.from("fedcba9876543210");
      const a = deriveKey(PASSWORD, saltA);
      const b = deriveKey(PASSWORD, saltB);
      expect(a.equals(b)).toBe(false);
    });

    it("密码不同 → 派生密钥不同", () => {
      const salt = generateSalt();
      const a = deriveKey(PASSWORD, salt);
      const b = deriveKey(WRONG_PASSWORD, salt);
      expect(a.equals(b)).toBe(false);
    });
  });

  describe("generateSalt / generateIV（随机量生成）", () => {
    it("generateSalt 返回 16 字节 Buffer", () => {
      const salt = generateSalt();
      expect(Buffer.isBuffer(salt)).toBe(true);
      expect(salt.length).toBe(SALT_LENGTH);
    });

    it("generateIV 返回 12 字节 Buffer", () => {
      const iv = generateIV();
      expect(Buffer.isBuffer(iv)).toBe(true);
      expect(iv.length).toBe(IV_LENGTH);
    });

    it("generateSalt 两次调用产生不同值（随机性）", () => {
      const a = generateSalt();
      const b = generateSalt();
      expect(a.equals(b)).toBe(false);
    });

    it("generateIV 两次调用产生不同值（随机性）", () => {
      const a = generateIV();
      const b = generateIV();
      expect(a.equals(b)).toBe(false);
    });
  });

  describe("encrypt（Buffer 加密）", () => {
    it("输出为 Buffer 且长度 = salt+iv+tag+明文 = 44+明文长度", () => {
      const data = Buffer.from("hello cloud sync", "utf8");
      const encrypted = encrypt(data, PASSWORD);
      expect(Buffer.isBuffer(encrypted)).toBe(true);
      expect(encrypted.length).toBe(OVERHEAD + data.length);
    });

    it("密文不含明文字节片段（非空明文）", () => {
      const data = Buffer.from("plaintext-secret-content", "utf8");
      const encrypted = encrypt(data, PASSWORD);
      // 密文主体（跳过 salt/iv/tag 头部）不应包含明文子串
      const ciphertext = encrypted.subarray(OVERHEAD);
      expect(ciphertext.includes(data)).toBe(false);
    });

    it("同输入每次产生不同密文（随机盐 + 随机 IV）", () => {
      const data = Buffer.from("same-input", "utf8");
      const a = encrypt(data, PASSWORD);
      const b = encrypt(data, PASSWORD);
      expect(a.equals(b)).toBe(false);
      // 但二者均可被同一密码解回原明文
      expect(decrypt(a, PASSWORD).equals(data)).toBe(true);
      expect(decrypt(b, PASSWORD).equals(data)).toBe(true);
    });

    it("输出结构：前 16=salt、中 12=iv、次 16=tag、余为密文", () => {
      const data = Buffer.from("structured", "utf8");
      const encrypted = encrypt(data, PASSWORD);
      const salt = encrypted.subarray(0, SALT_LENGTH);
      const iv = encrypted.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const tag = encrypted.subarray(
        SALT_LENGTH + IV_LENGTH,
        SALT_LENGTH + IV_LENGTH + TAG_LENGTH
      );
      const ciphertext = encrypted.subarray(OVERHEAD);
      // 各段长度正确
      expect(salt.length).toBe(SALT_LENGTH);
      expect(iv.length).toBe(IV_LENGTH);
      expect(tag.length).toBe(TAG_LENGTH);
      expect(ciphertext.length).toBe(data.length);
      // salt 与 iv 均非全零（随机生成的极低概率，锁定随机性契约）
      expect(salt.equals(Buffer.alloc(SALT_LENGTH))).toBe(false);
      expect(iv.equals(Buffer.alloc(IV_LENGTH))).toBe(false);
    });

    it("空 Buffer 明文也可加密且长度恰为 44（仅头部）", () => {
      const empty = Buffer.alloc(0);
      const encrypted = encrypt(empty, PASSWORD);
      expect(encrypted.length).toBe(OVERHEAD);
      expect(decrypt(encrypted, PASSWORD).equals(empty)).toBe(true);
    });
  });

  describe("encryptString / decryptString（字符串往返）", () => {
    it("encryptString 返回 base64 字符串", () => {
      const encrypted = encryptString("text", PASSWORD);
      expect(typeof encrypted).toBe("string");
      // base64 字符集校验
      expect(/^[A-Za-z0-9+/]*={0,2}$/.test(encrypted)).toBe(true);
    });

    it("ASCII 文本往返一致", () => {
      const text = "ascii-text-12345";
      const encrypted = encryptString(text, PASSWORD);
      expect(decryptString(encrypted, PASSWORD)).toBe(text);
    });

    it("Unicode / emoji 文本往返一致", () => {
      const text = "中文-にほんご-한글-emoji-🚀🔐-éàü";
      const encrypted = encryptString(text, PASSWORD);
      expect(decryptString(encrypted, PASSWORD)).toBe(text);
    });

    it("空字符串往返一致", () => {
      const encrypted = encryptString("", PASSWORD);
      expect(decryptString(encrypted, PASSWORD)).toBe("");
    });

    it("同输入每次产生不同密文", () => {
      const a = encryptString("same", PASSWORD);
      const b = encryptString("same", PASSWORD);
      expect(a).not.toBe(b);
      expect(decryptString(a, PASSWORD)).toBe("same");
      expect(decryptString(b, PASSWORD)).toBe("same");
    });

    it("错误密码解密抛错（GCM 认证失败）", () => {
      const encrypted = encryptString("secret", PASSWORD);
      expect(() => decryptString(encrypted, WRONG_PASSWORD)).toThrow();
    });
  });

  describe("decrypt（Buffer 解密）", () => {
    it("往返一致：decrypt(encrypt(data)) deep-equals data", () => {
      const data = Buffer.from("round-trip-buffer", "utf8");
      const encrypted = encrypt(data, PASSWORD);
      const decrypted = decrypt(encrypted, PASSWORD);
      expect(decrypted.equals(data)).toBe(true);
    });

    it("错误密码抛错（GCM 认证标签不匹配）", () => {
      const data = Buffer.from("auth-tag-test", "utf8");
      const encrypted = encrypt(data, PASSWORD);
      expect(() => decrypt(encrypted, WRONG_PASSWORD)).toThrow();
    });

    it("篡改认证 tag 抛错", () => {
      const data = Buffer.from("tag-tamper", "utf8");
      const encrypted = encrypt(data, PASSWORD);
      // 翻转 tag 首字节（tag 位于 [28, 44)）
      const tampered = Buffer.from(encrypted);
      tampered[SALT_LENGTH + IV_LENGTH] ^= 0xff;
      expect(() => decrypt(tampered, PASSWORD)).toThrow();
    });

    it("篡改密文主体抛错", () => {
      const data = Buffer.from("ciphertext-tamper", "utf8");
      const encrypted = encrypt(data, PASSWORD);
      const tampered = Buffer.from(encrypted);
      // 翻转密文首字节（位于 OVERHEAD 之后）
      tampered[OVERHEAD] ^= 0xff;
      expect(() => decrypt(tampered, PASSWORD)).toThrow();
    });

    it("篡改 salt 抛错（派生密钥改变 → 认证失败）", () => {
      const data = Buffer.from("salt-tamper", "utf8");
      const encrypted = encrypt(data, PASSWORD);
      const tampered = Buffer.from(encrypted);
      tampered[0] ^= 0xff;
      expect(() => decrypt(tampered, PASSWORD)).toThrow();
    });

    it("数据过短（< 44 字节）抛 '加密数据格式无效：数据太短'", () => {
      const tooShort = Buffer.alloc(OVERHEAD - 1, 0x41);
      expect(() => decrypt(tooShort, PASSWORD)).toThrow(
        /加密数据格式无效：数据太短/
      );
    });

    it("恰好 44 字节但无密文（空明文加密产物）可正常解回空 Buffer", () => {
      const empty = Buffer.alloc(0);
      const encrypted = encrypt(empty, PASSWORD);
      expect(encrypted.length).toBe(OVERHEAD);
      const decrypted = decrypt(encrypted, PASSWORD);
      expect(decrypted.equals(empty)).toBe(true);
    });
  });

  describe("hashFileContent（SHA-256 文件哈希）", () => {
    it("返回 64 位 hex 字符串", () => {
      const hash = hashFileContent(Buffer.from("file-content"));
      expect(typeof hash).toBe("string");
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it("相同内容 → 相同哈希（确定性）", () => {
      const content = Buffer.from("deterministic-content");
      expect(hashFileContent(content)).toBe(hashFileContent(content));
    });

    it("不同内容 → 不同哈希", () => {
      const a = hashFileContent(Buffer.from("content-a"));
      const b = hashFileContent(Buffer.from("content-b"));
      expect(a).not.toBe(b);
    });

    it("与 Node crypto.createHash('sha256') 结果一致（契约锁定）", () => {
      const content = Buffer.from("contract-lock");
      const expected = nodeCrypto
        .createHash("sha256")
        .update(content)
        .digest("hex");
      expect(hashFileContent(content)).toBe(expected);
    });

    it("空 Buffer 也能哈希（非空 64 位 hex）", () => {
      const hash = hashFileContent(Buffer.alloc(0));
      expect(hash).toHaveLength(64);
      // 空内容的 sha256 已知值
      expect(hash).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      );
    });
  });

  describe("createPasswordVerifier / verifyPassword（密码校验）", () => {
    it("createPasswordVerifier 返回 base64 字符串", () => {
      const verifier = createPasswordVerifier(PASSWORD);
      expect(typeof verifier).toBe("string");
      expect(verifier.length).toBeGreaterThan(0);
      expect(/^[A-Za-z0-9+/]*={0,2}$/.test(verifier)).toBe(true);
    });

    it("正确密码 → verifyPassword 返回 true", () => {
      const verifier = createPasswordVerifier(PASSWORD);
      expect(verifyPassword(verifier, PASSWORD)).toBe(true);
    });

    it("错误密码 → verifyPassword 返回 false（不抛错）", () => {
      const verifier = createPasswordVerifier(PASSWORD);
      expect(verifyPassword(verifier, WRONG_PASSWORD)).toBe(false);
    });

    it("不同密码生成不同的 verifier", () => {
      const a = createPasswordVerifier(PASSWORD);
      const b = createPasswordVerifier(WRONG_PASSWORD);
      expect(a).not.toBe(b);
    });

    it("verifier 被篡改 → verifyPassword 返回 false", () => {
      const verifier = createPasswordVerifier(PASSWORD);
      // 翻转 base64 首字符
      const tamperedChar = verifier.charAt(0) === "A" ? "B" : "A";
      const tampered = tamperedChar + verifier.slice(1);
      expect(verifyPassword(tampered, PASSWORD)).toBe(false);
    });
  });

  describe("跨函数契约（端到端加密链路）", () => {
    it("encryptString → decryptString 与 encrypt → decrypt 走同一原语", () => {
      const text = "cross-function-contract";
      const strEncrypted = encryptString(text, PASSWORD);
      // encryptString 产物是 encrypt 产物的 base64
      const bufEncrypted = Buffer.from(strEncrypted, "base64");
      expect(decrypt(bufEncrypted, PASSWORD).toString("utf8")).toBe(text);
    });

    it("同一密码加密的多条独立密文互不影响解密", () => {
      const a = encryptString("message-a", PASSWORD);
      const b = encryptString("message-b", PASSWORD);
      expect(decryptString(a, PASSWORD)).toBe("message-a");
      expect(decryptString(b, PASSWORD)).toBe("message-b");
    });
  });
});
