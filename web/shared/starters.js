// The deck you get when you have not chosen a style yet.
//
// Adapted from Newsx (web/shared/starters.js), which builds a designed
// newsletter template the same way.
//
// Every deck has the same set of layouts - title, section, title and content,
// two column, big number, quote, full-bleed picture, chart, comparison, agenda,
// closing, blank - because those are the slides people actually make. This
// builds them plainly: one grid, one scale of type, the palette by role and
// nothing decorative. The generator in generate.js builds the same set with a
// character to it; this is the one with none, which is what somebody who knows
// what their deck should look like wants to start from.
//
// Every part of a starter is an ordinary element that can be moved, restyled or
// deleted.

import { makeDeck, makeLayout, makeElement, makeSlide, ASPECTS, newId } from './model.js';

export const STARTERS = {
  plain: {
    name: 'Plain',
    description: 'A clean set of layouts: the title at the top, the words under it, the number in the corner.',
  },
  banded: {
    name: 'Banded',
    description: 'The same layouts with a coloured band behind the title, and section slides in the primary colour.',
  },
  blank: {
    name: 'Blank',
    description: 'One empty layout and one empty slide. Everything else is yours to place.',
  },
};

/** The measurements every layout in a starter is built on. */
function grid(aspect) {
  const size = ASPECTS[aspect] || ASPECTS.wide;
  const W = size.width;
  const H = size.height;
  const m = 56;
  const g = 16;
  const cw = (W - 2 * m - 11 * g) / 12;
  return {
    W, H, m, g, cw,
    span: (n) => n * cw + (n - 1) * g,
    col: (n) => m + n * (cw + g),
    // The title band, the body beneath it and the strip the footer sits in.
    titleY: 52,
    titleH: 68,
    bodyY: 150,
    bodyH: H - 150 - 56,
    footY: H - 40,
    footH: 22,
  };
}

const el = (type, box, style = {}, content = {}, extra = {}) => {
  const e = makeElement(type, 0, 0, extra.preset);
  e.x = box.x; e.y = box.y; e.w = Math.max(1, box.w); e.h = Math.max(1, box.h);
  e.style = { ...e.style, ...style };
  e.content = { ...e.content, ...content };
  if (extra.name) e.name = extra.name;
  if (extra.fixed) e.editable = false;
  return e;
};

const text = (box, words, style, name, preset = 'body') => el('text', box, style, { text: words }, { preset, name });

/** The number, the date and the footer, in the strip along the bottom. */
function chrome(t, opts = {}) {
  const small = { size: 11, color: 'muted', valign: 'middle', fit: 'shrink' };
  return [
    el('field', { x: t.m, y: t.footY, w: t.span(6), h: t.footH }, { ...small, align: 'left' }, { field: 'footer' }, { name: 'Footer', fixed: opts.fixed }),
    el('field', { x: t.W - t.m - t.span(2), y: t.footY, w: t.span(2), h: t.footH }, { ...small, align: 'right' }, { field: 'number' }, { name: 'Slide number', fixed: opts.fixed }),
  ];
}

/**
 * The layouts, built for one aspect and one style.
 * @param style 'plain' or 'banded'
 */
