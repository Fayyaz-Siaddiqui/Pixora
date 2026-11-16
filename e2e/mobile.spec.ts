import { expect, photo, test, uploadFiles } from './fixtures';

test('mobile: menu navigation and resizing work on a phone screen', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Menu').click();
  await page.getByRole('banner').getByRole('link', { name: 'Image Compressor' }).click();
  await expect(page).toHaveURL(/image-compressor/);
  await uploadFiles(page, [await photo('phone.jpg', 800, 600)]);
  await page.getByRole('button', { name: /^Compress$/ }).click();
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
  // No horizontal scrolling on small screens.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
