// What a deck is made of.
//
// Adapted from Newsx (web/shared/model.js), where a publication is a template
// and the issues made from it. A deck is the same shape:
//
//   deck     the presentation: a title, a palette, its layouts and its slides
//   layout   a design several slides share - title, section, two column, quote,
//            chart - with its elements placed. Change the layout and every
//            slide using it changes, unless that slide has overridden the
//            property in question.
//   slide    one slide: which layout it uses, what is different about it (the
//            words, the picture, the chart's data, a new seed for a graphic),
//            its notes, and whether it is hidden.
//
// A slide never copies its layout. It records only its differences, so moving
// the footer on the layout moves it on every slide that has not deliberately
// moved the footer itself, and "Back to layout" is just forgetting a difference.
//
// The deck's order is the order of `slides`, and that is the only place order
// lives. No slide stores its number; see numbering.js.

import { PALETTES, DEFAULT_PALETTE, completePalette } from './color.js';
import { sampleData } from './charts.js';
import { newSeed } from './patterns.js';
import { numbering, resolveReference, slideTitle, sectionOf, sectionsOf } from './numbering.js';

/**
 * The two shapes a slide comes in. Both are in points, as a PDF measures them,
 * and both are 540 tall: changing the aspect changes how wide a slide is, not
 * how big its type is.
 */
export const ASPECTS = {
  wide: { label: 'Widescreen (16:9)', ratio: '16:9', width: 960, height: 540 },
  standard: { label: 'Standard (4:3)', ratio: '4:3', width: 720, height: 540 },
};

export const DEFAULT_ASPECT = 'wide';

export const aspectSize = (aspect) => ASPECTS[aspect] || ASPECTS[DEFAULT_ASPECT];

let counter = 0;
export function newId(prefix = 'e') {
  counter = (counter + 1) % 1296;
  return prefix + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0') + counter.toString(36).padStart(2, '0');
}

export const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/* -------------------------------------------------------------- elements */

export const ELEMENT_TYPES = {
  text: { label: 'Text', icon: 'text' },
  image: { label: 'Picture', icon: 'image' },
  icon: { label: 'Icon', icon: 'sparkles' },
  chart: { label: 'Chart', icon: 'chartBar' },
  table: { label: 'Table', icon: 'table' },
  code: { label: 'Code', icon: 'code' },
  stat: { label: 'Big number', icon: 'target' },
  shape: { label: 'Shape', icon: 'shapes' },
  line: { label: 'Line or arrow', icon: 'trendUp' },
  pattern: { label: 'Generated graphic', icon: 'pattern' },
  field: { label: 'Slide number, date or footer', icon: 'hash' },
  reference: { label: 'Reference to a slide', icon: 'link' },
  agenda: { label: 'Agenda', icon: 'checklist' },
};

/** Text presets: the same element, started at a size a slide can be read at. */
export const TEXT_PRESETS = {
  title: { label: 'Title', w: 620, h: 84, style: { family: 'sans', size: 40, bold: true, color: 'primary', lineHeight: 1.08, fit: 'shrink', valign: 'middle' }, text: 'Slide title' },
  subtitle: { label: 'Subtitle', w: 560, h: 48, style: { family: 'sans', size: 20, color: 'muted', lineHeight: 1.25, fit: 'shrink' }, text: 'A line that says what the slide is about' },
  heading: { label: 'Heading', w: 400, h: 34, style: { family: 'sans', size: 19, bold: true, color: 'primary', lineHeight: 1.2 }, text: 'Heading' },
  label: { label: 'Label', w: 260, h: 20, style: { family: 'sans', size: 11, bold: true, color: 'accent', transform: 'upper', tracking: 120, lineHeight: 1.25 }, text: 'Label' },
  body: { label: 'Body text', w: 420, h: 200, style: { family: 'sans', size: 17, color: 'ink', lineHeight: 1.45, paraSpacing: 0.5, fit: 'shrink' }, text: 'A sentence a room can read from the back.' },
  bullets: { label: 'Bullets', w: 460, h: 250, style: { family: 'sans', size: 18, color: 'ink', lineHeight: 1.45, paraSpacing: 0.55, fit: 'shrink' }, text: '- The first point\n- The second point\n  - Something underneath it\n- The third point' },
  caption: { label: 'Caption', w: 300, h: 30, style: { family: 'sans', size: 11, italic: true, color: 'muted', lineHeight: 1.3 }, text: 'Caption' },
  quote: { label: 'Quote', w: 560, h: 150, style: { family: 'serif', size: 30, italic: true, color: 'primary', lineHeight: 1.28, fit: 'shrink', valign: 'middle' }, text: '> A line worth putting on a slide of its own.' },
};

