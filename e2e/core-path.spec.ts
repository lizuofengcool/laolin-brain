import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for the Full Core User Journey.
 *
 * Tests the entire lifecycle from registration to logout:
 * Register → Login → Dashboard → Upload file → Preview → Rename → Favorite →
 * Delete → Restore from recycle bin → Search → Settings → Logout
 */

const TEST_USER = {
  name: 'Core Path E2E User',
  email: `e2e-core-${Date.now()}@example.com`,
  password: 'testpass1234',
};

const ORIGINAL_FILENAME = 'core-path-test.txt';
const RENAMED_FILENAME = 'core-path-renamed.txt';

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

/**
 * Helper: upload a text file via the file chooser in the files view.
 */
async function uploadTestFile(page: Page, filename: string, content: string) {
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('拖拽文件到此处，或点击上传').click(),
  ]);

  await fileChooser.setFiles({
    name: filename,
    mimeType: 'text/plain',
    buffer: Buffer.from(content),
  });

  // Wait for upload to complete (AI processing in local mode)
  await page.waitForTimeout(5_000);

  // Verify file appears in the list
  await expect(page.getByText(filename)).toBeVisible({ timeout: 15_000 });
}

/**
 * Helper: hover over a file card to reveal the more actions button (…).
 * Returns the dropdown trigger button.
 */
async function getMoreActionsButton(page: Page, filename: string) {
  // The "more" button is inside the card that contains the filename.
  // Hover over the card first to make the button visible (it uses group-hover opacity).
  const fileCard = page.locator('text=' + filename).locator('..').locator('..').locator('..').first();
  await fileCard.hover();
  await page.waitForTimeout(300);

  // The more actions button is the second-to-last ghost button in the preview area
  // (the last one is the star/favorite button at top-right)
  const moreBtn = fileCard.locator('button').filter({ has: page.locator('svg.lucide-more-vertical') });
  await expect(moreBtn.first()).toBeVisible();
  return moreBtn.first();
}

