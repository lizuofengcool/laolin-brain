/**
 * 邀请接受页（src/app/invite/page.tsx）「回跳记忆」契约测试
 *
 * 锁定 invite_redirect sessionStorage key 的设置/清理时机：
 *   - 无效 token（缺 token 参数）→ 不设置（清理旧值）
 *   - 未登录 + 有效 token → 设置 /invite?token=xxx（用户可能离开本页登录）
 *   - 已登录 + 邮箱匹配（可立即接受）→ 清理
 *   - 已登录 + 邮箱不匹配（需切换账号）→ 设置
 *   - 接受成功 → 清理
 *
 *   - useAppStore 提供 { isAuthenticated, hydrateAuth }（无 selector 调用）
 *   - next/navigation useRouter 提供 push stub
 *   - 内嵌 LoginForm 桩，避免真实组件的 store/router 调用干扰
 *   - global.fetch 经 vi.stubGlobal 路由 GET/POST /api/invitations/accept
 *   - token 经 window.history.pushState 注入到 window.location.search
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ---- hoisted mocks ----
const { mockUseAppStore, mockRouter } = vi.hoisted(() => ({
  mockUseAppStore: vi.fn(),
  mockRouter: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock("@/stores/app-store", () => ({
  useAppStore: (...args: unknown[]) => mockUseAppStore(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// 内嵌 LoginForm 桩：invite 页未登录分支渲染 <LoginForm/>，桩避免真实组件的
// useAppStore/useRouter 调用干扰本页 sessionStorage 契约断言。
vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: () => <div data-testid="login-form-stub" />,
}));

import InvitePage from "@/app/invite/page";

const TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const INVITE_URL = `/invite?token=${TOKEN}`;

/** 构造类 fetch 响应：仅提供组件使用的 ok/status/json 三字段。 */
function res(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function preview(
  over: Partial<{
    tenantName: string;
    role: string;
    invitedEmail: string;
    status: string;
    expiresAt: string;
    emailMatches: boolean;
  }> = {},
) {
  return {
    tenantName: "Acme 团队",
    role: "member",
    invitedEmail: "a@b.com",
    status: "pending",
    expiresAt: "2099-01-01T00:00:00.000Z",
    emailMatches: true,
    ...over,
  };
}

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);

  mockUseAppStore.mockReset();
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
  mockRouter.refresh.mockReset();

  sessionStorage.clear();
  localStorage.clear();
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

/** 设置 useAppStore 返回的认证状态（invite 页无 selector 调用，直接返回整对象）。 */
function setAuth(authed: boolean) {
  mockUseAppStore.mockReturnValue({
    isAuthenticated: authed,
    hydrateAuth: () => {},
  });
}

/** 路由 GET/POST /api/invitations/accept 的 fetch 实现。 */
function acceptFetch(opts: { get?: () => ReturnType<typeof res>; post?: () => ReturnType<typeof res> } = {}) {
  return async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && url.startsWith("/api/invitations/accept?")) {
      return opts.get?.() ?? res(preview());
    }
    if (method === "POST" && url === "/api/invitations/accept") {
      return opts.post?.() ?? res({ success: true, tenantId: "t-1" });
    }
    throw new Error(`Unexpected fetch ${method} ${url}`);
  };
}

describe("InvitePage - invite_redirect 回跳记忆", () => {
  it("无效 token（缺参数）：不设置 invite_redirect 并显示无效链接", async () => {
    setAuth(false);
    window.history.pushState({}, "", "/invite"); // 无 token 参数

    render(<InvitePage />);

    await waitFor(() => expect(screen.getByText("无效的邀请链接")).toBeInTheDocument());
    expect(sessionStorage.getItem("invite_redirect")).toBeNull();
  });

  it("未登录 + 有效 token：设置 invite_redirect", async () => {
    setAuth(false);
    window.history.pushState({}, "", INVITE_URL);

    render(<InvitePage />);

    await waitFor(() =>
      expect(sessionStorage.getItem("invite_redirect")).toBe(INVITE_URL),
    );
  });

  it("已登录 + 邮箱匹配（可立即接受）：清理 invite_redirect", async () => {
    setAuth(true);
    mockFetch.mockImplementation(acceptFetch({ get: () => res(preview({ emailMatches: true })) }));
    window.history.pushState({}, "", INVITE_URL);

    render(<InvitePage />);

    // 预览加载完成后，已登录 + 邮箱匹配 → 无需回跳
    await waitFor(() => expect(screen.getByText("团队邀请")).toBeInTheDocument());
    expect(sessionStorage.getItem("invite_redirect")).toBeNull();
  });

  it("已登录 + 邮箱不匹配（需切换账号）：设置 invite_redirect", async () => {
    setAuth(true);
    mockFetch.mockImplementation(acceptFetch({ get: () => res(preview({ emailMatches: false })) }));
    window.history.pushState({}, "", INVITE_URL);

    render(<InvitePage />);

    await waitFor(() =>
      expect(sessionStorage.getItem("invite_redirect")).toBe(INVITE_URL),
    );
    // 不匹配提示文案存在，佐证预览已就绪
    expect(screen.getByText(/当前登录账号不匹配/)).toBeInTheDocument();
  });

  it("接受邀请成功：清理 invite_redirect", async () => {
    setAuth(true);
    mockFetch.mockImplementation(
      acceptFetch({
        get: () => res(preview({ emailMatches: true, status: "pending" })),
        post: () => res({ success: true, tenantId: "t-1" }),
      }),
    );
    window.history.pushState({}, "", INVITE_URL);

    render(<InvitePage />);

    // 预览就绪 → 接受按钮可点击
    const acceptBtn = await screen.findByRole("button", { name: "接受邀请" });
    // 接受前：已登录 + 邮箱匹配 → 未设置 invite_redirect
    expect(sessionStorage.getItem("invite_redirect")).toBeNull();

    fireEvent.click(acceptBtn);

    // 接受成功 → phase=accepted，effect 清理（保持为 null）
    await waitFor(() => expect(screen.getByText("已成功加入团队")).toBeInTheDocument());
    expect(sessionStorage.getItem("invite_redirect")).toBeNull();
  });
});