const TEXT_STYLE = {
  family: 'sans', size: 17, color: 'ink', bold: false, italic: false, align: 'left', valign: 'top',
  lineHeight: 1.4, tracking: 0, transform: 'none', columns: 1, gutter: 20, paraSpacing: 0.5, fit: 'shrink',
  fill: null, stroke: null, lw: 1, radius: 0, padding: 0, opacity: 1,
};

/** What a field can show. All of them are worked out, none of them are typed. */
export const FIELD_KINDS = {
  number: { label: 'Slide number', text: '{n}' },
  numberOfTotal: { label: 'Slide n of total', text: '{n} of {total}' },
  total: { label: 'How many slides', text: '{total}' },
  title: { label: 'This slide’s title', text: '{title}' },
  section: { label: 'This section’s name', text: '{section}' },
  deck: { label: 'The deck’s title', text: '{deck}' },
  date: { label: 'Today’s date', text: '{date}' },
  footer: { label: 'The deck’s footer', text: '{footer}' },
};

/** A new element of a type, placed at x, y. */
export function makeElement(type, x = 60, y = 60, preset) {
  const el = { id: newId(), type, name: '', x, y, w: 240, h: 120, locked: true, editable: true, style: {}, content: {} };
  switch (type) {
    case 'text': {
      const p = TEXT_PRESETS[preset] || TEXT_PRESETS.body;
      Object.assign(el, { w: p.w, h: p.h, name: p.label });
      el.style = { ...TEXT_STYLE, ...p.style };
      el.content = { text: p.text };
      break;
    }
    case 'image':
      Object.assign(el, { w: 360, h: 240, name: 'Picture' });
      el.style = { fit: 'cover', radius: 0, stroke: null, lw: 1, opacity: 1 };
      el.content = { asset: null, focusX: 0.5, focusY: 0.5, alt: '' };
      break;
    case 'icon':
      Object.assign(el, { w: 56, h: 56, name: 'Icon' });
      el.style = { color: 'primary', badge: 'none', badgeColor: 'tint', weight: 1, opacity: 1 };
      el.content = { icon: 'lightbulb' };
      break;
    case 'chart':
      Object.assign(el, { w: 440, h: 280, name: 'Chart' });
      el.style = { family: 'sans', size: 0, color: 'ink', fill: null, padding: 0, radius: 0, opacity: 1 };
      el.content = { kind: preset || 'bar', title: '', data: sampleData(preset || 'bar'), options: {} };
      break;
    case 'table':
      Object.assign(el, { w: 460, h: 220, name: 'Table' });
      el.style = { family: 'sans', size: 14, color: 'ink', header: true, zebra: true, headFill: 'primary', rule: 'rule', align: 'left', padding: 8, radius: 0, opacity: 1 };
      el.content = { rows: [['Region', 'Sold', 'Returned'], ['North', '124', '6'], ['South', '98', '4'], ['West', '71', '3']] };
      break;
    case 'code':
      Object.assign(el, { w: 460, h: 200, name: 'Code' });
      el.style = { family: 'mono', size: 14, color: 'ink', fill: 'tint', radius: 6, padding: 14, lineHeight: 1.45, opacity: 1, numbers: false };
      el.content = { code: 'function greet(name) {\n  return `Hello, ${name}`;\n}' };
      break;
    case 'stat':
      Object.assign(el, { w: 260, h: 130, name: 'Big number' });
      el.style = { family: 'sans', color: 'primary', labelColor: 'muted', align: 'left', iconSide: 'none', fill: null, radius: 8, padding: 0, opacity: 1 };
      el.content = { value: '94%', label: 'of customers renewed', icon: 'target' };
      break;
    case 'shape':
      Object.assign(el, { w: 240, h: 120, name: 'Shape', editable: false });
      el.style = { shape: 'rect', fill: 'tint', stroke: null, lw: 1, radius: 0, opacity: 1 };
      break;
    case 'line':
      Object.assign(el, { w: 240, h: 2, name: 'Line', editable: false });
      el.style = { stroke: 'rule', lw: 2, dash: false, cap: 'round', startHead: 'none', endHead: 'none', opacity: 1 };
      // Endpoints are fractions of the element's box, so a line is a box like
      // everything else: resizing it scales the line, and dragging an end
      // moves one fraction.
      el.content = { from: [0, 0.5], to: [1, 0.5] };
      break;
    case 'pattern':
      Object.assign(el, { w: 360, h: 240, name: 'Generated graphic' });
      el.style = { kind: 'network', scheme: 'brand', density: 1, stroke: 1, fill: null, radius: 0, opacity: 1 };
      el.content = { seed: newSeed() };
      break;
    case 'field':
      Object.assign(el, { w: 120, h: 24, name: 'Slide number' });
      el.style = { ...TEXT_STYLE, size: 11, color: 'muted', align: 'right', valign: 'middle', fit: 'shrink' };
      el.content = { field: preset && FIELD_KINDS[preset] ? preset : 'number' };
      break;
    case 'reference':
      Object.assign(el, { w: 220, h: 24, name: 'Reference' });
      el.style = { ...TEXT_STYLE, size: 13, color: 'accent', italic: true, fit: 'shrink' };
      // The target is a slide's id, never its number: that is the whole point.
      el.content = { target: null, text: 'see slide {ref}' };
      break;
    case 'agenda':
      Object.assign(el, { w: 460, h: 300, name: 'Agenda' });
      el.style = { ...TEXT_STYLE, size: 18, lineHeight: 1.5, paraSpacing: 0.6, color: 'ink', numberColor: 'accent' };
      el.content = { source: 'sections', numbers: true, limit: 12, dim: true };
      break;
    default:
      break;
  }
  return el;
}

