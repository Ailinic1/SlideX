// Measuring text the way the PDF will set it.
//
// Copied from Newsx (web/shared/fonts.js), unchanged but for this note.
//
// Slides are set in three families - sans, serif and mono - which the PDF names
// as Helvetica, Times and Courier and the screen draws as Liberation Sans, Serif
// and Mono (or Arial, Times New Roman and Courier New, which share their widths).
// Every line break is decided here, from one table, so the screen and the PDF
// cannot disagree about where a line ends.
//
// Shared by the slide in the browser and the PDF writer in Node: no DOM here.

import { CHARS, CODES, WIDTHS } from './metrics.js';

export const FAMILIES = ['sans', 'serif', 'mono'];

export const FAMILY_LABELS = { sans: 'Sans serif', serif: 'Serif', mono: 'Monospace' };

/** What the screen asks for, family by family. */
export const CSS_FAMILY = {
  sans: "'Liberation Sans', Arimo, Arial, Helvetica, sans-serif",
  serif: "'Liberation Serif', Tinos, 'Times New Roman', Times, serif",
  mono: "'Liberation Mono', Cousine, 'Courier New', Courier, monospace",
};

/** What the PDF asks for: the standard fonts every reader has. */
export const PDF_FONT = {
  sans: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  serif: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  mono: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
};

const INDEX = new Map();
for (let i = 0; i < CHARS.length; i++) INDEX.set(CHARS[i], i);
const CODE_OF = new Map();
for (let i = 0; i < CHARS.length; i++) CODE_OF.set(CHARS[i], CODES[i]);

// What a character outside the fonts' repertoire becomes, when there is an
// honest stand-in. Anything else becomes a question mark, and the check panel
// says so, rather than vanishing from a published page.
const STAND_INS = {
  '−': '-', '‐': '-', '‑': '-', '‒': '–', '―': '—',
  '′': "'", '″': '"', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ',
  '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '→': '->', '←': '<-',
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'μ': 'µ',
  '✓': 'v', '✔': 'v', '×': '×', '⁄': '/', '∕': '/', '\t': ' ',
};

export const faceIndex = (bold, italic) => (bold ? 1 : 0) + (italic ? 2 : 0);

/** Text rewritten into characters the page fonts have. */
export function printable(text) {
  let out = '';
  for (const ch of String(text == null ? '' : text)) {
    if (INDEX.has(ch)) out += ch;
    else if (STAND_INS[ch] != null) out += STAND_INS[ch];
    else if (ch === '\n' || ch === '\r') out += ch;
    else out += '?';
  }
  return out;
}

/** The characters in a string the page fonts cannot show, once each. */
export function unprintable(text) {
  const seen = new Set();
  for (const ch of String(text == null ? '' : text)) {
    if (!INDEX.has(ch) && STAND_INS[ch] == null && ch !== '\n' && ch !== '\r') seen.add(ch);
  }
  return [...seen];
}

/** The WinAnsi byte for a character, for the PDF writer. */
export const winAnsiCode = (ch) => (CODE_OF.has(ch) ? CODE_OF.get(ch) : 63);

/**
 * Width of a string in points.
 * @param font {family, bold, italic, size, tracking} - tracking in points per character
 */
export function measure(text, font) {
  const family = WIDTHS[font.family] ? font.family : 'sans';
  const table = WIDTHS[family][faceIndex(font.bold, font.italic)];
  const s = String(text);
  let units = 0;
  let count = 0;
  for (const ch of s) {
    const i = INDEX.get(ch);
    units += i == null ? table[INDEX.get('?')] : table[i];
    count++;
  }
  return (units / 1000) * font.size + (font.tracking || 0) * count;
}

/** Height from baseline to the top of a capital, and below it, roughly. */
export const ascent = (size) => size * 0.78;
export const descent = (size) => size * 0.22;
