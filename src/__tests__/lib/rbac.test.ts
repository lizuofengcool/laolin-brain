import { describe, it, expect } from "vitest";
import {
  ROLE_NAMES,
  PERMISSION_NAMES,
  getRolePermissions,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getAllRoles,
  getAllPermissions,
  getPermissionsByModule,
  compareRoles,
  isRoleHigher,
  isRoleLower,
} from "@/lib/rbac";
import type { Role, Permission } from "@/lib/rbac";

/**
 * 直接覆盖 src/lib/rbac.ts 的 10 个运行时导出（2 常量 + 8 函数）。
 *
 * 历史背景：本文件早期版本用「模拟」内联副本测试——自行声明 Role/Permission
 * 类型、ROLE_PERMISSIONS 映射、hasPermission/compareRoles 等函数——从未 import
 * 真实模块，故 src/lib/rbac.ts 长期零真实覆盖。更糟的是内联副本与真实模块存在
 * 三处实质性偏离，使测试给出错误信心：
 *
 *   1. 权限名：内联用 `workspace:view`/`workspace:manage`，真实模块用 `space:*`
 *   2. admin 权限集：内联副本让 admin 缺 `user:remove`/`setting:storage`/
 *      `comment:delete`，并据此断言"管理员不应拥有 user:remove"——但真实模块
 *      的 admin **确实拥有** user:remove（仅缺 user:changeRole 与 billing:manage）
 *   3. 三个函数签名/语义不同：getPermissionsByModule（真实无参，返回全量分组；
 *      内联副本接受 role 参数）、getAllRoles/getAllPermissions（真实返回
 *      `{role,name}`/`{permission,name}` 对象数组；内联副本返回字符串数组）
 *
 * 本文件改为真实 import + 控制流锁定，纠正上述错误断言。
 */

// ==================== 常量导出 ====================

describe("ROLE_NAMES", () => {
  it("恰好定义 4 个角色，键为 owner/admin/member/viewer", () => {
    expect(Object.keys(ROLE_NAMES).sort()).toEqual([
      "admin",
      "member",
      "owner",
      "viewer",
    ]);
  });

  it("每个角色映射到非空中文显示名", () => {
    expect(ROLE_NAMES.owner).toBe("所有者");
    expect(ROLE_NAMES.admin).toBe("管理员");
    expect(ROLE_NAMES.member).toBe("成员");
    expect(ROLE_NAMES.viewer).toBe("访客");
  });
});

