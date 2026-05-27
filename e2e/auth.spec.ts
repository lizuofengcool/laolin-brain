import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Authentication flow.
 *
 * The app uses an SPA pattern with Zustand state for view switching.
 * Login page is at `/` with `currentView: "login"`.
 * After login, the dashboard view renders.
 */

const TEST_USER = {
  name: 'E2E Test User',
  email: `e2e-test-${Date.now()}@example.com`,
  password: 'testpass1234',
};

test.describe('Authentication Flow', () => {
  test('should show the login form on initial load', async ({ page }) => {
    await page.goto('/');

    // Clear any stored auth state so we see the login page
    await page.evaluate(() => {
      localStorage.removeItem('kb_token');
      localStorage.removeItem('kb_user');
    });
    await page.reload();

    // Verify login form is visible
    await expect(page.getByText('智能文档知识库')).toBeVisible();
    await expect(page.getByText('登录')).toBeVisible(); // submit button
    await expect(page.getByLabel('邮箱')).toBeVisible();
    await expect(page.getByLabel('密码')).toBeVisible();
  });

  test('should switch to registration form', async ({ page }) => {
    await page.goto('/');

    // Clear auth state
    await page.evaluate(() => {
      localStorage.removeItem('kb_token');
      localStorage.removeItem('kb_user');
    });
    await page.reload();

    // Click "立即注册" link
    await page.getByText('立即注册').click();

    // Verify registration form elements appear
    await expect(page.getByLabel('用户名')).toBeVisible();
    await expect(page.getByLabel('邮箱')).toBeVisible();
    await expect(page.getByLabel('密码')).toBeVisible();
    await expect(page.getByText('注册')).toBeVisible(); // submit button changed
  });

  test('should register a new user and redirect to dashboard', async ({ page }) => {
    await page.goto('/');

    // Clear auth state
    await page.evaluate(() => {
      localStorage.removeItem('kb_token');
      localStorage.removeItem('kb_user');
    });
    await page.reload();

    // Switch to registration form
    await page.getByText('立即注册').click();

    // Fill registration form
    await page.getByLabel('用户名').fill(TEST_USER.name);
    await page.getByLabel('邮箱').fill(TEST_USER.email);
    await page.getByLabel('密码').fill(TEST_USER.password);

    // Submit registration
    await page.getByRole('button', { name: '注册' }).click();

    // Wait for dashboard to appear (SPA transition)
    // The dashboard shows a welcome message after login
    await expect(page.getByText(/欢迎回来/i)).toBeVisible({ timeout: 15_000 });

    // Verify we're no longer on the login page
    await expect(page.getByLabel('密码')).not.toBeVisible();
  });

  test('should login with registered credentials', async ({ page }) => {
    // First register
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('kb_token');
      localStorage.removeItem('kb_user');
    });
    await page.reload();

    await page.getByText('立即注册').click();
    await page.getByLabel('用户名').fill(TEST_USER.name);
    await page.getByLabel('邮箱').fill(TEST_USER.email);
    await page.getByLabel('密码').fill(TEST_USER.password);
    await page.getByRole('button', { name: '注册' }).click();
    await expect(page.getByText(/欢迎回来/i)).toBeVisible({ timeout: 15_000 });

    // Logout first
    await page.evaluate(() => {
      localStorage.removeItem('kb_token');
      localStorage.removeItem('kb_user');
    });
    await page.reload();

    // Now we should see login form again
    await expect(page.getByText('智能文档知识库')).toBeVisible();

    // Fill login form (no username field in login mode)
    await page.getByLabel('邮箱').fill(TEST_USER.email);
    await page.getByLabel('密码').fill(TEST_USER.password);

    // Submit login
    await page.getByRole('button', { name: '登录' }).click();

    // Verify dashboard shows
    await expect(page.getByText(/欢迎回来/i)).toBeVisible({ timeout: 15_000 });
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('kb_token');
      localStorage.removeItem('kb_user');
    });
    await page.reload();

    // Try to login with wrong credentials
    await page.getByLabel('邮箱').fill('nonexistent@example.com');
    await page.getByLabel('密码').fill('wrongpassword');

    await page.getByRole('button', { name: '登录' }).click();

    // Verify error message appears
    await expect(page.getByText(/登录失败|Invalid/i)).toBeVisible({ timeout: 10_000 });
  });

  test('should logout and redirect to login', async ({ page }) => {
    // Register and login first
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('kb_token');
      localStorage.removeItem('kb_user');
    });
    await page.reload();

    await page.getByText('立即注册').click();
    await page.getByLabel('用户名').fill(TEST_USER.name);
    await page.getByLabel('邮箱').fill(TEST_USER.email);
    await page.getByLabel('密码').fill(TEST_USER.password);
    await page.getByRole('button', { name: '注册' }).click();
    await expect(page.getByText(/欢迎回来/i)).toBeVisible({ timeout: 15_000 });

    // Logout via sidebar
    await page.getByRole('button', { name: '退出登录' }).click();

    // Verify we're back on the login page
    await expect(page.getByText('智能文档知识库')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('邮箱')).toBeVisible();
    await expect(page.getByLabel('密码')).toBeVisible();
  });
});
