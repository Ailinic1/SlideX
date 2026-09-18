// A slide's drawing, as SVG.
//
// Copied from Newsx (web/shared/svg.js), which writes a newsletter page the
// same way.
//
// scene.js turns a slide into a flat list of drawing operations; this writes
// that list as SVG for the screen, and pdf.js writes the same list as a PDF.
// Nothing is decided here - positions, line breaks and colours all arrive
// decided - which is why the two can be trusted to agree.
//
// Operations, in slide points with y downwards:
//   {t:'rect', x, y, w, h, r, fill, stroke, lw, opacity}
//   {t:'ellipse', cx, cy, rx, ry, fill, stroke, lw, opacity}
//   {t:'line', x1, y1, x2, y2, stroke, lw, cap, dash, opacity}
//   {t:'path', segs, fill, stroke, lw, cap, join, opacity, evenodd}
//   {t:'text', x, y, text, family, bold, italic, size, fill, tracking, opacity}
//   {t:'image', asset, x, y, w, h, opacity}
//   {t:'group', el, clip: segs, opacity, items}

import { pathToD } from './path.js';
import { CSS_FAMILY } from './fonts.js';

const n = (v) => {
  const r = Math.round((Number(v) || 0) * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export const escXml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function paint(op, opacity) {
  let s = '';
  s += op.fill ? ' fill="' + op.fill + '"' : ' fill="none"';
  if (op.stroke && op.lw !== 0) {
    s += ' stroke="' + op.stroke + '" stroke-width="' + n(op.lw == null ? 1 : op.lw) + '"';
    if (op.cap) s += ' stroke-linecap="' + op.cap + '"';
    if (op.join) s += ' stroke-linejoin="' + op.join + '"';
    if (op.dash && op.dash.length) s += ' stroke-dasharray="' + op.dash.map(n).join(' ') + '"';
  }
  if (opacity < 1) s += ' opacity="' + n(opacity) + '"';
  return s;
}

/**
 * @param ops     the drawing
 * @param opts    {width, height, assetUrl(id) -> href, idPrefix, background, attrs}
 */
export function renderSVG(ops, opts = {}) {
  const prefix = opts.idPrefix || 'p';
  let clipCount = 0;
  const assetUrl = opts.assetUrl || ((id) => id);
  const out = [];
  const draw = (list, inherited) => {
    for (const op of list || []) {
      const opacity = inherited * (op.opacity == null ? 1 : op.opacity);
      if (opacity <= 0) continue;
      switch (op.t) {
        case 'rect':
          out.push('<rect x="' + n(op.x) + '" y="' + n(op.y) + '" width="' + n(Math.max(0, op.w)) + '" height="' + n(Math.max(0, op.h)) + '"' +
            (op.r ? ' rx="' + n(op.r) + '"' : '') + paint(op, opacity) + '/>');
          break;
        case 'ellipse':
          out.push('<ellipse cx="' + n(op.cx) + '" cy="' + n(op.cy) + '" rx="' + n(op.rx) + '" ry="' + n(op.ry) + '"' + paint(op, opacity) + '/>');
          break;
        case 'line':
          out.push('<line x1="' + n(op.x1) + '" y1="' + n(op.y1) + '" x2="' + n(op.x2) + '" y2="' + n(op.y2) + '"' + paint({ ...op, fill: null }, opacity) + '/>');
          break;
        case 'path':
          if (!op.segs || !op.segs.length) break;
          out.push('<path d="' + pathToD(op.segs) + '"' + (op.evenodd ? ' fill-rule="evenodd"' : '') + paint(op, opacity) + '/>');
          break;
        case 'text': {
          const attrs = ' x="' + n(op.x) + '" y="' + n(op.y) + '" font-family="' + escXml(CSS_FAMILY[op.family] || CSS_FAMILY.sans) +
            '" font-size="' + n(op.size) + '"' + (op.bold ? ' font-weight="700"' : '') + (op.italic ? ' font-style="italic"' : '') +
            (op.tracking ? ' letter-spacing="' + n(op.tracking) + '"' : '') +
            ' fill="' + (op.fill || '#000') + '"' + (opacity < 1 ? ' opacity="' + n(opacity) + '"' : '');
          out.push('<text' + attrs + ' xml:space="preserve">' + escXml(op.text) + '</text>');
          break;
        }
        case 'image':
          if (!op.asset) break;
          out.push('<image href="' + escXml(assetUrl(op.asset)) + '" x="' + n(op.x) + '" y="' + n(op.y) + '" width="' + n(op.w) + '" height="' + n(op.h) +
            '" preserveAspectRatio="none"' + (opacity < 1 ? ' opacity="' + n(opacity) + '"' : '') + '/>');
          break;
        case 'group': {
          let open = '<g' + (op.el ? ' data-el="' + escXml(op.el) + '"' : '');
          let clipDef = '';
          if (op.clip && op.clip.length) {
            const id = prefix + '-clip-' + (clipCount++);
            clipDef = '<clipPath id="' + id + '"><path d="' + pathToD(op.clip) + '"/></clipPath>';
            open += ' clip-path="url(#' + id + ')"';
          }
          out.push(clipDef + open + '>');
          draw(op.items, opacity);
          out.push('</g>');
          break;
        }
        default:
          break;
      }
    }
  };
  draw(ops, 1);
  const w = n(opts.width);
  const h = n(opts.height);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '"' +
    (opts.attrs || '') + ' style="font-kerning:none;text-rendering:geometricPrecision">' +
    (opts.background ? '<rect width="' + w + '" height="' + h + '" fill="' + opts.background + '"/>' : '') +
    out.join('') + '</svg>';
}
