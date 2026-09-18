// Where a slide's number comes from.
//
// A slide's number is never stored. It is worked out, every time anything is
// drawn, from where the slide sits in the deck's list - which is why moving a
// slide cannot leave a wrong number behind anywhere. Drag one in the sorter,
// cut and paste it, delete the one above it, undo any of that, and every number
// on every slide is right again, because there was never a second copy of the
// number to go stale.
//
// Everything that shows a number reads it from here: the sorter, the {n} and
// {total} fields on the slides, a "see slide {ref}" pointing at another slide,
// the agenda, the presenter view, the PDF and "go to slide". One function, one
// answer.
//
// A cross-reference stores the target slide's id, never its number. So the
// reference is still to the same slide after a reorder, and if that slide is
// deleted the reference says so - which the check panel picks up - rather than
// quietly pointing at whatever slide took its place.

/**
 * The numbering of a deck.
 *
 * @param deck {slides: [{id, hidden}], options: {numberHidden, startNumber}}
 * @returns {
 *   total,                     how many slides are numbered
 *   count,                     how many slides there are, hidden ones included
 *   numberOf(id) -> n | null,  null when the slide is hidden and not counted
 *   indexOf(id) -> i | -1,     its place in the deck, hidden ones included
 *   at(n) -> slide | null,     the slide with that number
 *   idAt(i),
 *   slides,                    every slide, in order
 *   visible,                   the slides that are numbered, in order
 * }
 */
export function numbering(deck) {
  const slides = (deck && deck.slides) || [];
  const options = (deck && deck.options) || {};
  // Hidden slides are either passed over - so what the audience sees is
  // 1, 2, 3 with no gaps - or counted anyway, for a deck whose hidden slides
  // are backup material people still refer to by number. It is one choice for
  // the whole deck, because half-and-half would be a deck nobody can cite.
  const skipHidden = options.numberHidden !== 'keep';
  const start = Number.isFinite(Number(options.startNumber)) ? Math.max(0, Math.round(Number(options.startNumber))) : 1;

  const numbers = new Map();
  const indexes = new Map();
  const byNumber = new Map();
  const visible = [];
  let n = start;
  slides.forEach((slide, i) => {
    indexes.set(slide.id, i);
    if (slide.hidden && skipHidden) {
      numbers.set(slide.id, null);
      return;
    }
    numbers.set(slide.id, n);
    byNumber.set(n, slide);
    visible.push(slide);
    n++;
  });

  return {
    total: visible.length,
    count: slides.length,
    first: start,
    last: start + visible.length - 1,
    slides,
    visible,
    numberOf: (id) => (numbers.has(id) ? numbers.get(id) : null),
    indexOf: (id) => (indexes.has(id) ? indexes.get(id) : -1),
    at: (number) => byNumber.get(Number(number)) || null,
    idAt: (i) => (slides[i] ? slides[i].id : null),
    has: (id) => indexes.has(id),
  };
}

/**
 * What a cross-reference points at.
 *
 * @returns {ok, number, title, slide} - ok is false when the slide it named has
 *   been deleted, which is what the check panel reports and what the field
 *   shows on the slide, rather than a number that would be wrong.
 */
export function resolveReference(deck, targetId, nums) {
  const n = nums || numbering(deck);
  const slide = (deck.slides || []).find((s) => s.id === targetId);
  if (!slide) return { ok: false, number: null, title: '', slide: null };
  return { ok: true, number: n.numberOf(slide.id), title: slideTitle(deck, slide), slide };
}

/**
 * A slide's title, for the sorter, the agenda and the presenter view.
 *
 * It is the words in the slide's title element - the first text element whose
 * name is a title, or failing that the first line of the first text on it - so
 * nobody has to name a slide twice. A slide with nothing that could be a title
 * says so, and the check panel counts it.
 */
export function slideTitle(deck, slide, resolved) {
  const elements = resolved || resolveElements(deck, slide);
  const titled = elements.find((e) => e.type === 'text' && isTitleName(e.name));
  const pick = titled || elements.find((e) => e.type === 'text');
  if (!pick) return '';
  const words = firstLine(pick.content && pick.content.text);
  return words;
}

const TITLE_NAMES = /^(title|heading|slide title|section title|big number|question)$/i;
export const isTitleName = (name) => TITLE_NAMES.test(String(name || '').trim());

/** The first line with words in it, with the markup taken off. */
function firstLine(text) {
  for (const raw of String(text == null ? '' : text).split('\n')) {
    const line = raw.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*•]\s+/, '').replace(/^>\s?/, '')
      .replace(/\*\*/g, '').replace(/\*/g, '').trim();
    if (line) return line;
  }
  return '';
}

/**
 * The elements of a slide as they will be drawn.
 *
 * Kept here as well as in model.js so that numbering, which everything reads,
 * does not have to import the whole model to find a title.
 */
function resolveElements(deck, slide) {
  const layout = (deck.layouts || []).find((l) => l.id === slide.layout);
  const out = [];
  for (const el of (layout ? layout.elements : [])) {
    const ov = (slide.overrides || {})[el.id];
    if (ov && ov.hidden) continue;
    out.push(ov && ov.content ? { ...el, content: { ...(el.content || {}), ...ov.content } } : el);
  }
  for (const extra of slide.extras || []) out.push(extra);
  return out;
}

/**
 * The sections of a deck, with the slides in each.
 *
 * A section is a run of slides in the deck's own order - it never reorders
 * anything. The sorter walks the slides from first to last and starts a new
 * group whenever the section changes, so what you see down the left is the
 * deck, in the order it will be shown, with headings printed where the subject
 * changes. Put a slide from section two in the middle of section one and the
 * sorter says so, by heading the run it made.
 *
 * Numbers keep counting across all of it - a section is a fold, not a restart -
 * so section two of a twelve-slide deck starts at whatever number it starts at.
 *
 * @returns [{section: {id, title, collapsed} | null, slides: [...], first: true
 *   the first time this section appears}]
 */
export function sectionsOf(deck) {
  const known = new Map((deck.sections || []).map((s) => [s.id, s]));
  const groups = [];
  const seen = new Set();
  let current;
  for (const slide of deck.slides || []) {
    const id = slide.sectionId && known.has(slide.sectionId) ? slide.sectionId : null;
    if (!groups.length || id !== current) {
      groups.push({ section: id ? known.get(id) : null, slides: [], first: !seen.has(id) });
      seen.add(id);
      current = id;
    }
    groups[groups.length - 1].slides.push(slide);
  }
  // A section somebody has made but not put a slide in yet still shows, at the
  // end, so it can be dropped into.
  for (const s of deck.sections || []) if (!seen.has(s.id)) groups.push({ section: s, slides: [], first: true });
  return groups;
}

/** The section a slide is in, or null. */
export function sectionOf(deck, slide) {
  if (!slide || !slide.sectionId) return null;
  return (deck.sections || []).find((s) => s.id === slide.sectionId) || null;
}
