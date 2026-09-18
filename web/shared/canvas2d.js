// A slide's drawing, onto a 2D canvas.
//
// The third renderer, beside svg.js for the screen and src/lib/pdf.js for the
// PDF, and it exists for one reason: a PNG of a slide.
//
// A PNG could be had by loading the SVG into an <img> and drawing that, but a
// browser will not load the pictures inside an SVG loaded as an image, so every
// photograph in the deck would come out blank. Drawing the operations here
// instead means a PNG with everything in it - and, because the operations are
// the same ones the PDF is written from, a PNG that is the same picture as the
// PDF, down to where each line breaks.
//
// Browser only: it wants a CanvasRenderingContext2D. Nothing else in
// web/shared/ does, so nothing else has to care.

import { CSS_FAMILY } from './fonts.js';

/**
 * Draw a list of operations onto a canvas context.
 *
 * @param ctx    a CanvasRenderingContext2D, already scaled if you want it bigger
 * @param ops    the drawing, from renderSlide()
 * @param opts   {images: {assetId: HTMLImageElement}}
 */
export function drawOps(ctx, ops, opts = {}) {
  const images = opts.images || {};

  const path = (segs) => {
    ctx.beginPath();
    for (const s of segs) {
      if (s[0] === 'M') ctx.moveTo(s[1], s[2]);
      else if (s[0] === 'L') ctx.lineTo(s[1], s[2]);
      else if (s[0] === 'C') ctx.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]);
      else if (s[0] === 'Z') ctx.closePath();
    }
  };

  const paint = (op) => {
    if (op.fill) {
      ctx.fillStyle = op.fill;
      ctx.fill(op.evenodd ? 'evenodd' : 'nonzero');
    }
    if (op.stroke && op.lw !== 0) {
      ctx.strokeStyle = op.stroke;
      ctx.lineWidth = op.lw == null ? 1 : op.lw;
      ctx.lineCap = op.cap || 'butt';
      ctx.lineJoin = op.join || 'miter';
      ctx.setLineDash(op.dash && op.dash.length ? op.dash : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const draw = (list, inherited) => {
    for (const op of list || []) {
      const opacity = inherited * (op.opacity == null ? 1 : op.opacity);
      if (opacity <= 0) continue;
      ctx.globalAlpha = opacity;
      switch (op.t) {
        case 'rect': {
          const w = Math.max(0, op.w);
          const h = Math.max(0, op.h);
          ctx.beginPath();
          if (op.r) roundRect(ctx, op.x, op.y, w, h, Math.min(op.r, w / 2, h / 2));
          else ctx.rect(op.x, op.y, w, h);
          paint(op);
          break;
        }
        case 'ellipse':
          ctx.beginPath();
          ctx.ellipse(op.cx, op.cy, Math.abs(op.rx), Math.abs(op.ry), 0, 0, Math.PI * 2);
          paint(op);
          break;
        case 'line':
          ctx.beginPath();
          ctx.moveTo(op.x1, op.y1);
          ctx.lineTo(op.x2, op.y2);
          paint({ ...op, fill: null });
          break;
        case 'path':
          if (!op.segs || !op.segs.length) break;
          path(op.segs);
          paint(op);
          break;
        case 'text': {
          // The same families the screen asks for, so a PNG and the editor set
          // the words in the same face. Where each word sits was decided long
          // before this, by fonts.js, so nothing is measured here.
          ctx.font = (op.italic ? 'italic ' : '') + (op.bold ? '700 ' : '400 ') + op.size + 'px ' + (CSS_FAMILY[op.family] || CSS_FAMILY.sans);
          ctx.fillStyle = op.fill || '#000';
          ctx.textBaseline = 'alphabetic';
          if (op.tracking) {
            // Canvas has letterSpacing only lately, so a tracked line is drawn
            // a character at a time rather than trusting it.
            let x = op.x;
            for (const ch of op.text) {
              ctx.fillText(ch, x, op.y);
              x += ctx.measureText(ch).width + op.tracking;
            }
          } else {
            ctx.fillText(op.text, op.x, op.y);
          }
          break;
        }
        case 'image': {
          const img = images[op.asset];
          if (!img) break;
          try { ctx.drawImage(img, op.x, op.y, op.w, op.h); } catch (e) { /* a picture that will not draw is left out */ }
          break;
        }
        case 'group':
          ctx.save();
          if (op.clip && op.clip.length) { path(op.clip); ctx.clip(); }
          draw(op.items, opacity);
          ctx.restore();
          break;
        default:
          break;
      }
    }
    ctx.globalAlpha = 1;
  };

  draw(ops, 1);
}

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Every picture a drawing uses, loaded and ready to draw. */
export function loadImages(ops, assetUrl) {
  const wanted = new Set();
  const walk = (list) => {
    for (const op of list || []) {
      if (op.t === 'image' && op.asset) wanted.add(op.asset);
      if (op.t === 'group') walk(op.items);
    }
  };
  walk(ops);
  return Promise.all([...wanted].map((asset) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve([asset, img]);
    img.onerror = () => resolve(null);
    img.src = assetUrl(asset);
  }))).then((pairs) => Object.fromEntries(pairs.filter(Boolean)));
}

/**
 * One slide as a PNG.
 *
 * @param opts {width: how many pixels across, assetUrl}
 * @returns a Blob
 */
export async function slideToPng(ops, size, opts = {}) {
  const width = Math.max(64, Math.round(opts.width || size.width * 2));
  const k = width / size.width;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(size.height * k);
  const ctx = canvas.getContext('2d');
  // A slide has a background of its own, but a PNG of one that does not - a
  // blank layout, say - should be white rather than transparent, because it is
  // going into a document.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(k, k);
  const images = await loadImages(ops, opts.assetUrl || ((id) => id));
  drawOps(ctx, ops, { images });
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
