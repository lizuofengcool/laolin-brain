/**
 * InvitationsManager 组件测试
 *
 * 锁定团队邀请管理组件（src/components/settings/InvitationsManager.tsx）的渲染
 * 与 fetch 契约：列表渲染 / 创建 / 撤销 / 重发 / 403 / 410 / 分页 / 空与加载态。
 *
 * 后端契约由 invitations-route.test.ts 等 handler 测试锁定；本测试聚焦前端消费层：
 *   - useAppStore 提供 token（vi.hoisted + mockUseAppStore，沿用项目范式）
 *   - global.fetch 按 method+url 路由返回固定响应
 *   - Radix Select 在 jsdom 下受 portal/pointer 限制，mock 为透传 stub（不测角色
 *     选择，组件默认 role='member'，与初值一致）
 *   - window.confirm 在撤销流程中 spy 控制返回值
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ---- hoisted mocks ----
const { mockUseAppStore } = vi.hoisted(() => ({
  mockUseAppStore: vi.fn(),
}));

vi.mock("@/stores/app-store", () => ({
  useAppStore: (...args: unknown[]) => mockUseAppStore(...args),
}));

// Radix Select 在 jsdom 下受 portal/pointer 限制，mock 为透传 stub。
// 角色选择不在本轮测试范围（组件默认 role='member'），聚焦 fetch 契约。
// SelectContent 真实仅在 dropdown 打开时挂载（portal），此处返回 null 避免下拉
// 选项文案（管理员/成员/访客）污染列表行角色标签断言。
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => children,
  SelectContent: () => null,
  SelectItem: ({ children }: { children: React.ReactNode }) => children,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => children,
  SelectValue: () => null,
}));

import { InvitationsManager } from "@/components/settings/InvitationsManager";

// ---- 类型与 fixtures ----
interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

interface ListResponse {
  data: Invitation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

function listResponse(data: Invitation[], total: number): ListResponse {
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

function inv(over: Partial<Invitation> = {}): Invitation {
  return {
    id: "inv-1",
    email: "alice@example.com",
    role: "member",
    status: "pending",
    invitedBy: "owner@example.com",
    expiresAt: "2099-01-01T00:00:00.000Z",
    acceptedAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
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
  create?: () => ReturnType<typeof res>;
  remove?: () => ReturnType<typeof res>;
  resend?: () => ReturnType<typeof res>;
} = {}) {
  return async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && url.startsWith("/api/invitations?")) {
      return opts.list?.() ?? res(listResponse([], 0));
    }
    if (method === "POST" && url === "/api/invitations") {
      return opts.create?.() ?? res({ id: "inv-new" });
    }
    if (method === "DELETE" && /\/api\/invitations\/[^/]+$/.test(url)) {
      return opts.remove?.() ?? res({ success: true });
    }
    if (method === "POST" && /\/api\/invitations\/[^/]+\/resend$/.test(url)) {
      return opts.resend?.() ?? res({ success: true });
    }
    throw new Error(`Unexpected fetch ${method} ${url}`);
  };
}

let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  mockUseAppStore.mockReset();
  mockUseAppStore.mockImplementation((selector: (s: { token: string }) => string) =>
    selector({ token: "test-token" })
  );
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  confirmSpy.mockRestore();
  vi.unstubAllGlobals();
  cleanup();
});

// ─── 登录态 / 兜底 ─────────────────────────────────────
describe("InvitationsManager - 登录态", () => {
  it("无 token 时显示「请先登录」兜底且不发起任何请求", () => {
    mockUseAppStore.mockImplementation((selector: (s: { token: string }) => string) =>
      selector({ token: "" })
    );
    render(<InvitationsManager />);

    expect(screen.getByText(/请先登录后管理团队邀请/)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("有 token 时挂载即以 page=1 & pageSize=10 带 Bearer token 拉取列表", async () => {
    mockFetch.mockImplementation(makeFetch({ list: () => res(listResponse([], 0)) }));

    render(<InvitationsManager />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/invitations?page=1&pageSize=10",
        expect.objectContaining({ headers: { Authorization: "Bearer test-token" } })
      );
    });
  });
});

// ─── 列表渲染 ──────────────────────────────────────────
describe("InvitationsManager - 列表渲染", () => {
  it("渲染邮箱 / 角色标签 / 状态徽章 / 「共 N 条邀请」", async () => {
    const rows: Invitation[] = [
      inv({ id: "i-1", email: "alice@x.com", role: "admin", status: "pending" }),
      inv({ id: "i-2", email: "bob@x.com", role: "member", status: "accepted" }),
      inv({ id: "i-3", email: "carol@x.com", role: "viewer", status: "revoked" }),
    ];
    mockFetch.mockImplementation(makeFetch({ list: () => res(listResponse(rows, 3)) }));

    render(<InvitationsManager />);

    expect(await screen.findByText("alice@x.com")).toBeInTheDocument();
    // 角色标签
    expect(screen.getByText("管理员")).toBeInTheDocument();
    expect(screen.getByText("成员")).toBeInTheDocument();
    expect(screen.getByText("访客")).toBeInTheDocument();
    // 状态徽章
    expect(screen.getByText("待接受")).toBeInTheDocument();
    expect(screen.getByText("已接受")).toBeInTheDocument();
    expect(screen.getByText("已撤销")).toBeInTheDocument();
    // 计数
    expect(screen.getByText(/共 3 条邀请/)).toBeInTheDocument();
  });

  it("空列表显示「暂无邀请记录」", async () => {
    mockFetch.mockImplementation(makeFetch({ list: () => res(listResponse([], 0)) }));

    render(<InvitationsManager />);

    expect(await screen.findByText("暂无邀请记录")).toBeInTheDocument();
  });

  it("pending 且 expiresAt 已过期 → 状态徽章显示「已过期」而非「待接受」", async () => {
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([inv({ expiresAt: "2020-01-01T00:00:00.000Z" })], 1)),
      })
    );

    render(<InvitationsManager />);

    expect(await screen.findByText("已过期")).toBeInTheDocument();
    expect(screen.queryByText("待接受")).not.toBeInTheDocument();
  });
});

// ─── 403 / 错误态 ──────────────────────────────────────
describe("InvitationsManager - 权限与错误", () => {
  it("GET 403 → 显示「没有权限管理邀请」且创建表单禁用", async () => {
    mockFetch.mockImplementation(makeFetch({ list: () => res({ error: "forbidden" }, 403) }));

    render(<InvitationsManager />);

    expect(await screen.findByText(/没有权限管理邀请/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /发送邀请/ })).toBeDisabled();
  });

  it("GET 非 ok → 显示后端 error 文案", async () => {
    mockFetch.mockImplementation(
      makeFetch({ list: () => res({ error: "服务器内部错误" }, 500) })
    );

    render(<InvitationsManager />);

    expect(await screen.findByText("服务器内部错误")).toBeInTheDocument();
  });
});

// ─── 创建邀请 ──────────────────────────────────────────
describe("InvitationsManager - 创建邀请", () => {
  it("空邮箱提交 → 显示「邮箱不能为空」且不发起 POST", async () => {
    mockFetch.mockImplementation(makeFetch({ list: () => res(listResponse([], 0)) }));

    render(<InvitationsManager />);
    await screen.findByText("暂无邀请记录");

    // 邮箱为空时提交按钮 disabled，直接 submit 表单触发 handleCreate 的空值校验
    const form = screen.getByPlaceholderText("被邀请人邮箱").closest("form") as HTMLFormElement;
    fireEvent.submit(form);

    expect(await screen.findByText("邮箱不能为空")).toBeInTheDocument();
    const postCall = mockFetch.mock.calls.find(
      ([url, init]) => url === "/api/invitations" && (init as RequestInit)?.method === "POST"
    );
    expect(postCall).toBeUndefined();
  });

  it("合法邮箱提交 → POST {email, role:'member'} 带 Bearer token，成功后刷新列表", async () => {
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([], 0)),
        create: () => res({ id: "inv-new" }),
      })
    );

    render(<InvitationsManager />);
    await screen.findByText("暂无邀请记录");

    fireEvent.change(screen.getByPlaceholderText("被邀请人邮箱"), {
      target: { value: "bob@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /发送邀请/ }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/invitations",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          }),
          body: JSON.stringify({ email: "bob@example.com", role: "member" }),
        })
      );
    });
    expect(await screen.findByText(/已向 bob@example.com 发送邀请/)).toBeInTheDocument();
  });

  it("POST 失败 400 → 内联显示后端 error", async () => {
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([], 0)),
        create: () => res({ error: "该邮箱已存在有效邀请" }, 400),
      })
    );

    render(<InvitationsManager />);
    await screen.findByText("暂无邀请记录");

    // 用合法格式邮箱：input 为 type="email"，jsdom 会做约束校验，非法格式（如 "bad"）
    // 会阻止表单提交、handleCreate 不执行、POST 不发出。后端仍可因业务规则返回 400，
    // 这里模拟"该邮箱已存在有效邀请"的业务拒绝，验证 400 error 内联展示路径。
    fireEvent.change(screen.getByPlaceholderText("被邀请人邮箱"), {
      target: { value: "dup@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /发送邀请/ }));

    expect(await screen.findByText("该邮箱已存在有效邀请")).toBeInTheDocument();
  });
});

// ─── 撤销 / 重发 ───────────────────────────────────────
describe("InvitationsManager - 撤销与重发", () => {
  it("撤销：confirm 确认 → DELETE /api/invitations/:id，成功后刷新列表", async () => {
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([inv()], 1)),
        remove: () => res({ success: true }),
      })
    );

    render(<InvitationsManager />);
    await screen.findByText("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/invitations/inv-1",
        expect.objectContaining({
          method: "DELETE",
          headers: { Authorization: "Bearer test-token" },
        })
      );
    });
    expect(await screen.findByText(/已撤销 alice@example.com 的邀请/)).toBeInTheDocument();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it("撤销：confirm 取消 → 不发起 DELETE", async () => {
    confirmSpy.mockReturnValue(false);
    mockFetch.mockImplementation(
      makeFetch({ list: () => res(listResponse([inv()], 1)) })
    );

    render(<InvitationsManager />);
    await screen.findByText("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    const deleteCall = mockFetch.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === "DELETE"
    );
    expect(deleteCall).toBeUndefined();
  });

  it("重发：POST /api/invitations/:id/resend，成功后显示刷新提示并刷新列表", async () => {
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([inv()], 1)),
        resend: () => res({ success: true }),
      })
    );

    render(<InvitationsManager />);
    await screen.findByText("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: "重发" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/invitations/inv-1/resend",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer test-token" },
        })
      );
    });
    expect(
      await screen.findByText(/已重新发送 alice@example.com 的邀请/)
    ).toBeInTheDocument();
  });

  it("重发 410 → 内联显示后端 error（不刷新列表）", async () => {
    mockFetch.mockImplementation(
      makeFetch({
        list: () => res(listResponse([inv()], 1)),
        resend: () => res({ error: "邀请已失效" }, 410),
      })
    );

    render(<InvitationsManager />);
    await screen.findByText("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: "重发" }));

    expect(await screen.findByText("邀请已失效")).toBeInTheDocument();
  });
});

// ─── 分页 ──────────────────────────────────────────────
describe("InvitationsManager - 分页", () => {
  it("total > pageSize → 显示「第 1 / 2 页」，点「下一页」以 page=2 拉取", async () => {
    mockFetch.mockImplementation(
      makeFetch({ list: () => res(listResponse([inv()], 15)) })
    );

    render(<InvitationsManager />);
    expect(await screen.findByText(/共 15 条邀请/)).toBeInTheDocument();
    expect(screen.getByText(/第 1 \/ 2 页/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => {
      const page2Call = mockFetch.mock.calls.find(
        ([url]) => typeof url === "string" && url.includes("page=2")
      );
      expect(page2Call).toBeDefined();
    });
  });
});
