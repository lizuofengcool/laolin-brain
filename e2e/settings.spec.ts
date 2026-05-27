import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for Settings view.
 *
 * Settings page displays:
 * - Account info (name, email, user ID, storage mode)
 * - Storage mode switch (local vs cloud)
 * - Data backup & export (JSON)
 * - Data import
 * - ZIP backup & restore (BackupRestore component)
 */

const TEST_USER = {
  name: 'Settings E2E User',
  email: `e2e-settings-${Date.now()}@example.com`,
  password: 'testpass1234',
};

/**
 * Helper: register and login, returns when the dashboard is visible.
 */
async function registerAndLogin(page: Page) {
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
}

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test('should navigate to settings view', async ({ page }) => {
    // Navigate via sidebar
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 10_000 });
  });

  test('should display account information', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 10_000 });

    // Verify account info card is visible
    await expect(page.getByText('账号信息')).toBeVisible();

    // Verify user name is displayed
    await expect(page.getByText(TEST_USER.name)).toBeVisible();

    // Verify user email is displayed
    await expect(page.getByText(TEST_USER.email)).toBeVisible();
  });

  test('should display storage mode', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 10_000 });

    // Verify storage mode label
    await expect(page.getByText('存储模式').first()).toBeVisible();

    // Verify storage mode badge (either local or cloud)
    await expect(
      page.locator('text=/💾 本地|☁️ 云端/')
    ).toBeVisible();

    // Verify the storage switch card is visible with both options
    await expect(page.getByText('本地存储 (IndexedDB)')).toBeVisible();
    await expect(page.getByText('云端存储 (服务端)')).toBeVisible();
  });

  test('should display local storage as default', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 10_000 });

    // The default storage mode should be "local"
    // Verify the local option has the active styling (border-primary)
    const localOption = page.locator('text=本地存储 (IndexedDB)').locator('..');
    await expect(localOption).toBeVisible();

    // The user's storage mode badge should show local
    await expect(page.getByText(/💾 本地/)).toBeVisible();
  });

  test('should show backup and restore section', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 10_000 });

    // Verify ZIP backup section
    await expect(page.getByText('ZIP 备份与恢复')).toBeVisible();

    // Verify backup button exists
    await expect(page.getByRole('button', { name: '导出 ZIP 备份' })).toBeVisible();

    // Verify restore button exists
    await expect(page.getByRole('button', { name: '从备份恢复' })).toBeVisible();
  });

  test('should show data export section', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 10_000 });

    // Verify data export card
    await expect(page.getByText('数据备份与导出')).toBeVisible();
    await expect(page.getByRole('button', { name: '导出数据 (JSON)' })).toBeVisible();
  });

  test('should show data import section', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 10_000 });

    // Verify data import card
    await expect(page.getByText('数据导入')).toBeVisible();
  });

  test('should navigate to settings via header dropdown', async ({ page }) => {
    // Click the user avatar dropdown in the header
    const avatarButton = page.locator('button').filter({ has: page.locator('text=' + TEST_USER.name.charAt(0).toUpperCase()) }).first();
    await expect(avatarButton).toBeVisible();
    await avatarButton.click();

    // Click "设置" in the dropdown
    await page.getByText('设置').click();

    // Verify settings view
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 10_000 });
  });
});
