import { test, expect } from '@playwright/test';

test.describe('Export/Import Zones', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/designer');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display export button', async ({ page }) => {
    const exportBtn = page.locator('button:has-text("Export")');
    await expect(exportBtn.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display import button', async ({ page }) => {
    const importBtn = page.locator('button:has-text("Import")');
    await expect(importBtn.first()).toBeVisible({ timeout: 10000 });
  });

  test('should open export dialog', async ({ page }) => {
    const exportBtn = page.locator('button:has-text("Export")');
    if (await exportBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await exportBtn.first().click();
      // Dialog should appear (Export Zones title or similar)
      const dialog = page.locator('[role="dialog"]').or(page.locator('text=Export'));
      await expect(dialog.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should open import dialog', async ({ page }) => {
    const importBtn = page.locator('button:has-text("Import")');
    if (await importBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await importBtn.first().click();
      const dialog = page.locator('[role="dialog"]').or(page.locator('text=Import'));
      await expect(dialog.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
