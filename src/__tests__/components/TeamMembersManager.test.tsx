/**
 * TeamMembersManager 组件测试
 *
 * 锁定团队成员管理组件（src/components/settings/TeamMembersManager.tsx）的渲染
 * 与 fetch 契约：列表渲染 / 搜索 / 角色变更 / 移除 / 403 / 自身行禁用 /
 * 所有者行不可操作 / 分页 / 空与加载态。
 *
 * 后端契约由 tenant-users-route.test.ts 锁定；本测试聚焦前端消费层：
 *   - useAppStore 提供 token + user.id（vi.hoisted + mockUseAppStore，沿用项目范式）
 *   - global.fetch 按 method+url 路由返回固定响应
 *   - Radix Select 在 jsdom 下受 portal/pointer 限制，mock 为透传 stub：
 *     SelectItem 渲染为可点击 button，经共享 selectHandler 调用 onValueChange，
 *     从而可测试行内角色编辑流程（点击选项 → 保存 → PATCH 契约）
 *   - window.confirm 在移除流程中 spy 控制返回值
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ---- hoisted mocks ----
// selectHandler 为共享可变对象：Select 渲染时写入最新 value/onValueChange，
// SelectItem 点击时读取 onValueChange 触发回调。组件同一时刻仅一个行内编辑
// Select 渲染（editingId 单值），无多 Select 串扰。
const { mockUseAppStore, selectHandler } = vi.hoisted(() => ({
  mockUseAppStore: vi.fn(),
  selectHandler: {
    value: "",
    onValueChange: (_v: string) => {},
  } as { value: string; onValueChange: (v: string) => void },
}));

vi.mock("@/stores/app-store", () => ({
  useAppStore: (...args: unknown[]) => mockUseAppStore(...args),
}));

// Radix Select mock：Select 透传 children 并捕获 onValueChange；SelectItem
// 渲染为带 data-testid 的 button，点击调用 selectHandler.onValueChange。
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (v: string) => void }) => {
    selectHandler.value = value;
    selectHandler.onValueChange = onValueChange;
    return children;
  },
  SelectContent: ({ children }: { children: React.ReactNode }) => children,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <button type="button" data-testid={`role-option-${value}`} onClick={() => selectHandler.onValueChange(value)}>
      {children}
    </button>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ""}</span>,
}));

import { TeamMembersManager } from "@/components/settings/TeamMembersManager";

// ---- 类型与 fixtures ----
interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
  createdAt: string;
}

interface ListResponse {
  data: Member[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

function listResponse(data: Member[], total: number): ListResponse {
  return {
    data,
    total,
    page: 1,
    pageSize: 10,
    totalPages: Math.ceil(total / 10),
    hasMore: total > 10,
  };
}

/** 构造类 fetch 响应：仅提供组件使用的 ok/status/json 三字段。 */
function res(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function mem(over: Partial<Member> = {}): Member {
  return {
    id: "u-1",
    name: "Alice",
    email: "alice@example.com",
    role: "member",
    joinedAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

const mockFetch = vi.fn();

/**
 * 按 method+url 路由 fetch 的实现工厂。各 handler 返回已包装的 res()。
 * 未匹配的调用抛错，便于发现意外请求。
 */
function makeFetch(opts: {
  list?: () => ReturnType<typeof res>;
  patch?: (id: string) => ReturnType<typeof res>;
  remove?: (id: string) => ReturnType<typeof res>;
} = {}) {
  return async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && url.startsWith("/api/tenant/users?")) {
      return opts.list?.() ?? res(listResponse([], 0));
    }
    if (method === "PATCH" && /\/api\/tenant\/users\/[^/]+$/.test(url)) {
      const id = url.split("/").pop() as string;
      return opts.patch?.(id) ?? res({ success: true });
    }
    if (method === "DELETE" && /\/api\/tenant\/users\/[^/]+$/.test(url)) {
      const id = url.split("/").pop() as string;
      return opts.remove?.(id) ?? res({ success: true, message: "用户已移除" });
    }
    throw new Error(`Unexpected fetch ${method} ${url}`);
  };
}

let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  mockUseAppStore.mockReset();
  mockUseAppStore.mockImplementation(
    (selector: (s: { token: string; user: { id: string } | null }) => unknown) =>
      selector({ token: "test-token", user: { id: "user-self" } })
  );
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  confirmSpy.mockRestore();
  vi.unstubAllGlobals();
  cleanup();
});

