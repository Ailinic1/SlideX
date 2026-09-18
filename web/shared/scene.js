// A slide, as drawing operations.
//
// Adapted from Newsx (web/shared/scene.js), which draws a newsletter page the
// same way.
//
// Everything the screen, the projector and the PDF show comes out of
// renderSlide(): the layout's elements with the slide's differences applied,
// each turned into rectangles, paths, words and pictures in slide points. It
// also reports what it noticed while drawing - words that did not fit, a
// missing picture, a reference to a slide that is gone - which is what the
// check panel reads.

import { resolveColor, textOn, mix, contrast } from './color.js';
import { layoutText } from './text.js';
import { renderChart, iconOps, formatNumber, fitText } from './charts.js';
import { renderPattern } from './patterns.js';
import { roundedRect, ellipsePath } from './path.js';
import { measure, printable } from './fonts.js';
import { fillFields, fieldTemplate, agendaText, numbering, resolveReference } from './model.js';

/**
 * @param slide a resolved slide: {background, elements}
 * @param ctx   {deck, slide: the slide record, numbers, assets: {id: {width, height}},
 *               date, draft: true on screen}
 * @returns {ops, report: {elementId: {overflow, hiddenWords, missing, ...}}, width, height}
 */
export function renderSlide(slide, ctx) {
  const deck = ctx.deck;
  const palette = deck.palette;
  const W = deck.size.width;
  const H = deck.size.height;
  const numbers = ctx.numbers || numbering(deck);
  const inner = { ...ctx, numbers };
  const ops = [];
  const report = {};
  const bg = resolveColor(slide.background || 'paper', palette) || '#ffffff';
  ops.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: bg });
  for (const el of slide.elements || []) {
    if (el.hidden) continue;
    const items = [];
    const note = {};
    try {
      drawElement(items, el, inner, palette, note);
    } catch (e) {
      note.error = e.message;
    }
    if (Object.keys(note).length) report[el.id] = note;
    ops.push({ t: 'group', el: el.id, clip: null, opacity: el.style && el.style.opacity != null ? Number(el.style.opacity) : 1, items });
  }
  return { ops, report, width: W, height: H };
}

function frame(items, el, palette) {
  const s = el.style || {};
  const fill = resolveColor(s.fill, palette);
  const stroke = resolveColor(s.stroke, palette);
  if (fill || stroke) {
    items.push({ t: 'rect', x: el.x, y: el.y, w: el.w, h: el.h, r: Number(s.radius) || 0, fill, stroke, lw: Number(s.lw) || 1 });
  }
  const pad = Math.max(0, Number(s.padding) || 0);
  return { x: el.x + pad, y: el.y + pad, w: Math.max(1, el.w - pad * 2), h: Math.max(1, el.h - pad * 2) };
}

function drawElement(items, el, ctx, palette, note) {
  const s = el.style || {};
  const c = el.content || {};
  switch (el.type) {
    case 'text': {
      const box = frame(items, el, palette);
      drawText(items, fillFields(c.text, ctx), box, s, palette, note);
      break;
    }
    case 'field': {
      const box = frame(items, el, palette);
      drawText(items, fillFields(fieldTemplate(c), ctx), box, { ...s, placeholder: false }, palette, note);
      break;
    }
    case 'reference': {
      const box = frame(items, el, palette);
      const target = c.target || null;
      const found = target ? resolveReference(ctx.deck, target, ctx.numbers) : { ok: false };
      // A reference whose slide has been deleted says so on the slide. Showing
      // a number here would be showing somebody else's number.
      if (!found.ok) {
        note.brokenReference = target || '';
        const text = ctx.draft ? (target ? '→ that slide is gone' : '→ not pointed at a slide yet') : '';
        if (text) drawText(items, text, box, { ...s, color: 'muted', placeholder: false }, palette, note);
        break;
      }
      drawText(items, fillFields(c.text || 'see slide {ref}', { ...ctx, target }), box, { ...s, placeholder: false }, palette, note);
      break;
    }
    case 'agenda': {
      const box = frame(items, el, palette);
      drawAgenda(items, el, box, ctx, palette, note);
      break;
    }
    case 'shape':
      drawShape(items, el, palette);
      break;
    case 'line':
      drawLine(items, el, palette);
      break;
    case 'image':
      drawImage(items, el, ctx, palette, note);
      break;
    case 'icon':
      drawIcon(items, el, palette);
      break;
    case 'chart': {
      const box = frame(items, el, palette);
      items.push(...renderChart(c, box, { palette, family: s.family || 'sans', size: Number(s.size) || 0, color: s.color }));
      break;
    }
    case 'table':
      drawTable(items, el, ctx, palette, note);
      break;
    case 'code':
      drawCode(items, el, palette, note);
      break;
    case 'stat':
      drawStat(items, el, ctx, palette);
      break;
    case 'pattern': {
      const fill = resolveColor(s.fill, palette);
      const clip = roundedRect(el.x, el.y, el.w, el.h, Number(s.radius) || 0);
      const inner = [];
      if (fill) inner.push({ t: 'rect', x: el.x, y: el.y, w: el.w, h: el.h, fill });
      inner.push(...renderPattern({ ...s, seed: c.seed }, { x: el.x, y: el.y, w: el.w, h: el.h }, palette));
      items.push({ t: 'group', clip, items: inner });
      break;
    }
    default:
      break;
  }
}

