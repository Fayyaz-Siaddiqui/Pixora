import sharp from 'sharp';
import { expect, photo, test, transparentLogo, uploadFiles } from './fixtures';

test('homepage upload, then resize and download', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('without compromising quality');
  await uploadFiles(page, [await photo('holiday.jpg', 1200, 800)]);
  await expect(page.getByText('Your image is ready.')).toBeVisible();

  await page.getByRole('link', { name: /^Resizer/ }).click();
  await expect(page).toHaveURL(/image-resizer/);
  await expect(page.getByRole('button', { name: /^holiday\.jpg/ })).toHaveAttribute('aria-pressed', 'true');

  const width = page.getByLabel('Width');
  await width.fill('600');
  await expect(page.getByLabel('Height')).toHaveValue('400');
  await page.getByRole('button', { name: /^Resize$/ }).click();

  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  await expect(page.getByText('600 × 400 px')).toBeVisible();
  await expect(page.getByLabel('Comparison position')).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  expect(download.suggestedFilename()).toBe('holiday-600x400.jpg');
  const meta = await sharp(await download.path()).metadata();
  expect([meta.width, meta.height]).toEqual([600, 400]);
});

test('width typed before the upload finishes still gets a matching height', async ({ page }) => {
  await page.goto('/image-resizer');
  await uploadFiles(page, [await photo('early.jpg', 1000, 500)]);
  await page.getByLabel('Width').fill('400'); // may run before the upload completes
  await expect(page.getByLabel('Height')).toHaveValue('200');
});

test('unlocked size with Fill and a social preset', async ({ page }) => {
  await page.goto('/image-resizer');
  await uploadFiles(page, [await photo('wide.jpg', 1600, 900)]);
  await page.getByText('Size presets').click();
  await page.getByRole('button', { name: /Instagram Square/ }).click();
  await expect(page.getByLabel('Width')).toHaveValue('1080');
  await page.getByRole('button', { name: /^Resize$/ }).click();
  await expect(page.getByText('1,080 × 1,080 px')).toBeVisible();
  // 1600x900 -> 1080x1080 enlarges the height: the user is told honestly.
  await expect(page.getByText(/will be enlarged 120%/)).toBeVisible();
});

test('"keep smaller images" never enlarges', async ({ page }) => {
  await page.goto('/image-resizer');
  await uploadFiles(page, [await photo('small.jpg', 500, 400)]);
  await expect(page.getByLabel('Width')).toHaveValue('500');
  await page.getByLabel('Width').fill('1000');
  await expect(page.getByText(/will be enlarged 200%/)).toBeVisible();
  await page.getByRole('switch', { name: 'Keep smaller images at their original size' }).click();
  await expect(page.getByText(/will keep its original size/)).toBeVisible();
  await page.getByRole('button', { name: /^Resize$/ }).click();
  await expect(page.getByRole('region', { name: 'Results' }).getByText('500 × 400 px')).toBeVisible();
});

test('compressor reaches a target size', async ({ page }) => {
  await page.goto('/image-compressor');
  await uploadFiles(page, [await photo('big.jpg', 1600, 1200)]);
  // This image is ~200 KB at high quality and ~66 KB at the quality floor.
  await page.getByLabel('Target file size (optional)').fill('120');
  await page.getByRole('button', { name: /^Compress$/ }).click();
  await expect(page.getByText(/% smaller/)).toBeVisible();
  await expect(page.getByText(/Target size couldn’t be reached/)).toHaveCount(0);

  // An unreachable target is reported honestly instead of producing a broken-looking file.
  await page.getByLabel('Target file size (optional)').fill('20');
  await page.getByRole('button', { name: /^Compress$/ }).click();
  await expect(page.getByText(/Target size couldn’t be reached/)).toBeVisible();
});

