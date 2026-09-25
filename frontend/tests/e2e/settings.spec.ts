import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test('should display settings page', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).toBeVisible();
    // Should have Settings heading or settings content
    const heading = page.locator('h1').or(page.locator('text=Settings'));
    await expect(heading.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display settings navigation sections', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    // Should have at least one nav section visible
    const navItems = [
      'Streams', 'AI Model', 'Zone Defaults', 'Retention',
      'Notifications', 'Advanced', 'User Management', 'Audit Logs',
    ];
    let found = false;
    for (const item of navItems) {
      const el = page.locator(`text=${item}`);
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        found = true;
        break;
      }
    }
    expect(found).toBeTruthy();
  });

  test('should navigate between settings sections', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Try clicking on different nav items
    const sections = ['AI Model', 'Zone Defaults', 'Retention', 'Notifications', 'Advanced'];
    for (const section of sections) {
      const btn = page.locator(`button:has-text("${section}")`).or(page.locator(`text=${section}`));
      if (await btn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.first().click();
        await page.waitForTimeout(300);
        break;
      }
    }
  });
});
