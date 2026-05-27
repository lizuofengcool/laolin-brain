import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for Navigation.
 *
 * The app uses an SPA pattern with Zustand state for view switching.
 * Sidebar navigation items map to ViewType values.
 * Mobile nav is a fixed bottom bar (visible on small viewports).
 */

const TEST_USER = {
  name: 'Nav E2E User',
  email: `e2e-nav-${Date.now()}@example.com`,
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

test.describe('Sidebar Navigation (Desktop)', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test('should show the sidebar with navigation items', async ({ page }) => {
    // Sidebar should be visible on desktop
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();

    // Verify key navigation items exist in the sidebar
    await expect(page.getByRole('button', { name: '仪表盘' })).toBeVisible();
    await expect(page.getByRole('button', { name: '文件管理' })).toBeVisible();
    await expect(page.getByRole('button', { name: '搜索' })).toBeVisible();
    await expect(page.getByRole('button', { name: '设置' })).toBeVisible();
    await expect(page.getByRole('button', { name: '收藏夹' })).toBeVisible();
  });

  test('should navigate to dashboard view', async ({ page }) => {
    // Already on dashboard after login
    await expect(page.getByText(/欢迎回来/i)).toBeVisible();

    // Click dashboard in sidebar
    await page.getByRole('button', { name: '仪表盘' }).click();

    // Dashboard should still be shown
    await expect(page.getByText(/欢迎回来/i)).toBeVisible({ timeout: 5_000 });
  });

  test('should navigate to files view', async ({ page }) => {
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('拖拽文件到此处，或点击上传')).toBeVisible();
  });

  test('should navigate to search view', async ({ page }) => {
    await page.getByRole('button', { name: '搜索' }).click();
    await expect(page.getByRole('heading', { name: '搜索文件' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder('搜索文件名、文档内容、标签...')).toBeVisible();
  });

  test('should navigate to favorites view', async ({ page }) => {
    await page.getByRole('button', { name: '收藏夹' }).click();
    await expect(page.getByRole('heading', { name: '收藏夹' })).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to recycle bin view', async ({ page }) => {
    await page.getByRole('button', { name: '回收站' }).click();
    await expect(page.getByRole('heading', { name: '回收站' })).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to settings view', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to timeline view', async ({ page }) => {
    await page.getByRole('button', { name: '时间线' }).click();
    // Timeline view should render (it may show an empty state)
    await page.waitForTimeout(2_000);
    // Verify we navigated away from dashboard
    await expect(page.getByText(/欢迎回来/i)).not.toBeVisible();
  });

  test('should navigate between views sequentially', async ({ page }) => {
    // Dashboard → Files
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 10_000 });

    // Files → Search
    await page.getByRole('button', { name: '搜索' }).click();
    await expect(page.getByRole('heading', { name: '搜索文件' })).toBeVisible({ timeout: 10_000 });

    // Search → Settings
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 10_000 });

    // Settings → Dashboard
    await page.getByRole('button', { name: '仪表盘' }).click();
    await expect(page.getByText(/欢迎回来/i)).toBeVisible({ timeout: 10_000 });
  });

  test('should collapse and expand the sidebar', async ({ page }) => {
    // Sidebar collapse toggle button exists
    const collapseButton = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-left, svg.lucide-chevron-right') });
    await expect(collapseButton.first()).toBeVisible();

    // Click to collapse
    await collapseButton.first().click();
    await page.waitForTimeout(500);

    // Sidebar should still exist but be narrow
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    // The sidebar label texts should be hidden when collapsed
    // We can verify by checking that "知识库" label is no longer visible
    await expect(page.locator('aside span.font-semibold')).not.toBeVisible();

    // Click to expand
    await collapseButton.first().click();
    await page.waitForTimeout(500);

    // Label should be visible again
    await expect(page.locator('aside').getByText('知识库')).toBeVisible({ timeout: 5_000 });
  });

  test('should navigate to search via header search form', async ({ page }) => {
    // Type in the header search input and submit
    const headerSearch = page.getByPlaceholder('搜索文件... (Ctrl+K)');
    await expect(headerSearch).toBeVisible();
    await headerSearch.fill('test query');

    // Submit the form (press Enter)
    await headerSearch.press('Enter');

    // Should navigate to search view
    await expect(page.getByRole('heading', { name: '搜索文件' })).toBeVisible({ timeout: 10_000 });

    // The search query should be in the search input
    const searchInput = page.getByPlaceholder('搜索文件名、文档内容、标签...');
    await expect(searchInput).toHaveValue('test query');
  });
});

test.describe('Mobile Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Use mobile viewport (already handled by 'mobile-chrome' project in config)
    await registerAndLogin(page);
  });

  test('should show mobile bottom navigation bar', async ({ page }) => {
    // The mobile nav should be visible on small viewports
    const mobileNav = page.locator('nav.fixed.bottom-0');
    await expect(mobileNav).toBeVisible();

    // Verify main nav items are present
    await expect(page.getByText('首页')).toBeVisible();
    await expect(page.getByText('文件')).toBeVisible();
    await expect(page.getByText('收藏')).toBeVisible();
    await expect(page.getByText('搜索')).toBeVisible();
    await expect(page.getByText('设置')).toBeVisible();
  });

  test('should navigate via mobile nav items', async ({ page }) => {
    // Tap "文件"
    await page.getByText('文件').click();
    await page.waitForTimeout(1_000);
    // Verify navigation happened
    await expect(page.getByText('拖拽文件到此处，或点击上传')).toBeVisible({ timeout: 10_000 });

    // Tap "搜索"
    await page.getByText('搜索').click();
    await page.waitForTimeout(1_000);
    await expect(page.getByRole('heading', { name: '搜索文件' })).toBeVisible({ timeout: 10_000 });

    // Tap "首页"
    await page.getByText('首页').click();
    await page.waitForTimeout(1_000);
    await expect(page.getByText(/欢迎回来/i)).toBeVisible({ timeout: 10_000 });
  });

  test('should open and close the "more" menu', async ({ page }) => {
    // Click "更多" button in mobile nav
    const moreButton = page.getByText('更多');
    await expect(moreButton).toBeVisible();
    await moreButton.click();

    // The more menu should appear with additional items
    await expect(page.getByText('相册')).toBeVisible();
    await expect(page.getByText('人脸')).toBeVisible();
    await expect(page.getByText('标签')).toBeVisible();
    await expect(page.getByText('时间线')).toBeVisible();
    await expect(page.getByText('回收站')).toBeVisible();

    // Click outside to close
    // Tap "首页" which should close more menu and navigate
    await page.getByText('首页').click();
    await page.waitForTimeout(500);

    // More menu items should no longer be visible
    await expect(page.getByText('相册')).not.toBeVisible();
  });

  test('should navigate via "more" menu items', async ({ page }) => {
    // Open "更多" menu
    await page.getByText('更多').click();

    // Tap "回收站"
    await page.getByText('回收站').click();
    await page.waitForTimeout(1_000);
    await expect(page.getByRole('heading', { name: '回收站' })).toBeVisible({ timeout: 10_000 });

    // Open "更多" menu again
    await page.getByText('更多').click();

    // Tap "标签"
    await page.getByText('标签').click();
    await page.waitForTimeout(1_000);
    // Should have navigated to tags view
    await expect(page.getByText(/欢迎回来/i)).not.toBeVisible();
  });
});