/** What a slide may change on an element whose layout fixes its place. */
export const SLIDE_STYLE_KEYS = {
  text: ['color', 'size', 'align', 'valign', 'fill', 'bold', 'italic'],
  image: ['fit', 'radius'],
  icon: ['color', 'badge', 'badgeColor'],
  chart: ['color', 'size'],
  table: ['size', 'header', 'zebra'],
  code: ['size', 'fill'],
  stat: ['color', 'align'],
  shape: ['fill', 'stroke'],
  line: ['stroke', 'lw', 'startHead', 'endHead'],
  pattern: ['kind', 'scheme', 'density'],
  field: ['color', 'size', 'align'],
  reference: ['color', 'size'],
  agenda: ['size', 'numbers'],
};

/* --------------------------------------------------------------- layouts */

/** The layouts a deck comes with, and what each is for. */
export const LAYOUT_KINDS = {
  title: { label: 'Title', hint: 'The slide the deck opens on' },
  section: { label: 'Section', hint: 'A divider that names what comes next' },
  titleContent: { label: 'Title and content', hint: 'A heading with words, bullets or a picture under it' },
  twoColumn: { label: 'Two column', hint: 'Two things side by side' },
  bigNumber: { label: 'Big number', hint: 'One figure, said loudly' },
  quote: { label: 'Quote', hint: 'Somebody’s words, on a slide of their own' },
  imageFull: { label: 'Full-bleed picture', hint: 'A picture to the edges, with a line over it' },
  chart: { label: 'Chart', hint: 'A chart with a heading and a note' },
  comparison: { label: 'Comparison', hint: 'This against that' },
  agenda: { label: 'Agenda', hint: 'What the deck is going to cover' },
  closing: { label: 'Closing', hint: 'Thanks, and how to get in touch' },
  blank: { label: 'Blank', hint: 'Nothing but the deck’s background' },
};