describe("PERMISSION_NAMES", () => {
  it("恰好定义 26 个权限（回归守卫：新增权限需同步更新本测试）", () => {
    expect(Object.keys(PERMISSION_NAMES)).toHaveLength(26);
  });

  it("覆盖 8 个模块前缀：file/folder/user/setting/billing/ai/space/comment", () => {
    const modules = new Set(
      Object.keys(PERMISSION_NAMES).map((p) => p.split(":")[0])
    );
    expect(modules).toEqual(
      new Set([
        "file",
        "folder",
        "user",
        "setting",
        "billing",
        "ai",
        "space",
        "comment",
      ])
    );
  });

  it("space:* 而非 workspace:*（纠正历史内联副本的权限名偏离）", () => {
    expect("space:view" in PERMISSION_NAMES).toBe(true);
    expect("space:manage" in PERMISSION_NAMES).toBe(true);
    expect("workspace:view" in PERMISSION_NAMES).toBe(false);
    expect("workspace:manage" in PERMISSION_NAMES).toBe(false);
  });

  it("每个权限映射到非空中文显示名", () => {
    for (const name of Object.values(PERMISSION_NAMES)) {
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

// ==================== getRolePermissions ====================

describe("getRolePermissions", () => {
  it("owner 拥有全部 26 个权限（与 PERMISSION_NAMES 一致）", () => {
    const perms = getRolePermissions("owner");
    expect(perms).toHaveLength(26);
    // 内容与 PERMISSION_NAMES 键集一致（顺序无关，用 set 比较）
    expect(new Set(perms)).toEqual(new Set(Object.keys(PERMISSION_NAMES)));
  });

  it("admin 拥有 24 个权限（仅缺 user:changeRole 与 billing:manage）", () => {
    const perms = getRolePermissions("admin");
    expect(perms).toHaveLength(24);
    // 关键纠正：真实 admin **拥有** user:remove（历史内联副本错误地断言为缺）
    expect(perms).toContain("user:remove");
    expect(perms).toContain("setting:storage");
    expect(perms).toContain("comment:delete");
    // owner 专属：user:changeRole、billing:manage
    expect(perms).not.toContain("user:changeRole");
    expect(perms).not.toContain("billing:manage");
  });

  it("member 拥有 14 个权限（基础使用，无删除/管理类）", () => {
    const perms = getRolePermissions("member");
    expect(perms).toHaveLength(14);
    // 有写入但无删除
    expect(perms).toContain("file:upload");
    expect(perms).toContain("file:edit");
    expect(perms).toContain("folder:rename");
    expect(perms).toContain("comment:create");
    expect(perms).not.toContain("file:delete");
    expect(perms).not.toContain("folder:delete");
    expect(perms).not.toContain("comment:delete");
    expect(perms).not.toContain("user:invite");
    expect(perms).not.toContain("user:remove");
    expect(perms).not.toContain("billing:manage");
  });

  it("viewer 拥有 6 个只读权限", () => {
    const perms = getRolePermissions("viewer");
    expect(perms).toHaveLength(6);
    expect(perms).toEqual([
      "file:download",
      "file:view",
      "folder:view",
      "setting:view",
      "space:view",
      "comment:view",
    ]);
    // 无任何写入/管理权限
    expect(perms).not.toContain("file:upload");
    expect(perms).not.toContain("file:edit");
    expect(perms).not.toContain("folder:create");
    expect(perms).not.toContain("comment:create");
  });

  it("未知角色返回空数组（`ROLE_PERMISSIONS[role] || []` 短路回退）", () => {
    // @ts-expect-error 故意传入非法角色（"invalid" 不属于 Role 联合）测试运行时回退
    expect(getRolePermissions("invalid")).toEqual([]);
  });
});

// ==================== hasPermission ====================

describe("hasPermission", () => {
  it("owner 对全部 26 个权限均返回 true（全量 sweep）", () => {
    const allPerms = Object.keys(PERMISSION_NAMES) as Permission[];
    for (const p of allPerms) {
      expect(hasPermission("owner", p)).toBe(true);
    }
  });

  it("admin 拥有 user:remove（纠正历史副本的错误断言）但缺 user:changeRole/billing:manage", () => {
    expect(hasPermission("admin", "user:remove")).toBe(true);
    expect(hasPermission("admin", "setting:storage")).toBe(true);
    expect(hasPermission("admin", "comment:delete")).toBe(true);
    expect(hasPermission("admin", "user:changeRole")).toBe(false);
    expect(hasPermission("admin", "billing:manage")).toBe(false);
    // admin 仍有 file:delete / user:invite / setting:edit
    expect(hasPermission("admin", "file:delete")).toBe(true);
    expect(hasPermission("admin", "user:invite")).toBe(true);
    expect(hasPermission("admin", "setting:edit")).toBe(true);
  });

  it("member 有 file:upload/file:edit，缺 file:delete/user:invite/setting:edit", () => {
    expect(hasPermission("member", "file:upload")).toBe(true);
    expect(hasPermission("member", "file:edit")).toBe(true);
    expect(hasPermission("member", "comment:create")).toBe(true);
    expect(hasPermission("member", "file:delete")).toBe(false);
    expect(hasPermission("member", "user:invite")).toBe(false);
    expect(hasPermission("member", "setting:edit")).toBe(false);
    expect(hasPermission("member", "billing:view")).toBe(false);
  });

  it("viewer 有 file:view/file:download/folder:view，缺 file:upload/file:edit/comment:create", () => {
    expect(hasPermission("viewer", "file:view")).toBe(true);
    expect(hasPermission("viewer", "file:download")).toBe(true);
    expect(hasPermission("viewer", "folder:view")).toBe(true);
    expect(hasPermission("viewer", "setting:view")).toBe(true);
    expect(hasPermission("viewer", "file:upload")).toBe(false);
    expect(hasPermission("viewer", "file:edit")).toBe(false);
    expect(hasPermission("viewer", "comment:create")).toBe(false);
    expect(hasPermission("viewer", "folder:create")).toBe(false);
  });

  it("未知角色对任意权限返回 false（getRolePermissions 回退 []）", () => {
    // @ts-expect-error 故意传入非法角色（"invalid" 不属于 Role 联合）
    expect(hasPermission("invalid", "file:view")).toBe(false);
  });
});

// ==================== hasAllPermissions ====================

describe("hasAllPermissions", () => {
  it("owner 满足任意子集", () => {
    expect(
      hasAllPermissions("owner", ["file:view", "file:edit", "file:delete"])
    ).toBe(true);
  });

  it("admin 满足其拥有权限的子集", () => {
    expect(hasAllPermissions("admin", ["file:view", "file:edit"])).toBe(true);
  });

  it("admin 不满足包含 user:changeRole 的集合", () => {
    expect(
      hasAllPermissions("admin", ["file:view", "user:changeRole"])
    ).toBe(false);
  });

  it("member 不满足同时含 file:view 与 file:delete 的集合（缺 file:delete）", () => {
    expect(hasAllPermissions("member", ["file:view", "file:delete"])).toBe(
      false
    );
  });

  it("空权限列表返回 true（vacuous truth：[].every(...) 恒真）", () => {
    expect(hasAllPermissions("viewer", [])).toBe(true);
    expect(hasAllPermissions("member", [])).toBe(true);
  });
});

// ==================== hasAnyPermission ====================

describe("hasAnyPermission", () => {
  it("member 命中 file:delete（无）或 file:upload（有）→ true", () => {
    expect(hasAnyPermission("member", ["file:delete", "file:upload"])).toBe(
      true
    );
  });

  it("viewer 对全部为写入权限的列表返回 false", () => {
    expect(
      hasAnyPermission("viewer", ["file:upload", "file:edit", "folder:create"])
    ).toBe(false);
  });

  it("owner 对任意非空列表返回 true", () => {
    expect(
      hasAnyPermission("owner", ["billing:manage", "user:changeRole"])
    ).toBe(true);
  });

  it("空权限列表返回 false（[].some(...) 恒假）", () => {
    expect(hasAnyPermission("owner", [])).toBe(false);
    expect(hasAnyPermission("admin", [])).toBe(false);
  });
});

// ==================== getAllRoles ====================

describe("getAllRoles", () => {
  it("返回 4 个角色，按 ROLE_NAMES 插入顺序：owner/admin/member/viewer", () => {
    const roles = getAllRoles();
    expect(roles.map((r) => r.role)).toEqual([
      "owner",
      "admin",
      "member",
      "viewer",
    ]);
  });

  it("每项为 { role, name } 形状且 name 与 ROLE_NAMES 一致", () => {
    const roles = getAllRoles();
    expect(roles).toHaveLength(4);
    for (const r of roles) {
      expect(r).toEqual({ role: r.role, name: ROLE_NAMES[r.role] });
    }
  });

  it("首项 owner→所有者，末项 viewer→访客", () => {
    const roles = getAllRoles();
    expect(roles[0]).toEqual({ role: "owner", name: "所有者" });
    expect(roles[3]).toEqual({ role: "viewer", name: "访客" });
  });
});

// ==================== getAllPermissions ====================

describe("getAllPermissions", () => {
  it("返回 26 个权限（与 PERMISSION_NAMES 键数一致）", () => {
    const perms = getAllPermissions();
    expect(perms).toHaveLength(26);
    expect(perms).toHaveLength(Object.keys(PERMISSION_NAMES).length);
  });

  it("每项为 { permission, name } 形状且 name 与 PERMISSION_NAMES 一致", () => {
    const perms = getAllPermissions();
    for (const p of perms) {
      expect(p).toEqual({
        permission: p.permission,
        name: PERMISSION_NAMES[p.permission],
      });
      expect(typeof p.name).toBe("string");
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  it("包含 file:upload / billing:manage / space:manage / comment:delete", () => {
    const set = new Set(getAllPermissions().map((p) => p.permission));
    expect(set.has("file:upload")).toBe(true);
    expect(set.has("billing:manage")).toBe(true);
    expect(set.has("space:manage")).toBe(true);
    expect(set.has("comment:delete")).toBe(true);
  });
});

// ==================== getPermissionsByModule ====================

describe("getPermissionsByModule", () => {
  it("返回 8 个模块（file/folder/user/setting/billing/ai/space/comment）", () => {
    const modules = getPermissionsByModule();
    expect(Object.keys(modules).sort()).toEqual([
      "ai",
      "billing",
      "comment",
      "file",
      "folder",
      "setting",
      "space",
      "user",
    ]);
  });

  it("不接受 role 参数：返回全量权限分组（非单角色权限分组）", () => {
    // 真实签名无参——传入 role 也会被忽略，返回的是 PERMISSION_NAMES 全量分组
    // @ts-expect-error 故意传参验证签名无参语义
    const withArg = getPermissionsByModule("viewer");
    const noArg = getPermissionsByModule();
    expect(withArg).toEqual(noArg);
    // file 模块应是全量 6 个权限（PERMISSION_NAMES 中所有 file:*），而非 viewer 的 2 个
    expect(withArg.file).toHaveLength(6);
  });

  it("各模块权限数：file=6 folder=4 user=4 setting=3 billing=2 ai=2 space=2 comment=3", () => {
    const modules = getPermissionsByModule();
    expect(modules.file).toHaveLength(6);
    expect(modules.folder).toHaveLength(4);
    expect(modules.user).toHaveLength(4);
    expect(modules.setting).toHaveLength(3);
    expect(modules.billing).toHaveLength(2);
    expect(modules.ai).toHaveLength(2);
    expect(modules.space).toHaveLength(2);
    expect(modules.comment).toHaveLength(3);
    // 合计 26
    const total = Object.values(modules).reduce((s, arr) => s + arr.length, 0);
    expect(total).toBe(26);
  });

  it("每项为 { permission, name } 形状，且 name 与 PERMISSION_NAMES 一致", () => {
    const modules = getPermissionsByModule();
    for (const [mod, perms] of Object.entries(modules)) {
      for (const p of perms) {
        expect(p.permission.startsWith(`${mod}:`)).toBe(true);
        expect(p).toEqual({
          permission: p.permission,
          name: PERMISSION_NAMES[p.permission],
        });
      }
    }
  });

  it("file 模块含 file:upload/file:download/file:delete/file:share/file:view/file:edit", () => {
    const filePerms = new Set(
      getPermissionsByModule().file.map((p) => p.permission)
    );
    expect(filePerms).toEqual(
      new Set([
        "file:upload",
        "file:download",
        "file:delete",
        "file:share",
        "file:view",
        "file:edit",
      ])
    );
  });
});

// ==================== compareRoles ====================

describe("compareRoles", () => {
  // roleOrder = ['owner','admin','member','viewer']（index 0..3）
  // index1 < index2 → 1（role1 更高）；index1 > index2 → -1；相等 → 0

  it("owner 高于 admin/member/viewer → 1", () => {
    expect(compareRoles("owner", "admin")).toBe(1);
    expect(compareRoles("owner", "member")).toBe(1);
    expect(compareRoles("owner", "viewer")).toBe(1);
  });

  it("admin 高于 member/viewer → 1，低于 owner → -1", () => {
    expect(compareRoles("admin", "member")).toBe(1);
    expect(compareRoles("admin", "viewer")).toBe(1);
    expect(compareRoles("admin", "owner")).toBe(-1);
  });

  it("member 高于 viewer → 1，低于 owner/admin → -1", () => {
    expect(compareRoles("member", "viewer")).toBe(1);
    expect(compareRoles("member", "owner")).toBe(-1);
    expect(compareRoles("member", "admin")).toBe(-1);
  });

  it("viewer 低于 owner/admin/member → -1", () => {
    expect(compareRoles("viewer", "owner")).toBe(-1);
    expect(compareRoles("viewer", "admin")).toBe(-1);
    expect(compareRoles("viewer", "member")).toBe(-1);
  });

  it("相同角色返回 0", () => {
    expect(compareRoles("owner", "owner")).toBe(0);
    expect(compareRoles("admin", "admin")).toBe(0);
    expect(compareRoles("member", "member")).toBe(0);
    expect(compareRoles("viewer", "viewer")).toBe(0);
  });

  it("反对称性：compareRoles(a,b) === -compareRoles(b,a)（a≠b）", () => {
    // 对角线 a===b 时两侧均为 0，但 -0 经 Object.is 与 0 不等（toBe 用 Object.is），
    // 故仅对相异角色验证反对称性；对角线由"相同角色返回 0"用例覆盖。
    const roles: Role[] = ["owner", "admin", "member", "viewer"];
    for (const a of roles) {
      for (const b of roles) {
        if (a === b) continue;
        expect(compareRoles(a, b)).toBe(-compareRoles(b, a));
      }
    }
  });
});

// ==================== isRoleHigher / isRoleLower ====================

describe("isRoleHigher", () => {
  it("owner 高于 admin/member/viewer", () => {
    expect(isRoleHigher("owner", "admin")).toBe(true);
    expect(isRoleHigher("owner", "member")).toBe(true);
    expect(isRoleHigher("owner", "viewer")).toBe(true);
  });

  it("admin 高于 member/viewer，不高于 owner", () => {
    expect(isRoleHigher("admin", "member")).toBe(true);
    expect(isRoleHigher("admin", "viewer")).toBe(true);
    expect(isRoleHigher("admin", "owner")).toBe(false);
  });

  it("相同角色返回 false（compareRoles === 0，不 > 0）", () => {
    expect(isRoleHigher("owner", "owner")).toBe(false);
    expect(isRoleHigher("admin", "admin")).toBe(false);
  });

  it("viewer 不高于任何角色", () => {
    expect(isRoleHigher("viewer", "member")).toBe(false);
    expect(isRoleHigher("viewer", "admin")).toBe(false);
    expect(isRoleHigher("viewer", "owner")).toBe(false);
  });
});

describe("isRoleLower", () => {
  it("viewer 低于 member/admin/owner", () => {
    expect(isRoleLower("viewer", "member")).toBe(true);
    expect(isRoleLower("viewer", "admin")).toBe(true);
    expect(isRoleLower("viewer", "owner")).toBe(true);
  });

  it("member 低于 admin/owner，不低于 viewer", () => {
    expect(isRoleLower("member", "admin")).toBe(true);
    expect(isRoleLower("member", "owner")).toBe(true);
    expect(isRoleLower("member", "viewer")).toBe(false);
  });

  it("相同角色返回 false（compareRoles === 0，不 < 0）", () => {
    expect(isRoleLower("owner", "owner")).toBe(false);
    expect(isRoleLower("viewer", "viewer")).toBe(false);
  });

  it("owner 不低于任何角色", () => {
    expect(isRoleLower("owner", "admin")).toBe(false);
    expect(isRoleLower("owner", "member")).toBe(false);
    expect(isRoleLower("owner", "viewer")).toBe(false);
  });
});
