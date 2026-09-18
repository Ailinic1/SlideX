/**
 * A deck as a PDF.
 *
 * Adapted from Newsx (src/lib/render.js).
 *
 * One slide to a page, in the deck's order, at the size the slides are - so a
 * 16:9 deck makes a 16:9 PDF, not a letter page with a slide in the middle of
 * it. The pages are drawn by the same code the editor and the projector draw
 * with, so the file is what was on screen.
 *
 * Two other layouts, for the two other things a PDF of a deck is for:
 *
 *   notes     one slide to a page with what you were going to say under it,
 *             for the person giving the talk
 *   handout   two, three or six slides to a page, for the room
 *
 * Both of those are on paper, because they are printed; the slides themselves
 * are not, because they are not.
 */
import fs from 'fs';
import path from 'path';
import { resolveSlide, numbering, slideTitle } from '../../web/shared/model.js';
import { renderSlide } from '../../web/shared/scene.js';
import { layoutText } from '../../web/shared/text.js';
import { resolveColor } from '../../web/shared/color.js';
import { roundedRect } from '../../web/shared/path.js';
import { writePdf } from './pdf.js';
import { paths } from './store.js';
import { UserError } from './errors.js';

/** Paper for the layouts that are printed rather than projected. */
const PAPER = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
};

export const PDF_LAYOUTS = {
  slides: { label: 'One slide to a page', hint: 'The deck itself, at the size the slides are' },
  notes: { label: 'Notes', hint: 'Each slide with what you were going to say under it' },
  handout2: { label: 'Handout, two to a page', hint: 'For the room' },
  handout3: { label: 'Handout, three to a page', hint: 'With ruled lines to write on' },
  handout6: { label: 'Handout, six to a page', hint: 'The whole deck in a few sheets' },
};

/**
 * @param id     the deck's id (where its pictures are)
 * @param deck   the deck itself
 * @param opts   {layout, paper, assets, hidden: include hidden slides}
 */
export function renderPdf(id, deck, opts = {}) {
  const layout = PDF_LAYOUTS[opts.layout] ? opts.layout : 'slides';
  const assets = opts.assets || {};
  const nums = numbering(deck);
  // What goes in the file is what the deck's order says, and hidden slides are
  // left out unless somebody asks for them - the same slides, in the same
  // order, with the same numbers as the talk.
  const slides = opts.hidden ? deck.slides : nums.visible;
  if (!slides.length) throw new UserError('Every slide in this deck is hidden, so there is nothing to put in a PDF.');

  const drawn = slides.map((slide) => {
    const r = renderSlide(resolveSlide(deck, slide), { deck, slide, numbers: nums, assets, draft: false });
    return { slide, ops: r.ops, report: r.report };
  });

  const pages = layout === 'slides'
    ? drawn.map((d) => ({ width: deck.size.width, height: deck.size.height, ops: d.ops }))
    : layout === 'notes'
      ? drawn.map((d) => notesPage(deck, d, nums, opts))
      : handoutPages(deck, drawn, nums, opts, Number(layout.replace('handout', '')));

  const dir = paths.assets(id);
  const { buffer, warnings } = writePdf(pages, {
    title: deck.title || 'Presentation',
    subject: layout === 'slides' ? 'Slides' : PDF_LAYOUTS[layout].label,
    author: opts.author || '',
    loadAsset: (asset) => {
      const meta = assets[asset];
      if (!meta || !/^[a-f0-9]{40}$/.test(asset)) return null;
      const file = path.join(dir, asset + '.' + meta.kind);
      return fs.existsSync(file) ? fs.readFileSync(file) : null;
    },
  });
  return { buffer, warnings, slides: slides.length, pages: pages.length, layout };
}

/**
 * Put a slide's drawing inside a box on a bigger page.
 *
 * The ops are in slide points with the origin at the slide's top left, so a
 * scale and a shift is the whole of it; nothing is redrawn or re-measured, and
 * a handout is therefore exactly the slides.
 */
function placed(deck, ops, box) {
  const k = Math.min(box.w / deck.size.width, box.h / deck.size.height);
  const w = deck.size.width * k;
  const h = deck.size.height * k;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  return { ops: scale(ops, k, x, y), box: { x, y, w, h } };
}

/** Every coordinate in a drawing, multiplied and shifted. */
function scale(ops, k, dx, dy) {
  const X = (v) => dx + v * k;
  const Y = (v) => dy + v * k;
  return ops.map((op) => {
    switch (op.t) {
      case 'rect': return { ...op, x: X(op.x), y: Y(op.y), w: op.w * k, h: op.h * k, r: (op.r || 0) * k, lw: op.lw == null ? op.lw : op.lw * k };
      case 'ellipse': return { ...op, cx: X(op.cx), cy: Y(op.cy), rx: op.rx * k, ry: op.ry * k, lw: op.lw == null ? op.lw : op.lw * k };
      case 'line': return { ...op, x1: X(op.x1), y1: Y(op.y1), x2: X(op.x2), y2: Y(op.y2), lw: op.lw == null ? op.lw : op.lw * k, dash: op.dash ? op.dash.map((d) => d * k) : op.dash };
      case 'path': return { ...op, segs: scaleSegs(op.segs, k, dx, dy), lw: op.lw == null ? op.lw : op.lw * k };
      case 'text': return { ...op, x: X(op.x), y: Y(op.y), size: op.size * k, tracking: (op.tracking || 0) * k };
      case 'image': return { ...op, x: X(op.x), y: Y(op.y), w: op.w * k, h: op.h * k };
      case 'group': return { ...op, clip: op.clip ? scaleSegs(op.clip, k, dx, dy) : op.clip, items: scale(op.items || [], k, dx, dy) };
      default: return op;
    }
  });
}