export function drawText(items, text, box, s, palette, note) {
  const layout = layoutText(text, box, s);
  const color = resolveColor(s.color || 'ink', palette);
  const accent = resolveColor(s.accentColor || 'accent', palette);
  for (const line of layout.lines) {
    for (const w of line.words) {
      items.push({ t: 'text', x: box.x + w.x, y: box.y + line.y, text: w.text, family: s.family || 'sans', bold: w.bold, italic: w.italic, size: w.size, tracking: w.tracking, fill: color });
    }
  }
  for (const m of layout.marks) {
    if (m.kind === 'bar') items.push({ t: 'rect', x: box.x + m.x, y: box.y + m.y, w: m.w, h: m.h, r: m.w / 2, fill: accent });
    else items.push({ t: 'text', x: box.x + m.x, y: box.y + m.y, text: m.text, family: s.family || 'sans', bold: m.bold, size: m.size, fill: m.kind === 'bullet' ? accent : color });
  }
  if (note && layout.overflow) {
    note.overflow = true;
    note.hiddenWords = layout.hiddenWords;
  }
  if (note && s.fit === 'shrink' && layout.size < (Number(s.size) || 17) - 0.05) note.shrunk = Math.round((layout.size / (Number(s.size) || 17)) * 100);
  // Type that shrank until nobody at the back can read it is a slide that
  // failed at its one job. Type that was small on purpose - a footer, a
  // caption - is not, so this only fires when shrinking to fit did it.
  if (note && s.fit === 'shrink' && layout.lines.length && layout.size < 12 && layout.size < (Number(s.size) || 17) - 0.05) {
    note.tiny = Math.round(layout.size * 10) / 10;
  }
  if (note && !String(text || '').trim() && s.placeholder !== false) note.empty = true;
  return layout;
}

function drawAgenda(items, el, box, ctx, palette, note) {
  const s = el.style || {};
  const c = el.content || {};
  const text = agendaText(c, ctx);
  if (!text) {
    note.empty = true;
    if (!ctx.draft) return;
    drawText(items, c.source === 'titles' ? 'No slide has a title yet.' : 'The deck has no sections yet.', box, { ...s, color: 'muted', italic: true }, palette, {});
    return;
  }
  // The numbers down the left are in the accent, the titles in the text
  // colour, which is what makes an agenda read as a list rather than a
  // paragraph that happens to have digits in it.
  drawText(items, text, box, { ...s, accentColor: s.numberColor || 'accent' }, palette, note);
}

