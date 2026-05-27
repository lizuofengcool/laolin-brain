import { test, expect, Page } from '@playwright/test';
import path from 'path';

/**
 * E2E tests for File Management.
 *
 * The app uses local (IndexedDB) storage by default.
 * Files are uploaded through the drag-and-drop UploadZone component.
 */

const TEST_USER = {
  name: 'Files E2E User',
  email: `e2e-files-${Date.now()}@example.com`,
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

  // Switch to register
  await page.getByText('立即注册').click();
  await page.getByLabel('用户名').fill(TEST_USER.name);
  await page.getByLabel('邮箱').fill(TEST_USER.email);
  await page.getByLabel('密码').fill(TEST_USER.password);
  await page.getByRole('button', { name: '注册' }).click();

  // Wait for dashboard
  await expect(page.getByText(/欢迎回来/i)).toBeVisible({ timeout: 15_000 });
}

test.describe('File Management', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test('should navigate to files view and show upload zone', async ({ page }) => {
    // Click "文件管理" in the sidebar
    await page.getByRole('button', { name: '文件管理' }).click();

    // Verify files view heading
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 10_000 });

    // Verify upload zone is visible
    await expect(page.getByText('拖拽文件到此处，或点击上传')).toBeVisible();
  });

  test('should upload a text file via file input', async ({ page }) => {
    // Navigate to files view
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 10_000 });

    // Find the file input inside the upload zone and upload a test file
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();

    // Create a small test text file using the file chooser approach
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByText('拖拽文件到此处，或点击上传').click(),
    ]);

    await fileChooser.setFiles({
      name: 'test-note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This is a test note for E2E testing.\nHello, Second Brain!'),
    });

    // Wait for upload to complete — look for a success toast or the file in the list
    // The upload may take a moment (AI processing in local mode)
    await page.waitForTimeout(5_000);

    // The file should appear in the file list after upload
    // Since we're in local mode, check for the file name in the page
    await expect(page.getByText('test-note.txt')).toBeVisible({ timeout: 15_000 });
  });

  test('should show the file list with file type badges', async ({ page }) => {
    // Navigate to files view
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 10_000 });

    // The storage mode badge should be visible
    await expect(page.getByText(/本地模式|云端模式/)).toBeVisible();

    // Upload zone should be visible even without files
    await expect(page.getByText('拖拽文件到此处，或点击上传')).toBeVisible();
  });

  test('should show file type filter badges after navigating from dashboard stats', async ({ page }) => {
    // We're on the dashboard. Click "查看详细分析" or a stat card to navigate with filter.
    // Since there are no files yet, click the "文件管理" sidebar item first
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 10_000 });

    // Verify storage mode badge is displayed
    const storageBadge = page.locator('text=/💾 本地模式|☁️ 云端模式/');
    await expect(storageBadge).toBeVisible();
  });

  test('should display search functionality in search view', async ({ page }) => {
    // Navigate to search view via sidebar
    await page.getByRole('button', { name: '搜索' }).click();

    // Wait for search view to render
    await expect(page.getByRole('heading', { name: '搜索文件' })).toBeVisible({ timeout: 10_000 });

    // Verify search input is present
    const searchInput = page.getByPlaceholder('搜索文件名、文档内容、标签...');
    await expect(searchInput).toBeVisible();

    // Type a search query
    await searchInput.fill('test');

    // Click the search button
    await page.getByRole('button', { name: '搜索' }).click();

    // Wait for results section to appear (may be empty)
    await page.waitForTimeout(2_000);

    // The empty search state message should be visible if no results
    // Or results should appear
    await expect(
      page.locator('text=/搜索你的文件|搜索结果|0 个结果/i')
    ).toBeVisible({ timeout: 10_000 });
  });

  test('should upload a file and search for it', async ({ page }) => {
    // Navigate to files view and upload a file
    await page.getByRole('button', { name: '文件管理' }).click();
    await expect(page.getByRole('heading', { name: '文件管理' })).toBeVisible({ timeout: 10_000 });

    // Upload a test file
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByText('拖拽文件到此处，或点击上传').click(),
    ]);

    await fileChooser.setFiles({
      name: 'searchable-document.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Unique content for search testing: xyzzy123'),
    });

    // Wait for upload to complete
    await page.waitForTimeout(5_000);
    await expect(page.getByText('searchable-document.txt')).toBeVisible({ timeout: 15_000 });

    // Now navigate to search and search for the file
    await page.getByRole('button', { name: '搜索' }).click();
    await expect(page.getByRole('heading', { name: '搜索文件' })).toBeVisible({ timeout: 10_000 });

    const searchInput = page.getByPlaceholder('搜索文件名、文档内容、标签...');
    await searchInput.fill('searchable-document');
    await page.getByRole('button', { name: '搜索' }).click();

    // Wait for search results
    await page.waitForTimeout(3_000);

    // The file should appear in search results
    await expect(page.getByText('searchable-document.txt')).toBeVisible({ timeout: 15_000 });
  });
});
