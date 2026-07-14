/**
 * LoginForm 组件测试
 *
 * 锁定登录/注册表单（src/components/auth/LoginForm.tsx）的「邀请回跳」契约：
 * 登录成功后读取 sessionStorage 的 invite_redirect，消费（removeItem）并
 * router.push 回邀请页；回跳目标即当前页（/invite 内嵌登录）时跳过导航但仍消费；
 * 无 invite_redirect 时维持默认（不跳转）；登录失败时不消费、不跳转。
 *
 *   - useAppStore 提供 login（vi.hoisted + mockUseAppStore，沿用项目范式）
 *   - next/navigation useRouter 提供 push spy
 *   - global.fetch 经 vi.stubGlobal 返回登录响应
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ---- hoisted mocks ----
const { mockUseAppStore, mockRouter, loginSpy } = vi.hoisted(() => ({
  mockUseAppStore: vi.fn(),
  mockRouter: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  loginSpy: vi.fn(),
}));

vi.mock("@/stores/app-store", () => ({
  useAppStore: (...args: unknown[]) => mockUseAppStore(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { LoginForm } from "@/components/auth/LoginForm";

/** 构造类 fetch 响应：仅提供组件使用的 ok/status/json 三字段。 */
function res(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const INVITE_URL = `/invite?token=${TOKEN}`;

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string) => {
    if (url === "/api/auth/login") {
      return res({ user: { id: "u-1", email: "a@b.com", name: "A" }, token: "tok-1" });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", mockFetch);

  mockUseAppStore.mockReset();
  mockUseAppStore.mockReturnValue({ login: loginSpy });

  loginSpy.mockReset();
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
  mockRouter.refresh.mockReset();

  sessionStorage.clear();
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

/** 填写邮箱/密码并提交登录表单，等待 login 被调用。 */
async function submitLogin(password = "password1") {
  fireEvent.change(screen.getByPlaceholderText("请输入邮箱"), { target: { value: "a@b.com" } });
  fireEvent.change(screen.getByPlaceholderText("请输入密码"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  await waitFor(() => expect(loginSpy).toHaveBeenCalled());
}

describe("LoginForm - 邀请回跳", () => {
  it("无 invite_redirect：登录成功不跳转", async () => {
    render(<LoginForm />);
    await submitLogin();

    expect(loginSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u-1", email: "a@b.com" }),
      "tok-1",
    );
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("invite_redirect")).toBeNull();
  });

  it("有 invite_redirect 且目标不同于当前页：push 到目标并消费", async () => {
    sessionStorage.setItem("invite_redirect", INVITE_URL);
    // 当前在根路径（非 /invite），应触发导航
    window.history.pushState({}, "", "/");

    render(<LoginForm />);
    await submitLogin();

    expect(mockRouter.push).toHaveBeenCalledWith(INVITE_URL);
    expect(sessionStorage.getItem("invite_redirect")).toBeNull();
  });

  it("回跳目标即当前页（/invite 内嵌登录）：跳过导航但仍消费", async () => {
    sessionStorage.setItem("invite_redirect", INVITE_URL);
    window.history.pushState({}, "", INVITE_URL); // 已在邀请页内嵌登录

    render(<LoginForm />);
    await submitLogin();

    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("invite_redirect")).toBeNull();
  });

  it("登录失败：不消费 invite_redirect、不跳转", async () => {
    mockFetch.mockImplementation(async () => res({ error: "密码错误" }, 401));
    sessionStorage.setItem("invite_redirect", INVITE_URL);

    render(<LoginForm />);
    fireEvent.change(screen.getByPlaceholderText("请输入邮箱"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("请输入密码"), { target: { value: "wrongpass" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(screen.getByText("密码错误")).toBeInTheDocument());
    expect(loginSpy).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    // 失败路径不读取/消费 invite_redirect，原值保留
    expect(sessionStorage.getItem("invite_redirect")).toBe(INVITE_URL);
  });
});
