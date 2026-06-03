// scripts/generate-icons.mjs
// Generate all icon sizes from icon.svg using sharp

import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'icon.svg');
const svgBuffer = readFileSync(svgPath);

// Output targets: [output_path, size]
const targets = [
  // Tauri app icons
  ['src-tauri/icons/32x32.png', 32],
  ['src-tauri/icons/128x128.png', 128],
  ['src-tauri/icons/128x128@2x.png', 256],
  ['src-tauri/icons/icon.png', 512],
  // Web favicon
  ['public/favicon.png', 64],
];

// Generate PNGs
for (const [relPath, size] of targets) {
  const outPath = join(root, relPath);
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`✓ ${relPath} (${size}x${size})`);
}

// --- ICO generation (sharp 0.34+ no longer supports .toFormat('ico')) ---

// Build ICO from an array of PNG buffers
function createIco(pngBuffers) {
  const DIR_ENTRY_SIZE = 16;
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: ICO
  header.writeUInt16LE(count, 4);  // image count

  let offset = 6 + count * DIR_ENTRY_SIZE;
  const entries = pngBuffers.map((buf) => {
    // PNG IHDR width/height at byte 16–23
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const entry = Buffer.alloc(DIR_ENTRY_SIZE);
    entry.writeUInt8(w >= 256 ? 0 : w, 0);
    entry.writeUInt8(h >= 256 ? 0 : h, 1);
    entry.writeUInt8(0, 2);         // palette
    entry.writeUInt8(0, 3);         // reserved
    entry.writeUInt16LE(1, 4);      // planes
    entry.writeUInt16LE(32, 6);     // bpp
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buf.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...pngBuffers]);
}

// Tauri icon.ico — multi-size (32, 64, 128, 256)
const icoSizes = [32, 64, 128, 256];
const icoBuffers = await Promise.all(
  icoSizes.map((size) => sharp(svgBuffer).resize(size, size).png().toBuffer())
);
writeFileSync(join(root, 'src-tauri/icons/icon.ico'), createIco(icoBuffers));
console.log('✓ src-tauri/icons/icon.ico');

// favicon.ico — single 32x32
const faviconBuffer = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
writeFileSync(join(root, 'public/favicon.ico'), createIco([faviconBuffer]));
console.log('✓ public/favicon.ico');

console.log('\nAll icons generated successfully.');