function drawShape(items, el, palette) {
  const s = el.style || {};
  const fill = resolveColor(s.fill, palette);
  const stroke = resolveColor(s.stroke, palette);
  const lw = Number(s.lw) || 1;
  switch (s.shape) {
    case 'ellipse':
      items.push({ t: 'path', segs: ellipsePath(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2), fill, stroke, lw });
      break;
    case 'pill':
      items.push({ t: 'rect', x: el.x, y: el.y, w: el.w, h: el.h, r: Math.min(el.w, el.h) / 2, fill, stroke, lw });
      break;
    case 'triangle':
      items.push({ t: 'path', segs: [['M', el.x + el.w / 2, el.y], ['L', el.x + el.w, el.y + el.h], ['L', el.x, el.y + el.h], ['Z']], fill, stroke, lw, join: 'round' });
      break;
    case 'diamond':
      items.push({ t: 'path', segs: [['M', el.x + el.w / 2, el.y], ['L', el.x + el.w, el.y + el.h / 2], ['L', el.x + el.w / 2, el.y + el.h], ['L', el.x, el.y + el.h / 2], ['Z']], fill, stroke, lw, join: 'round' });
      break;
    case 'chevron': {
      const notch = Math.min(el.w * 0.25, el.h / 2);
      items.push({ t: 'path', segs: [['M', el.x, el.y], ['L', el.x + el.w - notch, el.y], ['L', el.x + el.w, el.y + el.h / 2], ['L', el.x + el.w - notch, el.y + el.h], ['L', el.x, el.y + el.h], ['L', el.x + notch, el.y + el.h / 2], ['Z']], fill, stroke, lw, join: 'round' });
      break;
    }
    case 'corner':
      items.push({ t: 'path', segs: [['M', el.x, el.y], ['L', el.x + el.w, el.y], ['L', el.x, el.y + el.h], ['Z']], fill, stroke, lw });
      break;
    default:
      items.push({ t: 'rect', x: el.x, y: el.y, w: el.w, h: el.h, r: Number(s.radius) || 0, fill, stroke, lw });
  }
}

/**
 * A line or an arrow. Its ends are fractions of its box, so it is a box like
 * everything else and snapping, aligning and resizing all work on it.
 */
function drawLine(items, el, palette) {
  const s = el.style || {};
  const c = el.content || {};
  const from = Array.isArray(c.from) ? c.from : [0, 0.5];
  const to = Array.isArray(c.to) ? c.to : [1, 0.5];
  const x1 = el.x + from[0] * el.w;
  const y1 = el.y + from[1] * el.h;
  const x2 = el.x + to[0] * el.w;
  const y2 = el.y + to[1] * el.h;
  const stroke = resolveColor(s.stroke || 'rule', palette);
  const lw = Math.max(0.25, Number(s.lw) || 2);
  const head = (hx, hy, ox, oy, kind) => {
    if (!kind || kind === 'none') return;
    const angle = Math.atan2(hy - oy, hx - ox);
    const size = Math.max(5, lw * 3.2);
    if (kind === 'dot') {
      items.push({ t: 'ellipse', cx: hx, cy: hy, rx: size * 0.38, ry: size * 0.38, fill: stroke });
      return;
    }
    const wing = (turn) => [hx - Math.cos(angle + turn) * size, hy - Math.sin(angle + turn) * size];
    const a = wing(0.42);
    const b = wing(-0.42);
    items.push({ t: 'path', segs: [['M', ...a], ['L', hx, hy], ['L', ...b], ...(kind === 'arrow' ? [['Z']] : [])], fill: kind === 'arrow' ? stroke : null, stroke, lw, join: 'round', cap: 'round' });
  };
  items.push({ t: 'line', x1, y1, x2, y2, stroke, lw, cap: s.cap || 'round', dash: s.dash ? [lw * 3, lw * 2.4] : null });
  head(x2, y2, x1, y1, s.endHead);
  head(x1, y1, x2, y2, s.startHead);
}

