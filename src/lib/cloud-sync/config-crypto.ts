/**
 * 租户存储配置（storageConfig.config）落库加密
 *
 * 背景：storageConfig.config 在 schema 中标注"加密存储"，但历史实现以
 * JSON.stringify 明文落库，secretAccessKey / accessKeyId 在数据库文件中裸露。
 * 本模块对该字段做 AES-256-GCM 加密/解密，密钥取自
 * STORAGE_CONFIG_ENCRYPTION_KEY 环境变量（PBKDF2 派生 256 位密钥）。
 *
 * 旧数据兼容：解密时若遇到非 "v1:" 前缀的明文 JSON，回退 JSON.parse，
 * 存量行无需迁移即可继续读取；下次 POST /api/cloud-sync/config 写入时即自动加密。
 *
 * 安全默认（与 requirePlatformAdmin 的 ADMIN_EMAILS 失败关闭约定一致）：
 *   - production 环境未配置密钥 → 抛错（fail-closed），拒绝明文加解密；
 *   - development/test 未配置密钥 → 使用内置开发密钥并打印一次警告，便于本地与单测。
 *
 * 完整性：GCM 认证标签保证密文篡改即解密失败，避免坏数据静默通过。
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM 推荐 96 位
const TAG_LENGTH = 16; // GCM 认证标签
const KEY_LENGTH = 32; // 256 位
const PBKDF2_ITERATIONS = 100000;
const DIGEST = "sha256";

// 应用级固定盐（不参与保密，仅限定密钥用途、防止跨用途碰撞）。与随机盐的密码派生不同：
// 此处密钥本身已是保密的服务器密钥，固定盐仅用于将 env 密钥稳定映射为派生密钥。
const APP_SALT = "laolin-brain:storage-config:v1";

const VERSION_PREFIX = "v1:";

let devKeyWarned = false;

/**
 * 解析加解密密钥。production 未配置则 fail-closed；dev/test 回退内置开发密钥。
 */
function resolveKey(): Buffer {
  const envKey = process.env.STORAGE_CONFIG_ENCRYPTION_KEY;
  if (envKey && envKey.trim().length > 0) {
    return crypto.pbkdf2Sync(envKey, APP_SALT, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "STORAGE_CONFIG_ENCRYPTION_KEY 未配置：生产环境拒绝以明文加解密租户存储配置（fail-closed）。请在 .env 设置 32+ 字符随机字符串。"
    );
  }

  if (!devKeyWarned) {
    devKeyWarned = true;
    console.warn(
      "[config-crypto] STORAGE_CONFIG_ENCRYPTION_KEY 未配置，使用内置开发密钥（仅适用于 development/test，生产环境必须配置）。"
    );
  }
  return crypto.pbkdf2Sync(
    "dev-only-insecure-key-do-not-use-in-prod",
    APP_SALT,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    DIGEST
  );
}

/**
 * 加密存储配置对象。
 * 返回 "v1:" + base64(iv(12) + tag(16) + ciphertext)。
 * 每次调用使用随机 IV，故相同输入产生不同密文。
 */
export function encryptConfig(config: unknown): string {
  const key = resolveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(config), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * 解密存储配置字符串。
 * - "v1:" 前缀：AES-256-GCM 解密；密文被篡改时抛错（GCM 认证失败）。
 * - 非 "v1:" 前缀：视为历史明文 JSON，回退 JSON.parse（向后兼容存量行）。
 */
export function decryptConfig(stored: string): unknown {
  if (typeof stored !== "string") {
    throw new Error("storageConfig.config 非字符串，无法解密");
  }

  // 兼容历史明文 JSON 行
  if (!stored.startsWith(VERSION_PREFIX)) {
    return JSON.parse(stored);
  }

  const key = resolveKey();
  const payload = Buffer.from(stored.slice(VERSION_PREFIX.length), "base64");
  if (payload.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("storageConfig.config 加密载荷格式无效：数据过短");
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

/**
 * 加密单个敏感字符串（如 AI Provider API Key）。
 *
 * 与 encryptConfig 同范式（AES-256-GCM + "v1:" 前缀 + 随机 IV + 同一密钥派生 +
 * production fail-closed），但面向字符串而非 JSON 对象——避免对裸字符串做
 * JSON.stringify 的语义错配（encryptConfig 会对入参 JSON.stringify 再加密）。
 *
 * 返回 "v1:" + base64(iv(12) + tag(16) + ciphertext)。每次调用使用随机 IV，
 * 故相同输入产生不同密文。用于 AiProviderConfig.apiKey 等需可逆读取的密文落库
 * （对比 api-keys/route.ts 的 apiSecret 为单向 sha256 哈希——后者仅做比对、不可还原）。
 */
export function encryptSecret(plaintext: string): string {
  const key = resolveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plainBuf = Buffer.from(plaintext, "utf8");
  const ciphertext = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * 解密敏感字符串。
 * - "v1:" 前缀：AES-256-GCM 解密；密文被篡改时抛错（GCM 认证失败）。
 * - 非 "v1:" 前缀：视为历史明文，原样返回（向后兼容存量行，下次写入即自动加密）。
 *
 * 用于读取 encryptSecret 落库的密文；调用方应在 catch 中回退到环境变量或失败关闭，
 * 以应对密钥轮换/数据损坏场景。
 */
export function decryptSecret(stored: string): string {
  if (typeof stored !== "string") {
    throw new Error("密文非字符串，无法解密");
  }

  // 兼容历史明文（未加密的存量 apiKey）
  if (!stored.startsWith(VERSION_PREFIX)) {
    return stored;
  }

  const key = resolveKey();
  const payload = Buffer.from(stored.slice(VERSION_PREFIX.length), "base64");
  if (payload.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("密文加密载荷格式无效：数据过短");
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plainBuf = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plainBuf.toString("utf8");
}
