// Text: what somebody types on a slide, and where each word of it lands.
//
// Copied from Newsx (web/shared/text.js), with bullet indent levels added: a
// slide's list goes two and three deep, a newsletter's does not.
//
// A text box holds plain words with a little markup, the kind anybody can type
// without a toolbar:
//
//   # A heading inside the box         - a bulleted item
//   ## A smaller one                     - an item one level in
//   > a pull quote                     1. a numbered item
//                                      **bold** and *italic*
//
// One line is one paragraph. layoutText() turns that into positioned words,
// measured from the same widths the PDF uses, and says whether it all fitted.

import { measure, printable } from './fonts.js';

/* ---------------------------------------------------------------- parsing */

/** Runs of text with their emphasis: [{text, bold, italic}] */
export function parseInline(src) {
  const runs = [];
  let bold = false;
  let italic = false;
  let buf = '';
  const flush = () => {
    if (buf) runs.push({ text: buf, bold, italic });
    buf = '';
  };
  const s = String(src || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length && '*\\'.includes(s[i + 1])) { buf += s[++i]; continue; }
    if (ch === '*' && s[i + 1] === '*') { flush(); bold = !bold; i++; continue; }
    // A lone asterisk with a space after it is a multiplication or a footnote
    // mark, not the start of emphasis.
    if (ch === '*' && (italic || /\S/.test(s[i + 1] || ''))) { flush(); italic = !italic; continue; }
    buf += ch;
  }
  flush();
  return runs;
}

/**
 * How far in a list item is indented. Two spaces, or one tab, is one level; a
 * slide's list goes three deep and no further, because a fourth level is
 * something that wanted to be a slide of its own.
 */
export function indentLevel(prefix) {
  const spaces = String(prefix || '').replace(/\t/g, '  ').length;
  return Math.max(0, Math.min(2, Math.floor(spaces / 2)));
}

/**
 * Paragraphs: [{kind: 'p'|'bullet'|'number'|'h1'|'h2'|'quote'|'blank', n, runs}]
 */
