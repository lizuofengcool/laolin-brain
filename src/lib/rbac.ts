/**
 * 基于角色的访问控制（RBAC）工具
 * 定义角色、权限和权限检查
 */

// 角色类型
export type Role = 'owner' | 'admin' | 'member' | 'viewer';

// 权限类型
export type Permission =
  // 文件管理
  | 'file:upload'
  | 'file:download'
  | 'file:delete'
  | 'file:share'
  | 'file:view'
  | 'file:edit'
  // 文件夹管理
  | 'folder:create'
  | 'folder:delete'
  | 'folder:rename'
  | 'folder:view'
  // 用户管理
  | 'user:invite'
  | 'user:remove'
  | 'user:changeRole'
  | 'user:view'
  // 设置管理
  | 'setting:view'
  | 'setting:edit'
  | 'setting:storage'
  // 计费管理
  | 'billing:view'
  | 'billing:manage'
  // AI功能
  | 'ai:use'
  | 'ai:manage'
  // 团队空间
  | 'space:view'
  | 'space:manage'
  // 评论
  | 'comment:view'
  | 'comment:create'
  | 'comment:delete';

// 角色权限映射
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    // 全部权限
    'file:upload',
    'file:download',
    'file:delete',
    'file:share',
    'file:view',
    'file:edit',
    'folder:create',
    'folder:delete',
    'folder:rename',
    'folder:view',
    'user:invite',
    'user:remove',
    'user:changeRole',
    'user:view',
    'setting:view',
    'setting:edit',
    'setting:storage',
    'billing:view',
    'billing:manage',
    'ai:use',
    'ai:manage',
    'space:view',
    'space:manage',
    'comment:view',
    'comment:create',
    'comment:delete',
  ],
  admin: [
    // 大部分管理权限，除了计费和所有者专属
    'file:upload',
    'file:download',
    'file:delete',
    'file:share',
    'file:view',
    'file:edit',
    'folder:create',
    'folder:delete',
    'folder:rename',
    'folder:view',
    'user:invite',
    'user:remove',
    'user:view',
    'setting:view',
    'setting:edit',
    'setting:storage',
    'billing:view',
    'ai:use',
    'ai:manage',
    'space:view',
    'space:manage',
    'comment:view',
    'comment:create',
    'comment:delete',
  ],
  member: [
    // 基础使用权限
    'file:upload',
    'file:download',
    'file:share',
    'file:view',
    'file:edit',
    'folder:create',
    'folder:rename',
    'folder:view',
    'user:view',
    'setting:view',
    'ai:use',
    'space:view',
    'comment:view',
    'comment:create',
  ],
  viewer: [
    // 只读权限
    'file:download',
    'file:view',
    'folder:view',
    'setting:view',
    'space:view',
    'comment:view',
  ],
};

// 角色名称
export const ROLE_NAMES: Record<Role, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
  viewer: '访客',
};

// 权限名称
export const PERMISSION_NAMES: Record<Permission, string> = {
  'file:upload': '上传文件',
  'file:download': '下载文件',
  'file:delete': '删除文件',
  'file:share': '分享文件',
  'file:view': '查看文件',
  'file:edit': '编辑文件',
  'folder:create': '创建文件夹',
  'folder:delete': '删除文件夹',
  'folder:rename': '重命名文件夹',
  'folder:view': '查看文件夹',
  'user:invite': '邀请用户',
  'user:remove': '移除用户',
  'user:changeRole': '修改角色',
  'user:view': '查看用户',
  'setting:view': '查看设置',
  'setting:edit': '编辑设置',
  'setting:storage': '存储设置',
  'billing:view': '查看账单',
  'billing:manage': '管理计费',
  'ai:use': '使用AI',
  'ai:manage': '管理AI',
  'space:view': '查看空间',
  'space:manage': '管理空间',
  'comment:view': '查看评论',
  'comment:create': '发表评论',
  'comment:delete': '删除评论',
};

/**
 * 获取角色的所有权限
 * @param role 角色
 * @returns 权限列表
 */
export function getRolePermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * 检查角色是否有某个权限
 * @param role 角色
 * @param permission 权限
 * @returns 是否有权限
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = getRolePermissions(role);
  return permissions.includes(permission);
}

/**
 * 检查角色是否有所有指定权限
 * @param role 角色
 * @param permissions 权限列表
 * @returns 是否有所有权限
 */
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

/**
 * 检查角色是否有任意一个指定权限
 * @param role 角色
 * @param permissions 权限列表
 * @returns 是否有任意一个权限
 */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

/**
 * 获取所有角色列表
 * @returns 角色列表
 */
export function getAllRoles(): { role: Role; name: string }[] {
  return (Object.keys(ROLE_NAMES) as Role[]).map(role => ({
    role,
    name: ROLE_NAMES[role],
  }));
}

/**
 * 获取所有权限列表
 * @returns 权限列表
 */
export function getAllPermissions(): { permission: Permission; name: string }[] {
  return (Object.keys(PERMISSION_NAMES) as Permission[]).map(permission => ({
    permission,
    name: PERMISSION_NAMES[permission],
  }));
}

/**
 * 按模块分组权限
 * @returns 分组后的权限
 */
export function getPermissionsByModule(): Record<string, { permission: Permission; name: string }[]> {
  const modules: Record<string, { permission: Permission; name: string }[]> = {};

  (Object.keys(PERMISSION_NAMES) as Permission[]).forEach(permission => {
    const module = permission.split(':')[0];
    if (!modules[module]) {
      modules[module] = [];
    }
    modules[module].push({
      permission,
      name: PERMISSION_NAMES[permission],
    });
  });

  return modules;
}

/**
 * 比较两个角色的权限等级
 * @param role1 角色1
 * @param role2 角色2
 * @returns 1: role1 > role2, -1: role1 < role2, 0: equal
 */
export function compareRoles(role1: Role, role2: Role): number {
  const roleOrder: Role[] = ['owner', 'admin', 'member', 'viewer'];
  const index1 = roleOrder.indexOf(role1);
  const index2 = roleOrder.indexOf(role2);

  if (index1 < index2) return 1;
  if (index1 > index2) return -1;
  return 0;
}

/**
 * 检查角色1是否比角色2权限更高
 * @param role1 角色1
 * @param role2 角色2
 * @returns 是否更高
 */
export function isRoleHigher(role1: Role, role2: Role): boolean {
  return compareRoles(role1, role2) > 0;
}

/**
 * 检查角色1是否比角色2权限更低
 * @param role1 角色1
 * @param role2 角色2
 * @returns 是否更低
 */
export function isRoleLower(role1: Role, role2: Role): boolean {
  return compareRoles(role1, role2) < 0;
}
