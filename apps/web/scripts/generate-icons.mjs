// Generates the site icons from the Pixora mark (components/brand/logo.tsx):
//   app/icon.svg          crisp vector icon for modern browsers
//   app/favicon.ico       16/32/48 px for older browsers, Windows and bookmarks
//   app/apple-icon.png    180 px home-screen icon for iPhone/iPad
//   public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png  (web app manifest)
//
// Run after changing the mark:  node apps/web/scripts/generate-icons.mjs
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const webDir = fileURLToPath(new URL('..', import.meta.url));
const BG = '#16181d'; // dark ink tile: readable on light and dark browser tabs
const INK = '#ffffff';
const ACCENT = '#ff6a3d';

/**
 * The mark on a rounded tile. `inset` shrinks the artwork (safe zone for
 * maskable icons); `bold` thickens strokes so 16 px stays legible.
 */
function tileSvg({ size = 32, radius = 7, inset = 0, bold = false, square = false } = {}) {
  const sw = bold ? 3.1 : 2.6;
  const scale = (32 - inset * 2) / 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${square ? 0 : radius}" fill="${BG}"/>
  <g transform="translate(${inset} ${inset}) scale(${scale}) translate(16 16) scale(0.8) translate(-16 -16)" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 9a5 5 0 0 1 5-5h14a5 5 0 0 1 5 5v8" stroke="${INK}" stroke-width="${sw}"/>
    <path d="M4 9v14a5 5 0 0 0 5 5h8" stroke="${INK}" stroke-width="${sw}"/>
    <rect x="9.5" y="9.5" width="4" height="4" rx="1" fill="${INK}" stroke="none"/>
    <rect x="15" y="9.5" width="4" height="4" rx="1" fill="${INK}" opacity="0.5" stroke="none"/>
    <rect x="9.5" y="15" width="4" height="4" rx="1" fill="${INK}" opacity="0.5" stroke="none"/>
    <path d="M21 28h7v-7" stroke="${ACCENT}" stroke-width="${sw + 0.3}"/>
    <path d="M27.5 27.5 20 20" stroke="${ACCENT}" stroke-width="${sw + 0.3}"/>
  </g>
</svg>
`;
}

const png = (svg, size) => sharp(Buffer.from(svg), { density: Math.max(72, (72 * size) / 32) }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** ICO container holding PNG images (supported by every browser and Windows Vista+). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); // palette
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); // colour planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

const out = (rel, data) => writeFile(path.join(webDir, rel), data).then(() => console.log(`wrote ${rel} (${data.length} bytes)`));

await out('app/icon.svg', tileSvg());
await out(
  'app/favicon.ico',
  ico([
    { size: 16, data: await png(tileSvg({ size: 16, bold: true, radius: 6 }), 16) },
    { size: 32, data: await png(tileSvg({ size: 32, bold: true }), 32) },
    { size: 48, data: await png(tileSvg({ size: 48 }), 48) },
  ]),
);
// iOS adds its own rounded corners and dislikes transparency: full-bleed square.
await out('app/apple-icon.png', await png(tileSvg({ size: 180, square: true }), 180));
await out('public/icon-192.png', await png(tileSvg({ size: 192 }), 192));
await out('public/icon-512.png', await png(tileSvg({ size: 512 }), 512));
// Maskable: Android may crop to a circle, so keep the mark inside the central safe zone.
await out('public/icon-maskable-512.png', await png(tileSvg({ size: 512, square: true, inset: 4 }), 512));
