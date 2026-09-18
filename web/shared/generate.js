// Deck styles generated from a seed.
//
// Adapted from Newsx (web/shared/generate.js), which generates newsletter
// templates the same way. What changes for slides: a slide is wide and short,
// it is read from six metres away, and it is not filled to a footer - so the
// arithmetic here composes regions across a slide rather than stacking blocks
// down a page, and the type scale starts where a projector starts.
//
// "Generate another" should be a thing a person can press twenty times in a
// minute, and every result should be a deck they would not be embarrassed to
// present. Randomness alone gives neither: a slide of randomly placed boxes is
// a mess. So the randomness here only ever chooses between things that are
// already right, and the arithmetic that makes a slide look designed is not
// random at all:
//
//   - One grid. Every slide has a margin, a gutter and twelve columns, and
//     every box starts and ends on them, so edges line up from slide to slide.
//   - One scale. Type sizes come from a few fixed steps (display, title,
//     heading, body, label), set by the slide's height, never picked freely.
//   - Measured, not guessed. Each text box is exactly as tall as its words
//     need, measured with the same widths the PDF uses, so nothing is cut off.
//   - Room to breathe. A slide is a heading and a body region; what goes in
//     the body is measured, centred in what is left, and never allowed to
//     touch the margins.
//   - Colours by contrast. Words on a coloured band take whichever palette
//     colour reads on it, checked, not assumed.
//
// What is random is the character: the palette, the pairing of typefaces, the
// kind of title slide, which arrangements the content slides use, whether
// panels are tinted, outlined or bare, rounded or square, how icons are badged
// and which generated graphic decorates it. The same seed always gives the
// same deck, so a style somebody liked can be made again.
//
// No AI: a seeded random number generator and rules.

import { makeElement, makeDeck, makeLayout, makeSlide, ASPECTS, newId, LAYOUT_KINDS } from './model.js';
import { PALETTES, completePalette, resolveColor, contrast } from './color.js';
import { sampleData } from './charts.js';
import { rng, newSeed } from './patterns.js';
import { layoutText } from './text.js';

export const GENERATOR_VERSION = 1;

const half = (v) => Math.round(v * 2) / 2;

/** A graphic's seed, drawn from the deck's own, so one seed makes one deck. */
const seedFrom = (random) => Math.floor(random() * 0xffffffff).toString(36);

/* ------------------------------------------------------------------ dice */

