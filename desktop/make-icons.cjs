'use strict';
/**
 * The program's icon, drawn for every place an operating system looks for one.
 *
 *   desktop/icons/icon.ico        Windows: the program, its shortcuts, the installer
 *   desktop/icons/icon.icns       macOS: the app, the Dock, the disk image
 *   desktop/icons/linux/NxN.png   Linux: the applications menu and the task bar
 *
 * All of them come from assets/icon.svg, so there is one drawing of the mark.
 * Each size is drawn from the vector at that size rather than shrunk from a big
 * one, so the 16-pixel icon in a task bar is sharp. Electron draws them - it is
 * already here to build the app - onto a canvas in a hidden page, and the two
 * container formats are simple enough to write by hand, so this needs nothing
 * else installed.
 *
 * The results are committed. Run `npm run icons` after the mark changes. It
 * borrows Electron for the drawing (npx fetches it; SlideX itself does not use
 * Electron) and, like any Electron program, needs a display, though its window
 * is never shown.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'icons');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets', 'icon.svg'), 'utf8');

const WINDOWS_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
// PNG-in-ICNS types, and the size each one is drawn at.
const MAC_TYPES = [
  ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
  ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
];

/** The drawing inside the mark's <svg>, to be placed on another canvas. */
const MARK = SOURCE.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

/** The mark filling its square, as Windows and Linux show icons. */
const FULL_BLEED = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' + MARK + '</svg>';

/**
 * The mark on Apple's icon grid. Every macOS app icon is a tile 824 units across
 * on a 1024 canvas, with a shadow in the margin; drawn edge to edge, ours would
 * sit in the Dock a size larger than everything beside it.
 */
const ON_MAC_GRID =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  // sRGB, or the filter works in linear light and the tile comes out a shade off #17181a.
  '<defs><filter id="shadow" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB">' +
  '<feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.3"/></filter></defs>' +
  '<g filter="url(#shadow)"><svg x="100" y="100" width="824" height="824" viewBox="0 0 32 32">' + MARK + '</svg></g></svg>';

/**
 * One size of one drawing: its PNG, and its pixels as BGRA rows top to bottom.
 * The browser scales the vector to the canvas, so every size is drawn, not shrunk.
 */
async function draw(page, svg, size) {
  const result = await page.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ${size};
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, ${size}, ${size});
    const rgba = ctx.getImageData(0, 0, ${size}, ${size}).data;
    let binary = '';
    for (let i = 0; i < rgba.length; i += 0x8000) binary += String.fromCharCode.apply(null, rgba.subarray(i, i + 0x8000));
    return { png: canvas.toDataURL('image/png').split(',')[1], rgba: btoa(binary) };
  })()`);
  const bgra = Buffer.from(result.rgba, 'base64');
  for (let i = 0; i < bgra.length; i += 4) {
    const red = bgra[i];
    bgra[i] = bgra[i + 2];
    bgra[i + 2] = red;
  }
  return { size, png: Buffer.from(result.png, 'base64'), bgra };
}

/**
 * An ICO file. The 256 image is stored as PNG, which is how Windows expects it
 * at that size; the rest as 32-bit bitmaps, which every reader of the format
 * understands - including NSIS, which builds the installer's icon from it.
 */
function ico(images) {
  const entries = images.map(({ size, png, bgra }) => {
    if (size >= 256) return png;
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(size, 4);
    header.writeInt32LE(size * 2, 8); // the colour rows, then the mask rows
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    const maskRow = Math.ceil(size / 32) * 4;
    header.writeUInt32LE(size * size * 4 + maskRow * size, 20);
    const rows = [];
    for (let y = size - 1; y >= 0; y--) rows.push(bgra.subarray(y * size * 4, (y + 1) * size * 4));
    return Buffer.concat([header, ...rows, Buffer.alloc(maskRow * size)]);
  });
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size }, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, at);
    head.writeUInt8(size >= 256 ? 0 : size, at + 1);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(entries[i].length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += entries[i].length;
  });
  return Buffer.concat([head, ...entries]);
}

/** An ICNS file: a header, then each image as a PNG under its type code. */
function icns(images) {
  const chunks = images.map(({ type, png }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

async function main() {
  const win = new BrowserWindow({ show: false, width: 64, height: 64 });
  await win.loadURL('about:blank');
  const page = win.webContents;
  fs.mkdirSync(path.join(OUT, 'linux'), { recursive: true });

  const windows = [];
  for (const size of WINDOWS_SIZES) windows.push(await draw(page, FULL_BLEED, size));
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(windows));

  for (const size of LINUX_SIZES) {
    const { png } = await draw(page, FULL_BLEED, size);
    fs.writeFileSync(path.join(OUT, 'linux', size + 'x' + size + '.png'), png);
  }

  const drawn = new Map();
  for (const [, size] of MAC_TYPES) {
    if (!drawn.has(size)) drawn.set(size, (await draw(page, ON_MAC_GRID, size)).png);
  }
  fs.writeFileSync(path.join(OUT, 'icon.icns'), icns(MAC_TYPES.map(([type, size]) => ({ type, png: drawn.get(size) }))));

  win.destroy();
  console.log('icons written to ' + path.relative(ROOT, OUT));
}

app.disableHardwareAcceleration();
app.whenReady().then(main).then(() => app.quit(), (error) => {
  console.error(error);
  app.exit(1);
});
