import { test, expect } from '@playwright/test';

// These tests assume the user is logged in - they test the UI structure
// For full E2E, you'd need to set up auth state

test.describe('file management', () => {
  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    // Should show settings content or redirect to login
    const hasSettings = await page.getByText(/设置/i).isVisible().catch(() => false);
    const hasLogin = await page.getByText(/登录/i).isVisible().catch(() => false);
    expect(hasSettings || hasLogin).toBeTruthy();
  });

  test('files page structure', async ({ page }) => {
    await page.goto('/files');
    // Either shows files or redirects to login
    const hasFiles = await page.getByText(/文件/i).isVisible().catch(() => false);
    const hasLogin = await page.getByText(/登录/i).isVisible().catch(() => false);
    expect(hasFiles || hasLogin).toBeTruthy();
  });
});