test.describe('Core Path: Full User Journey', () => {
  test('should complete the full core user journey', async ({ page }) => {
    // ── Step 1: Register & Login ──────────────────────────────────
    await registerAndLogin(page);
    await expect(page.getByText(/欢迎回来/i)).toBeVisible();
    await expect(page.getByText(TEST_USER.name)).toBeVisible();

    // ── Step 2: Navigate to files view ──────────────────────────
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('拖拽文件到此处，或点击上传')).toBeVisible();

    // ── Step 3: Upload a text file ──────────────────────────────
    await uploadTestFile(page, ORIGINAL_FILENAME, 'Core path test content for full journey.\nLine two here.');

    // ── Step 4: Click file → Preview dialog opens → Close ───────
    // For text files, clicking the card opens the preview dialog
    await page.getByText(ORIGINAL_FILENAME).click();
    // The preview dialog should show with the file name in the dialog title
    await expect(page.locator('[role="dialog"]').getByText(ORIGINAL_FILENAME)).toBeVisible({ timeout: 10_000 });
    // The preview content should be visible
    await expect(page.locator('[role="dialog"]').getByText(/Core path test content/)).toBeVisible({ timeout: 10_000 });
    // Close the preview dialog
    await page.locator('[role="dialog"]').getByRole('button', { name: '关闭' }).click();
    await expect(page.locator('[role="dialog"]').getByText(ORIGINAL_FILENAME)).not.toBeVisible({ timeout: 5_000 });

    // ── Step 5: Rename the file ─────────────────────────────────
    const moreBtn = await getMoreActionsButton(page, ORIGINAL_FILENAME);
    await moreBtn.click();

    // Click "重命名" in the dropdown
    await page.getByText('重命名', { exact: true }).click();

    // Rename dialog should open
    await expect(page.locator('[role="dialog"]').getByText('重命名文件')).toBeVisible({ timeout: 5_000 });

    // Clear the input and type new name
    const renameInput = page.locator('[role="dialog"]').getByLabel('新文件名');
    await renameInput.clear();
    await renameInput.fill(RENAMED_FILENAME);

    // Click "确认" to save
    await page.locator('[role="dialog"]').getByRole('button', { name: '确认' }).click();

    // Wait for rename to complete - old name should disappear, new name appear
    await expect(page.getByText(ORIGINAL_FILENAME)).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(RENAMED_FILENAME)).toBeVisible({ timeout: 10_000 });

    // ── Step 6: Toggle favorite ─────────────────────────────────
    // Hover over the file card to reveal the star button
    const renamedCard = page.locator('text=' + RENAMED_FILENAME).locator('..').locator('..').locator('..').first();
    await renamedCard.hover();
    await page.waitForTimeout(300);

    // Click the star/favorite button (it's the button with the star SVG in the card's preview area)
    const starBtn = renamedCard.locator('button').filter({ has: page.locator('svg.lucide-star') });
    await expect(starBtn.first()).toBeVisible();
    await starBtn.first().click();

    // Wait for favorite to be toggled - the star should be filled
    await page.waitForTimeout(1_000);

    // ── Step 7: Verify file in favorites view ──────────────────
    await page.getByRole('button', { name: '收藏夹' }).click();
    await expect(page.getByRole('heading', { name: '收藏夹' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(RENAMED_FILENAME)).toBeVisible({ timeout: 10_000 });

    // ── Step 8: Delete the file ─────────────────────────────────
    // Go back to files view
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(RENAMED_FILENAME)).toBeVisible({ timeout: 10_000 });

    // Hover and click more actions to delete
    const deleteMoreBtn = await getMoreActionsButton(page, RENAMED_FILENAME);
    await deleteMoreBtn.click();
    await page.getByText('删除', { exact: true }).click();

    // Delete confirmation dialog should appear
    await expect(page.locator('[role="dialog"]').getByText('删除文件')).toBeVisible({ timeout: 5_000 });
    await page.locator('[role="dialog"]').getByRole('button', { name: '确认删除' }).click();

    // File should be removed from files view
    await expect(page.getByText(RENAMED_FILENAME)).not.toBeVisible({ timeout: 10_000 });

    // ── Step 9: Verify file in recycle bin ──────────────────────
    await page.getByRole('button', { name: '回收站' }).click();
    await expect(page.getByRole('heading', { name: '回收站' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(RENAMED_FILENAME)).toBeVisible({ timeout: 10_000 });

    // ── Step 10: Restore file from recycle bin ───────────────────
    // Click the "恢复" (restore) button next to the file
    await page.locator('tr, div').filter({ hasText: RENAMED_FILENAME }).getByRole('button', { name: '恢复' }).click();

    // Wait for restore - file should disappear from recycle bin
    await expect(page.getByText(RENAMED_FILENAME)).not.toBeVisible({ timeout: 10_000 });

    // Recycle bin should be empty now
    await expect(page.getByText('回收站为空')).toBeVisible({ timeout: 5_000 });

    // ── Step 11: Verify file back in files view ─────────────────
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(RENAMED_FILENAME)).toBeVisible({ timeout: 10_000 });

    // ── Step 12: Search for file ─────────────────────────────────
    await page.getByRole('button', { name: '搜索' }).click();
    await expect(page.getByRole('heading', { name: '搜索文件' })).toBeVisible({ timeout: 15_000 });

    const searchInput = page.getByPlaceholder('搜索文件名、文档内容、标签...');
    await searchInput.fill('core-path-renamed');
    await page.getByRole('button', { name: '搜索' }).click();

    // Wait for search results
    await page.waitForTimeout(3_000);
    await expect(page.getByText(RENAMED_FILENAME)).toBeVisible({ timeout: 15_000 });

    // ── Step 13: Navigate to settings ────────────────────────────
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 15_000 });

    // Verify account info is visible
    await expect(page.getByText('账号信息')).toBeVisible();
    await expect(page.getByText(TEST_USER.name)).toBeVisible();
    await expect(page.getByText(TEST_USER.email)).toBeVisible();

    // ── Step 14: Logout ─────────────────────────────────────────
    await page.getByRole('button', { name: '退出登录' }).click();

    // Verify we're back on the login page
    await expect(page.getByText('智能文档知识库')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('邮箱')).toBeVisible();
    await expect(page.getByLabel('密码')).toBeVisible();
  });
});

