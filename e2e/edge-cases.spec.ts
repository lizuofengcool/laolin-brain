import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for edge cases.
 *
 * Covers:
 * - Empty state views (no files, empty recycle bin, empty favorites)
 * - Form validation (empty email, empty password on register)
 * - Long filename handling
 * - Duplicate navigation (click same nav item twice)
 */

const TEST_USER = {
  name: 'Edge Case E2E User',
  email: `e2e-edge-${Date.now()}@example.com`,
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

test.describe('Edge Case: Empty State Views', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test('should show empty state in files view when no files uploaded', async ({ page }) => {
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 15_000 });

    // Upload zone should be visible
    await expect(page.getByText('拖拽文件到此处，或点击上传')).toBeVisible();

    // Empty state message should show
    await expect(page.getByText('暂无文件')).toBeVisible({ timeout: 10_000 });
  });

  test('should show empty state in favorites view when nothing is favorited', async ({ page }) => {
    await page.getByRole('button', { name: '收藏夹' }).click();
    await expect(page.getByRole('heading', { name: '收藏夹' })).toBeVisible({ timeout: 15_000 });

    // Empty favorites message
    await expect(page.getByText('暂无收藏')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('点击文件卡片上的星标来收藏文件')).toBeVisible();
  });

  test('should show empty state in recycle bin when no files deleted', async ({ page }) => {
    await page.getByRole('button', { name: '回收站' }).click();
    await expect(page.getByRole('heading', { name: '回收站' })).toBeVisible({ timeout: 15_000 });

    // Empty recycle bin message
    await expect(page.getByText('回收站为空')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('删除的文件会出现在这里')).toBeVisible();
  });

  test('should show empty state in search when no query matches', async ({ page }) => {
    await page.getByRole('button', { name: '搜索' }).click();
    await expect(page.getByRole('heading', { name: '搜索文件' })).toBeVisible({ timeout: 15_000 });

    // Search for something that definitely doesn't exist
    const searchInput = page.getByPlaceholder('搜索文件名、文档内容、标签...');
    await searchInput.fill('nonexistent-file-xyz-999');
    await page.getByRole('button', { name: '搜索' }).click();

    // Wait for search to process
    await page.waitForTimeout(3_000);

    // Should show empty or no results state
    await expect(
      page.locator('text=/搜索你的文件|搜索结果|0 个结果|暂无/i')
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Edge Case: Form Validation', () => {
  test('should show validation error when registering with empty email', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('kb_token');
      localStorage.removeItem('kb_user');
    });
    await page.reload();

    // Switch to register
    await page.getByText('立即注册').click();
    await expect(page.getByLabel('用户名')).toBeVisible();

    // Fill only username and password, leave email empty
    await page.getByLabel('用户名').fill('Test User');
    await page.getByLabel('密码').fill('testpass1234');

    // Try to submit
    await page.getByRole('button', { name: '注册' }).click();

    // The browser's built-in HTML5 validation should block submission
    // The email input should show a validation message or remain on the page
    // We should still see the registration form (not redirected)
    await expect(page.getByLabel('用户名')).toBeVisible({ timeout: 2_000 });

    // Verify we are NOT on the dashboard
    await expect(page.getByText(/欢迎回来/i)).not.toBeVisible();
  });

  test('should show validation error when registering with empty password', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('kb_token');
      localStorage.removeItem('kb_user');
    });
    await page.reload();

    // Switch to register
    await page.getByText('立即注册').click();
    await expect(page.getByLabel('用户名')).toBeVisible();

    // Fill only username and email, leave password empty
    await page.getByLabel('用户名').fill('Test User');
    await page.getByLabel('邮箱').fill('test@example.com');

    // Try to submit
    await page.getByRole('button', { name: '注册' }).click();

    // Browser validation should prevent submission
    await expect(page.getByLabel('用户名')).toBeVisible({ timeout: 2_000 });
    await expect(page.getByText(/欢迎回来/i)).not.toBeVisible();
  });

  test('should show validation error when logging in with empty email', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('kb_token');
      localStorage.removeItem('kb_user');
    });
    await page.reload();

    // Try to login without filling email
    await page.getByLabel('密码').fill('somepassword');
    await page.getByRole('button', { name: '登录' }).click();

    // Browser validation should block submission
    await expect(page.getByText('智能文档知识库')).toBeVisible({ timeout: 2_000 });
    await expect(page.getByText(/欢迎回来/i)).not.toBeVisible();
  });

  test('should show validation error when logging in with empty password', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('kb_token');
      localStorage.removeItem('kb_user');
    });
    await page.reload();

    // Try to login without filling password
    await page.getByLabel('邮箱').fill('test@example.com');
    await page.getByRole('button', { name: '登录' }).click();

    // Browser validation should block submission
    await expect(page.getByText('智能文档知识库')).toBeVisible({ timeout: 2_000 });
    await expect(page.getByText(/欢迎回来/i)).not.toBeVisible();
  });
});