export function buildLayouts(aspect = 'wide', style = 'plain') {
  const t = grid(aspect);
  const banded = style === 'banded';
  const out = [];
  const layout = (name, kind, elements, background) => {
    const l = makeLayout(name, kind);
    if (background) l.background = background;
    l.elements = elements;
    out.push(l);
    return l;
  };

  /* ------------------------------------------------------------- title */
  {
    const els = [];
    const top = banded ? 0 : t.H * 0.28;
    if (banded) els.push(el('shape', { x: 0, y: 0, w: t.W, h: t.H * 0.62 }, { shape: 'rect', fill: 'primary' }, {}, { name: 'Title band', fixed: true }));
    const onBand = banded ? 'paper' : 'primary';
    const under = banded ? 'tint' : 'muted';
    const titleY = banded ? t.H * 0.62 - 190 : top;
    els.push(
      text({ x: t.m, y: titleY, w: t.span(9), h: 26 }, '{deck}', { size: 13, bold: true, transform: 'upper', tracking: 140, color: banded ? 'highlight' : 'accent', fit: 'shrink' }, 'Kicker', 'label'),
      text({ x: t.m, y: titleY + 34, w: t.span(9), h: 110 }, 'The title of this deck', { size: 48, bold: true, color: onBand, lineHeight: 1.06, fit: 'shrink' }, 'Title', 'title'),
      text({ x: t.m, y: titleY + 152, w: t.span(8), h: 38 }, 'Who is presenting, and when', { size: 18, color: under, fit: 'shrink' }, 'Subtitle', 'subtitle'),
    );
    if (!banded) els.push(el('shape', { x: t.m, y: titleY + 20, w: t.span(2), h: 4 }, { shape: 'rect', fill: 'accent' }, {}, { name: 'Title rule', fixed: true }));
    els.push(el('field', { x: t.m, y: t.footY, w: t.span(6), h: t.footH }, { size: 11, color: banded ? 'muted' : 'muted', valign: 'middle', fit: 'shrink' }, { field: 'date' }, { name: 'Date' }));
    layout('Title', 'title', els);
  }

  /* ----------------------------------------------------------- section */
  {
    const els = [];
    if (banded) els.push(el('shape', { x: 0, y: 0, w: t.W, h: t.H }, { shape: 'rect', fill: 'primary' }, {}, { name: 'Section background', fixed: true }));
    const ink = banded ? 'paper' : 'primary';
    els.push(
      el('field', { x: t.m, y: t.H / 2 - 92, w: t.span(3), h: 44 }, { size: 38, bold: true, color: banded ? 'highlight' : 'accent', valign: 'middle', fit: 'shrink' }, { field: 'number' }, { name: 'Section number' }),
      text({ x: t.m, y: t.H / 2 - 40, w: t.span(9), h: 76 }, 'Section title', { size: 40, bold: true, color: ink, lineHeight: 1.1, fit: 'shrink' }, 'Section title', 'title'),
      text({ x: t.m, y: t.H / 2 + 44, w: t.span(7), h: 52 }, 'A line about what this part covers', { size: 17, color: banded ? 'tint' : 'muted', fit: 'shrink' }, 'Section note', 'subtitle'),
    );
    layout('Section', 'section', els);
  }

  /* --------------------------------------------- title and content */
  {
    const els = [];
    if (banded) els.push(el('shape', { x: 0, y: 0, w: t.W, h: t.titleY + t.titleH + 14 }, { shape: 'rect', fill: 'tint' }, {}, { name: 'Title band', fixed: true }));
    els.push(
      text({ x: t.m, y: t.titleY, w: t.span(10), h: t.titleH }, 'Slide title', { size: 34, bold: true, color: 'primary', valign: 'middle', fit: 'shrink' }, 'Title', 'title'),
      text({ x: t.m, y: t.bodyY, w: t.span(10), h: t.bodyH }, '- The first point\n- The second point\n  - Something underneath it\n- The third point', { size: 20, lineHeight: 1.5 }, 'Content', 'bullets'),
      ...chrome(t),
    );
    if (!banded) els.push(el('shape', { x: t.m, y: t.titleY + t.titleH + 6, w: t.span(12), h: 2 }, { shape: 'rect', fill: 'rule' }, {}, { name: 'Title rule', fixed: true }));
    layout('Title and content', 'titleContent', els);
  }

  /* -------------------------------------------------------- two column */
  {
    const colW = t.span(6) - t.g / 2;
    const right = t.m + colW + t.g * 2;
    layout('Two column', 'twoColumn', [
      text({ x: t.m, y: t.titleY, w: t.span(10), h: t.titleH }, 'Two things, side by side', { size: 32, bold: true, color: 'primary', valign: 'middle', fit: 'shrink' }, 'Title', 'title'),
      text({ x: t.m, y: t.bodyY, w: colW, h: 30 }, 'On the left', { size: 18, bold: true, color: 'primary' }, 'Left heading', 'heading'),
      text({ x: t.m, y: t.bodyY + 38, w: colW, h: t.bodyH - 38 }, '- A point\n- Another point', { size: 18 }, 'Left', 'bullets'),
      text({ x: right, y: t.bodyY, w: colW, h: 30 }, 'On the right', { size: 18, bold: true, color: 'primary' }, 'Right heading', 'heading'),
      text({ x: right, y: t.bodyY + 38, w: colW, h: t.bodyH - 38 }, '- A point\n- Another point', { size: 18 }, 'Right', 'bullets'),
      ...chrome(t),
    ]);
  }

  /* --------------------------------------------------------- big number */
  {
    layout('Big number', 'bigNumber', [
      text({ x: t.m, y: t.titleY, w: t.span(10), h: 40 }, 'What this number is', { size: 13, bold: true, transform: 'upper', tracking: 140, color: 'accent', valign: 'middle' }, 'Label', 'label'),
      el('stat', { x: t.m, y: t.H / 2 - 90, w: t.span(8), h: 180 }, { family: 'sans', color: 'primary', labelColor: 'muted', align: 'left', iconSide: 'none' }, { value: '94%', label: 'of customers renewed this year', icon: 'target' }, { name: 'Big number' }),
      text({ x: t.m, y: t.H - 118, w: t.span(8), h: 40 }, 'Where the number came from', { size: 13, italic: true, color: 'muted' }, 'Source', 'caption'),
      ...chrome(t),
    ]);
  }

  /* -------------------------------------------------------------- quote */
  {
    const els = [];
    if (banded) els.push(el('shape', { x: 0, y: 0, w: t.W, h: t.H }, { shape: 'rect', fill: 'tint' }, {}, { name: 'Quote background', fixed: true }));
    els.push(
      el('icon', { x: t.m, y: t.H / 2 - 110, w: 44, h: 44 }, { color: 'accent', badge: 'none' }, { icon: 'quote' }, { name: 'Quote mark' }),
      text({ x: t.m, y: t.H / 2 - 56, w: t.span(9), h: 128 }, '> A line worth putting on a slide of its own.', { size: 30, italic: true, family: 'serif', color: 'primary', lineHeight: 1.28, valign: 'middle', fit: 'shrink' }, 'Quote', 'quote'),
      text({ x: t.m, y: t.H / 2 + 86, w: t.span(7), h: 32 }, 'Who said it, and what they do', { size: 14, color: 'muted' }, 'Attribution', 'caption'),
      ...chrome(t),
    );
    layout('Quote', 'quote', els);
  }

  /* -------------------------------------------------- full-bleed picture */
  {
    layout('Full-bleed picture', 'imageFull', [
      el('image', { x: 0, y: 0, w: t.W, h: t.H }, { fit: 'cover' }, {}, { name: 'Picture' }),
      el('shape', { x: 0, y: t.H - 190, w: t.W, h: 190 }, { shape: 'rect', fill: 'primary', opacity: 0.86 }, {}, { name: 'Caption band', fixed: true }),
      text({ x: t.m, y: t.H - 154, w: t.span(9), h: 60 }, 'A line over the picture', { size: 30, bold: true, color: 'paper', valign: 'middle', fit: 'shrink' }, 'Title', 'title'),
      text({ x: t.m, y: t.H - 88, w: t.span(8), h: 34 }, 'What the picture shows, and where it was taken', { size: 14, color: 'tint' }, 'Caption', 'caption'),
    ]);
  }

  /* -------------------------------------------------------------- chart */
  {
    layout('Chart', 'chart', [
      text({ x: t.m, y: t.titleY, w: t.span(10), h: t.titleH }, 'What the chart shows', { size: 32, bold: true, color: 'primary', valign: 'middle', fit: 'shrink' }, 'Title', 'title'),
      el('chart', { x: t.m, y: t.bodyY, w: t.span(8), h: t.bodyH - 44 }, { family: 'sans', size: 12 }, { kind: 'bar' }, { name: 'Chart' }),
      text({ x: t.m, y: t.bodyY + t.bodyH - 36, w: t.span(8), h: 30 }, 'The one thing to take away from it', { size: 14, italic: true, color: 'muted' }, 'Takeaway', 'caption'),
      ...chrome(t),
    ]);
  }

  /* --------------------------------------------------------- comparison */
  {
    const colW = t.span(6) - t.g / 2;
    const right = t.m + colW + t.g * 2;
    const panel = (x, name) => el('shape', { x, y: t.bodyY, w: colW, h: t.bodyH }, { shape: 'rect', fill: 'tint', radius: 8 }, {}, { name, fixed: true });
    layout('Comparison', 'comparison', [
      text({ x: t.m, y: t.titleY, w: t.span(10), h: t.titleH }, 'This against that', { size: 32, bold: true, color: 'primary', valign: 'middle', fit: 'shrink' }, 'Title', 'title'),
      panel(t.m, 'Left panel'),
      panel(right, 'Right panel'),
      text({ x: t.m + 20, y: t.bodyY + 20, w: colW - 40, h: 30 }, 'This', { size: 19, bold: true, color: 'primary' }, 'Left heading', 'heading'),
      text({ x: t.m + 20, y: t.bodyY + 58, w: colW - 40, h: t.bodyH - 78 }, '- What it does well\n- What it costs', { size: 17 }, 'Left', 'bullets'),
      text({ x: right + 20, y: t.bodyY + 20, w: colW - 40, h: 30 }, 'That', { size: 19, bold: true, color: 'accent' }, 'Right heading', 'heading'),
      text({ x: right + 20, y: t.bodyY + 58, w: colW - 40, h: t.bodyH - 78 }, '- What it does well\n- What it costs', { size: 17 }, 'Right', 'bullets'),
      ...chrome(t),
    ]);
  }

  /* ------------------------------------------------------------- agenda */
  {
    layout('Agenda', 'agenda', [
      text({ x: t.m, y: t.titleY, w: t.span(10), h: t.titleH }, 'What we are going to cover', { size: 32, bold: true, color: 'primary', valign: 'middle', fit: 'shrink' }, 'Title', 'title'),
      el('agenda', { x: t.m, y: t.bodyY, w: t.span(8), h: t.bodyH }, { size: 20, lineHeight: 1.6 }, { source: 'sections', numbers: true }, { name: 'Agenda' }),
      ...chrome(t),
    ]);
  }

  /* ------------------------------------------------------------ closing */
  {
    const els = [];
    if (banded) els.push(el('shape', { x: 0, y: 0, w: t.W, h: t.H }, { shape: 'rect', fill: 'primary' }, {}, { name: 'Closing background', fixed: true }));
    const ink = banded ? 'paper' : 'primary';
    els.push(
      text({ x: t.m, y: t.H / 2 - 66, w: t.span(9), h: 80 }, 'Thank you', { size: 44, bold: true, color: ink, valign: 'middle', fit: 'shrink' }, 'Title', 'title'),
      text({ x: t.m, y: t.H / 2 + 26, w: t.span(7), h: 60 }, 'How to get in touch', { size: 18, color: banded ? 'tint' : 'muted' }, 'Contact', 'subtitle'),
    );
    layout('Closing', 'closing', els);
  }

  layout('Blank', 'blank', []);
  return out;
}

