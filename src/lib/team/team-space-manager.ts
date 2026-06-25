/**
 * 团队空间管理器
 * 负责团队管理、空间管理、成员管理、活动记录
 */

import {
  Team,
  TeamMember,
  TeamRole,
  TeamStatus,
  TeamSettings,
  TeamInvitation,
  Space,
  SpaceMember,
  SpaceRole,
  SpaceType,
  SpaceStatus,
  SpaceSettings,
  SpacePermissions,
  SharedFolder,
  SharedMember,
  SharePermission,
  TeamActivity,
  ActivityType,
  ActivityStats,
  TeamNotification,
  NotificationType,
  TEAM_ROLE_PERMISSIONS,
  SPACE_ROLE_PERMISSIONS,
  DEFAULT_TEAM_SETTINGS,
  DEFAULT_SPACE_SETTINGS,
  CreateTeamParams,
  CreateSpaceParams,
  InviteMemberParams,
  ActivityQueryParams,
} from './types';

/**
 * 团队空间管理器
 */
export class TeamSpaceManager {
  private teams: Map<string, Team> = new Map();
  private teamMembers: Map<string, TeamMember[]> = new Map();
  private teamInvitations: Map<string, TeamInvitation[]> = new Map();
  private spaces: Map<string, Space> = new Map();
  private spaceMembers: Map<string, SpaceMember[]> = new Map();
  private sharedFolders: Map<string, SharedFolder> = new Map();
  private sharedMembers: Map<string, SharedMember[]> = new Map();
  private activities: Map<string, TeamActivity[]> = new Map();
  private notifications: Map<string, TeamNotification[]> = new Map();

  constructor() {
    // 初始化
  }

  // ==================== 团队管理 ====================