test.describe('Edge Case: Long Filename Handling', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test('should upload a file with a very long filename and display it', async ({ page }) => {
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 15_000 });

    // Generate a long filename (100+ characters)
    const longName = 'a-very-long-filename-for-testing-truncation-in-the-file-card-display-area-' +
      'this-should-be-truncated-with-ellipsis-when-displayed-in-the-ui-component.txt';

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByText('拖拽文件到此处，或点击上传').click(),
    ]);

    await fileChooser.setFiles({
      name: longName,
      mimeType: 'text/plain',
      buffer: Buffer.from('Long filename test content'),
    });

    // Wait for upload
    await page.waitForTimeout(5_000);

    // The file should appear — the UI should truncate with ellipsis, but the element exists
    // We check for a partial match since the full name may be truncated
    await expect(page.getByText(longName.slice(0, 20))).toBeVisible({ timeout: 15_000 });

    // Verify the card title attribute contains the full name
    const fileTitle = page.getByText(longName.slice(0, 20)).first();
    await expect(fileTitle).toHaveAttribute('title', longName);
  });
});

test.describe('Edge Case: Duplicate Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test('should handle clicking the same navigation item twice (files)', async ({ page }) => {
    // Click files nav item
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 15_000 });

    // Click the same nav item again
    await page.getByRole('button', { name: '文件管理' }).click();

    // Should still be on files view (no crash, no unexpected redirect)
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('拖拽文件到此处，或点击上传')).toBeVisible();
  });

  test('should handle clicking the same navigation item twice (dashboard)', async ({ page }) => {
    // We're on dashboard after login
    await expect(page.getByText(/欢迎回来/i)).toBeVisible();

    // Click dashboard nav item
    await page.getByRole('button', { name: '仪表盘' }).click();

    // Click again
    await page.getByRole('button', { name: '仪表盘' }).click();

    // Should still be on dashboard (no crash)
    await expect(page.getByText(/欢迎回来/i)).toBeVisible({ timeout: 5_000 });
  });

  test('should handle clicking the same navigation item twice (settings)', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 15_000 });

    // Click again
    await page.getByRole('button', { name: '设置' }).click();

    // Should still be on settings (no crash, no unexpected redirect)
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('账号信息')).toBeVisible();
  });

  test('should handle clicking the same navigation item twice (search)', async ({ page }) => {
    await page.getByRole('button', { name: '搜索' }).click();
    await expect(page.getByRole('heading', { name: '搜索文件' })).toBeVisible({ timeout: 15_000 });

    // Click again
    await page.getByRole('button', { name: '搜索' }).click();

    // Should still be on search (no crash)
    await expect(page.getByRole('heading', { name: '搜索文件' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder('搜索文件名、文档内容、标签...')).toBeVisible();
  });

  test('should handle rapid sequential navigation between views', async ({ page }) => {
    // Rapidly click through multiple views
    await page.getByRole('button', { name: '文件管理' }).click();
    await page.getByRole('button', { name: '收藏夹' }).click();
    await page.getByRole('button', { name: '搜索' }).click();
    await page.getByRole('button', { name: '设置' }).click();
    await page.getByRole('button', { name: '仪表盘' }).click();

    // Should end up on dashboard
    await expect(page.getByText(/欢迎回来/i)).toBeVisible({ timeout: 15_000 });
  });
});