function drawImage(items, el, ctx, palette, note) {
  const s = el.style || {};
  const c = el.content || {};
  const clip = roundedRect(el.x, el.y, el.w, el.h, Number(s.radius) || 0);
  const info = c.asset && ctx.assets ? ctx.assets[c.asset] : null;
  if (!c.asset || (ctx.assets && !info)) {
    note.missing = true;
    if (ctx.draft) {
      const tint = resolveColor('tint', palette);
      const muted = resolveColor('muted', palette);
      items.push({ t: 'path', segs: clip, fill: tint, stroke: mix(muted, tint, 0.55), lw: 0.8 });
      const size = Math.min(el.w, el.h) * 0.3;
      items.push(...iconOps('image', el.x + (el.w - size) / 2, el.y + (el.h - size) / 2, size, mix(muted, tint, 0.3)));
    }
    return;
  }
  const iw = info ? info.width : el.w;
  const ih = info ? info.height : el.h;
  let dw, dh;
  if (s.fit === 'contain') {
    const k = Math.min(el.w / iw, el.h / ih);
    dw = iw * k; dh = ih * k;
  } else if (s.fit === 'stretch') {
    dw = el.w; dh = el.h;
  } else {
    const k = Math.max(el.w / iw, el.h / ih);
    dw = iw * k; dh = ih * k;
  }
  const fx = c.focusX == null ? 0.5 : Number(c.focusX);
  const fy = c.focusY == null ? 0.5 : Number(c.focusY);
  const x = el.x + (el.w - dw) * fx;
  const y = el.y + (el.h - dh) * fy;
  // A projector is about 1920 pixels across a slide 960 points wide, so a
  // picture wants about two pixels a point to look sharp rather than soft.
  if (info && info.width) {
    const perPoint = info.width / dw;
    if (perPoint < 1.1) note.lowResolution = Math.round(perPoint * 100) / 100;
  }
  items.push({ t: 'group', clip, items: [{ t: 'image', asset: c.asset, x, y, w: dw, h: dh }] });
  const stroke = resolveColor(s.stroke, palette);
  if (stroke) items.push({ t: 'path', segs: clip, stroke, lw: Number(s.lw) || 1 });
}

function drawIcon(items, el, palette) {
  const s = el.style || {};
  const c = el.content || {};
  const size = Math.min(el.w, el.h);
  const x = el.x + (el.w - size) / 2;
  const y = el.y + (el.h - size) / 2;
  const badge = s.badge || 'none';
  let color = resolveColor(s.color && s.color !== 'auto' ? s.color : 'primary', palette);
  const weight = Number(s.weight) || 1;
  if (badge === 'none') {
    items.push(...iconOps(c.icon, x, y, size, color, weight));
    return;
  }
  const badgeColor = resolveColor(s.badgeColor || 'tint', palette);
  if (badge === 'circle') items.push({ t: 'path', segs: ellipsePath(x + size / 2, y + size / 2, size / 2, size / 2), fill: badgeColor });
  else if (badge === 'rounded') items.push({ t: 'rect', x, y, w: size, h: size, r: size * 0.24, fill: badgeColor });
  else if (badge === 'ring') items.push({ t: 'path', segs: ellipsePath(x + size / 2, y + size / 2, size / 2 - size * 0.03, size / 2 - size * 0.03), stroke: badgeColor, lw: size * 0.05 });
  // An icon the colour of its own badge would vanish; it takes whichever of
  // ink and paper reads on the badge instead.
  if (badge !== 'ring' && (s.color == null || s.color === 'auto' || color === badgeColor)) color = textOn(badgeColor, palette);
  const inner = size * 0.58;
  items.push(...iconOps(c.icon, x + (size - inner) / 2, y + (size - inner) / 2, inner, color, weight * (size / inner) * 0.9));
}

/**
 * A table.
 *
 * Rows are plain strings, so a block pasted from a spreadsheet is a table
 * without anybody mapping columns to anything. Columns are as wide as their
 * widest cell wants, shared out from what there is.
 */
