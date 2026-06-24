// 云端同步加密模块
// 提供端到端加密功能，确保云端存储的数据只有用户本人可以解密
// 使用 AES-256-GCM 算法，提供保密性和完整性校验

import crypto from "crypto";

// 加密算法配置
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits，GCM 推荐
const SALT_LENGTH = 16;
const ITERATIONS = 100000; // PBKDF2 迭代次数
const TAG_LENGTH = 16; // GCM 认证标签长度

/**
 * 从用户密码派生加密密钥
 * 使用 PBKDF2 算法，确保相同密码生成相同密钥
 */
export function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

/**
 * 生成随机盐值
 */
export function generateSalt(): Buffer {
  return crypto.randomBytes(SALT_LENGTH);
}

/**
 * 生成随机初始化向量 (IV)
 */
export function generateIV(): Buffer {
  return crypto.randomBytes(IV_LENGTH);
}

/**
 * 加密数据
 * 返回格式：salt(16) + iv(12) + tag(16) + ciphertext
 */
export function encrypt(data: Buffer, password: string): Buffer {
  const salt = generateSalt();
  const iv = generateIV();
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  // 组合：salt + iv + tag + encrypted
  return Buffer.concat([salt, iv, tag, encrypted]);
}

/**
 * 加密字符串数据
 * 返回 base64 编码的加密结果
 */
export function encryptString(text: string, password: string): string {
  const data = Buffer.from(text, "utf8");
  const encrypted = encrypt(data, password);
  return encrypted.toString("base64");
}

/**
 * 解密数据
 * 输入格式：salt(16) + iv(12) + tag(16) + ciphertext
 */
export function decrypt(encryptedData: Buffer, password: string): Buffer {
  if (encryptedData.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
    throw new Error("加密数据格式无效：数据太短");
  }

  // 解析各部分
  const salt = encryptedData.subarray(0, SALT_LENGTH);
  const iv = encryptedData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = encryptedData.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + TAG_LENGTH
  );
  const ciphertext = encryptedData.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  // 派生密钥
  const key = deriveKey(password, salt);

  // 解密
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted;
}

/**
 * 解密 base64 编码的字符串数据
 */
export function decryptString(encryptedBase64: string, password: string): string {
  const encryptedData = Buffer.from(encryptedBase64, "base64");
  const decrypted = decrypt(encryptedData, password);
  return decrypted.toString("utf8");
}

/**
 * 生成文件内容的哈希（用于增量同步）
 * 使用 SHA-256 算法
 */
export function hashFileContent(content: Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * 验证密码是否正确（通过尝试解密测试数据）
 */
export function verifyPassword(encryptedTest: string, password: string): boolean {
  try {
    decryptString(encryptedTest, password);
    return true;
  } catch {
    return false;
  }
}

/**
 * 创建密码验证数据（用于后续验证密码是否正确）
 * 加密一个已知的测试字符串，保存起来用于验证
 */
export function createPasswordVerifier(password: string): string {
  const testData = "cloud-sync-password-verifier";
  return encryptString(testData, password);
}
