/**
 * The PDF writer.
 *
 * Copied from Newsx (src/lib/pdf.js), unchanged but for this note and the
 * program's name in the file's own metadata.
 *
 * It draws the same list of operations the screen draws (see web/shared/svg.js),
 * so what was on screen is what is in the file: same line breaks, same
 * positions, same colours. Text is real text in the standard Helvetica, Times
 * and Courier, so it can be searched, selected and read aloud; charts, icons and
 * generated graphics are vector paths; pictures are embedded once each however
 * many times they appear.
 *
 * No library: a PDF is a numbered list of objects and a table saying where each
 * one starts, and nothing here needs more than that.
 */
import zlib from 'zlib';
import { PDF_FONT, faceIndex, winAnsiCode, printable } from '../../web/shared/fonts.js';
import { roundedRect, ellipsePath } from '../../web/shared/path.js';
import { hexToRgb } from '../../web/shared/color.js';
import { imageKind, jpegInfo, decodePng } from './images.js';

const num = (v) => {
  const r = Math.round((Number(v) || 0) * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

function color(hex) {
  return hexToRgb(hex || '#000000').map((c) => num(c / 255)).join(' ');
}

function pdfString(s) {
  // Text strings in the document information dictionary, as UTF-16BE hex.
  const bytes = [0xfe, 0xff];
  for (const ch of String(s)) {
    const code = ch.codePointAt(0);
    if (code > 0xffff) {
      const v = code - 0x10000;
      const hi = 0xd800 + (v >> 10), lo = 0xdc00 + (v & 0x3ff);
      bytes.push(hi >> 8, hi & 255, lo >> 8, lo & 255);
    } else bytes.push(code >> 8, code & 255);
  }
  return '<' + Buffer.from(bytes).toString('hex') + '>';
}

function pdfDate(d) {
  const two = (n) => String(n).padStart(2, '0');
  return '(D:' + d.getUTCFullYear() + two(d.getUTCMonth() + 1) + two(d.getUTCDate()) + two(d.getUTCHours()) + two(d.getUTCMinutes()) + two(d.getUTCSeconds()) + 'Z)';
}

/**
 * @param pages   [{width, height, ops}]
 * @param opts    {title, author, subject, loadAsset(id) -> Buffer|null}
 * @returns {buffer, warnings}
 */
export function writePdf(pages, opts = {}) {
  const objects = []; // index + 1 is the object number
  const add = (body) => { objects.push(body); return objects.length; };
  const reserve = () => { objects.push(null); return objects.length; };
  const warnings = [];

  const catalog = reserve();
  const pagesRoot = reserve();
  const fonts = new Map(); // base font name -> {ref, key}
  const states = new Map(); // opacity -> {ref, key}
  const images = new Map(); // asset id -> {ref, key} | null

  const fontRef = (family, bold, italic) => {
    const name = (PDF_FONT[family] || PDF_FONT.sans)[faceIndex(bold, italic)];
    if (!fonts.has(name)) {
      const ref = add('<< /Type /Font /Subtype /Type1 /BaseFont /' + name + ' /Encoding /WinAnsiEncoding >>');
      fonts.set(name, { ref, key: 'F' + (fonts.size + 1) });
    }
    return fonts.get(name).key;
  };
  const stateRef = (opacity) => {
    const key = num(opacity);
    if (!states.has(key)) {
      const ref = add('<< /Type /ExtGState /ca ' + key + ' /CA ' + key + ' >>');
      states.set(key, { ref, key: 'GS' + (states.size + 1) });
    }
    return states.get(key).key;
  };
  const imageRef = (asset) => {
    if (images.has(asset)) return images.get(asset);
    let entry = null;
    try {
      const buf = opts.loadAsset ? opts.loadAsset(asset) : null;
      if (buf) entry = embedImage(buf, add);
    } catch (e) {
      warnings.push('A picture could not be put in the PDF: ' + e.message);
    }
    if (entry) entry.key = 'Im' + (images.size + 1);
    images.set(asset, entry);
    return entry;
  };

  const pageRefs = [];
  for (const page of pages) {
    const out = [];
    const H = page.height;
    // Everything is laid out with y running down the page, as on screen; one
    // flip at the start makes the PDF agree.
    out.push('1 0 0 -1 0 ' + num(H) + ' cm');
    const used = { fonts: new Set(), states: new Set(), images: new Set() };
    const withAlpha = (opacity, draw) => {
      if (opacity < 0.999) {
        const key = stateRef(opacity);
        used.states.add(key);
        out.push('q /' + key + ' gs');
        draw();
        out.push('Q');
      } else draw();
    };
    const pathOps = (segs) => {
      for (const s of segs) {
        if (s[0] === 'M') out.push(num(s[1]) + ' ' + num(s[2]) + ' m');
        else if (s[0] === 'L') out.push(num(s[1]) + ' ' + num(s[2]) + ' l');
        else if (s[0] === 'C') out.push(s.slice(1).map(num).join(' ') + ' c');
        else if (s[0] === 'Z') out.push('h');
      }
    };
    const paint = (op, segs) => {
      const fill = !!op.fill;
      const stroke = !!op.stroke && op.lw !== 0;
      if (!fill && !stroke) return;
      out.push('q');
      if (fill) out.push(color(op.fill) + ' rg');
      if (stroke) {
        out.push(color(op.stroke) + ' RG ' + num(op.lw == null ? 1 : op.lw) + ' w');
        out.push((op.cap === 'round' ? 1 : op.cap === 'square' ? 2 : 0) + ' J');
        out.push((op.join === 'round' ? 1 : op.join === 'bevel' ? 2 : 0) + ' j');
        if (op.dash && op.dash.length) out.push('[' + op.dash.map(num).join(' ') + '] 0 d');
      }
      pathOps(segs);
      out.push(fill && stroke ? (op.evenodd ? 'B*' : 'B') : fill ? (op.evenodd ? 'f*' : 'f') : 'S');
      out.push('Q');
    };
    const draw = (list, inherited) => {
      for (const op of list || []) {
        const opacity = inherited * (op.opacity == null ? 1 : op.opacity);
        if (opacity <= 0) continue;
        switch (op.t) {
          case 'rect':
            withAlpha(opacity, () => paint(op, roundedRect(op.x, op.y, Math.max(0, op.w), Math.max(0, op.h), op.r || 0)));
            break;
          case 'ellipse':
            withAlpha(opacity, () => paint(op, ellipsePath(op.cx, op.cy, op.rx, op.ry)));
            break;
          case 'line':
            withAlpha(opacity, () => paint({ ...op, fill: null }, [['M', op.x1, op.y1], ['L', op.x2, op.y2]]));
            break;
          case 'path':
            if (op.segs && op.segs.length) withAlpha(opacity, () => paint(op, op.segs));
            break;
          case 'text': {
            const text = printable(op.text);
            if (!text) break;
            const key = fontRef(op.family, op.bold, op.italic);
            used.fonts.add(key);
            let hex = '';
            for (const ch of text) hex += winAnsiCode(ch).toString(16).padStart(2, '0');
            withAlpha(opacity, () => {
              out.push('BT /' + key + ' ' + num(op.size) + ' Tf ' + color(op.fill) + ' rg ' +
                (op.tracking ? num(op.tracking) + ' Tc ' : '0 Tc ') +
                '1 0 0 -1 ' + num(op.x) + ' ' + num(op.y) + ' Tm <' + hex + '> Tj ET');
            });
            break;
          }
          case 'image': {
            const img = op.asset ? imageRef(op.asset) : null;
            if (!img) break;
            used.images.add(img.key);
            withAlpha(opacity, () => {
              out.push('q ' + num(op.w) + ' 0 0 ' + num(-op.h) + ' ' + num(op.x) + ' ' + num(op.y + op.h) + ' cm /' + img.key + ' Do Q');
            });
            break;
          }
          case 'group':
            out.push('q');
            if (op.clip && op.clip.length) { pathOps(op.clip); out.push('W n'); }
            draw(op.items, opacity);
            out.push('Q');
            break;
          default:
            break;
        }
      }
    };
    draw(page.ops, 1);

    const content = zlib.deflateSync(Buffer.from(out.join('\n'), 'latin1'));
    const contentRef = add({ dict: '<< /Length ' + content.length + ' /Filter /FlateDecode >>', stream: content });
    const res = [];
    if (used.fonts.size) res.push('/Font << ' + [...fonts.values()].filter((f) => used.fonts.has(f.key)).map((f) => '/' + f.key + ' ' + f.ref + ' 0 R').join(' ') + ' >>');
    if (used.states.size) res.push('/ExtGState << ' + [...states.values()].filter((s) => used.states.has(s.key)).map((s) => '/' + s.key + ' ' + s.ref + ' 0 R').join(' ') + ' >>');
    if (used.images.size) res.push('/XObject << ' + [...images.values()].filter((i) => i && used.images.has(i.key)).map((i) => '/' + i.key + ' ' + i.ref + ' 0 R').join(' ') + ' >>');
    const pageRef = add('<< /Type /Page /Parent ' + pagesRoot + ' 0 R /MediaBox [0 0 ' + num(page.width) + ' ' + num(page.height) + '] ' +
      '/Resources << /ProcSet [/PDF /Text /ImageB /ImageC] ' + res.join(' ') + ' >> /Contents ' + contentRef + ' 0 R >>');
    pageRefs.push(pageRef);
  }

  objects[pagesRoot - 1] = '<< /Type /Pages /Kids [' + pageRefs.map((r) => r + ' 0 R').join(' ') + '] /Count ' + pageRefs.length + ' >>';
  objects[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesRoot + ' 0 R /ViewerPreferences << /DisplayDocTitle true >> >>';
  const now = opts.date || new Date();
  const info = add('<< /Title ' + pdfString(opts.title || 'Presentation') + ' /Author ' + pdfString(opts.author || '') +
    ' /Subject ' + pdfString(opts.subject || '') + ' /Creator ' + pdfString('SlideX') + ' /Producer ' + pdfString('SlideX') +
    ' /CreationDate ' + pdfDate(now) + ' >>');

  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(offset);
    let buf;
    if (body && body.stream) {
      buf = Buffer.concat([Buffer.from((i + 1) + ' 0 obj\n' + body.dict + '\nstream\n', 'latin1'), body.stream, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    } else {
      buf = Buffer.from((i + 1) + ' 0 obj\n' + body + '\nendobj\n', 'latin1');
    }
    chunks.push(buf);
    offset += buf.length;
  });
  let xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (const o of offsets) xref += String(o).padStart(10, '0') + ' 00000 n \n';
  xref += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + offset + '\n%%EOF\n';
  chunks.push(Buffer.from(xref, 'latin1'));
  return { buffer: Buffer.concat(chunks), warnings };
}

function embedImage(buf, add) {
  const kind = imageKind(buf);
  if (kind === 'jpeg') {
    const info = jpegInfo(buf);
    if (!info) throw new Error('the JPEG could not be read');
    const space = info.components === 1 ? '/DeviceGray' : info.components === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
    const ref = add({ dict: '<< /Type /XObject /Subtype /Image /Width ' + info.width + ' /Height ' + info.height + ' /ColorSpace ' + space + ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' + buf.length + ' >>', stream: buf });
    return { ref };
  }
  if (kind === 'png') {
    const img = decodePng(buf);
    let smask = '';
    if (img.alpha) {
      const a = zlib.deflateSync(img.alpha);
      const maskRef = add({ dict: '<< /Type /XObject /Subtype /Image /Width ' + img.width + ' /Height ' + img.height + ' /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ' + a.length + ' >>', stream: a });
      smask = ' /SMask ' + maskRef + ' 0 R';
    }
    const data = zlib.deflateSync(img.rgb);
    const ref = add({ dict: '<< /Type /XObject /Subtype /Image /Width ' + img.width + ' /Height ' + img.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode' + smask + ' /Length ' + data.length + ' >>', stream: data });
    return { ref };
  }
  throw new Error('only PNG and JPEG pictures can go in a PDF');
}