function drawTable(items, el, ctx, palette, note) {
  const s = el.style || {};
  const rows = ((el.content || {}).rows || []).map((r) => (Array.isArray(r) ? r.map((cell) => printable(fillFields(cell, ctx))) : []));
  if (!rows.length) { note.empty = true; return; }
  const box = frame(items, el, palette);
  const cols = Math.max(...rows.map((r) => r.length), 1);
  const hasHead = s.header !== false && rows.length > 1;
  const pad = Math.max(2, Number(s.padding) || 8);
  const size = Math.max(6, Number(s.size) || 14);
  const font = { family: s.family || 'sans', size };
  const ink = resolveColor(s.color || 'ink', palette);
  const rule = resolveColor(s.rule || 'rule', palette);
  const headFill = hasHead ? resolveColor(s.headFill || 'primary', palette) : null;
  const headInk = headFill ? textOn(headFill, palette) : ink;

  // How wide each column wants to be, then squeezed to the width there is.
  const want = [];
  for (let c = 0; c < cols; c++) {
    let w = 0;
    rows.forEach((r, i) => {
      w = Math.max(w, measure(String(r[c] == null ? '' : r[c]), { ...font, bold: hasHead && i === 0 }));
    });
    want.push(w + pad * 2);
  }
  const total = want.reduce((n, w) => n + w, 0);
  const widths = total <= box.w ? want.map((w) => w + (box.w - total) / cols) : want.map((w) => (w / total) * box.w);
  const rowH = box.h / rows.length;
  if (rowH < size * 1.15) note.overflow = true;

  rows.forEach((row, i) => {
    const y = box.y + i * rowH;
    const head = hasHead && i === 0;
    if (head && headFill) items.push({ t: 'rect', x: box.x, y, w: box.w, h: rowH, r: Number(s.radius) || 0, fill: headFill });
    else if (s.zebra !== false && (i - (hasHead ? 1 : 0)) % 2 === 1) items.push({ t: 'rect', x: box.x, y, w: box.w, h: rowH, fill: resolveColor('tint', palette) });
    if (!head && i > 0) items.push({ t: 'line', x1: box.x, y1: y, x2: box.x + box.w, y2: y, stroke: rule, lw: 0.6 });
    let x = box.x;
    for (let c = 0; c < cols; c++) {
      const cell = String(row[c] == null ? '' : row[c]);
      const f = { ...font, bold: head };
      // A number belongs against the right of its column; words against the left.
      const numeric = !head && /^[\s$€£]*-?[\d,.]+%?$/.test(cell.trim()) && cell.trim() !== '';
      const text = fitText(cell, widths[c] - pad * 2, f);
      const w = measure(text, f);
      items.push({
        t: 'text',
        x: numeric ? x + widths[c] - pad - w : x + pad,
        y: y + rowH / 2 + size * 0.35,
        text, family: f.family, bold: head, size, fill: head ? headInk : ink,
      });
      if (text !== cell) note.clipped = true;
      x += widths[c];
    }
  });
}

/**
 * A code block: monospaced, never wrapped, never re-indented.
 *
 * Code that wraps is code nobody can read, so a line too long for the box is
 * reported rather than folded - the check panel says which slide, and the
 * answer is a shorter line or a bigger box.
 */
function drawCode(items, el, palette, note) {
  const s = el.style || {};
  const box = frame(items, el, palette);
  const lines = String((el.content || {}).code || '').replace(/\r\n?/g, '\n').split('\n');
  if (!lines.some((l) => l.trim())) { note.empty = true; return; }
  const size = Math.max(5, Number(s.size) || 14);
  const lh = size * (Number(s.lineHeight) || 1.45);
  const ink = resolveColor(s.color || 'ink', palette);
  const muted = resolveColor('muted', palette);
  const font = { family: 'mono', size };
  const gutter = s.numbers ? measure(String(lines.length), font) + size * 0.8 : 0;
  const avail = box.w - gutter;
  let over = 0;
  lines.forEach((line, i) => {
    const y = box.y + lh * (i + 0.5) + size * 0.35;
    if (y > box.y + box.h + 0.5) { over++; return; }
    if (s.numbers) items.push({ t: 'text', x: box.x, y, text: String(i + 1), family: 'mono', size, fill: muted });
    const text = printable(line.replace(/\t/g, '    '));
    if (measure(text, font) > avail + 0.5) note.clipped = true;
    items.push({ t: 'text', x: box.x + gutter, y, text, family: 'mono', size, fill: ink });
  });
  if (over) { note.overflow = true; note.hiddenWords = over; }
}