export function makeLayout(name = 'Blank', kind = 'blank') {
  return { id: newId('ly'), name, kind, background: 'paper', elements: [] };
}

export const layoutOf = (deck, id) => (deck.layouts || []).find((l) => l.id === id) || null;

/* ----------------------------------------------------------------- decks */

export function makeDeck(opts = {}) {
  const aspect = ASPECTS[opts.aspect] ? opts.aspect : DEFAULT_ASPECT;
  const size = ASPECTS[aspect];
  const layouts = opts.layouts || [makeLayout('Blank', 'blank')];
  return {
    format: 1,
    kind: 'slidex-deck',
    title: opts.title || 'Untitled deck',
    aspect,
    size: { width: size.width, height: size.height },
    palette: completePalette(PALETTES[opts.palette] || PALETTES[DEFAULT_PALETTE]),
    fonts: { heading: 'sans', body: 'sans', mono: 'mono' },
    options: {
      // Hidden slides are passed over when the deck is numbered, unless a deck
      // says otherwise.
      numberHidden: 'skip',
      startNumber: 1,
      transition: 'fade',
      footer: '',
      // A title slide with "1" in the corner looks like a page of a report.
      numbersOnTitle: false,
    },
    layouts,
    sections: opts.sections || [],
    slides: opts.slides || [],
  };
}

/** A new slide using a layout. */
export function makeSlide(deck, layoutId, opts = {}) {
  const layout = layoutOf(deck, layoutId) || (deck.layouts || [])[0];
  const slide = {
    id: newId('sl'),
    layout: layout ? layout.id : null,
    sectionId: opts.sectionId || null,
    hidden: false,
    notes: '',
    // null means "whatever the deck says"; a slide only stores a transition
    // when somebody has chosen a different one for it.
    transition: null,
    overrides: {},
    extras: [],
  };
  // A generated graphic on a new slide draws its own picture rather than the
  // layout's, so two slides of the same layout are not the same slide twice.
  for (const el of (layout ? layout.elements : [])) {
    if (el.type === 'pattern') slide.overrides[el.id] = { content: { seed: newSeed() } };
  }
  return slide;
}

export const slideOf = (deck, id) => (deck.slides || []).find((s) => s.id === id) || null;
export const slideIndex = (deck, id) => (deck.slides || []).findIndex((s) => s.id === id);

function mergeObj(base, over) {
  if (!over) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
      ? mergeObj(base[k], v)
      : v;
  }
  return out;
}

/**
 * The elements of a slide as they will be drawn: the layout's, with the slide's
 * differences applied, and anything the slide added on top.
 */
export function resolveSlide(deck, slide) {
  const layout = layoutOf(deck, slide.layout);
  if (!layout) return null;
  const elements = [];
  for (const el of layout.elements) {
    const ov = (slide.overrides || {})[el.id];
    if (ov && ov.hidden) continue;
    let merged = { ...el, fromLayout: true };
    if (ov) {
      merged = {
        ...merged,
        style: mergeObj(el.style || {}, ov.style),
        content: mergeObj(el.content || {}, ov.content),
      };
      if (ov.geometry) Object.assign(merged, pick(ov.geometry, ['x', 'y', 'w', 'h']));
      if (ov.name) merged.name = ov.name;
    }
    elements.push(merged);
  }
  for (const extra of slide.extras || []) elements.push({ ...extra, fromLayout: false, locked: false, editable: true });
  return {
    id: slide.id,
    layoutId: layout.id,
    name: layout.name,
    kind: layout.kind,
    background: layout.background,
    notes: slide.notes || '',
    hidden: !!slide.hidden,
    elements,
  };
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => Number.isFinite(obj[k])).map((k) => [k, obj[k]]));

/** A layout's own elements, drawn as a slide would show them. */
export function resolveLayout(deck, layout) {
  return { id: layout.id, layoutId: layout.id, name: layout.name, kind: layout.kind, background: layout.background, notes: '', hidden: false, elements: layout.elements.map((e) => ({ ...e, fromLayout: true })) };
}