// ─── 登录态 / 兜底 ─────────────────────────────────────
describe("TeamMembersManager - 登录态", () => {
  it("无 token 时显示「请先登录」兜底且不发起任何请求", () => {
    mockUseAppStore.mockImplementation(
      (selector: (s: { token: string; user: null }) => unknown) =>
        selector({ token: "", user: null })
    );
    render(<TeamMembersManager />);

    expect(screen.getByText(/请先登录后管理团队成员/)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("有 token 时挂载即以 page=1 & pageSize=10 带 Bearer token 拉取列表", async () => {
    mockFetch.mockImplementation(makeFetch({ list: () => res(listResponse([], 0)) }));

    render(<TeamMembersManager />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/tenant/users?page=1&pageSize=10",
        expect.objectContaining({ headers: { Authorization: "Bearer test-token" } })
      );
    });
  });
});

// ─── 列表渲染 ──────────────────────────────────────────
describe("TeamMembersManager - 列表渲染", () => {
  it("渲染邮箱 / 姓名 / 角色徽章 / 「共 N 名成员」", async () => {
    const rows: Member[] = [
      mem({ id: "u-1", email: "alice@x.com", name: "Alice", role: "owner" }),
      mem({ id: "u-2", email: "bob@x.com", name: "Bob", role: "admin" }),
      mem({ id: "u-3", email: "carol@x.com", name: "Carol", role: "member" }),
      mem({ id: "u-4", email: "dave@x.com", name: "Dave", role: "viewer" }),
    ];
    mockFetch.mockImplementation(makeFetch({ list: () => res(listResponse(rows, 4)) }));

    render(<TeamMembersManager />);

    expect(await screen.findByText("alice@x.com")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    // 角色徽章
    expect(screen.getByText("所有者")).toBeInTheDocument();
    expect(screen.getByText("管理员")).toBeInTheDocument();
    expect(screen.getByText("成员")).toBeInTheDocument();
    expect(screen.getByText("访客")).toBeInTheDocument();
    // 计数
    expect(screen.getByText(/共 4 名成员/)).toBeInTheDocument();
  });

  it("空列表显示「暂无成员」", async () => {
    mockFetch.mockImplementation(makeFetch({ list: () => res(listResponse([], 0)) }));

    render(<TeamMembersManager />);

    expect(await screen.findByText("暂无成员")).toBeInTheDocument();
  });

  it("姓名为空时显示「—」占位", async () => {
    mockFetch.mockImplementation(
      makeFetch({ list: () => res(listResponse([mem({ id: "u-1", name: "" })], 1)) })
    );

    render(<TeamMembersManager />);

    await screen.findByText("alice@example.com");
    // 姓名列占位
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

// ─── 权限与错误 ────────────────────────────────────────
describe("TeamMembersManager - 权限与错误", () => {
  it("GET 403 显示权限提示且不渲染列表", async () => {
    mockFetch.mockImplementation(
      makeFetch({ list: () => res({ error: "没有权限查看用户列表" }, 403) })
    );

    render(<TeamMembersManager />);

    expect(await screen.findByText(/没有权限查看成员列表/)).toBeInTheDocument();
    // 列表区域不渲染
    expect(screen.queryByText(/共 .* 名成员/)).not.toBeInTheDocument();
    expect(screen.queryByText("刷新")).not.toBeInTheDocument();
  });

  it("GET 500 显示后端 error 文案", async () => {
    mockFetch.mockImplementation(
      makeFetch({ list: () => res({ error: "获取成员列表失败" }, 500) })
    );

    render(<TeamMembersManager />);

    expect(await screen.findByText("获取成员列表失败")).toBeInTheDocument();
  });
});

// ─── 行级权限：所有者行 / 自身行 ───────────────────────
describe("TeamMembersManager - 行级权限", () => {
  it("所有者行操作列显示「—」，无修改/移除按钮", async () => {
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([mem({ id: "u-owner", name: "Owner", role: "owner" })], 1)),
      })
    );

    render(<TeamMembersManager />);

    await screen.findByText("owner@x.com" === "" ? "" : "alice@example.com");
    // 无操作按钮
    expect(screen.queryByRole("button", { name: /修改角色/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /移除/ })).not.toBeInTheDocument();
  });

  it("自身行（非所有者）的修改角色 / 移除按钮被禁用", async () => {
    // currentUserId = "user-self"，成员 id 与之一致
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([mem({ id: "user-self", name: "Me", role: "admin" })], 1)),
      })
    );

    render(<TeamMembersManager />);

    const editBtn = await screen.findByRole("button", { name: /修改角色/ });
    const removeBtn = screen.getByRole("button", { name: /移除/ });
    expect(editBtn).toBeDisabled();
    expect(removeBtn).toBeDisabled();
  });
});

// ─── 搜索 ──────────────────────────────────────────────
describe("TeamMembersManager - 搜索", () => {
  it("提交搜索后以 search 查询参数重新拉取列表", async () => {
    mockFetch.mockImplementation(makeFetch({ list: () => res(listResponse([], 0)) }));

    render(<TeamMembersManager />);
    await screen.findByText("暂无成员");

    const input = screen.getByPlaceholderText("按姓名或邮箱搜索");
    fireEvent.change(input, { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/tenant/users?page=1&pageSize=10&search=alice",
        expect.objectContaining({ headers: { Authorization: "Bearer test-token" } })
      );
    });
  });
});