export function parseRich(src) {
  const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  // Numbered items count per level, so an indented a-b-c list does not carry on
  // from the one above it.
  let numbers = [0, 0, 0];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (!line.trim()) { out.push({ kind: 'blank', runs: [] }); numbers = [0, 0, 0]; continue; }
    if ((m = line.match(/^([ \t]*)(?:[-*•])\s+(.*)$/))) {
      out.push({ kind: 'bullet', level: indentLevel(m[1]), runs: parseInline(m[2]) });
      continue;
    }
    if ((m = line.match(/^([ \t]*)(\d{1,3})[.)]\s+(.*)$/))) {
      const level = indentLevel(m[1]);
      numbers[level] = numbers[level] ? numbers[level] + 1 : parseInt(m[2], 10);
      for (let d = level + 1; d < numbers.length; d++) numbers[d] = 0;
      out.push({ kind: 'number', n: numbers[level], level, runs: parseInline(m[3]) });
      continue;
    }
    numbers = [0, 0, 0];
    if ((m = line.match(/^##\s+(.*)$/))) { out.push({ kind: 'h2', runs: parseInline(m[1]) }); continue; }
    if ((m = line.match(/^#\s+(.*)$/))) { out.push({ kind: 'h1', runs: parseInline(m[1]) }); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { out.push({ kind: 'quote', runs: parseInline(m[1]) }); continue; }
    out.push({ kind: 'p', runs: parseInline(line) });
  }
  // Blank lines at either end are the writer's typing, not spacing they meant.
  while (out.length && out[0].kind === 'blank') out.shift();
  while (out.length && out[out.length - 1].kind === 'blank') out.pop();
  return out;
}

/** The words a writer typed, with the markup taken out. */
export function plainText(src) {
  return parseRich(src).map((p) => p.runs.map((r) => r.text).join('')).join('\n');
}

export function wordCount(src) {
  const t = plainText(src).trim();
  return t ? t.split(/\s+/).length : 0;
}

/* ----------------------------------------------------------------- layout */

const KIND = {
  p: { scale: 1, bold: null, italic: null, indent: 0 },
  bullet: { scale: 1, bold: null, italic: null, indent: 1.15 },
  number: { scale: 1, bold: null, italic: null, indent: 1.45 },
  h1: { scale: 1.32, bold: true, italic: null, indent: 0 },
  h2: { scale: 1.14, bold: true, italic: null, indent: 0 },
  quote: { scale: 1.12, bold: null, italic: true, indent: 0.9 },
  blank: { scale: 1, bold: null, italic: null, indent: 0 },
};

// A different mark at each level, so the depth of an item is visible without
// counting the indent: a round bullet, an en dash, then a small square.
const BULLETS = ['•', '–', '▪'];

/** 1. at the top, then a. and i. beneath it, the way an outline is numbered. */
function numberLabel(n, level) {
  if (level === 1) return String.fromCharCode(96 + ((n - 1) % 26) + 1) + '.';
  if (level >= 2) return roman(n) + '.';
  return n + '.';
}

function roman(n) {
  const table = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let v = Math.max(1, Math.min(39, n));
  let out = '';
  for (const [value, sign] of table) while (v >= value) { out += sign; v -= value; }
  return out;
}

/** Split runs into words: each word is a list of styled pieces, with the space after it. */
function toWords(runs, transform) {
  const words = [];
  let current = [];
  const push = () => {
    if (current.length) words.push(current);
    current = [];
  };
  for (const run of runs) {
    let text = printable(run.text);
    if (transform === 'upper') text = text.toUpperCase();
    const parts = text.split(/( +)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^ +$/.test(part)) { push(); continue; }
      current.push({ text: part, bold: run.bold, italic: run.italic });
    }
  }
  push();
  return words;
}

/**
 * Lay text out in a box.
 *
 * @param src   the text, with markup
 * @param box   {w, h}
 * @param style {family, size, lineHeight, align, valign, tracking, bold, italic,
 *               transform, columns, gutter, paraSpacing, fit}
 * @returns {lines, marks, overflow, size, hiddenWords, height}
 *   lines: [{y, words: [{x, text, bold, italic, size}]}] with y the baseline,
 *   relative to the box's top-left; marks: bullets and quote bars.
 */
export function layoutText(src, box, style = {}) {
  const base = Math.max(3, Number(style.size) || 11);
  let result = layoutAt(src, box, style, base);
  // Shrinking to fit also means shrinking until no word has to be split
  // across lines - "Neuroscienc / e" is not a fit.
  const tooBig = (r) => r.overflow || r.brokeWord;
  if (tooBig(result) && style.fit === 'shrink') {
    // The largest size, down to half, at which everything fits.
    let lo = base * 0.5;
    let hi = base;
    let best = layoutAt(src, box, style, lo);
    if (!tooBig(best)) {
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        const attempt = layoutAt(src, box, style, mid);
        if (tooBig(attempt)) hi = mid;
        else { lo = mid; best = attempt; }
      }
    }
    result = best;
  }
  return result;
}

function layoutAt(src, box, style, size) {
  const paras = parseRich(src);
  const columns = Math.max(1, Math.min(4, Math.round(Number(style.columns) || 1)));
  const gutter = Number(style.gutter) >= 0 ? Number(style.gutter) : 14;
  const colW = Math.max(4, (box.w - gutter * (columns - 1)) / columns);
  const lh = Number(style.lineHeight) || 1.3;
  const paraGap = (Number(style.paraSpacing) >= 0 ? Number(style.paraSpacing) : 0.45) * size;
  const tracking = ((Number(style.tracking) || 0) / 1000) * size;
  const align = style.align || 'left';
  const family = style.family || 'sans';

  const lines = [];
  const marks = [];
  let col = 0;
  let y = 0; // top of the next line, within the column
  let overflow = false;
  let hiddenWords = 0;
  let brokeWord = false;
  const bottom = box.h;

  const place = (lineHeight) => {
    // Where the next line goes, moving to the next column when this one is full.
    if (y + lineHeight > bottom + 0.01) {
      if (col + 1 < columns && y > 0) { col++; y = 0; }
      else return null;
    }
    const top = y;
    y += lineHeight;
    return { top, x0: col * (colW + gutter) };
  };

  for (let pi = 0; pi < paras.length; pi++) {
    const para = paras[pi];
    const kind = KIND[para.kind] || KIND.p;
    const pSize = size * kind.scale;
    const lineH = pSize * lh;
    if (para.kind === 'blank') {
      if (y > 0) y += lineH * 0.5;
      continue;
    }
    if ((para.kind === 'h1' || para.kind === 'h2') && y > 0) y += pSize * 0.35;
    if (overflow) { hiddenWords += toWords(para.runs, style.transform).length; continue; }

    const level = para.level || 0;
    const indent = (kind.indent + level * 1.25) * pSize;
    const avail = Math.max(4, colW - indent);
    const font = (piece) => ({
      family,
      size: pSize,
      bold: kind.bold != null ? kind.bold || piece.bold : (style.bold ? !piece.bold : piece.bold),
      italic: kind.italic != null ? kind.italic !== !!piece.italic : (style.italic ? !piece.italic : piece.italic),
      tracking,
    });
    const words = toWords(para.runs, style.transform).map((pieces) => ({
      pieces,
      width: pieces.reduce((n, p) => n + measure(p.text, font(p)), 0),
    }));
    const spaceW = measure(' ', { family, size: pSize, tracking });

    // Greedy fill, breaking a word that is wider than the column by itself.
    const rows = [];
    let row = [];
    let rowW = 0;
    const breakWord = (word) => {
      const out = [];
      let piece = { pieces: [], width: 0 };
      for (const p of word.pieces) {
        for (const ch of p.text) {
          const w = measure(ch, font(p));
          if (piece.width + w > avail && piece.width > 0) { out.push(piece); piece = { pieces: [], width: 0 }; }
          const last = piece.pieces[piece.pieces.length - 1];
          if (last && last.bold === p.bold && last.italic === p.italic) last.text += ch;
          else piece.pieces.push({ text: ch, bold: p.bold, italic: p.italic });
          piece.width += w;
        }
      }
      if (piece.pieces.length) out.push(piece);
      return out;
    };
    for (const word of words) {
      if (word.width > avail) brokeWord = true;
      const parts = word.width > avail ? breakWord(word) : [word];
      for (const part of parts) {
        const need = row.length ? rowW + spaceW + part.width : part.width;
        if (row.length && need > avail + 0.01) {
          rows.push({ words: row, width: rowW });
          row = [part];
          rowW = part.width;
        } else {
          row.push(part);
          rowW = need;
        }
      }
    }
    if (row.length || !rows.length) rows.push({ words: row, width: rowW });

    let firstTop = null;
    let lastBottom = null;
    let firstX0 = 0;
    for (let ri = 0; ri < rows.length; ri++) {
      const r = rows[ri];
      const slot = place(lineH);
      if (!slot) {
        overflow = true;
        hiddenWords += rows.slice(ri).reduce((n, rr) => n + rr.words.length, 0);
        break;
      }
      if (firstTop == null) { firstTop = slot.top; firstX0 = slot.x0; }
      lastBottom = slot.top + lineH;
      const baseline = slot.top + lineH / 2 + pSize * 0.358;
      const isLast = ri === rows.length - 1;
      let x = slot.x0 + indent;
      let gap = spaceW;
      const slack = avail - r.width;
      if (align === 'center') x += slack / 2;
      else if (align === 'right') x += slack;
      else if (align === 'justify' && !isLast && r.words.length > 1) gap = spaceW + slack / (r.words.length - 1);

      const placed = [];
      for (const word of r.words) {
        let wx = x;
        for (const p of word.pieces) {
          const f = font(p);
          const w = measure(p.text, f);
          placed.push({ x: wx, width: w, text: p.text, bold: !!f.bold, italic: !!f.italic, size: pSize, tracking });
          wx += w;
        }
        x += word.width + gap;
      }
      lines.push({ y: baseline, top: slot.top, height: lineH, words: mergeRuns(placed, align === 'justify', spaceW), column: col });

      if (ri === 0 && (para.kind === 'bullet' || para.kind === 'number')) {
        marks.push({
          kind: para.kind,
          x: slot.x0 + level * 1.25 * pSize + (para.kind === 'bullet' ? pSize * 0.2 : 0),
          y: baseline,
          size: pSize * (para.kind === 'bullet' && level ? 0.9 : 1),
          text: para.kind === 'bullet' ? BULLETS[level] : numberLabel(para.n, level),
          bold: para.kind === 'number' && !level,
        });
      }
    }
    if (para.kind === 'quote' && firstTop != null) {
      marks.push({ kind: 'bar', x: firstX0, y: firstTop + pSize * 0.15, w: Math.max(1.5, pSize * 0.16), h: lastBottom - firstTop - pSize * 0.3 });
    }
    if (!overflow && pi < paras.length - 1 && paras[pi + 1].kind !== 'blank') {
      const next = paras[pi + 1].kind;
      const listRun = (para.kind === 'bullet' || para.kind === 'number') && next === para.kind;
      y += listRun ? paraGap * 0.35 : paraGap;
    }
  }

  // Vertical alignment applies to a single column only: several columns are
  // filled from the top, the way a newspaper fills them.
  const used = lines.length ? Math.max(...lines.map((l) => l.top + l.height)) : 0;
  if (columns === 1 && !overflow && (style.valign === 'middle' || style.valign === 'bottom')) {
    const shift = style.valign === 'middle' ? (box.h - used) / 2 : box.h - used;
    for (const l of lines) { l.y += shift; l.top += shift; }
    for (const m of marks) m.y += shift;
  }
  return { lines, marks, overflow, hiddenWords, size, height: used, brokeWord };
}

/** Neighbouring words in the same style become one run, unless each must sit exactly (justified). */
function mergeRuns(placed, exact, spaceW) {
  const out = [];
  for (const w of placed) {
    const prev = out[out.length - 1];
    if (!exact && prev && prev.bold === w.bold && prev.italic === w.italic && prev.size === w.size) {
      const gap = w.x - (prev.x + prev.width);
      if (Math.abs(gap) < 0.01) { prev.text += w.text; prev.width += w.width; continue; }
      if (Math.abs(gap - spaceW) < 0.01) { prev.text += ' ' + w.text; prev.width += gap + w.width; continue; }
    }
    out.push({ ...w });
  }
  return out;
}
