/**
 * email/settings-store 单测
 *
 * 锁定第一百八十轮租户级 SMTP 配置持久化的行为契约（真实 AES-256-GCM 加解密，仅隔离 DB）：
 *   - getEmailConfig：findFirst 以 {tenantId, key, userId:null} 查询；有行 → decryptConfig 还原
 *     为 EmailConfig；无行 → null；解密失败（密文损坏）→ console.error + null（不外抛）。
 *   - saveEmailConfig：encryptConfig 加密后落库；已有行 → update(by id)；无行 → create
 *     （type=json, category=notification, isEncrypted=true）；落库 value 为 v1: 密文、不含明文 pass。
 *   - maskEmailConfig：返回 configured/host/port/secure/user/from/fromName/hasPass，不含 pass。
 *   - 租户作用域：getEmailConfig/saveEmailConfig 的 DB 查询/写入均带 tenantId（A 不读 B）。
 *
 * 隔离策略：vi.mock('@/lib/db') 仅暴露 setting.findFirst/update/create；config-crypto 保持真实，
 * 覆盖加解密往返；decryptConfig(encryptConfig(x)) ≈ x（每次 IV 随机，密文不同但明文相等）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { encryptConfig, decryptConfig } from "@/lib/cloud-sync/config-crypto";
import type { EmailConfig } from "@/lib/email";

const {
  mockSettingFindFirst,
  mockSettingUpdate,
  mockSettingCreate,
} = vi.hoisted(() => ({
  mockSettingFindFirst: vi.fn(),
  mockSettingUpdate: vi.fn(),
  mockSettingCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    setting: {
      findFirst: (...args: unknown[]) => mockSettingFindFirst(...args),
      update: (...args: unknown[]) => mockSettingUpdate(...args),
      create: (...args: unknown[]) => mockSettingCreate(...args),
    },
  },
}));

import {
  getEmailConfig,
  saveEmailConfig,
  maskEmailConfig,
  EMAIL_SETTING_KEY,
} from "@/lib/email/settings-store";

const config: EmailConfig = {
  host: "smtp.tenant.com",
  port: 465,
  secure: true,
  user: "tenant@smtp.com",
  pass: "tenant-secret-pass-DO-NOT-LEAK",
  from: "noreply@tenant.com",
  fromName: "租户团队",
};

describe("email/settings-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingUpdate.mockResolvedValue({ id: "set-1" });
    mockSettingCreate.mockResolvedValue({ id: "set-1" });
  });

  describe("getEmailConfig", () => {
    it("findFirst 以 {tenantId, key, userId:null} 查询，select.value", async () => {
      mockSettingFindFirst.mockResolvedValue({ value: encryptConfig(config) });
      await getEmailConfig("tenant-A");
      const arg = mockSettingFindFirst.mock.calls[0][0];
      expect(arg.where).toEqual({
        tenantId: "tenant-A",
        key: EMAIL_SETTING_KEY,
        userId: null,
      });
      expect(arg.select).toEqual({ value: true });
    });

    it("有加密行 → decryptConfig 还原为原配置", async () => {
      mockSettingFindFirst.mockResolvedValue({ value: encryptConfig(config) });
      const got = await getEmailConfig("tenant-A");
      expect(got).toEqual(config);
    });

    it("加解密往返：每次 encryptConfig 密文不同（随机 IV），解密后明文相等", async () => {
      const c1 = encryptConfig(config);
      const c2 = encryptConfig(config);
      expect(c1).not.toEqual(c2);
      expect(decryptConfig(c1)).toEqual(config);
      expect(decryptConfig(c2)).toEqual(config);
    });

    it("无行 → null", async () => {
      mockSettingFindFirst.mockResolvedValue(null);
      expect(await getEmailConfig("tenant-A")).toBeNull();
    });

    it("value 为空 → null", async () => {
      mockSettingFindFirst.mockResolvedValue({ value: null });
      expect(await getEmailConfig("tenant-A")).toBeNull();
    });

    it("解密失败（密文损坏）→ console.error + null，不外抛", async () => {
      mockSettingFindFirst.mockResolvedValue({ value: "v1:!!!corrupt-payload!!!" });
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const got = await getEmailConfig("tenant-A");
      expect(got).toBeNull();
      expect(errSpy).toHaveBeenCalledTimes(1);
      errSpy.mockRestore();
    });
  });

  describe("saveEmailConfig", () => {
    it("无已有行 → create，value 为 v1: 加密密文（不含明文 pass），isEncrypted=true / type=json / category=notification", async () => {
      mockSettingFindFirst.mockResolvedValue(null);
      await saveEmailConfig("tenant-A", config);

      const createArg = mockSettingCreate.mock.calls[0][0];
      const data = createArg.data;
      expect(data.tenantId).toBe("tenant-A");
      expect(data.key).toBe(EMAIL_SETTING_KEY);
      expect(data.type).toBe("json");
      expect(data.category).toBe("notification");
      expect(data.isEncrypted).toBe(true);
      // value 为 v1: 密文，不含明文 pass
      expect(typeof data.value).toBe("string");
      expect(data.value.startsWith("v1:")).toBe(true);
      expect(data.value).not.toContain(config.pass);
      // 解密往返正确
      expect(decryptConfig(data.value)).toEqual(config);
      // findFirst 查询带 tenantId
      expect(mockSettingFindFirst.mock.calls[0][0].where.tenantId).toBe("tenant-A");
    });

    it("已有行 → update(by id)，不再 create", async () => {
      mockSettingFindFirst.mockResolvedValue({ id: "existing-id" });
      await saveEmailConfig("tenant-A", config);

      const updateArg = mockSettingUpdate.mock.calls[0][0];
      expect(updateArg.where.id).toBe("existing-id");
      expect(updateArg.data.value.startsWith("v1:")).toBe(true);
      expect(updateArg.data.value).not.toContain(config.pass);
      expect(mockSettingCreate).not.toHaveBeenCalled();
    });

    it("多次保存同一租户 → 每次密文不同（随机 IV），明文相等", async () => {
      mockSettingFindFirst.mockResolvedValue({ id: "existing-id" });
      await saveEmailConfig("tenant-A", config);
      await saveEmailConfig("tenant-A", config);
      const v1 = mockSettingUpdate.mock.calls[0][0].data.value;
      const v2 = mockSettingUpdate.mock.calls[1][0].data.value;
      expect(v1).not.toEqual(v2);
      expect(decryptConfig(v1)).toEqual(config);
      expect(decryptConfig(v2)).toEqual(config);
    });
  });

  describe("maskEmailConfig", () => {
    it("返回 configured + 非敏感字段 + hasPass，不含 pass", () => {
      const m = maskEmailConfig(config);
      expect(m).toEqual({
        configured: true,
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user,
        from: config.from,
        fromName: config.fromName,
        hasPass: true,
      });
      expect((m as Record<string, unknown>).pass).toBeUndefined();
    });

    it("pass 为空 → hasPass=false", () => {
      const m = maskEmailConfig({ ...config, pass: "" });
      expect(m.hasPass).toBe(false);
    });
  });
});