/**
 * A deck to start from.
 * @param id   a key of STARTERS
 * @param opts {title, aspect, palette}
 */
export function buildStarter(id = 'plain', opts = {}) {
  const which = STARTERS[id] ? id : 'plain';
  const aspect = ASPECTS[opts.aspect] ? opts.aspect : 'wide';
  const layouts = which === 'blank' ? [makeLayout('Blank', 'blank')] : buildLayouts(aspect, which);
  const deck = makeDeck({ ...opts, aspect, layouts });
  deck.title = opts.title || deck.title;
  if (which === 'blank') {
    deck.slides = [makeSlide(deck, layouts[0].id)];
    return deck;
  }
  // A deck opens with the slides somebody is going to make anyway: a title, an
  // agenda, a section, one of content, and a closing slide.
  const of = (kind) => (layouts.find((l) => l.kind === kind) || layouts[0]).id;
  const section = { id: newId('sc'), title: 'Where we are', collapsed: false };
  deck.sections = [section];
  deck.slides = [
    makeSlide(deck, of('title')),
    makeSlide(deck, of('agenda')),
    makeSlide(deck, of('section'), { sectionId: section.id }),
    makeSlide(deck, of('titleContent'), { sectionId: section.id }),
    makeSlide(deck, of('closing')),
  ];
  return deck;
}
