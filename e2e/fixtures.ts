import { test as base, expect, type Page } from '@playwright/test';
import sharp from 'sharp';

export interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export async function photo(name = 'photo.jpg', width = 1200, height = 800): Promise<FilePayload> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 3) {
    const x = (i / 3) % width;
    raw[i] = (x * 255) / width;
    raw[i + 1] = 110 + ((i * 7) % 60);
    raw[i + 2] = 180;
  }
  const buffer = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
  return { name, mimeType: 'image/jpeg', buffer };
}

export async function transparentLogo(name = 'logo.png'): Promise<FilePayload> {
  const buffer = await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: 150, height: 150, channels: 4, background: '#e4572e' } }, left: 75, top: 75 }])
    .png()
    .toBuffer();
  return { name, mimeType: 'image/png', buffer };
}

/** Upload through the visible file input of the dropzone. */
export async function uploadFiles(page: Page, files: FilePayload[]) {
  await page.getByLabel('Choose image files').first().setInputFiles(files);
}

/** Fails the test if the page logs any error to the console. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        // Browsers log every 4xx response; expected API validation answers (e.g. 422) are not app errors. 5xx still fail.
        if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(e.message));
      await use(errors);
      expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
