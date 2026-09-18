/**
 * Pictures, read far enough to put them in a PDF.
 *
 * A JPEG goes into a PDF as it is: the format already speaks DCT. A PNG has to
 * be undone - inflated, unfiltered, its palette looked up and its transparency
 * split off into a mask - because a PDF cannot read PNG itself. The page in the
 * browser re-encodes every picture as an ordinary PNG or JPEG when it is added,
 * so the unusual corners of the format (interlacing, 16-bit) rarely get here,
 * but they are handled rather than refused.
 */
import zlib from 'zlib';

export function imageKind(buf) {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  return null;
}

/** {width, height} without decoding the picture. */
export function imageSize(buf) {
  const kind = imageKind(buf);
  if (kind === 'png') return { kind, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (kind === 'jpeg') {
    const info = jpegInfo(buf);
    return info ? { kind, width: info.width, height: info.height } : null;
  }
  return null;
}

export function jpegInfo(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), components: buf[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}

/**
 * Decode a PNG to 8-bit RGB and, when it has any, an 8-bit alpha channel.
 * @returns {width, height, rgb: Buffer, alpha: Buffer|null}
 */
export function decodePng(buf) {
  let pos = 8;
  let header = null;
  let palette = null;
  let trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!header) throw new Error('The picture is not a readable PNG.');
  const { width, height, depth, color } = header;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!channels) throw new Error('The picture uses a PNG colour type this program cannot read.');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bitsPerPixel = channels * depth;
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));

  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height, 255);
  let hasAlpha = color === 4 || color === 6 || !!trns;

  const passes = header.interlace
    ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
    : [[0, 0, 1, 1]];
  let offset = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((width - x0) / dx);
    const ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil((pw * bitsPerPixel) / 8);
    let prev = Buffer.alloc(stride);
    for (let row = 0; row < ph; row++) {
      const filter = raw[offset];
      const line = Buffer.from(raw.subarray(offset + 1, offset + 1 + stride));
      offset += 1 + stride;
      unfilter(filter, line, prev, bytesPerPixel);
      for (let col = 0; col < pw; col++) {
        const px = x0 + col * dx;
        const py = y0 + row * dy;
        const o = py * width + px;
        const sample = (i) => readSample(line, col * channels + i, depth);
        const max = (1 << depth) - 1;
        const to8 = (v) => (depth === 8 ? v : depth === 16 ? v >> 8 : Math.round((v * 255) / max));
        let r, g, b, a = 255;
        if (color === 0) {
          const v = sample(0);
          r = g = b = to8(v);
          if (trns && trns.length >= 2 && v === trns.readUInt16BE(0)) a = 0;
        } else if (color === 2) {
          const [vr, vg, vb] = [sample(0), sample(1), sample(2)];
          r = to8(vr); g = to8(vg); b = to8(vb);
          if (trns && trns.length >= 6 && vr === trns.readUInt16BE(0) && vg === trns.readUInt16BE(2) && vb === trns.readUInt16BE(4)) a = 0;
        } else if (color === 3) {
          const idx = sample(0);
          r = palette ? palette[idx * 3] : 0; g = palette ? palette[idx * 3 + 1] : 0; b = palette ? palette[idx * 3 + 2] : 0;
          if (trns && idx < trns.length) a = trns[idx];
        } else if (color === 4) {
          r = g = b = to8(sample(0)); a = to8(sample(1));
        } else {
          r = to8(sample(0)); g = to8(sample(1)); b = to8(sample(2)); a = to8(sample(3));
        }
        rgb[o * 3] = r; rgb[o * 3 + 1] = g; rgb[o * 3 + 2] = b;
        alpha[o] = a;
      }
      prev = line;
    }
  }
  if (hasAlpha) hasAlpha = alpha.some((v) => v !== 255);
  return { width, height, rgb, alpha: hasAlpha ? alpha : null };
}

function readSample(line, index, depth) {
  if (depth === 8) return line[index];
  if (depth === 16) return line.readUInt16BE(index * 2);
  const bit = index * depth;
  const byte = line[bit >> 3];
  const shift = 8 - depth - (bit & 7);
  return (byte >> shift) & ((1 << depth) - 1);
}

function unfilter(filter, line, prev, bpp) {
  for (let i = 0; i < line.length; i++) {
    const left = i >= bpp ? line[i - bpp] : 0;
    const up = prev[i] || 0;
    const upLeft = i >= bpp ? prev[i - bpp] || 0 : 0;
    switch (filter) {
      case 1: line[i] = (line[i] + left) & 255; break;
      case 2: line[i] = (line[i] + up) & 255; break;
      case 3: line[i] = (line[i] + ((left + up) >> 1)) & 255; break;
      case 4: {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255;
        break;
      }
      default: break;
    }
  }
}

/** A tiny PNG writer, for the tests and for generated previews. */
export function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy ? rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
      : Buffer.from(rgba.slice(y * width * 4, (y + 1) * width * 4)).copy(raw, y * (width * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