/** Whether a slide has changed a property of an element away from its layout. */
export function hasOverride(slide, elementId, what) {
  const ov = (slide.overrides || {})[elementId];
  if (!ov) return false;
  if (!what) return !!(ov.content || ov.style || ov.geometry || ov.hidden || ov.name);
  return !!ov[what];
}

/* --------------------------------------------------- moving slides about */
//
// Every one of these returns a new `slides` array rather than changing the one
// it was given, so the editor can put the old one back for an undo and the
// numbering is simply whatever the array says at the time.

const reindex = (slides) => slides.slice();

/** Move the slides with these ids so they sit at `to`, in the order they were. */
export function moveSlides(deck, ids, to) {
  const set = new Set(ids);
  const slides = deck.slides || [];
  const moving = slides.filter((s) => set.has(s.id));
  if (!moving.length) return reindex(slides);
  const rest = slides.filter((s) => !set.has(s.id));
  // `to` is a position in the original list; how far it shifts depends on how
  // many of the moving slides were above it.
  const above = slides.slice(0, to).filter((s) => set.has(s.id)).length;
  const at = Math.max(0, Math.min(rest.length, to - above));
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/** Put new slides in at a position. */
export function insertSlides(deck, newSlides, at) {
  const slides = deck.slides || [];
  const i = at == null ? slides.length : Math.max(0, Math.min(slides.length, at));
  return [...slides.slice(0, i), ...newSlides, ...slides.slice(i)];
}

/** Copies of slides, with new ids for them and for anything they added. */
export function duplicateSlides(deck, ids) {
  const set = new Set(ids);
  return (deck.slides || []).filter((s) => set.has(s.id)).map((s) => ({
    ...clone(s),
    id: newId('sl'),
    extras: (s.extras || []).map((e) => ({ ...clone(e), id: newId() })),
  }));
}

export function removeSlides(deck, ids) {
  const set = new Set(ids);
  return (deck.slides || []).filter((s) => !set.has(s.id));
}

/**
 * Every cross-reference in a deck, and whether it still points at a slide.
 *
 * A reference names a slide by its id, so a reorder cannot break it. Deleting
 * the slide it names can, and this is what finds those: the check panel lists
 * them, and the field on the slide says the slide is gone rather than showing a
 * number that would be somebody else's.
 *
 * @returns [{slideId, elementId, name, target, ok}]
 */
export function referencesIn(deck) {
  const out = [];
  const known = new Set((deck.slides || []).map((s) => s.id));
  for (const slide of deck.slides || []) {
    const resolved = resolveSlide(deck, slide);
    if (!resolved) continue;
    for (const el of resolved.elements) {
      if (el.type === 'reference') {
        const target = el.content && el.content.target;
        out.push({ slideId: slide.id, elementId: el.id, name: el.name || 'Reference', target: target || null, ok: !!target && known.has(target) });
        continue;
      }
      const text = el.type === 'text' ? (el.content || {}).text : null;
      for (const m of String(text || '').matchAll(/\{ref(?:\.title)?:([^}]+)\}/gi)) {
        out.push({ slideId: slide.id, elementId: el.id, name: el.name || 'Text', target: m[1], ok: known.has(m[1]) });
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------------- fields */

export const TOKENS = [
  ['{n}', 'This slide’s number'],
  ['{total}', 'How many slides the deck has'],
  ['{title}', 'This slide’s title'],
  ['{section}', 'The section this slide is in'],
  ['{deck}', 'The deck’s title'],
  ['{date}', 'Today’s date'],
  ['{footer}', 'The deck’s footer'],
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function longDate(d = new Date()) {
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

/**
 * Fill in the fields in a piece of text.
 *
 * Every number here comes from numbering.js, which reads the deck's order and
 * nothing else, so this is right the instant a slide moves. A token nobody
 * recognises is left exactly as it was typed, so a typo shows on the slide
 * instead of disappearing.
 *
 * @param ctx {deck, slide, numbers, date}
 */
export function fillFields(text, ctx) {
  const deck = ctx.deck || { slides: [] };
  const nums = ctx.numbers || numbering(deck);
  const slide = ctx.slide || null;
  return String(text == null ? '' : text).replace(/\{([a-z][a-z.]*)(?::([^}]*))?\}/gi, (all, rawName, arg) => {
    const name = rawName.toLowerCase();
    switch (name) {
      case 'n': case 'number': {
        if (!slide) return String(nums.first);
        const n = nums.numberOf(slide.id);
        return n == null ? '–' : String(n);
      }
      case 'total': return String(nums.total);
      case 'deck': return deck.title || 'Untitled deck';
      case 'title': return slide ? slideTitle(deck, slide) : '';
      case 'section': {
        const section = slide ? sectionOf(deck, slide) : null;
        return section ? section.title : '';
      }
      case 'date': return longDate(ctx.date || new Date());
      case 'footer': return (deck.options && deck.options.footer) || '';
      case 'ref': case 'ref.title': {
        const id = arg || (ctx.target || '');
        const r = resolveReference(deck, id, nums);
        if (!r.ok) return '?';
        if (name === 'ref.title') return r.title || '–';
        return r.number == null ? '–' : String(r.number);
      }
      default: return all;
    }
  });
}

/** What a field element says, before the tokens in it are filled in. */
export function fieldTemplate(content) {
  const kind = FIELD_KINDS[content && content.field] ? content.field : 'number';
  return FIELD_KINDS[kind].text;
}

/**
 * An agenda, written as text with the markup the text layout understands.
 *
 * It is built from the deck as it is now - the sections, or the slides' own
 * titles - and numbered from numbering.js, so adding a slide in the middle
 * moves every number on the agenda without anybody touching it.
 */
export function agendaText(content, ctx) {
  const deck = ctx.deck || { slides: [] };
  const nums = ctx.numbers || numbering(deck);
  const here = ctx.slide || null;
  const limit = Math.max(1, Number(content.limit) || 12);
  const showNumbers = content.numbers !== false;
  const rows = [];
  if (content.source === 'titles') {
    for (const slide of nums.visible) {
      if (here && slide.id === here.id) continue;
      const title = slideTitle(deck, slide);
      if (!title) continue;
      rows.push({ n: nums.numberOf(slide.id), title, current: false });
    }
  } else {
    // A section that a slide of another has been dropped into the middle of is
    // two runs in the sorter, but one line on the agenda: where it starts.
    for (const group of sectionsOf(deck)) {
      if (!group.section || !group.first || !group.slides.length) continue;
      const first = group.slides.find((s) => nums.numberOf(s.id) != null) || group.slides[0];
      rows.push({
        n: nums.numberOf(first.id),
        title: group.section.title,
        current: !!(here && here.sectionId === group.section.id),
      });
    }
  }
  const list = rows.slice(0, limit);
  if (!list.length) return content.empty || '';
  return list.map((r) => {
    const number = showNumbers && r.n != null ? r.n + '. ' : '- ';
    return (r.current ? '**' + number + r.title + '**' : number + r.title);
  }).join('\n');
}

/* ----------------------------------------------------------------- fonts */

/**
 * The pairings of typefaces a deck can be set in.
 *
 * Three families - sans, serif and mono - is the whole repertoire, because
 * those are the three the PDF can promise every reader already has (see
 * fonts.js). What is worth choosing is which does the headings and which does
 * the words underneath them.
 */
export const FONT_PAIRINGS = [
  { id: 'sans', label: 'Sans throughout', heading: 'sans', body: 'sans', why: 'The plainest, and the easiest to read from the back of a room.' },
  { id: 'sans-serif', label: 'Sans headings, serif words', heading: 'sans', body: 'serif', why: 'Headings that cut, paragraphs that read.' },
  { id: 'serif-sans', label: 'Serif headings, sans words', heading: 'serif', body: 'sans', why: 'A formal heading over plain words.' },
  { id: 'serif', label: 'Serif throughout', heading: 'serif', body: 'serif', why: 'For a deck that is mostly prose.' },
];

/**
 * Set the deck in a different pairing.
 *
 * Every element that was in the old heading face goes to the new one, and
 * every element that was in the old body face goes to the new one. Monospace
 * is left alone: a code block is monospaced because it is code, not because
 * of a pairing.
 */
export function applyFonts(deck, pairing) {
  const from = deck.fonts || { heading: 'sans', body: 'sans' };
  const move = (family) => {
    if (family === 'mono') return 'mono';
    if (family === from.heading && from.heading !== from.body) return pairing.heading;
    if (family === from.body && from.heading !== from.body) return pairing.body;
    // When the deck was in one face throughout, headings are told apart from
    // the words by their weight, which is what makes a heading a heading.
    return family === from.heading ? pairing.heading : pairing.body;
  };
  const retype = (el) => {
    if (!el.style || !el.style.family) return;
    const heading = el.style.bold || (el.style.size || 0) >= 24;
    el.style.family = el.style.family === 'mono' ? 'mono' : (heading ? pairing.heading : move(el.style.family));
  };
  for (const layout of deck.layouts || []) for (const el of layout.elements) retype(el);
  for (const slide of deck.slides || []) {
    for (const el of slide.extras || []) retype(el);
    for (const ov of Object.values(slide.overrides || {})) {
      if (ov.style && ov.style.family && ov.style.family !== 'mono') ov.style.family = ov.style.bold ? pairing.heading : pairing.body;
    }
  }
  deck.fonts = { heading: pairing.heading, body: pairing.body, mono: 'mono' };
  return deck;
}

/* ------------------------------------------------- a new generated style */

/**
 * The slides of a deck, moved onto a different set of layouts.
 *
 * A slide records its differences against its layout's elements by id, and a
 * newly generated style has new ids. So each slide is matched to a layout of
 * the same kind - title to title, two-column to two-column - and what the slide
 * wrote (the words, the picture, the chart's data) is carried to the element of
 * the same name and kind on it: "Title" to "Title". Positions and styles are
 * not carried, because they belonged to the old design. Whatever finds no
 * counterpart is counted, so the person choosing the new style is told before
 * anything moves.
 *
 * @returns {slides, layouts, carried, dropped}
 */
export function rebaseSlides(oldDeck, newDeck, slides) {
  let carried = 0;
  let dropped = 0;
  const kindOf = (deck, id) => (layoutOf(deck, id) || {}).kind || 'titleContent';
  const layoutsByKind = new Map();
  for (const l of newDeck.layouts || []) if (!layoutsByKind.has(l.kind)) layoutsByKind.set(l.kind, l);
  const fallback = layoutsByKind.get('titleContent') || (newDeck.layouts || [])[0];

  const out = (slides || []).map((slide) => {
    const kind = kindOf(oldDeck, slide.layout);
    const target = layoutsByKind.get(kind) || fallback;
    const next = { ...clone(slide), layout: target ? target.id : null, overrides: {}, extras: [] };
    const before = layoutOf(oldDeck, slide.layout);
    const used = new Set();
    for (const [elId, ov] of Object.entries(slide.overrides || {})) {
      const was = before && before.elements.find((e) => e.id === elId);
      if (!ov || !ov.content || !was) {
        if (ov && (ov.hidden || ov.geometry || ov.style)) dropped++;
        continue;
      }
      // A new design draws its own graphics, so an old seed means nothing.
      if (was.type === 'pattern') continue;
      const match = target && target.elements.find((e) => !used.has(e.id) && e.editable !== false && e.type === was.type && e.name === was.name);
      if (!match) { dropped++; continue; }
      used.add(match.id);
      next.overrides[match.id] = { content: clone(ov.content) };
      carried++;
    }
    for (const extra of slide.extras || []) { next.extras.push(clone(extra)); carried++; }
    // Whatever the new design's graphics are, this slide gets its own.
    for (const el of (target ? target.elements : [])) {
      if (el.type === 'pattern') next.overrides[el.id] = { ...(next.overrides[el.id] || {}), content: { ...((next.overrides[el.id] || {}).content || {}), seed: newSeed() } };
    }
    return next;
  });
  return { slides: out, layouts: newDeck.layouts, carried, dropped };
}

export { numbering, resolveReference, slideTitle, sectionOf, sectionsOf };