test('converter asks for a background before turning transparency into JPG', async ({ page }) => {
  await page.goto('/image-converter');
  await uploadFiles(page, [await transparentLogo()]);
  await page.getByRole('button', { name: /^JPEG/ }).click();
  await expect(page.getByText('Background for transparent areas')).toBeVisible();
  await expect(page.getByText(/can’t keep them/)).toBeVisible();
  await page.getByRole('button', { name: /Convert to JPG/ }).click();
  await expect(page.getByText('Transparent areas were filled with your background colour.')).toBeVisible();

  await page.getByRole('button', { name: /^WebP/ }).click();
  await page.getByRole('button', { name: /Convert to WebP/ }).click();
  await expect(page.getByRole('region', { name: 'Results' }).getByText('WebP', { exact: true })).toBeVisible();
});

test('cropper: square circle crop with rotation', async ({ page }) => {
  await page.goto('/image-cropper');
  await uploadFiles(page, [await photo('portrait.jpg', 800, 1200)]);
  await page.getByRole('button', { name: 'Rotate right 90°' }).click();
  await page.getByLabel('Aspect ratio').selectOption('1:1');
  await page.getByRole('switch', { name: 'Circle crop' }).click();
  await expect(page.getByText('Selection: 800 × 800 px of 1200 × 800 px')).toBeVisible();
  await page.getByRole('button', { name: 'Crop image' }).click();
  const results = page.getByRole('region', { name: 'Results' });
  await expect(results.getByText('800 × 800 px')).toBeVisible();
  await expect(results.getByText('PNG', { exact: true })).toBeVisible();
});

test('enhancer live preview, undo and export', async ({ page }) => {
  await page.goto('/image-enhancer');
  await uploadFiles(page, [await photo('dull.jpg', 900, 600)]);
  const canvas = page.getByLabel('Edited preview');
  await expect(canvas).toBeVisible();
  await expect(page.getByText('Preview unavailable')).toHaveCount(0);

  const brightness = page.getByLabel('Brightness');
  await brightness.focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByText('+20')).toBeVisible();

  // The canvas must actually change: sample the centre pixel before/after undo.
  const sample = () =>
    canvas.evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(c.width / 2, c.height / 2, 1, 1).data));
  await page.waitForTimeout(200);
  const bright = await sample();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(200);
  const original = await sample();
  expect(bright[1]!).toBeGreaterThan(original[1]!);
  await page.getByRole('button', { name: 'Redo' }).click();

  await page.getByRole('button', { name: 'Apply & export' }).click();
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
});

test('batch: three images, one ZIP', async ({ page }) => {
  await page.goto('/batch-image-resizer');
  await uploadFiles(page, [await photo('a.jpg', 900, 600), await photo('b.jpg', 600, 900), await photo('c.jpg', 700, 700)]);
  await expect(page.getByText('3 images selected.')).toBeVisible();
  await page.getByLabel('Width').fill('300');
  await page.getByRole('button', { name: 'Resize all (3)' }).click();
  await expect(page.getByText('3 of 3 done')).toBeVisible();
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download all (ZIP)' }).click()]);
  expect(zip.suggestedFilename()).toMatch(/\.zip$/);
});

test('bad uploads are explained, not silently dropped', async ({ page }) => {
  await page.goto('/image-resizer');
  await uploadFiles(page, [{ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('definitely not an image') }]);
  await expect(page.getByText(/One file was not added/)).toBeVisible();
  await expect(page.getByText(/not a recognised image/)).toBeVisible();
});

test('metadata viewer detects a renamed file', async ({ page }) => {
  await page.goto('/image-metadata-viewer');
  const png = await transparentLogo('really-a-png.jpg');
  await uploadFiles(page, [png]);
  await expect(page.getByText(/doesn’t match its content/)).toBeVisible();
  await expect(page.getByText('No GPS location found.')).toBeVisible();
});

test('every public page renders without errors', async ({ page }) => {
  for (const path of ['/', '/image-resizer', '/image-compressor', '/image-converter', '/image-cropper', '/image-enhancer', '/batch-image-resizer', '/image-metadata-viewer', '/privacy', '/status']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  const sitemap = await page.request.get('/sitemap.xml');
  expect(await sitemap.text()).toContain('/image-cropper');
});
