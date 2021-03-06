import { test, expect } from '@playwright/test';

test('test search', async ({ page }) => {
  await page.goto('.');


  // Click [placeholder="search a chart"]
  await page.locator('[placeholder="search a chart"]').click();
  // Fill [placeholder="search a chart"]
  await page.locator('[placeholder="search a chart"]').fill('plex');
  await expect(page).toHaveURL('#/plex');

  const links = page.locator('a:has-text("plex")');
  for (let i = 0; i < 30; i++) {
    await expect(links).not.toHaveCount(i);
  }

  const rows = page.locator('table tbody tr');
  for (let i = 0; i < 30; i++) {
    await expect(rows).not.toHaveCount(i);
  }
});