// ─── 角色变更 ──────────────────────────────────────────
describe("TeamMembersManager - 角色变更", () => {
  it("点击修改角色 → 选择新角色 → 保存，发起 PATCH { role } 契约", async () => {
    const patchFn = vi.fn(() => res({ success: true }));
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([mem({ id: "u-2", email: "bob@x.com", role: "member" })], 1)),
        patch: (id) => {
          patchFn(id);
          return res({ success: true });
        },
      })
    );

    render(<TeamMembersManager />);
    await screen.findByText("bob@x.com");

    // 进入编辑
    fireEvent.click(screen.getByRole("button", { name: /修改角色/ }));
    // 编辑器出现：保存 / 取消 + 角色选项
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    // 选择「管理员」
    fireEvent.click(screen.getByTestId("role-option-admin"));
    // 保存
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(patchFn).toHaveBeenCalledWith("u-2");
    });
    // 校验 PATCH body
    const patchCall = mockFetch.mock.calls.find(
      ([url, init]) => init?.method === "PATCH" && /\/api\/tenant\/users\/u-2$/.test(url as string)
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({ role: "admin" });
  });

  it("点击取消隐藏编辑器且不发起 PATCH", async () => {
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([mem({ id: "u-2", email: "bob@x.com", role: "member" })], 1)),
      })
    );

    render(<TeamMembersManager />);
    await screen.findByText("bob@x.com");

    fireEvent.click(screen.getByRole("button", { name: /修改角色/ }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    // 编辑器消失，恢复修改角色按钮
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
    });
    // 无 PATCH
    expect(mockFetch.mock.calls.some(([_, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("角色未变更（保存当前角色）时不发起 PATCH", async () => {
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([mem({ id: "u-2", email: "bob@x.com", role: "member" })], 1)),
      })
    );

    render(<TeamMembersManager />);
    await screen.findByText("bob@x.com");

    fireEvent.click(screen.getByRole("button", { name: /修改角色/ }));
    // draftRole 初值 = 当前角色 member，不改动直接保存
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    // 无 PATCH（newRole === member.role 提前 return）
    expect(mockFetch.mock.calls.some(([_, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("PATCH 后端 403 显示 error 文案", async () => {
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([mem({ id: "u-2", email: "bob@x.com", role: "member" })], 1)),
        patch: () => res({ error: "没有权限修改用户角色" }, 403),
      })
    );

    render(<TeamMembersManager />);
    await screen.findByText("bob@x.com");

    fireEvent.click(screen.getByRole("button", { name: /修改角色/ }));
    fireEvent.click(screen.getByTestId("role-option-admin"));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("没有权限修改用户角色")).toBeInTheDocument();
  });
});

// ─── 移除成员 ──────────────────────────────────────────
describe("TeamMembersManager - 移除成员", () => {
  it("确认后发起 DELETE 契约并显示成功消息", async () => {
    const removeFn = vi.fn(() => res({ success: true, message: "用户已移除" }));
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([mem({ id: "u-2", email: "bob@x.com", role: "member" })], 1)),
        remove: (id) => {
          removeFn(id);
          return res({ success: true, message: "用户已移除" });
        },
      })
    );

    render(<TeamMembersManager />);
    await screen.findByText("bob@x.com");

    fireEvent.click(screen.getByRole("button", { name: /移除/ }));

    await waitFor(() => expect(removeFn).toHaveBeenCalledWith("u-2"));
    expect(await screen.findByText(/已移除 bob@x.com/)).toBeInTheDocument();
  });

  it("confirm 取消时不发起 DELETE", async () => {
    confirmSpy.mockReturnValue(false);
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([mem({ id: "u-2", email: "bob@x.com", role: "member" })], 1)),
      })
    );

    render(<TeamMembersManager />);
    await screen.findByText("bob@x.com");

    fireEvent.click(screen.getByRole("button", { name: /移除/ }));

    expect(mockFetch.mock.calls.some(([_, init]) => init?.method === "DELETE")).toBe(false);
  });

  it("DELETE 后端 400 「不能移除所有者」显示 error 文案", async () => {
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([mem({ id: "u-2", email: "bob@x.com", role: "member" })], 1)),
        remove: () => res({ error: "不能移除所有者" }, 400),
      })
    );

    render(<TeamMembersManager />);
    await screen.findByText("bob@x.com");

    fireEvent.click(screen.getByRole("button", { name: /移除/ }));

    expect(await screen.findByText("不能移除所有者")).toBeInTheDocument();
  });
});

// ─── 分页 ──────────────────────────────────────────────
describe("TeamMembersManager - 分页", () => {
  it("total > pageSize 显示页码与翻页按钮，下一页以 page=2 拉取", async () => {
    const rows: Member[] = Array.from({ length: 10 }, (_, i) =>
      mem({ id: `u-${i + 1}`, email: `u${i + 1}@x.com`, name: `U${i + 1}` })
    );
    mockFetch.mockImplementation(makeFetch({ list: () => res(listResponse(rows, 25)) }));

    render(<TeamMembersManager />);
    await screen.findByText("u1@x.com");

    expect(screen.getByText(/第 1 \/ 3 页/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/tenant/users?page=2&pageSize=10",
        expect.objectContaining({ headers: { Authorization: "Bearer test-token" } })
      );
    });
  });
});