  /**
   * 创建团队
   */
  async createTeam(
    tenantId: string,
    userId: string,
    params: CreateTeamParams
  ): Promise<Team> {
    const teamId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const team: Team = {
      id: teamId,
      tenantId,
      name: params.name,
      description: params.description,
      avatar: params.avatar,
      status: 'active',
      memberCount: 1,
      spaceCount: 0,
      storageUsed: 0,
      settings: {
        ...DEFAULT_TEAM_SETTINGS,
        ...params.settings,
      },
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.teams.set(teamId, team);

    // 添加创建者为所有者
    const ownerMember: TeamMember = {
      id: `member_${Date.now()}`,
      teamId,
      userId,
      tenantId,
      role: 'owner',
      status: 'active',
      joinedAt: new Date(),
      lastActiveAt: new Date(),
    };

    this.teamMembers.set(teamId, [ownerMember]);
    this.teamInvitations.set(teamId, []);

    // 记录活动
    this.recordActivity(teamId, tenantId, {
      type: 'team_create',
      actorId: userId,
      actorName: '创建者',
      targetType: 'team',
      targetId: teamId,
      targetName: params.name,
    });

    return team;
  }

  /**
   * 获取团队信息
   */
  async getTeam(teamId: string, tenantId: string): Promise<Team | null> {
    const team = this.teams.get(teamId);
    if (!team || team.tenantId !== tenantId) return null;
    return team;
  }

  /**
   * 获取用户的团队列表
   */
  async getUserTeams(userId: string, tenantId: string): Promise<Team[]> {
    const userTeams: Team[] = [];

    for (const [teamId, members] of this.teamMembers) {
      const member = members.find(m => m.userId === userId && m.tenantId === tenantId);
      if (member && member.status === 'active') {
        const team = this.teams.get(teamId);
        if (team && team.status === 'active') {
          userTeams.push(team);
        }
      }
    }

    return userTeams.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 更新团队信息
   */
  async updateTeam(
    teamId: string,
    tenantId: string,
    userId: string,
    updates: Partial<Pick<Team, 'name' | 'description' | 'avatar' | 'settings'>>
  ): Promise<Team | null> {
    const team = this.teams.get(teamId);
    if (!team || team.tenantId !== tenantId) return null;

    // 检查权限
    const hasPermission = await this.checkTeamPermission(teamId, userId, 'canManageTeam');
    if (!hasPermission) return null;

    const updatedTeam: Team = {
      ...team,
      ...updates,
      updatedAt: new Date(),
    };

    this.teams.set(teamId, updatedTeam);

    // 记录活动
    this.recordActivity(teamId, tenantId, {
      type: 'team_update',
      actorId: userId,
      actorName: '管理员',
      targetType: 'team',
      targetId: teamId,
      targetName: updatedTeam.name,
    });

    return updatedTeam;
  }

  /**
   * 归档团队
   */
  async archiveTeam(teamId: string, tenantId: string, userId: string): Promise<boolean> {
    const team = this.teams.get(teamId);
    if (!team || team.tenantId !== tenantId) return false;

    const hasPermission = await this.checkTeamPermission(teamId, userId, 'canManageTeam');
    if (!hasPermission) return false;

    team.status = 'archived';
    team.updatedAt = new Date();
    this.teams.set(teamId, team);

    return true;
  }

  // ==================== 团队成员管理 ====================

  /**
   * 获取团队成员列表
   */
  async getTeamMembers(teamId: string, tenantId: string): Promise<TeamMember[]> {
    const members = this.teamMembers.get(teamId) || [];
    return members.filter(m => m.tenantId === tenantId && m.status === 'active');
  }

  /**
   * 邀请成员加入团队
   */
  async inviteTeamMember(
    teamId: string,
    tenantId: string,
    inviterId: string,
    params: InviteMemberParams
  ): Promise<TeamInvitation | null> {
    const team = this.teams.get(teamId);
    if (!team || team.tenantId !== tenantId) return null;

    // 检查权限
    const hasPermission = await this.checkTeamPermission(teamId, inviterId, 'canManageMembers');
    if (!hasPermission) return null;

    const invitationId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const token = Math.random().toString(36).substr(2, 32);
    const expiresInDays = params.expiresInDays || 7;

    const invitation: TeamInvitation = {
      id: invitationId,
      teamId,
      tenantId,
      email: params.email,
      role: params.role as TeamRole,
      invitedBy: inviterId,
      invitedAt: new Date(),
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      status: 'pending',
      token,
    };

    const invitations = this.teamInvitations.get(teamId) || [];
    invitations.push(invitation);
    this.teamInvitations.set(teamId, invitations);

    // 发送通知
    this.sendNotification(tenantId, {
      type: 'team_invitation',
      title: '团队邀请',
      content: `您被邀请加入团队「${team.name}」`,
      teamId,
      data: { invitationId, email: params.email },
    });

    return invitation;
  }

  /**
   * 接受团队邀请
   */
  async acceptTeamInvitation(
    token: string,
    userId: string,
    tenantId: string
  ): Promise<TeamMember | null> {
    // 查找邀请
    for (const [teamId, invitations] of this.teamInvitations) {
      const invitation = invitations.find(
        inv => inv.token === token && inv.status === 'pending' && inv.tenantId === tenantId
      );

      if (invitation && invitation.expiresAt > new Date()) {
        // 更新邀请状态
        invitation.status = 'accepted';

        // 添加成员
        const member: TeamMember = {
          id: `member_${Date.now()}`,
          teamId,
          userId,
          tenantId,
          role: invitation.role,
          status: 'active',
          joinedAt: new Date(),
          invitedBy: invitation.invitedBy,
          lastActiveAt: new Date(),
        };

        const members = this.teamMembers.get(teamId) || [];
        members.push(member);
        this.teamMembers.set(teamId, members);

        // 更新团队成员数
        const team = this.teams.get(teamId);
        if (team) {
          team.memberCount = members.filter(m => m.status === 'active').length;
          team.updatedAt = new Date();
          this.teams.set(teamId, team);
        }

        // 记录活动
        this.recordActivity(teamId, tenantId, {
          type: 'team_member_join',
          actorId: userId,
          actorName: '新成员',
          targetType: 'member',
          targetId: userId,
        });

        return member;
      }
    }

    return null;
  }

  /**
   * 修改成员角色
   */
  async changeMemberRole(
    teamId: string,
    tenantId: string,
    userId: string,
    targetUserId: string,
    newRole: TeamRole
  ): Promise<boolean> {
    const members = this.teamMembers.get(teamId);
    if (!members) return false;

    // 检查权限
    const hasPermission = await this.checkTeamPermission(teamId, userId, 'canManageMembers');
    if (!hasPermission) return false;

    const targetMember = members.find(
      m => m.userId === targetUserId && m.tenantId === tenantId && m.status === 'active'
    );

    if (!targetMember) return false;

    // 不能修改所有者
    if (targetMember.role === 'owner') return false;

    targetMember.role = newRole;

    // 记录活动
    this.recordActivity(teamId, tenantId, {
      type: 'team_member_role_change',
      actorId: userId,
      actorName: '管理员',
      targetType: 'member',
      targetId: targetUserId,
      details: { oldRole: targetMember.role, newRole },
    });

    return true;
  }

  /**
   * 移除团队成员
   */
  async removeTeamMember(
    teamId: string,
    tenantId: string,
    userId: string,
    targetUserId: string
  ): Promise<boolean> {
    const members = this.teamMembers.get(teamId);
    if (!members) return false;

    // 检查权限
    const hasPermission = await this.checkTeamPermission(teamId, userId, 'canManageMembers');
    if (!hasPermission) return false;

    const targetMember = members.find(
      m => m.userId === targetUserId && m.tenantId === tenantId && m.status === 'active'
    );

    if (!targetMember || targetMember.role === 'owner') return false;

    targetMember.status = 'removed';

    // 更新团队成员数
    const team = this.teams.get(teamId);
    if (team) {
      team.memberCount = members.filter(m => m.status === 'active').length;
      team.updatedAt = new Date();
      this.teams.set(teamId, team);
    }

    // 记录活动
    this.recordActivity(teamId, tenantId, {
      type: 'team_member_leave',
      actorId: userId,
      actorName: '管理员',
      targetType: 'member',
      targetId: targetUserId,
    });

    return true;
  }

  /**
   * 检查团队权限
   */
  async checkTeamPermission(
    teamId: string,
    userId: string,
    permission: keyof typeof TEAM_ROLE_PERMISSIONS[TeamRole]
  ): Promise<boolean> {
    const members = this.teamMembers.get(teamId);
    if (!members) return false;

    const member = members.find(m => m.userId === userId && m.status === 'active');
    if (!member) return false;

    const permissions = TEAM_ROLE_PERMISSIONS[member.role];
    return permissions[permission] || false;
  }

  // ==================== 空间管理 ====================

  /**
   * 创建空间
   */
  async createSpace(
    tenantId: string,
    userId: string,
    params: CreateSpaceParams
  ): Promise<Space | null> {
    // 如果是团队空间，检查权限
    if (params.teamId) {
      const canCreate = await this.checkTeamPermission(params.teamId, userId, 'canCreateSpace');
      if (!canCreate) return null;
    }

    const spaceId = `space_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const space: Space = {
      id: spaceId,
      tenantId,
      teamId: params.teamId,
      name: params.name,
      description: params.description,
      type: params.type || (params.teamId ? 'team' : 'personal'),
      status: 'active',
      ownerId: userId,
      memberCount: 1,
      fileCount: 0,
      folderCount: 0,
      storageUsed: 0,
      color: params.color,
      icon: params.icon,
      settings: {
        ...DEFAULT_SPACE_SETTINGS,
        ...params.settings,
      },
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.spaces.set(spaceId, space);

    // 添加创建者为所有者
    const ownerMember: SpaceMember = {
      id: `sm_${Date.now()}`,
      spaceId,
      userId,
      tenantId,
      role: 'owner',
      permissions: SPACE_ROLE_PERMISSIONS.owner,
      joinedAt: new Date(),
      lastActiveAt: new Date(),
    };

    this.spaceMembers.set(spaceId, [ownerMember]);

    // 更新团队空间数
    if (params.teamId) {
      const team = this.teams.get(params.teamId);
      if (team) {
        team.spaceCount++;
        team.updatedAt = new Date();
        this.teams.set(params.teamId, team);

        // 记录活动
        this.recordActivity(params.teamId, tenantId, {
          type: 'space_create',
          actorId: userId,
          actorName: '创建者',
          targetType: 'space',
          targetId: spaceId,
          targetName: params.name,
        });
      }
    }

    return space;
  }

  /**
   * 获取空间信息
   */
  async getSpace(spaceId: string, tenantId: string): Promise<Space | null> {
    const space = this.spaces.get(spaceId);
    if (!space || space.tenantId !== tenantId) return null;
    return space;
  }

  /**
   * 获取用户的空间列表
   */
  async getUserSpaces(userId: string, tenantId: string): Promise<Space[]> {
    const userSpaces: Space[] = [];

    for (const [spaceId, members] of this.spaceMembers) {
      const member = members.find(m => m.userId === userId && m.tenantId === tenantId);
      if (member) {
        const space = this.spaces.get(spaceId);
        if (space && space.status === 'active') {
          userSpaces.push(space);
        }
      }
    }

    return userSpaces.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 获取团队空间列表
   */
  async getTeamSpaces(teamId: string, tenantId: string): Promise<Space[]> {
    const teamSpaces: Space[] = [];

    for (const [spaceId, space] of this.spaces) {
      if (space.teamId === teamId && space.tenantId === tenantId && space.status === 'active') {
        teamSpaces.push(space);
      }
    }

    return teamSpaces.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 更新空间信息
   */
  async updateSpace(
    spaceId: string,
    tenantId: string,
    userId: string,
    updates: Partial<Pick<Space, 'name' | 'description' | 'color' | 'icon' | 'settings'>>
  ): Promise<Space | null> {
    const space = this.spaces.get(spaceId);
    if (!space || space.tenantId !== tenantId) return null;

    // 检查权限
    const hasPermission = await this.checkSpacePermission(spaceId, userId, 'canManageSettings');
    if (!hasPermission) return null;

    const updatedSpace: Space = {
      ...space,
      ...updates,
      updatedAt: new Date(),
    };

    this.spaces.set(spaceId, updatedSpace);

    return updatedSpace;
  }

  /**
   * 删除空间
   */
  async deleteSpace(spaceId: string, tenantId: string, userId: string): Promise<boolean> {
    const space = this.spaces.get(spaceId);
    if (!space || space.tenantId !== tenantId) return false;

    // 检查权限
    const hasPermission = await this.checkSpacePermission(spaceId, userId, 'canManageSettings');
    if (!hasPermission) return false;

    space.status = 'deleted';
    space.updatedAt = new Date();
    this.spaces.set(spaceId, space);

    // 更新团队空间数
    if (space.teamId) {
      const team = this.teams.get(space.teamId);
      if (team) {
        team.spaceCount--;
        team.updatedAt = new Date();
        this.teams.set(space.teamId, team);
      }
    }

    return true;
  }

  // ==================== 空间成员管理 ====================

  /**
   * 获取空间成员列表
   */
  async getSpaceMembers(spaceId: string, tenantId: string): Promise<SpaceMember[]> {
    const members = this.spaceMembers.get(spaceId) || [];
    return members.filter(m => m.tenantId === tenantId);
  }

  /**
   * 添加空间成员
   */
  async addSpaceMember(
    spaceId: string,
    tenantId: string,
    userId: string,
    targetUserId: string,
    role: SpaceRole
  ): Promise<SpaceMember | null> {
    const space = this.spaces.get(spaceId);
    if (!space || space.tenantId !== tenantId) return null;

    // 检查权限
    const hasPermission = await this.checkSpacePermission(spaceId, userId, 'canManageMembers');
    if (!hasPermission) return null;

    const members = this.spaceMembers.get(spaceId) || [];

    // 检查是否已存在
    const existing = members.find(m => m.userId === targetUserId);
    if (existing) return existing;

    const member: SpaceMember = {
      id: `sm_${Date.now()}`,
      spaceId,
      userId: targetUserId,
      tenantId,
      role,
      permissions: SPACE_ROLE_PERMISSIONS[role],
      joinedAt: new Date(),
      addedBy: userId,
      lastActiveAt: new Date(),
    };

    members.push(member);
    this.spaceMembers.set(spaceId, members);

    // 更新空间成员数
    space.memberCount = members.length;
    space.updatedAt = new Date();
    this.spaces.set(spaceId, space);

    // 发送通知
    this.sendNotification(tenantId, {
      type: 'space_invitation',
      title: '空间邀请',
      content: `您被添加到空间「${space.name}」`,
      spaceId,
      data: { role },
    });

    return member;
  }

  /**
   * 修改空间成员角色
   */
  async changeSpaceMemberRole(
    spaceId: string,
    tenantId: string,
    userId: string,
    targetUserId: string,
    newRole: SpaceRole
  ): Promise<boolean> {
    const members = this.spaceMembers.get(spaceId);
    if (!members) return false;

    // 检查权限
    const hasPermission = await this.checkSpacePermission(spaceId, userId, 'canManageMembers');
    if (!hasPermission) return false;

    const targetMember = members.find(m => m.userId === targetUserId && m.tenantId === tenantId);
    if (!targetMember || targetMember.role === 'owner') return false;

    targetMember.role = newRole;
    targetMember.permissions = SPACE_ROLE_PERMISSIONS[newRole];

    return true;
  }

  /**
   * 移除空间成员
   */
  async removeSpaceMember(
    spaceId: string,
    tenantId: string,
    userId: string,
    targetUserId: string
  ): Promise<boolean> {
    const members = this.spaceMembers.get(spaceId);
    if (!members) return false;

    // 检查权限
    const hasPermission = await this.checkSpacePermission(spaceId, userId, 'canManageMembers');
    if (!hasPermission) return false;

    const index = members.findIndex(
      m => m.userId === targetUserId && m.tenantId === tenantId && m.role !== 'owner'
    );

    if (index === -1) return false;

    members.splice(index, 1);
    this.spaceMembers.set(spaceId, members);

    // 更新空间成员数
    const space = this.spaces.get(spaceId);
    if (space) {
      space.memberCount = members.length;
      space.updatedAt = new Date();
      this.spaces.set(spaceId, space);
    }

    return true;
  }

  /**
   * 检查空间权限
   */
  async checkSpacePermission(
    spaceId: string,
    userId: string,
    permission: keyof SpacePermissions
  ): Promise<boolean> {
    const members = this.spaceMembers.get(spaceId);
    if (!members) return false;

    const member = members.find(m => m.userId === userId);
    if (!member) return false;

    return member.permissions[permission] || false;
  }

  /**
   * 获取用户在空间的角色
   */
  async getUserSpaceRole(spaceId: string, userId: string): Promise<SpaceRole | null> {
    const members = this.spaceMembers.get(spaceId);
    if (!members) return null;

    const member = members.find(m => m.userId === userId);
    return member?.role || null;
  }

  // ==================== 共享文件夹 ====================

  /**
   * 创建共享文件夹
   */
  async createSharedFolder(
    folderId: string,
    spaceId: string,
    tenantId: string,
    userId: string,
    name: string,
    permission: SharePermission = 'view'
  ): Promise<SharedFolder | null> {
    // 检查权限
    const hasPermission = await this.checkSpacePermission(spaceId, userId, 'canShare');
    if (!hasPermission) return null;

    const sharedId = `shared_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const sharedFolder: SharedFolder = {
      id: sharedId,
      folderId,
      spaceId,
      tenantId,
      name,
      permission,
      memberCount: 0,
      fileCount: 0,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sharedFolders.set(sharedId, sharedFolder);
    this.sharedMembers.set(sharedId, []);

    return sharedFolder;
  }

  /**
   * 添加共享成员
   */
  async addSharedMember(
    sharedFolderId: string,
    tenantId: string,
    userId: string,
    targetUserId: string,
    permission: SharePermission
  ): Promise<SharedMember | null> {
    const sharedFolder = this.sharedFolders.get(sharedFolderId);
    if (!sharedFolder || sharedFolder.tenantId !== tenantId) return null;

    // 检查权限（创建者或管理员）
    if (sharedFolder.createdBy !== userId) {
      // 可以添加更多权限检查
    }

    const members = this.sharedMembers.get(sharedFolderId) || [];

    // 检查是否已存在
    const existing = members.find(m => m.userId === targetUserId);
    if (existing) return existing;

    const member: SharedMember = {
      id: `shm_${Date.now()}`,
      sharedFolderId,
      userId: targetUserId,
      tenantId,
      permission,
      canShare: permission === 'admin',
      addedBy: userId,
      addedAt: new Date(),
    };

    members.push(member);
    this.sharedMembers.set(sharedFolderId, members);

    // 更新成员数
    sharedFolder.memberCount = members.length;
    sharedFolder.updatedAt = new Date();
    this.sharedFolders.set(sharedFolderId, sharedFolder);

    return member;
  }

  // ==================== 活动记录 ====================

  /**
   * 记录团队活动
   */
  recordActivity(
    teamId: string,
    tenantId: string,
    activity: Omit<TeamActivity, 'id' | 'teamId' | 'tenantId' | 'createdAt'>
  ): void {
    const activityRecord: TeamActivity = {
      id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      teamId,
      tenantId,
      ...activity,
      createdAt: new Date(),
    };

    const teamActivities = this.activities.get(teamId) || [];
    teamActivities.unshift(activityRecord);

    // 只保留最近1000条
    if (teamActivities.length > 1000) {
      teamActivities.length = 1000;
    }

    this.activities.set(teamId, teamActivities);
  }

  /**
   * 获取团队活动列表
   */
  async getTeamActivities(params: ActivityQueryParams): Promise<{
    activities: TeamActivity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { teamId, page = 1, pageSize = 20 } = params;
    if (!teamId) return { activities: [], total: 0, page, pageSize };

    let teamActivities = this.activities.get(teamId) || [];

    // 过滤
    if (params.type) {
      const types = Array.isArray(params.type) ? params.type : [params.type];
      teamActivities = teamActivities.filter(a => types.includes(a.type));
    }

    if (params.userId) {
      teamActivities = teamActivities.filter(a => a.actorId === params.userId);
    }

    if (params.dateFrom) {
      teamActivities = teamActivities.filter(a => a.createdAt >= params.dateFrom!);
    }

    if (params.dateTo) {
      teamActivities = teamActivities.filter(a => a.createdAt <= params.dateTo!);
    }

    const total = teamActivities.length;
    const start = (page - 1) * pageSize;
    const activities = teamActivities.slice(start, start + pageSize);

    return { activities, total, page, pageSize };
  }

  /**
   * 获取活动统计
   */
  async getActivityStats(teamId: string, tenantId: string): Promise<ActivityStats> {
    const teamActivities = this.activities.get(teamId) || [];
    const filtered = teamActivities.filter(a => a.tenantId === tenantId);

    const stats: ActivityStats = {
      totalActivities: filtered.length,
      fileUploads: filtered.filter(a => a.type === 'file_upload').length,
      fileUpdates: filtered.filter(a => a.type === 'file_update').length,
      comments: filtered.filter(a => a.type === 'comment_create' || a.type === 'comment_reply').length,
      memberActivities: filtered.filter(a =>
        a.type.startsWith('team_member') || a.type.startsWith('space_member')
      ).length,
      byDate: {},
      byUser: {},
      byType: {},
    };

    // 按日期统计
    for (const activity of filtered) {
      const date = activity.createdAt.toISOString().split('T')[0];
      stats.byDate[date] = (stats.byDate[date] || 0) + 1;
      stats.byUser[activity.actorId] = (stats.byUser[activity.actorId] || 0) + 1;
      stats.byType[activity.type] = (stats.byType[activity.type] || 0) + 1;
    }

    return stats;
  }

  // ==================== 通知管理 ====================

  /**
   * 发送通知
   */
  sendNotification(
    tenantId: string,
    notification: Omit<TeamNotification, 'id' | 'tenantId' | 'isRead' | 'createdAt'> & { userId?: string }
  ): void {
    const notificationRecord: TeamNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: notification.userId || 'system',
      tenantId,
      teamId: notification.teamId,
      spaceId: notification.spaceId,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      data: notification.data,
      isRead: false,
      createdAt: new Date(),
    };

    const userNotifications = this.notifications.get(notificationRecord.userId) || [];
    userNotifications.unshift(notificationRecord);
    this.notifications.set(notificationRecord.userId, userNotifications);
  }

  /**
   * 获取用户通知
   */
  async getUserNotifications(
    userId: string,
    tenantId: string,
    options?: { unreadOnly?: boolean; limit?: number }
  ): Promise<TeamNotification[]> {
    const notifications = this.notifications.get(userId) || [];
    let filtered = notifications.filter(n => n.tenantId === tenantId);

    if (options?.unreadOnly) {
      filtered = filtered.filter(n => !n.isRead);
    }

    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * 标记通知为已读
   */
  async markNotificationAsRead(
    notificationId: string,
    userId: string,
    tenantId: string
  ): Promise<boolean> {
    const notifications = this.notifications.get(userId) || [];
    const notification = notifications.find(
      n => n.id === notificationId && n.tenantId === tenantId
    );

    if (!notification) return false;

    notification.isRead = true;
    notification.readAt = new Date();

    return true;
  }

  /**
   * 标记所有通知为已读
   */
  async markAllNotificationsAsRead(userId: string, tenantId: string): Promise<number> {
    const notifications = this.notifications.get(userId) || [];
    let count = 0;

    for (const notification of notifications) {
      if (notification.tenantId === tenantId && !notification.isRead) {
        notification.isRead = true;
        notification.readAt = new Date();
        count++;
      }
    }

    return count;
  }

  /**
   * 获取未读通知数量
   */
  async getUnreadNotificationCount(userId: string, tenantId: string): Promise<number> {
    const notifications = this.notifications.get(userId) || [];
    return notifications.filter(n => n.tenantId === tenantId && !n.isRead).length;
  }

  // ==================== 工具方法 ====================

  /**
   * 格式化存储大小
   */
  formatStorageSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 获取角色显示名称
   */
  getRoleDisplayName(role: TeamRole | SpaceRole): string {
    const roleNames: Record<string, string> = {
      owner: '所有者',
      admin: '管理员',
      member: '成员',
      editor: '编辑者',
      commenter: '评论者',
      viewer: '查看者',
    };
    return roleNames[role] || role;
  }

  /**
   * 获取活动类型显示名称
   */
  getActivityTypeDisplayName(type: ActivityType): string {
    const typeNames: Record<string, string> = {
      team_create: '创建了团队',
      team_update: '更新了团队',
      team_member_join: '加入了团队',
      team_member_leave: '离开了团队',
      team_member_role_change: '修改了成员角色',
      space_create: '创建了空间',
      space_update: '更新了空间',
      space_delete: '删除了空间',
      space_member_join: '加入了空间',
      space_member_leave: '离开了空间',
      file_upload: '上传了文件',
      file_update: '更新了文件',
      file_delete: '删除了文件',
      file_move: '移动了文件',
      file_share: '分享了文件',
      folder_create: '创建了文件夹',
      folder_update: '更新了文件夹',
      folder_delete: '删除了文件夹',
      comment_create: '发表了评论',
      comment_reply: '回复了评论',
      mention: '提到了你',
    };
    return typeNames[type] || type;
  }
}

// 导出单例
export const teamSpaceManager = new TeamSpaceManager();
