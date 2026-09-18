// The program's icon, at every size and in every format each system wants.
//
//   node desktop/make-icons.mjs
//
// Newsx borrows Electron to draw its icons. This does not borrow anything: the
// mark is a handful of rounded rectangles, drawn here into pixels, written out
// by the PNG encoder the PDF writer already has, and packed into .ico and
// .icns - both of which are, at the sizes that matter, containers of PNGs.
//
// So the whole repository still installs nothing, and the icons can be made
// again on any machine with Node on it.
//
// Writes:
//   assets/icon.png            256, for the window and the page
//   desktop/icons/linux/*.png  16 to 512, for the menu and the task bar
//   desktop/icons/icon.ico     Windows
//   desktop/icons/icon.icns    macOS

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { encodePng } from '../src/lib/images.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------- the mark */

// A slide with a title bar and two lines under it, and beside it the edge of
// the next slide: a deck, reduced to its shapes. On a 32-unit grid, which is
// what assets/icon.svg draws on too, so the two cannot drift apart.
const MARK = [
  { x: 0, y: 0, w: 32, h: 32, r: 8, fill: '#17181a' },
  { x: 5.5, y: 8, w: 17, h: 16, r: 2, fill: '#ffffff' },
  { x: 8, y: 11, w: 10, h: 2.6, r: 1.3, fill: '#17181a' },
  { x: 8, y: 15.6, w: 7, h: 1.8, r: 0.9, fill: '#8a8c90', from: 32 },
  { x: 8, y: 19, w: 5, h: 1.8, r: 0.9, fill: '#8a8c90', from: 32 },
  { x: 24.5, y: 10.5, w: 2, h: 11, r: 0, fill: '#8a8c90' },
];

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * The mark at a size, as RGBA.
 *
 * Every edge is sampled four times across and four times down, which is what
 * keeps a rounded corner from looking like a staircase at sixteen pixels.
 */
function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const k = size / 32;
  const SUB = 4;
  for (const shape of MARK) {
    if (shape.from && size < shape.from) continue;
    const [r, g, b] = hex(shape.fill);
    const x0 = shape.x * k;
    const y0 = shape.y * k;
    const x1 = (shape.x + shape.w) * k;
    const y1 = (shape.y + shape.h) * k;
    const radius = Math.min(shape.r * k, (x1 - x0) / 2, (y1 - y0) / 2);
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(size, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(size, Math.ceil(x1)); x++) {
        let hits = 0;
        for (let sy = 0; sy < SUB; sy++) {
          for (let sx = 0; sx < SUB; sx++) {
            const px0 = x + (sx + 0.5) / SUB;
            const py0 = y + (sy + 0.5) / SUB;
            if (px0 < x0 || px0 > x1 || py0 < y0 || py0 > y1) continue;
            if (radius > 0) {
              const cx = Math.min(Math.max(px0, x0 + radius), x1 - radius);
              const cy = Math.min(Math.max(py0, y0 + radius), y1 - radius);
              if (Math.hypot(px0 - cx, py0 - cy) > radius) continue;
            }
            hits++;
          }
        }
        if (!hits) continue;
        const a = hits / (SUB * SUB);
        const i = (y * size + x) * 4;
        // Over whatever is already there, which for the mark is the dark
        // rounded square underneath everything else.
        const was = px[i + 3] / 255;
        const alpha = a + was * (1 - a);
        px[i] = Math.round((r * a + px[i] * was * (1 - a)) / alpha);
        px[i + 1] = Math.round((g * a + px[i + 1] * was * (1 - a)) / alpha);
        px[i + 2] = Math.round((b * a + px[i + 2] * was * (1 - a)) / alpha);
        px[i + 3] = Math.round(alpha * 255);
      }
    }
  }
  return px;
}

const png = (size) => encodePng(size, size, draw(size));

/* ------------------------------------------------------------------ .ico */

/**
 * A Windows icon: a six-byte header, one sixteen-byte entry per size, then the
 * images. Since Vista an entry may be a whole PNG rather than a bitmap, which
 * is what every size here is.
 */
function writeIco(sizes) {
  const images = sizes.map((s) => ({ size: s, data: png(s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);            // reserved
  header.writeUInt16LE(1, 2);            // 1 = icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = [];
  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry[0] = image.size >= 256 ? 0 : image.size;   // 0 means 256
    entry[1] = image.size >= 256 ? 0 : image.size;
    entry[2] = 0;                        // colours in the palette
    entry[3] = 0;                        // reserved
    entry.writeUInt16LE(1, 4);           // colour planes
    entry.writeUInt16LE(32, 6);          // bits per pixel
    entry.writeUInt32LE(image.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

/* ----------------------------------------------------------------- .icns */

/**
 * A macOS icon: "icns", the length of the whole file, then one block per
 * image - a four-character type saying what size it is, the block's length,
 * and the PNG.
 */
function writeIcns(blocks) {
  const parts = blocks.map(([type, size]) => {
    const data = png(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, 'latin1');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 4, 'latin1');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

/* ------------------------------------------------------------------ write */

const out = (rel, data) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log(String(data.length).padStart(8) + '  ' + rel);
};

out('assets/icon.png', png(256));
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
  out('desktop/icons/linux/' + size + 'x' + size + '.png', png(size));
}
out('desktop/icons/icon.ico', writeIco([16, 24, 32, 48, 64, 128, 256]));
out('desktop/icons/icon.icns', writeIcns([
  ['icp4', 16], ['icp5', 32], ['icp6', 64],
  ['ic07', 128], ['ic08', 256], ['ic09', 512],
  ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
]));

// zlib is imported for the deflate the PNG encoder does; naming it here keeps
// a reader from wondering where the compression happens.
void zlib;