function weighted(random, entries) {
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let r = random() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function shuffled(random, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The first role that reads on a fill, or whichever of paper and ink reads better. */
function readable(pal, fill, prefer, min = 4.5) {
  const bg = resolveColor(fill, pal);
  for (const role of prefer) if (contrast(resolveColor(role, pal), bg) >= min) return role;
  return contrast(resolveColor('paper', pal), bg) >= contrast(resolveColor('ink', pal), bg) ? 'paper' : 'ink';
}

/**
 * How much contrast a piece of text needs.
 *
 * The same rule WCAG uses: text that is large - 16 points and up, or 14 and up
 * when it is bold - needs 3 to 1, and everything smaller needs 4.5. On a slide
 * almost everything is large, which is the point of a slide; what this catches
 * is the label, the caption and the footer, which are not.
 */
export function contrastFloor(size, bold) {
  return size >= 16 || (bold && size >= 14) ? 3 : 4.5;
}

/**
 * A colour for words on a fill: the first of `prefer` that reads on it, tried
 * at 4.5 first and then at whatever this size actually needs, and failing both
 * whichever of paper and ink reads better. Nothing here is assumed.
 *
 * `on` may be several fills, for a colour that has to read on more than one -
 * a label that appears both on paper and on a tinted band.
 */
function ink(t, on, prefer, { size = t.fs.body, bold = false } = {}) {
  const fills = Array.isArray(on) ? on : [on];
  const floor = contrastFloor(size, bold);
  const worst = (role) => Math.min(...fills.map((f) => contrast(resolveColor(role, t.pal), resolveColor(f, t.pal))));
  for (const min of [4.5, floor]) {
    for (const role of prefer) if (worst(role) >= min) return role;
  }
  return worst('paper') >= worst('ink') ? 'paper' : 'ink';
}

/* ----------------------------------------------------------------- theme */

function makeTheme(random, opts) {
  const aspect = ASPECTS[opts.aspect] ? opts.aspect : 'wide';
  const { width: W, height: H } = ASPECTS[aspect];
  // Both shapes are 540 points tall, so type is the same size on each and only
  // the width changes. k is here for the day a third shape is not.
  const k = H / 540;
  const paletteKey = opts.palette && PALETTES[opts.palette] ? opts.palette : random.pick(Object.keys(PALETTES));
  const pal = completePalette(PALETTES[paletteKey]);
  const [head, body] = weighted(random, [[['sans', 'sans'], 5], [['sans', 'serif'], 2], [['serif', 'sans'], 2]]);
  const m = half(random.pick([48, 56, 56, 64]) * k);
  const g = half(random.pick([14, 16, 20]) * k);
  const cw = (W - 2 * m - 11 * g) / 12;
  const t = {
    random, aspect, W, H, k, m, g, cw, pal, paletteKey, head, body,
    gap: half(random.pick([20, 26, 32]) * k),
    radius: weighted(random, [[0, 4], [6, 3], [14, 2]]),
    panel: weighted(random, [['tint', 5], ['outline', 3], ['plain', 2]]),
    badge: weighted(random, [['circle', 4], ['rounded', 3], ['none', 3]]),
    badgeColor: random.pick(['primary', 'secondary', 'accent']),
    headingRule: weighted(random, [['none', 4], ['rule', 3], ['band', 2], ['kicker', 2]]),
    titleStyle: weighted(random, [['band', 4], ['sidebar', 3], ['rule', 3], ['card', 2], ['graphic', 2]]),
    sectionStyle: weighted(random, [['full', 4], ['half', 3], ['number', 3]]),
    // Where the slide number sits, and whether there is a footer at all.
    chrome: weighted(random, [['corner', 5], ['band', 2], ['none', 2]]),
    pattern: {
      kind: random.pick(['network', 'waves', 'contours', 'orbits', 'hexes', 'halftone', 'blobs', 'bars', 'confetti', 'mosaic']),
      density: half((0.7 + random() * 0.6) * 10) / 10,
    },
  };
  // Labels sit on paper and on tinted bands alike, so they must read on both.
  // A projector is not a page. Nothing here is smaller than eleven points, and
  // body text starts at a size a room can read.
  t.fs = {
    display: Math.max(30, random.pick([46, 50, 54]) * k),
    title: Math.max(22, random.pick([30, 33, 36]) * k),
    heading: Math.max(15, random.pick([18, 20]) * k),
    body: Math.max(13, (body === 'serif' ? 18 : 17.5) * k),
    small: Math.max(12, 15 * k),
    label: Math.max(10.5, random.pick([11.5, 12.5]) * k),
    caption: Math.max(10.5, 12 * k),
  };
  t.kicker = ink(t, ['paper', 'tint'], ['accent', 'secondary', 'primary'], { size: t.fs.label, bold: true });
  // The bands a slide is built in: a heading at the top, the body under it,
  // and a strip at the foot for the number.
  t.footH = t.chrome === 'none' ? 0 : half(24 * k);
  t.footY = H - m * 0.62 - t.footH;
  t.headY = half(m * 0.82);
  t.headH = half(t.fs.title * 1.5);
  t.bodyY = t.headY + t.headH + t.gap;
  t.bodyH = (t.chrome === 'none' ? H - m * 0.8 : t.footY - t.gap * 0.6) - t.bodyY;
  return t;
}

const span = (t, n) => n * t.cw + (n - 1) * t.g;
const full = (t) => t.W - 2 * t.m;

/* ------------------------------------------------------------------ text */

const styles = {
  kicker: (t, color = t.kicker) => ({ family: t.head, size: t.fs.label, bold: true, transform: 'upper', tracking: 130, color, lineHeight: 1.25 }),
  display: (t, color = 'primary', extra = {}) => ({ family: t.head, size: t.fs.display, bold: true, color, lineHeight: 1.06, fit: 'shrink', ...extra }),
  title: (t, color = 'primary', extra = {}) => ({ family: t.head, size: t.fs.title, bold: true, color, lineHeight: 1.12, valign: 'middle', fit: 'shrink', ...extra }),
  heading: (t, color = 'primary', extra = {}) => ({ family: t.head, size: t.fs.heading, bold: true, color, lineHeight: 1.2, fit: 'shrink', ...extra }),
  body: (t, extra = {}) => ({ family: t.body, size: t.fs.body, color: 'ink', lineHeight: t.body === 'serif' ? 1.45 : 1.48, paraSpacing: 0.55, fit: 'shrink', ...extra }),
  small: (t, extra = {}) => ({ family: t.body, size: t.fs.small, color: 'ink', lineHeight: 1.42, paraSpacing: 0.5, fit: 'shrink', ...extra }),
  caption: (t, extra = {}) => ({ family: t.head, size: t.fs.caption, color: 'muted', lineHeight: 1.35, fit: 'shrink', ...extra }),
};

/**
 * What a field will actually say, near enough to measure by.
 *
 * A box holding {deck} is empty at the moment it is designed and holds a deck's
 * whole name at the moment it is shown. Measuring the token would make a box
 * the width of eight characters, and the words would then shrink to fit it. So
 * every measurement here is taken against a stand-in of the length these things
 * really are.
 */
const SAMPLES = {
  deck: 'A deck with a reasonably long name on it',
  title: 'What we found this quarter',
  section: 'What we are proposing',
  footer: 'Company \u00b7 Confidential \u00b7 2026',
  date: '17 September 2026',
  n: '12',
  total: '24',
  ref: '12',
};

const asWords = (words) => String(words == null ? '' : words)
  .replace(/\{([a-z][a-z.]*)(?::[^}]*)?\}/gi, (all, name) => {
    const sample = SAMPLES[name.toLowerCase()];
    return sample == null ? all : sample;
  });

/** How tall a box must be for these words, at this width, in this style. */
function textH(rawWords, w, style) {
  const words = asWords(rawWords);
  const plain = { ...style, fit: 'none' };
  const cols = Math.max(1, style.columns || 1);
  let h = layoutText(words, { w, h: 1e6 }, plain).height;
  if (cols > 1) {
    let hh = h / cols;
    for (let i = 0; i < 200 && layoutText(words, { w, h: hh }, plain).overflow; i++) hh += 3;
    h = hh;
  }
  return Math.ceil(h + 2);
}

/* -------------------------------------------------------------- elements */

function el(type, box, style = {}, content = {}, extra = {}) {
  const e = makeElement(type, 0, 0, extra.preset);
  e.x = half(box.x);
  e.y = half(box.y);
  e.w = half(Math.max(2, box.w));
  e.h = half(Math.max(2, box.h));
  e.style = { ...e.style, ...style };
  e.content = { ...e.content, ...content };
  if (type === 'chart' && content.kind && !content.data) e.content.data = sampleData(content.kind);
  if (extra.name) e.name = extra.name;
  if (extra.fixed) e.editable = false;
  return e;
}

const text = (box, words, style, name, extra = {}) => el('text', box, style, { text: words }, { preset: 'body', name, ...extra });

/** A panel behind a block, in the theme's panel style. */
function panel(t, box, name) {
  if (t.panel === 'plain') return [];
  const style = t.panel === 'tint'
    ? { shape: 'rect', fill: 'tint', stroke: null, radius: t.radius }
    : { shape: 'rect', fill: null, stroke: 'rule', lw: 0.9, radius: t.radius };
  return [el('shape', box, style, {}, { name, fixed: true })];
}

const panelPad = (t) => (t.panel === 'plain' ? 0 : half(20 * t.k));

function iconEl(t, box, ic, name) {
  const style = t.badge === 'none'
    ? { color: t.badgeColor, badge: 'none' }
    : { badge: t.badge, badgeColor: t.badgeColor };
  return el('icon', box, style, { icon: ic }, { name });
}

/* ----------------------------------------------------------------- words */

const WORDS = {
  deckTitles: ['The title of this deck'],
  deckSubs: ['Who is presenting, and when', 'A line about what this is and who it is for'],
  kickers: ['Quarterly review', 'A proposal', 'Where we are', 'The short version', 'For discussion'],
  titles: [
    'What we found',
    'Where the work stands',
    'The three things that matter',
    'What changed this quarter',
    'What we are proposing',
  ],
  bullets: [
    '- The first point, in a line a room can read\n- The second point, no longer than this one\n  - Something underneath it\n- The third point',
    '- What we set out to do\n- What actually happened\n- What we would do differently',
    '- The problem, in one line\n- What we tried\n  - And what it cost\n- What we recommend',
  ],
  paragraphs: [
    'One idea to a slide, said in a sentence somebody can read from the back of the room and remember on the way out.',
    'If it takes a paragraph to say, it is two slides. If it takes a page, it is a document.',
  ],
  headings: ['On the left', 'On the right', 'Before', 'After', 'What works', 'What does not', 'This', 'That'],
  sectionTitles: ['Where we are', 'What we are proposing', 'What happens next', 'The detail'],
  sectionNotes: ['A line about what this part covers', 'What the next few slides are about'],
  quotes: [
    '> A line worth putting on a slide of its own.',
    '> If you cannot say it in a sentence, it is not the point yet.',
  ],
  quoteBy: ['Who said it, and what they do', 'Name, role'],
  stats: [
    ['94%', 'of customers renewed this year', 'target'],
    ['3.2×', 'more than the same time last year', 'trendUp'],
    ['12', 'markets, from four', 'globe'],
    ['48 days', 'from first call to signature', 'calendar'],
    ['1,420', 'people using it every week', 'users'],
  ],
  features: [
    ['Faster', 'What it does in a line.', 'rocket'],
    ['Cheaper', 'What it costs, in a line.', 'dollar'],
    ['Safer', 'What it protects, in a line.', 'shieldCheck'],
    ['Simpler', 'What it takes away, in a line.', 'lightbulb'],
    ['Wider', 'Who else it reaches.', 'globe'],
  ],
  captions: ['What the picture shows, and where it was taken', 'Who is in the picture, and what they are doing'],
  // A short heading, and the sentence that goes under it. Keeping them apart
  // stops a slide saying the same thing twice in two sizes.
  takeawayHeadings: ['What it says', 'The short version', 'Why it matters', 'What to take away'],
  takeaways: [
    'The one thing worth remembering about this, said in a sentence.',
    'What the numbers say, once somebody has looked at them properly.',
    'The trend is the point here, not any one of the months in it.',
  ],
  closings: ['Thank you', 'Questions?', 'That is the proposal'],
  contacts: ['How to get in touch', 'Where to read the detail'],
};

const CHARTS = [
  ['How it has gone, month by month', { kind: 'bar' }],
  ['Where it comes from', { kind: 'donut', options: { centerLabel: 'total' } }],
  ['Against the target', { kind: 'progress' }],
  ['This year and last', { kind: 'line' }],
  ['By market', { kind: 'hbar' }],
  ['Where we are', { kind: 'rings' }],
  ['The shape of it', { kind: 'waffle' }],
  ['The numbers themselves', { kind: 'table' }],
  ['How it fits together', { kind: 'stacked' }],
];

/* ------------------------------------------------------------- the chrome */

/**
 * The strip along the bottom: the slide number, and a footer if the deck has
 * one. Every layout but the title, the section and the full-bleed picture gets
 * it, which is what makes a deck's slides look like a deck.
 */
function chrome(t, opts = {}) {
  if (t.chrome === 'none') return [];
  const on = opts.on || 'paper';
  // A tinted strip along the foot of a white slide is a nice edge. On a slide
  // that is already a colour it is either invisible or a second thing to look
  // at, so there is no strip: only the number, in a colour that reads on the
  // slide itself.
  const band = t.chrome === 'band' && on === 'paper';
  const behind = band ? 'tint' : on;
  const color = ink(t, behind, ['muted', 'tint', 'highlight'], { size: t.fs.caption });
  const small = { family: t.head, size: t.fs.caption, color, valign: 'middle', fit: 'shrink' };
  const y = t.footY;
  const out = [];
  if (band) {
    out.push(el('shape', { x: 0, y: y - 6 * t.k, w: t.W, h: t.H - y + 6 * t.k }, { shape: 'rect', fill: 'tint' }, {}, { name: 'Footer band', fixed: true }));
  }
  out.push(
    el('field', { x: t.m, y, w: span(t, 7), h: t.footH }, { ...small, align: 'left' }, { field: 'footer' }, { name: 'Footer', fixed: true }),
    el('field', { x: t.W - t.m - span(t, 2), y, w: span(t, 2), h: t.footH }, { ...small, align: 'right', bold: t.chrome === 'corner' }, { field: 'number' }, { name: 'Slide number', fixed: true }),
  );
  return out;
}

/**
 * The heading at the top of a content slide, and where the body starts under it.
 * @returns {els, top} - top is the y the body may begin at
 */
function heading(t, words, opts = {}) {
  const w = opts.w == null ? full(t) : opts.w;
  const x = opts.x == null ? t.m : opts.x;
  const style = styles.title(t, opts.color || 'primary');
  const els = [];
  let y = t.headY;
  if (t.headingRule === 'band') {
    const bandH = t.headY + t.headH + half(14 * t.k);
    els.push(el('shape', { x: 0, y: 0, w: t.W, h: bandH }, { shape: 'rect', fill: 'tint' }, {}, { name: 'Title band', fixed: true }));
  }
  if (t.headingRule === 'kicker') {
    const ks = styles.kicker(t);
    const kH = textH('Label', w, ks);
    els.push(text({ x, y, w, h: kH }, t.random.pick(WORDS.kickers), ks, 'Kicker', { preset: 'label' }));
    y += kH + half(6 * t.k);
  }
  els.push(text({ x, y, w, h: t.headH }, words, style, opts.name || 'Title', { preset: 'title' }));
  let bottom = y + t.headH;
  if (t.headingRule === 'rule') {
    els.push(el('shape', { x, y: bottom + half(8 * t.k), w, h: 2 }, { shape: 'rect', fill: 'rule' }, {}, { name: 'Title rule', fixed: true }));
    bottom += half(10 * t.k);
  }
  if (t.headingRule === 'band') bottom += half(10 * t.k);
  return { els, top: bottom + t.gap };
}

/* ---------------------------------------------------------- body regions */

/**
 * Split a region into columns. Every column is a whole number of grid columns
 * wide, so a two-column slide and a three-column slide line up with each other.
 */
function columns(t, region, parts) {
  const total = parts.reduce((n, p) => n + p, 0);
  const gutter = t.g * 2;
  const usable = region.w - gutter * (parts.length - 1);
  const out = [];
  let x = region.x;
  for (const p of parts) {
    const w = (usable * p) / total;
    out.push({ x, y: region.y, w, h: region.h });
    x += w + gutter;
  }
  return out;
}

/**
 * Stack blocks down a region, giving each what it needs and sharing the rest
 * among the ones that can use it. A block is {min, grow, max, build(box)}.
 *
 * Unlike a page, a slide is not filled to its footer: what is left over is
 * shared between the top and the bottom, so a short slide sits in the middle
 * of its region rather than hanging from the top of it.
 */
function stack(t, region, blocks, { anchor = 'middle' } = {}) {
  const gap = t.gap;
  const list = blocks.filter(Boolean);
  if (!list.length) return [];
  const heights = list.map((b) => b.min);
  const needed = () => heights.reduce((n, x) => n + x, 0) + gap * (list.length - 1);
  let left = region.h - needed();
  for (let round = 0; round < 8 && left > 0.5; round++) {
    const room = list.map((b, i) => (b.grow > 0 ? Math.max(0, (b.max == null ? Infinity : b.max) - heights[i]) : 0));
    const weight = list.reduce((n, b, i) => n + (room[i] > 0 ? b.grow : 0), 0);
    if (!weight) break;
    let used = 0;
    list.forEach((b, i) => {
      if (room[i] <= 0) return;
      const add = Math.min(room[i], (left * b.grow) / weight);
      heights[i] += add;
      used += add;
    });
    left -= used;
    if (used < 0.5) break;
  }
  // If the blocks want more than there is, squeeze them all by the same share
  // rather than letting the last one run off the slide.
  if (left < 0) {
    const k = region.h / needed();
    for (let i = 0; i < heights.length; i++) heights[i] *= k;
    left = 0;
  }
  const out = [];
  let y = region.y + (anchor === 'middle' ? left / 2 : anchor === 'bottom' ? left : 0);
  list.forEach((b, i) => {
    out.push(...b.build({ x: region.x, y, w: region.w, h: heights[i] }));
    y += heights[i] + gap;
  });
  return out;
}

/* ---------------------------------------------------------------- blocks */

function bulletBlock(t, w, words, name = 'Content') {
  const style = styles.body(t);
  const h = textH(words, w, style);
  return { min: h, grow: 0.2, max: h + 40 * t.k, build: (box) => [text(box, words, style, name, { preset: 'bullets' })] };
}

function paragraphBlock(t, w, words, name = 'Content') {
  const style = styles.body(t, { lineHeight: 1.5 });
  const h = textH(words, w, style);
  return { min: h, grow: 0, max: h, build: (box) => [text(box, words, style, name, { preset: 'body' })] };
}

function pictureBlock(t, name = 'Picture') {
  return { min: 120 * t.k, grow: 4, max: 1e6, build: (box) => [el('image', box, { fit: 'cover', radius: t.radius }, {}, { name })] };
}

function chartBlock(t, spec, name = 'Chart') {
  const content = JSON.parse(JSON.stringify(spec[1]));
  return {
    min: 150 * t.k, grow: 3, max: 1e6,
    build: (box) => [el('chart', box, { family: t.head, size: Math.max(9, 11 * t.k) }, content, { name })],
  };
}

function statBlock(t, pick, big = false) {
  const [value, label, ic] = pick;
  const framed = t.panel !== 'plain';
  const pad = framed ? panelPad(t) : 0;
  return {
    min: (big ? 150 : 110) * t.k, grow: big ? 1 : 0.4, max: (big ? 240 : 150) * t.k,
    build: (box) => [el('stat', box, {
      family: t.head,
      color: 'primary',
      labelColor: 'muted',
      align: 'left',
      iconSide: t.badge === 'none' ? 'none' : 'top',
      fill: framed && t.panel === 'tint' ? 'tint' : null,
      stroke: framed && t.panel === 'outline' ? 'rule' : null,
      lw: 0.9,
      radius: t.radius,
      padding: pad,
    }, { value, label, icon: ic }, { name: 'Big number' })],
  };
}

function captionBlock(t, w, words, name = 'Caption') {
  const style = styles.caption(t, { italic: true });
  const h = textH(words, w, style);
  return { min: h, grow: 0, max: h, build: (box) => [text(box, words, style, name, { preset: 'caption' })] };
}

function headingBlock(t, w, words, name) {
  const style = styles.heading(t);
  const h = textH(words, w, style);
  return { min: h, grow: 0, max: h, build: (box) => [text(box, words, style, name, { preset: 'heading' })] };
}

/** A row of icon, heading and a line, the three-across block every deck has. */
function featureRow(t, region, count) {
  const r = t.random;
  const items = shuffled(r, WORDS.features).slice(0, count);
  const boxes = columns(t, region, items.map(() => 1));
  const size = half(44 * t.k);
  const hs = styles.heading(t);
  const bs = styles.small(t);
  const hH = Math.max(...items.map(([head]) => textH(head, boxes[0].w, hs)));
  const bH = Math.max(...items.map(([, words]) => textH(words, boxes[0].w, bs)));
  const block = size + 14 * t.k + hH + 6 * t.k + bH;
  const top = region.y + Math.max(0, (region.h - block) / 2);
  return items.flatMap(([head, words, ic], i) => {
    const box = boxes[i];
    return [
      iconEl(t, { x: box.x, y: top, w: size, h: size }, ic, head + ' icon'),
      text({ x: box.x, y: top + size + 14 * t.k, w: box.w, h: hH }, head, hs, head + ' heading', { preset: 'heading' }),
      text({ x: box.x, y: top + size + 14 * t.k + hH + 6 * t.k, w: box.w, h: bH }, words, bs, head + ' text', { preset: 'body' }),
    ];
  });
}

/* ---------------------------------------------------------------- layouts */

/** The title slide. */
function titleLayout(t, variant) {
  const r = t.random;
  const style = variant || t.titleStyle;
  const layout = makeLayout('Title', 'title');
  const words = WORDS.deckTitles[0];
  const sub = r.pick(WORDS.deckSubs);
  const kicker = r.pick(WORDS.kickers);
  const els = [];

  const block = (x, w, ink, under, kickerColor) => {
    const ks = { ...styles.kicker(t, kickerColor), align: undefined };
    const ts = styles.display(t, ink);
    const ss = { family: t.head, size: t.fs.body, color: under, lineHeight: 1.35, fit: 'shrink' };
    const kH = textH('{deck}', w, ks);
    const tH = textH(words, w, ts);
    const sH = textH(sub, w, ss);
    const total = kH + 12 * t.k + tH + 16 * t.k + sH;
    const y0 = (t.H - total) / 2;
    return [
      text({ x, y: y0, w, h: kH }, '{deck}', ks, 'Kicker', { preset: 'label' }),
      text({ x, y: y0 + kH + 12 * t.k, w, h: tH }, words, ts, 'Title', { preset: 'title' }),
      text({ x, y: y0 + kH + 12 * t.k + tH + 16 * t.k, w, h: sH }, sub, ss, 'Subtitle', { preset: 'subtitle' }),
      el('field', { x, y: t.H - t.m * 0.62 - 22 * t.k, w: span(t, 4), h: 22 * t.k }, { family: t.head, size: t.fs.caption, color: under, align: 'left', valign: 'middle', fit: 'shrink' }, { field: 'date' }, { name: 'Date' }),
    ];
  };

  if (style === 'band') {
    const ink = readable(t.pal, 'primary', ['paper']);
    const under = readable(t.pal, 'primary', ['tint', 'highlight', 'paper'], 4.5);
    const kickerColor = readable(t.pal, 'primary', ['highlight', 'accent', 'tint'], 4.5);
    els.push(
      el('shape', { x: 0, y: 0, w: t.W, h: t.H }, { shape: 'rect', fill: 'primary' }, {}, { name: 'Title background', fixed: true }),
      el('pattern', { x: t.W * 0.5, y: 0, w: t.W * 0.5, h: t.H }, { kind: t.pattern.kind, scheme: 'soft', density: t.pattern.density, opacity: 0.32 }, { seed: seedFrom(r) }, { name: 'Title graphic' }),
      ...block(t.m, span(t, 8), ink, under, kickerColor),
    );
  } else if (style === 'sidebar') {
    const sideW = half(t.W * r.pick([0.34, 0.4]));
    const onSide = readable(t.pal, 'primary', ['paper']);
    els.push(
      el('shape', { x: 0, y: 0, w: sideW, h: t.H }, { shape: 'rect', fill: 'primary' }, {}, { name: 'Side band', fixed: true }),
      el('pattern', { x: 0, y: t.H * 0.6, w: sideW, h: t.H * 0.4 }, { kind: t.pattern.kind, scheme: 'brand', density: t.pattern.density, opacity: 0.6 }, { seed: seedFrom(r) }, { name: 'Side graphic' }),
    );
    // The title sits on paper beside the band, so the band is decoration, not
    // something the words have to fight.
    const x = sideW + t.m;
    els.push(...block(x, t.W - sideW - 2 * t.m, 'primary', 'muted', t.kicker));
    els.push(el('field', { x: t.m * 0.5, y: t.H - t.m * 0.62 - 44 * t.k, w: sideW - t.m * 0.9, h: 44 * t.k }, { family: t.head, size: t.fs.caption, color: onSide, align: 'left', valign: 'bottom', lineHeight: 1.3, fit: 'shrink' }, { field: 'deck' }, { name: 'Deck name' }));
  } else if (style === 'card') {
    const cardW = span(t, 8);
    const pad = half(30 * t.k);
    els.push(el('pattern', { x: 0, y: 0, w: t.W, h: t.H }, { kind: t.pattern.kind, scheme: 'brand', density: t.pattern.density, opacity: 0.9, fill: 'tint' }, { seed: seedFrom(r) }, { name: 'Background graphic' }));
    const ks = styles.kicker(t);
    const ts = styles.display(t, 'primary');
    const ss = { family: t.head, size: t.fs.body, color: 'muted', lineHeight: 1.35, fit: 'shrink' };
    const inner = cardW - 2 * pad;
    const kH = textH('{deck}', inner, ks);
    const tH = textH(words, inner, ts);
    const sH = textH(sub, inner, ss);
    const cardH = pad * 2 + kH + 12 * t.k + tH + 16 * t.k + sH;
    const cardY = (t.H - cardH) / 2;
    els.push(
      el('shape', { x: t.m, y: cardY, w: cardW, h: cardH }, { shape: 'rect', fill: 'paper', radius: Math.max(t.radius, 6) }, {}, { name: 'Title card', fixed: true }),
      text({ x: t.m + pad, y: cardY + pad, w: inner, h: kH }, '{deck}', ks, 'Kicker', { preset: 'label' }),
      text({ x: t.m + pad, y: cardY + pad + kH + 12 * t.k, w: inner, h: tH }, words, ts, 'Title', { preset: 'title' }),
      text({ x: t.m + pad, y: cardY + pad + kH + 12 * t.k + tH + 16 * t.k, w: inner, h: sH }, sub, ss, 'Subtitle', { preset: 'subtitle' }),
    );
  } else if (style === 'graphic') {
    els.push(el('pattern', { x: 0, y: 0, w: t.W, h: t.H }, { kind: t.pattern.kind, scheme: 'soft', density: t.pattern.density, opacity: 0.55 }, { seed: seedFrom(r) }, { name: 'Background graphic' }));
    els.push(...block(t.m, span(t, 8), 'primary', 'muted', t.kicker));
  } else {
    // rule: the title on paper over a short accent rule.
    const x = t.m;
    const w = span(t, 9);
    const ks = styles.kicker(t);
    const ts = styles.display(t, 'primary');
    const ss = { family: t.head, size: t.fs.body, color: 'muted', lineHeight: 1.35, fit: 'shrink' };
    const kH = textH('{deck}', w, ks);
    const tH = textH(words, w, ts);
    const sH = textH(sub, w, ss);
    const total = 6 + 14 * t.k + kH + 12 * t.k + tH + 16 * t.k + sH;
    const y0 = (t.H - total) / 2;
    els.push(
      el('shape', { x, y: y0, w: span(t, 2), h: 6 }, { shape: 'rect', fill: 'accent' }, {}, { name: 'Title rule', fixed: true }),
      text({ x, y: y0 + 6 + 14 * t.k, w, h: kH }, '{deck}', ks, 'Kicker', { preset: 'label' }),
      text({ x, y: y0 + 6 + 14 * t.k + kH + 12 * t.k, w, h: tH }, words, ts, 'Title', { preset: 'title' }),
      text({ x, y: y0 + 6 + 14 * t.k + kH + 12 * t.k + tH + 16 * t.k, w, h: sH }, sub, ss, 'Subtitle', { preset: 'subtitle' }),
      el('field', { x, y: t.H - t.m * 0.62 - 22 * t.k, w: span(t, 4), h: 22 * t.k }, { family: t.head, size: t.fs.caption, color: 'muted', align: 'left', valign: 'middle', fit: 'shrink' }, { field: 'date' }, { name: 'Date' }),
    );
  }
  layout.elements = els;
  return layout;
}

/** The divider that names what comes next. */
function sectionLayout(t, variant) {
  const r = t.random;
  const style = variant || t.sectionStyle;
  const layout = makeLayout('Section', 'section');
  const words = r.pick(WORDS.sectionTitles);
  const note = r.pick(WORDS.sectionNotes);
  const els = [];
  const onColor = readable(t.pal, 'primary', ['paper']);
  const underColor = readable(t.pal, 'primary', ['tint', 'highlight', 'paper'], 4.5);
  const numberColor = readable(t.pal, 'primary', ['highlight', 'accent', 'tint'], 4.5);

  if (style === 'full' || style === 'number') {
    els.push(el('shape', { x: 0, y: 0, w: t.W, h: t.H }, { shape: 'rect', fill: 'primary' }, {}, { name: 'Section background', fixed: true }));
    if (style === 'number') {
      els.push(el('pattern', { x: t.W * 0.58, y: 0, w: t.W * 0.42, h: t.H }, { kind: t.pattern.kind, scheme: 'soft', density: t.pattern.density, opacity: 0.3 }, { seed: seedFrom(r) }, { name: 'Section graphic' }));
    }
    const w = span(t, 8);
    const ts = styles.display(t, onColor, { size: t.fs.display * 0.86 });
    const ns = { family: t.head, size: t.fs.display * 0.7, bold: true, color: numberColor, align: 'left', valign: 'bottom', fit: 'shrink' };
    const ss = { family: t.head, size: t.fs.body, color: underColor, lineHeight: 1.35, fit: 'shrink' };
    const nH = t.fs.display * 0.8;
    const tH = textH(words, w, ts);
    const sH = textH(note, w, ss);
    const total = nH + 10 * t.k + tH + 14 * t.k + sH;
    const y0 = (t.H - total) / 2;
    els.push(
      // The number here is the slide's own, worked out from where it sits.
      el('field', { x: t.m, y: y0, w: span(t, 3), h: nH }, ns, { field: 'number' }, { name: 'Section number' }),
      text({ x: t.m, y: y0 + nH + 10 * t.k, w, h: tH }, words, ts, 'Section title', { preset: 'title' }),
      text({ x: t.m, y: y0 + nH + 10 * t.k + tH + 14 * t.k, w, h: sH }, note, ss, 'Section note', { preset: 'subtitle' }),
    );
  } else {
    // half: colour on one side, the words on paper on the other.
    const left = r() < 0.5;
    const bandW = half(t.W * 0.42);
    els.push(
      el('shape', { x: left ? 0 : t.W - bandW, y: 0, w: bandW, h: t.H }, { shape: 'rect', fill: 'primary' }, {}, { name: 'Section band', fixed: true }),
      el('pattern', { x: left ? 0 : t.W - bandW, y: 0, w: bandW, h: t.H }, { kind: t.pattern.kind, scheme: 'soft', density: t.pattern.density, opacity: 0.28 }, { seed: seedFrom(r) }, { name: 'Section graphic' }),
    );
    const x = left ? bandW + t.m : t.m;
    const w = t.W - bandW - 2 * t.m;
    const ts = styles.display(t, 'primary', { size: t.fs.display * 0.82 });
    const ns = { family: t.head, size: t.fs.title, bold: true, color: ink(t, 'paper', ['accent', 'secondary', 'primary'], { size: t.fs.title, bold: true }), valign: 'bottom', fit: 'shrink' };
    const ss = { family: t.head, size: t.fs.body, color: 'muted', lineHeight: 1.35, fit: 'shrink' };
    const nH = t.fs.title * 1.2;
    const tH = textH(words, w, ts);
    const sH = textH(note, w, ss);
    const total = nH + 8 * t.k + tH + 14 * t.k + sH;
    const y0 = (t.H - total) / 2;
    els.push(
      el('field', { x, y: y0, w: span(t, 3), h: nH }, ns, { field: 'number' }, { name: 'Section number' }),
      text({ x, y: y0 + nH + 8 * t.k, w, h: tH }, words, ts, 'Section title', { preset: 'title' }),
      text({ x, y: y0 + nH + 8 * t.k + tH + 14 * t.k, w, h: sH }, note, ss, 'Section note', { preset: 'subtitle' }),
    );
  }
  layout.elements = els;
  return layout;
}

/** A heading with something under it: the slide most decks are mostly made of. */
function contentLayout(t, variant) {
  const r = t.random;
  const arrangement = variant || weighted(r, [['bullets', 5], ['bulletsPicture', 4], ['features', 3], ['bulletsStat', 2], ['paragraph', 2]]);
  const layout = makeLayout('Title and content', 'titleContent');
  const head = heading(t, r.pick(WORDS.titles));
  const region = { x: t.m, y: head.top, w: full(t), h: (t.chrome === 'none' ? t.H - t.m * 0.8 : t.footY - t.gap * 0.6) - head.top };
  const words = r.pick(WORDS.bullets);
  let body = [];
  if (arrangement === 'bullets') {
    body = stack(t, region, [bulletBlock(t, region.w, words)], { anchor: 'top' });
  } else if (arrangement === 'paragraph') {
    body = stack(t, region, [paragraphBlock(t, span(t, 9), r.pick(WORDS.paragraphs))], { anchor: 'top' });
    body = stack(t, { ...region, w: span(t, 9) }, [paragraphBlock(t, span(t, 9), r.pick(WORDS.paragraphs))], { anchor: 'top' });
  } else if (arrangement === 'features') {
    body = featureRow(t, region, t.W > 800 ? r.pick([3, 3, 4]) : 3);
  } else if (arrangement === 'bulletsStat') {
    const [a, b] = columns(t, region, [7, 5]);
    body = [
      ...stack(t, a, [bulletBlock(t, a.w, words)], { anchor: 'top' }),
      ...stack(t, b, [statBlock(t, r.pick(WORDS.stats), true)], { anchor: 'middle' }),
    ];
  } else {
    const wide = r() < 0.5;
    const [a, b] = columns(t, region, wide ? [6, 6] : [7, 5]);
    const left = r() < 0.5;
    const textBox = left ? a : b;
    const picBox = left ? b : a;
    body = [
      ...stack(t, textBox, [bulletBlock(t, textBox.w, words)], { anchor: 'top' }),
      ...stack(t, picBox, [pictureBlock(t), captionBlock(t, picBox.w, r.pick(WORDS.captions))], { anchor: 'top' }),
    ];
  }
  layout.elements = [...head.els, ...body, ...chrome(t)];
  return layout;
}

function twoColumnLayout(t, variant) {
  const r = t.random;
  const layout = makeLayout('Two column', 'twoColumn');
  const head = heading(t, r.pick(WORDS.titles));
  const region = { x: t.m, y: head.top, w: full(t), h: (t.chrome === 'none' ? t.H - t.m * 0.8 : t.footY - t.gap * 0.6) - head.top };
  const [a, b] = columns(t, region, [6, 6]);
  const names = shuffled(r, WORDS.headings).slice(0, 2);
  const words = shuffled(r, WORDS.bullets).slice(0, 2);
  const side = (box, name, body, i) => stack(t, box, [
    headingBlock(t, box.w, name, (i ? 'Right' : 'Left') + ' heading'),
    bulletBlock(t, box.w, body, i ? 'Right' : 'Left'),
  ], { anchor: 'top' });
  layout.elements = [...head.els, ...side(a, names[0], words[0], 0), ...side(b, names[1], words[1] || words[0], 1), ...chrome(t)];
  return layout;
}

function comparisonLayout(t, variant) {
  const r = t.random;
  const layout = makeLayout('Comparison', 'comparison');
  const head = heading(t, r.pick(WORDS.titles));
  const region = { x: t.m, y: head.top, w: full(t), h: (t.chrome === 'none' ? t.H - t.m * 0.8 : t.footY - t.gap * 0.6) - head.top };
  const [a, b] = columns(t, region, [6, 6]);
  const names = shuffled(r, [['What works', 'check'], ['What does not', 'close'], ['Before', 'clock'], ['After', 'rocket']]).slice(0, 2);
  const words = shuffled(r, WORDS.bullets).slice(0, 2);
  const pad = panelPad(t) || half(18 * t.k);
  const behind = t.panel === 'tint' ? 'tint' : 'paper';
  const side = (box, [name, ic], body, i) => {
    const inner = { x: box.x + pad, y: box.y + pad, w: box.w - 2 * pad, h: box.h - 2 * pad };
    const color = i
      ? ink(t, behind, ['accent', 'secondary', 'primary'], { size: t.fs.heading, bold: true })
      : ink(t, behind, ['primary', 'secondary'], { size: t.fs.heading, bold: true });
    const size = half(30 * t.k);
    const hs = styles.heading(t, color);
    const hH = Math.max(size, textH(name, inner.w - size - 10 * t.k, hs));
    const bs = styles.body(t, { size: t.fs.body * 0.95 });
    return [
      ...panel(t, box, (i ? 'Right' : 'Left') + ' panel'),
      iconEl(t, { x: inner.x, y: inner.y + (hH - size) / 2, w: size, h: size }, ic, name + ' icon'),
      text({ x: inner.x + size + 10 * t.k, y: inner.y, w: inner.w - size - 10 * t.k, h: hH }, name, hs, (i ? 'Right' : 'Left') + ' heading', { preset: 'heading' }),
      text({ x: inner.x, y: inner.y + hH + 12 * t.k, w: inner.w, h: inner.h - hH - 12 * t.k }, body, bs, i ? 'Right' : 'Left', { preset: 'bullets' }),
    ];
  };
  layout.elements = [...head.els, ...side(a, names[0], words[0], 0), ...side(b, names[1], words[1] || words[0], 1), ...chrome(t)];
  return layout;
}

function bigNumberLayout(t, variant) {
  const r = t.random;
  const style = variant || weighted(r, [['one', 4], ['three', 3], ['withNote', 3]]);
  const layout = makeLayout('Big number', 'bigNumber');
  const els = [];
  if (style === 'three') {
    const head = heading(t, r.pick(WORDS.titles));
    const region = { x: t.m, y: head.top, w: full(t), h: (t.chrome === 'none' ? t.H - t.m * 0.8 : t.footY - t.gap * 0.6) - head.top };
    const picks = shuffled(r, WORDS.stats).slice(0, 3);
    const boxes = columns(t, region, [1, 1, 1]);
    const framed = t.panel !== 'plain';
    const pad = framed ? panelPad(t) : 0;
    const statH = Math.min(region.h, half(170 * t.k));
    const y = region.y + Math.max(0, (region.h - statH) / 2);
    picks.forEach(([value, label, ic], i) => {
      const behind = framed && t.panel === 'tint' ? 'tint' : 'paper';
      const wanted = [['primary', 'secondary'], ['secondary', 'primary'], ['accent', 'primary', 'secondary']][i % 3];
      els.push(el('stat', { x: boxes[i].x, y, w: boxes[i].w, h: statH }, {
        family: t.head,
        color: ink(t, behind, wanted, { size: t.fs.display, bold: true }),
        labelColor: 'muted',
        align: 'left',
        iconSide: t.badge === 'none' ? 'none' : 'top',
        fill: framed && t.panel === 'tint' ? 'tint' : null,
        stroke: framed && t.panel === 'outline' ? 'rule' : null,
        lw: 0.9,
        radius: t.radius,
        padding: pad,
      }, { value, label, icon: ic }, { name: 'Number ' + (i + 1) }));
    });
    els.unshift(...head.els);
  } else {
    const [value, label, ic] = r.pick(WORDS.stats);
    const kicker = r.pick(WORDS.kickers);
    const w = span(t, style === 'withNote' ? 7 : 10);
    const ks = styles.kicker(t);
    const kH = textH(kicker, w, ks);
    const statH = half(190 * t.k);
    const note = r.pick(WORDS.takeaways);
    const ns = styles.small(t, { color: 'muted' });
    const nH = style === 'withNote' ? textH(note, span(t, 4), ns) : 0;
    const total = kH + 18 * t.k + statH;
    const y0 = (t.H - total) / 2;
    els.push(
      text({ x: t.m, y: y0, w, h: kH }, kicker, ks, 'Label', { preset: 'label' }),
      el('stat', { x: t.m, y: y0 + kH + 18 * t.k, w, h: statH }, {
        family: t.head, color: 'primary', labelColor: 'muted', align: 'left',
        iconSide: t.badge === 'none' ? 'none' : 'left',
      }, { value, label, icon: ic }, { name: 'Big number' }),
    );
    if (style === 'withNote') {
      els.push(text({ x: t.m + span(t, 8), y: y0 + kH + 18 * t.k + (statH - nH) / 2, w: span(t, 4), h: nH }, note, ns, 'Note', { preset: 'body' }));
    }
    els.push(...chrome(t));
  }
  if (style === 'three') els.push(...chrome(t));
  layout.elements = els;
  return layout;
}

function quoteLayout(t, variant) {
  const r = t.random;
  const style = variant || weighted(r, [['plain', 4], ['tint', 3], ['colour', 3]]);
  const layout = makeLayout('Quote', 'quote');
  const els = [];
  const onColour = style === 'colour';
  const ink = onColour ? readable(t.pal, 'primary', ['paper']) : 'primary';
  const under = onColour ? readable(t.pal, 'primary', ['tint', 'highlight', 'paper'], 4.5) : 'muted';
  const markColour = onColour ? readable(t.pal, 'primary', ['highlight', 'accent', 'tint'], 3) : 'accent';
  if (style === 'colour') els.push(el('shape', { x: 0, y: 0, w: t.W, h: t.H }, { shape: 'rect', fill: 'primary' }, {}, { name: 'Quote background', fixed: true }));
  if (style === 'tint') els.push(el('shape', { x: 0, y: 0, w: t.W, h: t.H }, { shape: 'rect', fill: 'tint' }, {}, { name: 'Quote background', fixed: true }));
  const words = r.pick(WORDS.quotes);
  const by = r.pick(WORDS.quoteBy);
  const w = span(t, 9);
  const qs = { family: 'serif', size: t.fs.title * 1.02, italic: true, color: ink, lineHeight: 1.3, fit: 'shrink' };
  const cs = styles.caption(t, { color: under, size: t.fs.small });
  const size = half(40 * t.k);
  const qH = textH(words, w, qs);
  const cH = textH(by, w, cs);
  const total = size + 16 * t.k + qH + 16 * t.k + cH;
  const y0 = (t.H - total) / 2;
  els.push(
    el('icon', { x: t.m, y: y0, w: size, h: size }, { color: markColour, badge: 'none' }, { icon: 'quote' }, { name: 'Quote mark' }),
    text({ x: t.m, y: y0 + size + 16 * t.k, w, h: qH }, words, qs, 'Quote', { preset: 'quote' }),
    text({ x: t.m, y: y0 + size + 16 * t.k + qH + 16 * t.k, w: span(t, 7), h: cH }, by, cs, 'Attribution', { preset: 'caption' }),
    ...chrome(t, { on: style === 'colour' ? 'primary' : style === 'tint' ? 'tint' : 'paper' }),
  );
  layout.elements = els;
  return layout;
}

function imageLayout(t, variant) {
  const r = t.random;
  const style = variant || weighted(r, [['band', 4], ['corner', 3], ['side', 3]]);
  const layout = makeLayout('Full-bleed picture', 'imageFull');
  const els = [el('image', { x: 0, y: 0, w: t.W, h: t.H }, { fit: 'cover' }, {}, { name: 'Picture' })];
  const words = r.pick(WORDS.titles);
  const caption = r.pick(WORDS.captions);
  const ink = readable(t.pal, 'primary', ['paper']);
  const under = readable(t.pal, 'primary', ['tint', 'highlight', 'paper'], 4.5);
  const ts = styles.title(t, ink, { valign: 'top' });
  const cs = styles.caption(t, { color: under });
  if (style === 'side') {
    const w = half(t.W * 0.42);
    const inner = w - 2 * t.m * 0.8;
    const pad = t.m * 0.8;
    const tH = textH(words, inner, ts);
    const cH = textH(caption, inner, cs);
    const y0 = (t.H - tH - 14 * t.k - cH) / 2;
    els.push(
      el('shape', { x: 0, y: 0, w, h: t.H }, { shape: 'rect', fill: 'primary', opacity: 0.94 }, {}, { name: 'Caption panel', fixed: true }),
      text({ x: pad, y: y0, w: inner, h: tH }, words, ts, 'Title', { preset: 'title' }),
      text({ x: pad, y: y0 + tH + 14 * t.k, w: inner, h: cH }, caption, cs, 'Caption', { preset: 'caption' }),
    );
  } else if (style === 'corner') {
    const w = span(t, 6);
    const pad = half(24 * t.k);
    const tH = textH(words, w - 2 * pad, ts);
    const cH = textH(caption, w - 2 * pad, cs);
    const boxH = tH + 12 * t.k + cH + 2 * pad;
    const y = t.H - t.m * 0.7 - boxH;
    els.push(
      el('shape', { x: t.m, y, w, h: boxH }, { shape: 'rect', fill: 'primary', radius: t.radius, opacity: 0.94 }, {}, { name: 'Caption panel', fixed: true }),
      text({ x: t.m + pad, y: y + pad, w: w - 2 * pad, h: tH }, words, ts, 'Title', { preset: 'title' }),
      text({ x: t.m + pad, y: y + pad + tH + 12 * t.k, w: w - 2 * pad, h: cH }, caption, cs, 'Caption', { preset: 'caption' }),
    );
  } else {
    const w = span(t, 9);
    const tH = textH(words, w, ts);
    const cH = textH(caption, w, cs);
    const bandH = tH + 14 * t.k + cH + t.m * 0.9;
    const y = t.H - bandH;
    els.push(
      el('shape', { x: 0, y, w: t.W, h: bandH }, { shape: 'rect', fill: 'primary', opacity: 0.9 }, {}, { name: 'Caption band', fixed: true }),
      text({ x: t.m, y: y + t.m * 0.4, w, h: tH }, words, ts, 'Title', { preset: 'title' }),
      text({ x: t.m, y: y + t.m * 0.4 + tH + 14 * t.k, w, h: cH }, caption, cs, 'Caption', { preset: 'caption' }),
    );
  }
  layout.elements = els;
  return layout;
}

function chartLayout(t, variant) {
  const r = t.random;
  const style = variant || weighted(r, [['wide', 4], ['withNote', 4], ['two', 2]]);
  const layout = makeLayout('Chart', 'chart');
  const head = heading(t, r.pick(WORDS.titles));
  const region = { x: t.m, y: head.top, w: full(t), h: (t.chrome === 'none' ? t.H - t.m * 0.8 : t.footY - t.gap * 0.6) - head.top };
  // A round chart across a whole slide is a small chart with a lot of white
  // beside it; alone and wide, a chart is one that reads along its width.
  const wideOk = (spec) => !['donut', 'rings', 'waffle', 'pie'].includes(spec[1].kind);
  let body;
  if (style === 'two') {
    const picks = shuffled(r, CHARTS).slice(0, 2);
    const boxes = columns(t, region, [1, 1]);
    body = picks.flatMap((spec, i) => stack(t, boxes[i], [
      headingBlock(t, boxes[i].w, spec[0], 'Chart ' + (i + 1) + ' heading'),
      chartBlock(t, spec, 'Chart ' + (i + 1)),
    ], { anchor: 'top' }));
  } else if (style === 'withNote') {
    const [a, b] = columns(t, region, [8, 4]);
    const spec = r.pick(CHARTS.filter(wideOk));
    const note = r.pick(WORDS.takeaways);
    body = [
      ...stack(t, a, [chartBlock(t, spec)], { anchor: 'top' }),
      ...stack(t, b, [
        headingBlock(t, b.w, r.pick(WORDS.takeawayHeadings), 'Takeaway heading'),
        paragraphBlock(t, b.w, note, 'Takeaway'),
      ], { anchor: 'middle' }),
    ];
  } else {
    const spec = r.pick(CHARTS.filter(wideOk));
    const note = r.pick(WORDS.takeaways);
    body = stack(t, region, [chartBlock(t, spec), captionBlock(t, region.w, note, 'Takeaway')], { anchor: 'top' });
  }
  layout.elements = [...head.els, ...body, ...chrome(t)];
  return layout;
}

function agendaLayout(t, variant) {
  const r = t.random;
  const style = variant || weighted(r, [['plain', 4], ['sidePanel', 3], ['graphic', 2]]);
  const layout = makeLayout('Agenda', 'agenda');
  const head = heading(t, 'What we are going to cover');
  const region = { x: t.m, y: head.top, w: full(t), h: (t.chrome === 'none' ? t.H - t.m * 0.8 : t.footY - t.gap * 0.6) - head.top };
  const els = [...head.els];
  if (style === 'sidePanel') {
    const [a, b] = columns(t, region, [7, 5]);
    els.push(
      el('agenda', a, { ...styles.body(t, { size: t.fs.body * 1.1, lineHeight: 1.7, paraSpacing: 0.4 }), numberColor: t.kicker }, { source: 'sections', numbers: true }, { name: 'Agenda' }),
      ...panel(t, b, 'Side panel'),
      el('pattern', { x: b.x + panelPad(t), y: b.y + panelPad(t), w: b.w - 2 * panelPad(t), h: b.h - 2 * panelPad(t) }, { kind: t.pattern.kind, scheme: 'brand', density: t.pattern.density, opacity: 0.85, radius: t.radius }, { seed: seedFrom(r) }, { name: 'Side graphic' }),
    );
  } else {
    if (style === 'graphic') {
      els.push(el('pattern', { x: t.W * 0.62, y: 0, w: t.W * 0.38, h: t.H }, { kind: t.pattern.kind, scheme: 'soft', density: t.pattern.density, opacity: 0.4 }, { seed: seedFrom(r) }, { name: 'Background graphic' }));
    }
    els.push(el('agenda', { x: region.x, y: region.y, w: span(t, style === 'graphic' ? 7 : 9), h: region.h },
      { ...styles.body(t, { size: t.fs.body * 1.15, lineHeight: 1.75, paraSpacing: 0.4 }), numberColor: t.kicker },
      { source: 'sections', numbers: true }, { name: 'Agenda' }));
  }
  els.push(...chrome(t));
  layout.elements = els;
  return layout;
}

function closingLayout(t, variant) {
  const r = t.random;
  const style = variant || weighted(r, [['colour', 5], ['plain', 3], ['graphic', 2]]);
  const layout = makeLayout('Closing', 'closing');
  const onColour = style !== 'plain';
  const els = [];
  if (style === 'colour') {
    els.push(el('shape', { x: 0, y: 0, w: t.W, h: t.H }, { shape: 'rect', fill: 'primary' }, {}, { name: 'Closing background', fixed: true }));
  } else if (style === 'graphic') {
    els.push(
      el('shape', { x: 0, y: 0, w: t.W, h: t.H }, { shape: 'rect', fill: 'primary' }, {}, { name: 'Closing background', fixed: true }),
      el('pattern', { x: 0, y: 0, w: t.W, h: t.H }, { kind: t.pattern.kind, scheme: 'soft', density: t.pattern.density, opacity: 0.32 }, { seed: seedFrom(r) }, { name: 'Closing graphic' }),
    );
  }
  const ink = onColour ? readable(t.pal, 'primary', ['paper']) : 'primary';
  const under = onColour ? readable(t.pal, 'primary', ['tint', 'highlight', 'paper'], 4.5) : 'muted';
  const words = r.pick(WORDS.closings);
  const contact = r.pick(WORDS.contacts);
  const w = span(t, 8);
  const ts = styles.display(t, ink);
  const ss = { family: t.head, size: t.fs.body, color: under, lineHeight: 1.4, fit: 'shrink' };
  const tH = textH(words, w, ts);
  const sH = textH(contact, w, ss);
  const total = tH + 20 * t.k + sH;
  const y0 = (t.H - total) / 2;
  els.push(
    text({ x: t.m, y: y0, w, h: tH }, words, ts, 'Title', { preset: 'title' }),
    text({ x: t.m, y: y0 + tH + 20 * t.k, w: span(t, 6), h: sH }, contact, ss, 'Contact', { preset: 'subtitle' }),
  );
  layout.elements = els;
  return layout;
}

function blankLayout(t) {
  const layout = makeLayout('Blank', 'blank');
  layout.elements = chrome(t);
  return layout;
}

/** Every layout a generated deck has, in the order the ribbon offers them. */
const BUILDERS = {
  title: titleLayout,
  agenda: agendaLayout,
  section: sectionLayout,
  titleContent: contentLayout,
  twoColumn: twoColumnLayout,
  bigNumber: bigNumberLayout,
  quote: quoteLayout,
  imageFull: imageLayout,
  chart: chartLayout,
  comparison: comparisonLayout,
  closing: closingLayout,
  blank: blankLayout,
};

/** The variants each kind can be generated in, for "six more". */
export const LAYOUT_VARIANTS = {
  title: ['band', 'sidebar', 'rule', 'card', 'graphic'],
  section: ['full', 'half', 'number'],
  titleContent: ['bullets', 'bulletsPicture', 'features', 'bulletsStat', 'paragraph'],
  bigNumber: ['one', 'three', 'withNote'],
  quote: ['plain', 'tint', 'colour'],
  imageFull: ['band', 'corner', 'side'],
  chart: ['wide', 'withNote', 'two'],
  agenda: ['plain', 'sidePanel', 'graphic'],
  closing: ['colour', 'plain', 'graphic'],
};

/* -------------------------------------------------------------------- api */

/**
 * A new deck, made by rules from a seed.
 * @param opts {seed, aspect, palette, title, slides: how many to start with}
 */
export function generateDeck(opts = {}) {
  const seed = String(opts.seed || newSeed());
  const random = rng('deck:' + GENERATOR_VERSION + ':' + seed);
  const t = makeTheme(random, opts);
  const layouts = Object.keys(BUILDERS).map((kind) => BUILDERS[kind](t));
  const deck = makeDeck({ aspect: t.aspect, layouts, title: opts.title });
  deck.palette = t.pal;
  deck.fonts = { heading: t.head, body: t.body, mono: 'mono' };
  deck.options.transition = weighted(random, [['fade', 5], ['none', 3], ['slide', 2]]);
  const of = (kind) => (layouts.find((l) => l.kind === kind) || layouts[0]).id;
  const section = { id: newId('sc'), title: 'Where we are', collapsed: false };
  deck.sections = [section];
  // A deck starts with the slides somebody is going to make anyway.
  const plan = [
    ['title', null],
    ['agenda', null],
    ['section', section.id],
    ['titleContent', section.id],
    ['bigNumber', section.id],
    ['chart', section.id],
    ['closing', null],
  ].slice(0, Math.max(2, Math.min(7, opts.slides || 7)));
  deck.slides = plan.map(([kind, sectionId]) => {
    const slide = makeSlide(deck, of(kind), { sectionId });
    // makeSlide gives a new slide's graphics seeds of their own, from the clock
    // and Math.random, because two slides of one layout should not be the same
    // picture twice. A generated deck draws them from its own seed instead, so
    // that the same seed is the same deck down to the last dot of the graphic.
    for (const id of Object.keys(slide.overrides)) {
      if (slide.overrides[id].content && slide.overrides[id].content.seed) {
        slide.overrides[id] = { content: { seed: seedFrom(random) } };
      }
    }
    return slide;
  });
  deck.generated = { seed, version: GENERATOR_VERSION };
  return deck;
}

/**
 * Six layouts for one slide, in the deck's own colours.
 *
 * Every one is a whole generated layout of the same kind, so applying it is the
 * ordinary "this slide uses that layout" - and what the slide has written moves
 * to the element of the same name, which is what makeOptions' names are for.
 *
 * @param opts {seed, aspect, palette, kind, count, offset}
 * @returns [{id, seed, layout}]
 */
export function generateSlideLayouts(opts = {}) {
  const kind = BUILDERS[opts.kind] ? opts.kind : 'titleContent';
  const count = Math.max(1, Math.min(12, opts.count || 6));
  const offset = Math.max(0, opts.offset || 0);
  const variants = LAYOUT_VARIANTS[kind] || [null];
  const out = [];
  for (let i = 0; i < count; i++) {
    const n = offset + i;
    const seed = String(opts.seed || 'slide') + ':' + n;
    const random = rng('slide:' + GENERATOR_VERSION + ':' + seed);
    // The palette is held if one was given, so "hold this palette while I try
    // layouts" is nothing more than passing it in every time.
    const t = makeTheme(random, { aspect: opts.aspect, palette: opts.palette });
    const layout = BUILDERS[kind](t, variants[n % variants.length]);
    layout.name = layout.name + ' ' + (n + 1);
    out.push({ id: layout.id, seed, layout });
  }
  return out;
}

/**
 * A whole generated style for a deck that already exists: the same twelve
 * layouts, in a new character. What moves onto it is rebaseSlides' business.
 */
export function generateLayoutsFor(opts = {}) {
  const seed = String(opts.seed || newSeed());
  const random = rng('deck:' + GENERATOR_VERSION + ':' + seed);
  const t = makeTheme(random, opts);
  return {
    seed,
    aspect: t.aspect,
    palette: t.pal,
    fonts: { heading: t.head, body: t.body, mono: 'mono' },
    transition: weighted(random, [['fade', 5], ['none', 3], ['slide', 2]]),
    layouts: Object.keys(BUILDERS).map((kind) => BUILDERS[kind](t)),
  };
}

export { newSeed, LAYOUT_KINDS };