test.describe('Core Path: Register then Login separately', () => {
  test('should register, logout, then login with same credentials', async ({ page }) => {
    // Register
    await registerAndLogin(page);
    await expect(page.getByText(/欢迎回来/i)).toBeVisible();

    // Logout
    await page.getByRole('button', { name: '退出登录' }).click();
    await expect(page.getByText('智能文档知识库')).toBeVisible({ timeout: 10_000 });

    // Login with the same credentials
    await page.getByLabel('邮箱').fill(TEST_USER.email);
    await page.getByLabel('密码').fill(TEST_USER.password);
    await page.getByRole('button', { name: '登录' }).click();

    // Should see dashboard again
    await expect(page.getByText(/欢迎回来/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(TEST_USER.name)).toBeVisible();
  });
});

test.describe('Core Path: Upload, Preview, Favorite, Delete cycle', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test('should upload a text file, preview it, and verify content', async ({ page }) => {
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 15_000 });

    const filename = 'preview-test.txt';
    const content = 'Hello World! This is preview test content.\nSecond line with more text.';

    await uploadTestFile(page, filename, content);

    // Click file to open preview
    await page.getByText(filename).click();
    await expect(page.locator('[role="dialog"]').getByText(filename)).toBeVisible({ timeout: 10_000 });

    // Verify content in preview
    await expect(page.locator('[role="dialog"]').getByText('Hello World!')).toBeVisible({ timeout: 10_000 });
  });

  test('should favorite a file and see it in favorites, then unfavorite', async ({ page }) => {
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 15_000 });

    const filename = 'fav-cycle-test.txt';
    await uploadTestFile(page, filename, 'Favorite cycle test');

    // Hover and toggle favorite
    const fileCard = page.locator('text=' + filename).locator('..').locator('..').locator('..').first();
    await fileCard.hover();
    await page.waitForTimeout(300);
    const starBtn = fileCard.locator('button').filter({ has: page.locator('svg.lucide-star') });
    await starBtn.first().click();
    await page.waitForTimeout(1_000);

    // Verify in favorites
    await page.getByRole('button', { name: '收藏夹' }).click();
    await expect(page.getByRole('heading', { name: '收藏夹' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(filename)).toBeVisible({ timeout: 10_000 });

    // Unfavorite from the favorites view - hover and click star
    const favCard = page.locator('text=' + filename).locator('..').locator('..').locator('..').first();
    await favCard.hover();
    await page.waitForTimeout(300);
    const unfavBtn = favCard.locator('button').filter({ has: page.locator('svg.lucide-star') });
    await unfavBtn.first().click();
    await page.waitForTimeout(1_000);

    // Favorites should be empty now
    await expect(page.getByText('暂无收藏')).toBeVisible({ timeout: 10_000 });
  });

  test('should delete file and restore it from recycle bin', async ({ page }) => {
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 15_000 });

    const filename = 'delete-restore-test.txt';
    await uploadTestFile(page, filename, 'Delete and restore test content');

    // Delete via more actions
    const moreBtn = await getMoreActionsButton(page, filename);
    await moreBtn.click();
    await page.getByText('删除', { exact: true }).click();
    await expect(page.locator('[role="dialog"]').getByText('删除文件')).toBeVisible({ timeout: 5_000 });
    await page.locator('[role="dialog"]').getByRole('button', { name: '确认删除' }).click();

    // File gone from files view
    await expect(page.getByText(filename)).not.toBeVisible({ timeout: 10_000 });

    // File in recycle bin
    await page.getByRole('button', { name: '回收站' }).click();
    await expect(page.getByRole('heading', { name: '回收站' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(filename)).toBeVisible({ timeout: 10_000 });

    // Restore
    await page.locator('div').filter({ hasText: filename }).getByRole('button', { name: '恢复' }).click();
    await expect(page.getByText(filename)).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('回收站为空')).toBeVisible({ timeout: 5_000 });

    // File back in files
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(filename)).toBeVisible({ timeout: 10_000 });
  });
});