function scaleSegs(segs, k, dx, dy) {
  return (segs || []).map((s) => {
    if (s[0] === 'Z') return s;
    const out = [s[0]];
    for (let i = 1; i < s.length; i += 2) out.push(dx + s[i] * k, dy + s[i + 1] * k);
    return out;
  });
}

const paperOf = (opts) => PAPER[opts.paper] || PAPER.a4;

/** A slide at the top of a page, and what you were going to say under it. */
function notesPage(deck, drawn, nums, opts) {
  const paper = paperOf(opts);
  const m = 54;
  const ops = [{ t: 'rect', x: 0, y: 0, w: paper.width, h: paper.height, fill: '#ffffff' }];
  const slideBox = { x: m, y: m + 28, w: paper.width - 2 * m, h: (paper.width - 2 * m) * (deck.size.height / deck.size.width) };
  const { ops: slideOps, box } = placed(deck, drawn.ops, slideBox);

  const n = nums.numberOf(drawn.slide.id);
  const title = slideTitle(deck, drawn.slide) || 'Untitled';
  ops.push(
    { t: 'text', x: m, y: m + 10, text: (n == null ? '–' : String(n)) + '.', family: 'sans', bold: true, size: 11, fill: '#17181a' },
    { t: 'text', x: m + 22, y: m + 10, text: cut(title, 78), family: 'sans', size: 11, fill: '#5c5e62' },
    { t: 'text', x: paper.width - m - 90, y: m + 10, text: cut(deck.title || '', 24), family: 'sans', size: 9, fill: '#8a8c90' },
  );
  // A hairline round the slide, so a white slide on white paper still has edges.
  ops.push({ t: 'path', segs: roundedRect(box.x, box.y, box.w, box.h, 0), stroke: '#dcdcde', lw: 0.6 });
  ops.push(...slideOps);

  const top = box.y + box.h + 26;
  const width = paper.width - 2 * m;
  const words = String(drawn.slide.notes || '').trim();
  if (words) {
    const style = { family: 'sans', size: 10.5, lineHeight: 1.5, paraSpacing: 0.5, color: 'ink' };
    const text = layoutText(words, { w: width, h: paper.height - top - m }, style);
    for (const line of text.lines) {
      for (const w of line.words) {
        ops.push({ t: 'text', x: m + w.x, y: top + line.y, text: w.text, family: 'sans', bold: w.bold, italic: w.italic, size: w.size, fill: '#17181a' });
      }
    }
    for (const mark of text.marks) {
      ops.push({ t: 'text', x: m + mark.x, y: top + mark.y, text: mark.text, family: 'sans', bold: mark.bold, size: mark.size, fill: '#5c5e62' });
    }
  } else {
    // Ruled lines, because a notes page with nothing on it is a page to write on.
    for (let y = top + 8; y < paper.height - m; y += 22) {
      ops.push({ t: 'line', x1: m, y1: y, x2: paper.width - m, y2: y, stroke: '#e8e8ea', lw: 0.6 });
    }
  }
  return { width: paper.width, height: paper.height, ops };
}

/** Two, three or six slides to a sheet, with room to write beside three. */
function handoutPages(deck, drawn, nums, opts, perPage) {
  const paper = paperOf(opts);
  const m = 46;
  const pages = [];
  const cols = perPage === 6 ? 2 : 1;
  const rows = perPage === 6 ? 3 : perPage;
  const gapX = 22;
  const gapY = 22;
  const headH = 22;
  const cellW = (paper.width - 2 * m - gapX * (cols - 1)) / cols;
  const cellH = (paper.height - 2 * m - headH - gapY * (rows - 1)) / rows;
  // Three to a page is the one with room beside it, which is the whole point
  // of three to a page.
  const slideW = perPage === 3 ? cellW * 0.58 : cellW;

  for (let i = 0; i < drawn.length; i += perPage) {
    const ops = [{ t: 'rect', x: 0, y: 0, w: paper.width, h: paper.height, fill: '#ffffff' }];
    ops.push(
      { t: 'text', x: m, y: m + 2, text: cut(deck.title || 'Presentation', 60), family: 'sans', bold: true, size: 10, fill: '#5c5e62' },
      { t: 'text', x: paper.width - m - 60, y: m + 2, text: 'Page ' + (pages.length + 1), family: 'sans', size: 9, fill: '#8a8c90' },
    );
    for (let j = 0; j < perPage && i + j < drawn.length; j++) {
      const item = drawn[i + j];
      const col = j % cols;
      const row = Math.floor(j / cols);
      const cell = {
        x: m + col * (cellW + gapX),
        y: m + headH + row * (cellH + gapY),
        w: slideW,
        h: cellH,
      };
      const { ops: slideOps, box } = placed(deck, item.ops, cell);
      ops.push({ t: 'path', segs: roundedRect(box.x, box.y, box.w, box.h, 0), stroke: '#dcdcde', lw: 0.6 });
      ops.push(...slideOps);
      const n = nums.numberOf(item.slide.id);
      ops.push({ t: 'text', x: box.x, y: box.y - 5, text: (n == null ? '–' : String(n)), family: 'sans', bold: true, size: 8.5, fill: '#8a8c90' });
      if (perPage === 3) {
        for (let y = box.y + 10; y < box.y + box.h; y += 20) {
          ops.push({ t: 'line', x1: box.x + box.w + 18, y1: y, x2: m + cellW, y2: y, stroke: '#e8e8ea', lw: 0.6 });
        }
      }
    }
    pages.push({ width: paper.width, height: paper.height, ops });
  }
  return pages;
}

const cut = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));

export function pdfFileName(deck, layout) {
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = layout && layout !== 'slides' ? '__' + layout : '';
  return (slug(deck.title) || 'deck') + suffix + '.pdf';
}

export { resolveColor };