function drawStat(items, el, ctx, palette) {
  const s = el.style || {};
  const c = el.content || {};
  const box = frame(items, el, palette);
  const color = resolveColor(s.color || 'primary', palette);
  const labelColor = resolveColor(s.labelColor || 'muted', palette);
  const family = s.family || 'sans';
  const rawValue = fillFields(c.value, ctx);
  const value = /^[\d,.\s-]+$/.test(rawValue) && rawValue.trim() ? formatNumber(rawValue, { decimals: String(rawValue).includes('.') ? undefined : 0 }) : rawValue;
  const label = fillFields(c.label, ctx);
  const hasIcon = c.icon && s.iconSide && s.iconSide !== 'none';
  const pad = resolveColor(s.fill, palette) && !(Number(s.padding) > 0) ? Math.min(box.w, box.h) * 0.12 : 0;
  const inner = { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 };
  let tx = inner.x;
  let tw = inner.w;
  let top = inner.y;
  let availH = inner.h;
  if (hasIcon && s.iconSide === 'top') {
    const size = Math.min(inner.h * 0.3, inner.w * 0.4);
    items.push(...iconOps(c.icon, s.align === 'center' ? inner.x + (inner.w - size) / 2 : inner.x, inner.y, size, color));
    top += size * 1.15;
    availH -= size * 1.15;
  } else if (hasIcon) {
    const size = Math.min(inner.h * 0.7, inner.w * 0.3);
    items.push(...iconOps(c.icon, inner.x, inner.y + (inner.h - size) / 2, size, color));
    tx += size * 1.25;
    tw -= size * 1.25;
  }
  const bigSize = Math.max(8, Math.min(availH * 0.62, (tw * 0.98) / Math.max(0.3, measure(value, { family, bold: true, size: 1 }))));
  const labelSize = Math.max(7, Math.min(Math.max(10, bigSize * 0.26), availH * 0.24));
  const labelLayout = layoutText(label, { w: tw, h: Math.max(labelSize * 1.3, availH - bigSize * 1.05) }, { family, size: labelSize, lineHeight: 1.25, align: s.align === 'center' && s.iconSide !== 'left' ? 'center' : 'left', fit: 'shrink' });
  const blockH = bigSize * 0.95 + labelLayout.height;
  const y0 = top + Math.max(0, (availH - blockH) / 2);
  const center = s.align === 'center' && s.iconSide !== 'left';
  const vw = measure(value, { family, bold: true, size: bigSize });
  items.push({ t: 'text', x: center ? tx + (tw - vw) / 2 : tx, y: y0 + bigSize * 0.78, text: value, family, bold: true, size: bigSize, fill: color });
  for (const line of labelLayout.lines) {
    for (const w of line.words) {
      items.push({ t: 'text', x: tx + w.x, y: y0 + bigSize * 0.95 + line.y, text: w.text, family, bold: w.bold, italic: w.italic, size: w.size, fill: labelColor });
    }
  }
}

/**
 * Whether the words of an element read on what is behind them.
 *
 * Only shapes underneath that cover the element count: a coloured band a
 * heading sits on, a tinted panel behind a paragraph. It is the same question
 * the generator asks itself before it puts text on a fill, asked again of a
 * slide somebody has changed by hand.
 */
export function contrastOf(elements, el, palette) {
  const s = el.style || {};
  if (!s.color) return null;
  const index = elements.indexOf(el);
  let behind = null;
  for (let i = 0; i < index; i++) {
    const other = elements[i];
    if (other.hidden) continue;
    const fill = other.type === 'shape' || other.type === 'text' ? (other.style || {}).fill : null;
    if (!fill) continue;
    if (el.x >= other.x - 0.5 && el.y >= other.y - 0.5 && el.x + el.w <= other.x + other.w + 0.5 && el.y + el.h <= other.y + other.h + 0.5) behind = fill;
  }
  const back = resolveColor(behind || 'paper', palette);
  const front = resolveColor(s.color, palette);
  if (!back || !front) return null;
  return { ratio: contrast(front, back), on: behind || 'paper' };
}

export { fitText };
