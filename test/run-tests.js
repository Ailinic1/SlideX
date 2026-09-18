// The slide engine, the numbering, the PDF writer and the stores, without a browser.
//
// Laid out as Newsx's test/run-tests.js is: no dependencies, one small harness,
// and `node test/run-tests.js` runs the lot.
import { test, assert, run } from './harness.js';
import { measure, printable, unprintable } from '../web/shared/fonts.js';
import { parseRich, layoutText, wordCount, indentLevel } from '../web/shared/text.js';
import { parsePath, pathToD, arcToCubics } from '../web/shared/path.js';
import { resolveColor, PALETTES, contrast, seriesColors, completePalette, textOn } from '../web/shared/color.js';
import { renderChart, niceScale, parseTable, formatNumber, CHART_KINDS, sampleData } from '../web/shared/charts.js';
import { renderPattern, PATTERN_KINDS, rng, hashSeed } from '../web/shared/patterns.js';
import { GLYPHS, CONTENT_NAMES, searchGlyphs } from '../web/shared/glyphs.js';
import { buildStarter, buildLayouts, STARTERS } from '../web/shared/starters.js';
import {
  makeDeck, makeSlide, makeElement, resolveSlide, resolveLayout, layoutOf,
  moveSlides, insertSlides, duplicateSlides, removeSlides, referencesIn,
  fillFields, agendaText, rebaseSlides, newId, clone,
} from '../web/shared/model.js';
import { numbering, slideTitle, sectionsOf, resolveReference } from '../web/shared/numbering.js';
import { renderSlide } from '../web/shared/scene.js';
import { renderSVG } from '../web/shared/svg.js';

/* ---------------------------------------------------------------- fonts */

test('Helvetica widths: "Hello" at 10pt', () => {
  // H 722, e 556, l 222, l 222, o 556 = 2278
  assert.strictEqual(Math.round(measure('Hello', { family: 'sans', size: 10 }) * 100) / 100, 22.78);
});

test('characters the PDF fonts lack are replaced, and reported', () => {
  assert.strictEqual(printable('2 − 1 ≤ 3'), '2 - 1 <= 3');
  assert.deepStrictEqual(unprintable('café 中'), ['中']);
});

/* ----------------------------------------------------------------- text */

test('markup: headings, bullets, numbers, quotes, emphasis', () => {
  const p = parseRich('# Title\n- one\n1. first\n2. second\n> quoted\nplain **bold** *it*');
  assert.deepStrictEqual(p.map((x) => x.kind), ['h1', 'bullet', 'number', 'number', 'quote', 'p']);
  assert.strictEqual(p[3].n, 2);
});

test('bullets go three levels deep, and no further', () => {
  const p = parseRich('- top\n  - second\n    - third\n      - still third');
  assert.deepStrictEqual(p.map((x) => x.level), [0, 1, 2, 2]);
  assert.strictEqual(indentLevel('\t'), 0 + 1);
});

test('a numbered list at each level counts on its own', () => {
  const p = parseRich('1. one\n  1. a\n  2. b\n2. two');
  assert.deepStrictEqual(p.map((x) => [x.level, x.n]), [[0, 1], [1, 1], [1, 2], [0, 2]]);
});

test('an indented bullet is indented on the slide, and marked differently', () => {
  const flat = layoutText('- one', { w: 300, h: 100 }, { size: 16 });
  const deep = layoutText('    - one', { w: 300, h: 100 }, { size: 16 });
  assert.ok(deep.lines[0].words[0].x > flat.lines[0].words[0].x + 20);
  assert.notStrictEqual(flat.marks[0].text, deep.marks[0].text);
});

test('text wraps inside its box and never runs past it', () => {
  const r = layoutText('The quick brown fox jumps over the lazy dog again and again and again.', { w: 100, h: 200 }, { size: 10 });
  assert.ok(r.lines.length > 2);
  for (const line of r.lines) {
    for (const w of line.words) assert.ok(w.x + measure(w.text, { family: 'sans', size: 10 }) <= 100.01, 'word past the edge: ' + w.text);
  }
  assert.strictEqual(r.overflow, false);
});

test('text that does not fit says so, and counts what is hidden', () => {
  const r = layoutText('word '.repeat(200), { w: 100, h: 30 }, { size: 10 });
  assert.strictEqual(r.overflow, true);
  assert.ok(r.hiddenWords > 100);
});

test('shrink to fit finds a size at which it fits, and never splits a word', () => {
  const r = layoutText('Everything We Learned This Quarter', { w: 200, h: 90 }, { size: 40, fit: 'shrink', bold: true });
  assert.strictEqual(r.overflow, false);
  assert.ok(r.size < 40 && r.size > 15);
  assert.ok(!r.brokeWord);
});

test('word count ignores markup', () => {
  assert.strictEqual(wordCount('# Two words\n- **three** more words'), 5);
});

/* ---------------------------------------------------------------- paths */

test('relative, shorthand and arc commands become absolute M L C Z', () => {
  const segs = parsePath('M2 2h4v4H2zm10 0a2 2 0 1 0 4 0');
  assert.deepStrictEqual(segs.slice(0, 5).map((s) => s[0]), ['M', 'L', 'L', 'L', 'Z']);
  assert.deepStrictEqual(segs[1].slice(1), [6, 2]);
});

test('a semicircle arc passes through its midpoint', () => {
  const c = arcToCubics(0, 0, 10, 10, 0, 0, 1, 20, 0);
  const mid = c[0].slice(5);
  assert.ok(Math.abs(mid[0] - 10) < 0.01 && Math.abs(Math.abs(mid[1]) - 10) < 0.01);
});

test('every icon parses into drawable segments', () => {
  for (const [name, d] of Object.entries(GLYPHS)) {
    const segs = parsePath(d);
    assert.ok(segs.length > 1, name);
    for (const s of segs) for (const v of s.slice(1)) assert.ok(Number.isFinite(v), name);
  }
  assert.ok(CONTENT_NAMES.length >= 60);
  assert.ok(searchGlyphs('risk').length >= 1);
});

/* --------------------------------------------------------------- colour */

test('roles resolve through the palette, hex passes through', () => {
  const p = PALETTES.harbor;
  assert.strictEqual(resolveColor('primary', p), '#16324f');
  assert.strictEqual(resolveColor('#ABC', p), '#aabbcc');
  assert.strictEqual(resolveColor('nonsense', p), p.ink);
});

test('every palette puts readable white text on its primary', () => {
  for (const [id, p] of Object.entries(PALETTES)) {
    assert.ok(contrast(p.primary, '#ffffff') >= 4.5, id + ': ' + contrast(p.primary, '#ffffff').toFixed(2));
    assert.ok(contrast(p.ink, p.paper) >= 7, id + ' ink on paper');
    assert.ok(contrast(p.muted, p.paper) >= 4, id + ' muted on paper');
    assert.strictEqual(textOn(p.primary, p), '#ffffff');
  }
});

test('a series of six colours still belongs to the deck', () => {
  const colors = seriesColors(PALETTES.aurora, 8);
  assert.strictEqual(colors.length, 8);
  assert.strictEqual(new Set(colors).size, 8);
});

/* ------------------------------------------------------------ numbering */
//
// The heart of it. A slide's number is derived from its place in the deck, so
// every one of these moves a slide about and then asks every number again.

function deckOf(count, opts = {}) {
  const deck = buildStarter('plain', { title: 'Test deck', ...opts });
  const layout = deck.layouts.find((l) => l.kind === 'titleContent').id;
  deck.slides = [];
  for (let i = 0; i < count; i++) {
    const slide = makeSlide(deck, layout);
    const title = layoutOf(deck, layout).elements.find((e) => e.name === 'Title');
    slide.overrides[title.id] = { content: { text: 'Slide ' + String.fromCharCode(65 + i) } };
    deck.slides.push(slide);
  }
  return deck;
}

const numbersOf = (deck) => {
  const n = numbering(deck);
  return deck.slides.map((s) => n.numberOf(s.id));
};
const titlesOf = (deck) => deck.slides.map((s) => slideTitle(deck, s));

test('a slide has no number of its own, anywhere in the deck', () => {
  const deck = deckOf(5);
  const json = JSON.stringify(deck.slides);
  assert.ok(!/"number"/.test(json), 'a slide stores a number');
  assert.ok(!/"index"/.test(json), 'a slide stores an index');
  assert.ok(!/"position"/.test(json), 'a slide stores a position');
});

test('numbers come from the order and nothing else', () => {
  const deck = deckOf(5);
  assert.deepStrictEqual(numbersOf(deck), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(titlesOf(deck), ['Slide A', 'Slide B', 'Slide C', 'Slide D', 'Slide E']);
});

test('moving a slide renumbers everything at once', () => {
  const deck = deckOf(5);
  const e = deck.slides[4].id;
  deck.slides = moveSlides(deck, [e], 1);
  assert.deepStrictEqual(titlesOf(deck), ['Slide A', 'Slide E', 'Slide B', 'Slide C', 'Slide D']);
  assert.deepStrictEqual(numbersOf(deck), [1, 2, 3, 4, 5]);
  const n = numbering(deck);
  assert.strictEqual(n.numberOf(e), 2);
  assert.strictEqual(slideTitle(deck, n.at(2)), 'Slide E');
  assert.strictEqual(slideTitle(deck, n.at(5)), 'Slide D');
});

test('moving several slides keeps them in the order they were', () => {
  const deck = deckOf(6);
  const [a, , c, , e] = deck.slides.map((s) => s.id);
  deck.slides = moveSlides(deck, [a, c, e], 6);
  assert.deepStrictEqual(titlesOf(deck), ['Slide B', 'Slide D', 'Slide F', 'Slide A', 'Slide C', 'Slide E']);
  assert.deepStrictEqual(numbersOf(deck), [1, 2, 3, 4, 5, 6]);
});

test('moving a slide to where it already is changes nothing', () => {
  const deck = deckOf(4);
  const before = titlesOf(deck);
  deck.slides = moveSlides(deck, [deck.slides[2].id], 2);
  assert.deepStrictEqual(titlesOf(deck), before);
});

test('deleting a slide moves every number after it up', () => {
  const deck = deckOf(5);
  const b = deck.slides[1].id;
  deck.slides = removeSlides(deck, [b]);
  assert.deepStrictEqual(titlesOf(deck), ['Slide A', 'Slide C', 'Slide D', 'Slide E']);
  assert.deepStrictEqual(numbersOf(deck), [1, 2, 3, 4]);
  assert.strictEqual(numbering(deck).total, 4);
  assert.strictEqual(numbering(deck).numberOf(b), null, 'a deleted slide has no number');
});

test('duplicating a slide gives the copy the next number, and a new id', () => {
  const deck = deckOf(3);
  const copies = duplicateSlides(deck, [deck.slides[0].id]);
  deck.slides = insertSlides(deck, copies, 1);
  assert.notStrictEqual(copies[0].id, deck.slides[0].id);
  assert.deepStrictEqual(titlesOf(deck), ['Slide A', 'Slide A', 'Slide B', 'Slide C']);
  assert.deepStrictEqual(numbersOf(deck), [1, 2, 3, 4]);
});

test('inserting a slide in the middle pushes the rest down one', () => {
  const deck = deckOf(3);
  const added = makeSlide(deck, deck.slides[0].layout);
  deck.slides = insertSlides(deck, [added], 1);
  const n = numbering(deck);
  assert.strictEqual(n.numberOf(added.id), 2);
  assert.strictEqual(n.total, 4);
  assert.strictEqual(n.numberOf(deck.slides[3].id), 4);
});

test('hidden slides are skipped, or kept, as the deck says', () => {
  const deck = deckOf(5);
  deck.slides[1].hidden = true;
  deck.slides[3].hidden = true;
  assert.deepStrictEqual(numbersOf(deck), [1, null, 2, null, 3]);
  assert.strictEqual(numbering(deck).total, 3);
  assert.strictEqual(numbering(deck).count, 5);
  deck.options.numberHidden = 'keep';
  assert.deepStrictEqual(numbersOf(deck), [1, 2, 3, 4, 5]);
  assert.strictEqual(numbering(deck).total, 5);
});

test('hiding a slide renumbers the ones after it straight away', () => {
  const deck = deckOf(4);
  assert.strictEqual(numbering(deck).numberOf(deck.slides[3].id), 4);
  deck.slides[0].hidden = true;
  assert.strictEqual(numbering(deck).numberOf(deck.slides[3].id), 3);
  deck.slides[0].hidden = false;
  assert.strictEqual(numbering(deck).numberOf(deck.slides[3].id), 4);
});

test('a deck can start at a number other than one', () => {
  const deck = deckOf(3);
  deck.options.startNumber = 10;
  assert.deepStrictEqual(numbersOf(deck), [10, 11, 12]);
  assert.strictEqual(numbering(deck).at(11).id, deck.slides[1].id);
});

test('the {n} and {total} fields on a slide follow the deck around', () => {
  const deck = deckOf(4);
  const [, b] = deck.slides;
  const say = (slide) => fillFields('Slide {n} of {total}', { deck, slide });
  assert.strictEqual(say(b), 'Slide 2 of 4');
  deck.slides = moveSlides(deck, [b.id], 4);
  assert.strictEqual(say(b), 'Slide 4 of 4');
  deck.slides = removeSlides(deck, [deck.slides[0].id]);
  assert.strictEqual(say(b), 'Slide 3 of 3');
});

test('the number field on every slide of a starter is right after a reorder', () => {
  const deck = buildStarter('plain', { title: 'Reordered' });
  const numberField = (slide) => {
    const resolved = resolveSlide(deck, slide);
    const el = resolved.elements.find((e) => e.type === 'field' && e.content.field === 'number');
    return el ? fillFields('{n}', { deck, slide }) : null;
  };
  const last = deck.slides[deck.slides.length - 1];
  deck.slides = moveSlides(deck, [last.id], 0);
  const n = numbering(deck);
  for (const slide of deck.slides) {
    const shown = numberField(slide);
    if (shown == null) continue;
    assert.strictEqual(shown, String(n.numberOf(slide.id)));
  }
});

/* --------------------------------------------------- cross-references */

test('a reference is stored by the target’s id and shows its number now', () => {
  const deck = deckOf(5);
  const target = deck.slides[3];
  const here = deck.slides[0];
  const ref = makeElement('reference');
  ref.content = { target: target.id, text: 'see slide {ref}' };
  here.extras = [ref];
  const shown = () => fillFields(ref.content.text, { deck, slide: here, target: target.id });
  assert.strictEqual(shown(), 'see slide 4');
  // Moving the slide the reference points at.
  deck.slides = moveSlides(deck, [target.id], 0);
  assert.strictEqual(shown(), 'see slide 1');
  // Moving a slide that is merely in between.
  deck.slides = moveSlides(deck, [deck.slides[4].id], 0);
  assert.strictEqual(shown(), 'see slide 2');
  // Nothing about the reference itself ever changed: it holds an id and some
  // words, and no number at all.
  assert.deepStrictEqual(ref.content, { target: target.id, text: 'see slide {ref}' });
});

test('a reference inside ordinary text follows the same slide', () => {
  const deck = deckOf(4);
  const target = deck.slides[2];
  const here = deck.slides[0];
  const words = 'The numbers are on slide {ref:' + target.id + '}.';
  assert.strictEqual(fillFields(words, { deck, slide: here }), 'The numbers are on slide 3.');
  deck.slides = moveSlides(deck, [target.id], 0);
  assert.strictEqual(fillFields(words, { deck, slide: here }), 'The numbers are on slide 1.');
});

test('a reference can show the title of the slide it points at', () => {
  const deck = deckOf(3);
  const target = deck.slides[2];
  assert.strictEqual(fillFields('{ref.title:' + target.id + '}', { deck, slide: deck.slides[0] }), 'Slide C');
});

test('a reference to a deleted slide is found, and does not show a number', () => {
  const deck = deckOf(4);
  const target = deck.slides[2];
  const ref = makeElement('reference');
  ref.content = { target: target.id, text: 'see slide {ref}' };
  deck.slides[0].extras = [ref];
  assert.deepStrictEqual(referencesIn(deck).map((r) => r.ok), [true]);
  deck.slides = removeSlides(deck, [target.id]);
  const broken = referencesIn(deck);
  assert.strictEqual(broken.length, 1);
  assert.strictEqual(broken[0].ok, false);
  assert.strictEqual(broken[0].target, target.id);
  assert.strictEqual(resolveReference(deck, target.id).ok, false);
  // The slide says so rather than showing somebody else's number.
  const drawn = renderSlide(resolveSlide(deck, deck.slides[0]), { deck, slide: deck.slides[0], draft: true });
  assert.strictEqual(drawn.report[ref.id].brokenReference, target.id);
});

test('a reference to a hidden slide that is not numbered says so', () => {
  const deck = deckOf(3);
  const target = deck.slides[2];
  target.hidden = true;
  assert.strictEqual(fillFields('{ref:' + target.id + '}', { deck, slide: deck.slides[0] }), '–');
  deck.options.numberHidden = 'keep';
  assert.strictEqual(fillFields('{ref:' + target.id + '}', { deck, slide: deck.slides[0] }), '3');
});

/* --------------------------------------------------------- undo and redo */

test('undo and redo put every number back exactly as it was', () => {
  const deck = deckOf(6);
  const snapshots = [];
  const take = () => snapshots.push(JSON.stringify(deck));
  const back = (i) => Object.assign(deck, JSON.parse(snapshots[i]));

  take();                                          // 0: A B C D E F
  deck.slides = moveSlides(deck, [deck.slides[5].id], 0);
  take();                                          // 1: F A B C D E
  deck.slides = removeSlides(deck, [deck.slides[2].id]);
  take();                                          // 2: F A C D E
  const copies = duplicateSlides(deck, [deck.slides[0].id]);
  deck.slides = insertSlides(deck, copies, 2);
  take();                                          // 3: F A F C D E

  assert.deepStrictEqual(titlesOf(deck), ['Slide F', 'Slide A', 'Slide F', 'Slide C', 'Slide D', 'Slide E']);
  assert.deepStrictEqual(numbersOf(deck), [1, 2, 3, 4, 5, 6]);

  back(2);
  assert.deepStrictEqual(titlesOf(deck), ['Slide F', 'Slide A', 'Slide C', 'Slide D', 'Slide E']);
  assert.deepStrictEqual(numbersOf(deck), [1, 2, 3, 4, 5]);
  back(1);
  assert.deepStrictEqual(titlesOf(deck), ['Slide F', 'Slide A', 'Slide B', 'Slide C', 'Slide D', 'Slide E']);
  back(0);
  assert.deepStrictEqual(titlesOf(deck), ['Slide A', 'Slide B', 'Slide C', 'Slide D', 'Slide E', 'Slide F']);
  assert.deepStrictEqual(numbersOf(deck), [1, 2, 3, 4, 5, 6]);
  back(3);
  assert.deepStrictEqual(numbersOf(deck), [1, 2, 3, 4, 5, 6]);
});

test('undoing a delete brings the reference to that slide back with it', () => {
  const deck = deckOf(4);
  const target = deck.slides[3];
  const ref = makeElement('reference');
  ref.content = { target: target.id, text: 'see slide {ref}' };
  deck.slides[0].extras = [ref];
  const before = JSON.stringify(deck);
  deck.slides = removeSlides(deck, [target.id]);
  assert.strictEqual(referencesIn(deck)[0].ok, false);
  Object.assign(deck, JSON.parse(before));
  assert.strictEqual(referencesIn(deck)[0].ok, true);
  assert.strictEqual(fillFields('{ref:' + target.id + '}', { deck, slide: deck.slides[0] }), '4');
});

/* ------------------------------------------------------------- sections */

test('numbers keep counting across sections', () => {
  const deck = deckOf(6);
  const one = { id: newId('sc'), title: 'One', collapsed: false };
  const two = { id: newId('sc'), title: 'Two', collapsed: false };
  deck.sections = [one, two];
  deck.slides[0].sectionId = one.id;
  deck.slides[1].sectionId = one.id;
  deck.slides[2].sectionId = two.id;
  deck.slides[3].sectionId = two.id;
  const groups = sectionsOf(deck);
  // The sorter shows the deck in its own order, with a heading where the
  // section changes - never regrouped.
  assert.deepStrictEqual(groups.map((g) => (g.section ? g.section.title : null)), ['One', 'Two', null]);
  assert.deepStrictEqual(groups.map((g) => g.slides.length), [2, 2, 2]);
  const n = numbering(deck);
  // The first slide of section two is the third slide of the deck, not the first.
  assert.strictEqual(n.numberOf(groups[1].slides[0].id), 3);
  assert.deepStrictEqual(numbersOf(deck), [1, 2, 3, 4, 5, 6]);
});

test('an agenda is built from the sections and renumbers with them', () => {
  const deck = deckOf(6);
  const one = { id: newId('sc'), title: 'Where we are', collapsed: false };
  const two = { id: newId('sc'), title: 'What comes next', collapsed: false };
  deck.sections = [one, two];
  deck.slides[1].sectionId = one.id;
  deck.slides[2].sectionId = one.id;
  deck.slides[4].sectionId = two.id;
  // The agenda sits on the first slide, which is in no section of its own.
  const here = deck.slides[0];
  const agenda = () => agendaText({ source: 'sections', numbers: true }, { deck, slide: here });
  assert.strictEqual(agenda(), '2. Where we are\n5. What comes next');
  // Moving a slide out of the way moves the agenda's numbers with it.
  deck.slides = moveSlides(deck, [here.id], 6);
  assert.strictEqual(agenda(), '1. Where we are\n4. What comes next');
});

test('an agenda built from slide titles leaves out the slide it is on', () => {
  const deck = deckOf(4);
  const words = agendaText({ source: 'titles', numbers: true }, { deck, slide: deck.slides[0] });
  assert.strictEqual(words, '2. Slide B\n3. Slide C\n4. Slide D');
});

/* ------------------------------------------------- layouts and overrides */

test('a slide shows its layout, with its own changes on top', () => {
  const deck = deckOf(1);
  const slide = deck.slides[0];
  const layout = layoutOf(deck, slide.layout);
  const title = layout.elements.find((e) => e.name === 'Title');
  slide.overrides[title.id] = { content: { text: 'Its own words' }, style: { color: 'accent' } };
  const shown = resolveSlide(deck, slide).elements.find((e) => e.id === title.id);
  assert.strictEqual(shown.content.text, 'Its own words');
  assert.strictEqual(shown.style.color, 'accent');
  // Everything the slide did not change still comes from the layout.
  assert.strictEqual(shown.style.size, title.style.size);
  assert.strictEqual(shown.x, title.x);
});

test('changing the layout changes every slide that has not overridden it', () => {
  const deck = deckOf(3);
  const layout = layoutOf(deck, deck.slides[0].layout);
  const title = layout.elements.find((e) => e.name === 'Title');
  deck.slides[1].overrides[title.id] = { style: { color: 'accent' } };
  title.style.color = 'muted';
  const colorOn = (i) => resolveSlide(deck, deck.slides[i]).elements.find((e) => e.id === title.id).style.color;
  assert.strictEqual(colorOn(0), 'muted');
  assert.strictEqual(colorOn(1), 'accent', 'a slide that said otherwise keeps saying it');
  assert.strictEqual(colorOn(2), 'muted');
  // "Back to layout" is just forgetting the difference.
  delete deck.slides[1].overrides[title.id];
  assert.strictEqual(colorOn(1), 'muted');
});

test('a slide can hide an element its layout has', () => {
  const deck = deckOf(1);
  const slide = deck.slides[0];
  const footer = layoutOf(deck, slide.layout).elements.find((e) => e.type === 'field');
  slide.overrides[footer.id] = { hidden: true };
  assert.ok(!resolveSlide(deck, slide).elements.some((e) => e.id === footer.id));
});

/* -------------------------------------------------------------- drawing */

test('every layout of every starter draws, on both shapes, with nothing overflowing', () => {
  for (const starter of Object.keys(STARTERS)) {
    for (const aspect of ['wide', 'standard']) {
      const deck = buildStarter(starter, { aspect, title: 'A deck with a reasonably long name' });
      deck.options.footer = 'Company · Confidential';
      for (const layout of deck.layouts) {
        const drawn = renderSlide(resolveLayout(deck, layout), { deck, slide: null, draft: false });
        for (const [id, note] of Object.entries(drawn.report)) {
          const el = layout.elements.find((e) => e.id === id) || {};
          const where = starter + '/' + aspect + '/' + layout.name + '/' + (el.name || id);
          assert.ok(!note.overflow, where + ' overflows');
          assert.ok(!note.error, where + ': ' + note.error);
        }
        for (const el of layout.elements) {
          const where = starter + '/' + aspect + '/' + layout.name + '/' + el.name;
          assert.ok(el.x >= -0.5 && el.y >= -0.5, where + ' starts off the slide');
          assert.ok(el.x + el.w <= deck.size.width + 0.5 && el.y + el.h <= deck.size.height + 0.5, where + ' runs off the slide');
        }
      }
    }
  }
});

test('a starter deck draws every slide, and its SVG is well formed', () => {
  const deck = buildStarter('banded', { title: 'Quarterly review' });
  const nums = numbering(deck);
  for (const slide of deck.slides) {
    const drawn = renderSlide(resolveSlide(deck, slide), { deck, slide, numbers: nums, draft: true });
    const svg = renderSVG(drawn.ops, { width: deck.size.width, height: deck.size.height });
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    assert.strictEqual((svg.match(/<g/g) || []).length, (svg.match(/<\/g>/g) || []).length);
  }
});

/* --------------------------------------------------------------- charts */

test('nice axis scales', () => {
  assert.deepStrictEqual(niceScale(0, 97).ticks.slice(-1), [100]);
  assert.strictEqual(niceScale(0, 8).step, 2);
});

test('numbers: thousands, compact, prefix and unit', () => {
  assert.strictEqual(formatNumber(12400), '12,400');
  assert.strictEqual(formatNumber(12400, { compact: true }), '12.4k');
  assert.strictEqual(formatNumber(0.5, { prefix: '$', decimals: 2 }), '$0.50');
});

test('pasted spreadsheet rows become chart data', () => {
  const d = parseTable('Region\tSold\tReturned\nNorth\t124\t6\nSouth\t98\t4');
  assert.deepStrictEqual(d.labels, ['North', 'South']);
  assert.deepStrictEqual(d.series.map((s) => s.name), ['Sold', 'Returned']);
  assert.deepStrictEqual(d.series[0].values, [124, 98]);
});

test('every chart kind draws inside its box', () => {
  const box = { x: 20, y: 20, w: 400, h: 260 };
  for (const kind of Object.keys(CHART_KINDS)) {
    const ops = renderChart({ kind, title: 'A chart', data: sampleData(kind) }, box, { palette: PALETTES.harbor });
    assert.ok(ops.length, kind + ' drew nothing');
    for (const op of ops) {
      const xs = [op.x, op.cx, op.x1, op.x2].filter(Number.isFinite);
      for (const x of xs) assert.ok(x >= box.x - 8 && x <= box.x + box.w + 8, kind + ' drew at x=' + x);
    }
  }
});

test('charts cope with empty and missing data', () => {
  for (const kind of Object.keys(CHART_KINDS)) {
    assert.doesNotThrow(() => renderChart({ kind, data: { labels: [], series: [] } }, { x: 0, y: 0, w: 200, h: 120 }, { palette: PALETTES.harbor }), kind);
    assert.doesNotThrow(() => renderChart({ kind }, { x: 0, y: 0, w: 200, h: 120 }, { palette: PALETTES.harbor }), kind);
  }
});

/* ------------------------------------------------------ generated graphics */

test('a generated graphic is the same for the same seed, and different for another', () => {
  const box = { x: 0, y: 0, w: 300, h: 200 };
  for (const kind of Object.keys(PATTERN_KINDS)) {
    const a = renderPattern({ kind, seed: 'abc', scheme: 'brand' }, box, PALETTES.harbor);
    const b = renderPattern({ kind, seed: 'abc', scheme: 'brand' }, box, PALETTES.harbor);
    const c = renderPattern({ kind, seed: 'abd', scheme: 'brand' }, box, PALETTES.harbor);
    assert.deepStrictEqual(a, b, kind + ' is not the same twice for one seed');
    assert.notDeepStrictEqual(a, c, kind + ' ignores its seed');
  }
});

test('the random number generator gives the same numbers everywhere', () => {
  const r = rng('slidex');
  const first = [r(), r(), r()].map((v) => Math.round(v * 1e6));
  const again = rng('slidex');
  assert.deepStrictEqual([again(), again(), again()].map((v) => Math.round(v * 1e6)), first);
  assert.strictEqual(hashSeed('slidex'), hashSeed('slidex'));
  assert.notStrictEqual(hashSeed('slidex'), hashSeed('slidey'));
});

/* --------------------------------------------------- new elements */

test('a table draws its rows and reports a column it had to cut', () => {
  const deck = deckOf(1);
  const table = makeElement('table', 40, 40);
  table.w = 400; table.h = 160;
  deck.slides[0].extras = [table];
  const drawn = renderSlide(resolveSlide(deck, deck.slides[0]), { deck, slide: deck.slides[0], draft: false });
  const texts = drawn.ops.find((g) => g.el === table.id).items.filter((i) => i.t === 'text').map((i) => i.text);
  assert.ok(texts.includes('Region'));
  assert.ok(texts.includes('124'));
  assert.ok(!drawn.report[table.id] || !drawn.report[table.id].overflow);
});

test('code is never wrapped; a line too long for the box is reported', () => {
  const deck = deckOf(1);
  const code = makeElement('code', 40, 40);
  code.w = 200; code.h = 120;
  code.content.code = 'const somethingWithAVeryLongNameIndeed = anotherThingWithALongName(1, 2, 3);';
  deck.slides[0].extras = [code];
  const drawn = renderSlide(resolveSlide(deck, deck.slides[0]), { deck, slide: deck.slides[0], draft: false });
  assert.strictEqual(drawn.report[code.id].clipped, true);
  const lines = drawn.ops.find((g) => g.el === code.id).items.filter((i) => i.t === 'text');
  assert.strictEqual(lines.length, 1, 'code was wrapped');
  assert.strictEqual(lines[0].family, 'mono');
});

test('a line with an arrowhead draws one, and its ends move with its box', () => {
  const deck = deckOf(1);
  const line = makeElement('line', 100, 100);
  line.style.endHead = 'arrow';
  deck.slides[0].extras = [line];
  const at = (x) => {
    line.x = x;
    const drawn = renderSlide(resolveSlide(deck, deck.slides[0]), { deck, slide: deck.slides[0], draft: false });
    return drawn.ops.find((g) => g.el === line.id).items;
  };
  const items = at(100);
  assert.strictEqual(items[0].x1, 100);
  assert.ok(items.some((i) => i.t === 'path' && i.fill), 'no arrowhead');
  assert.strictEqual(at(300)[0].x1, 300);
});

/* -------------------------------------------- moving onto another style */

test('moving a deck onto new layouts carries its words to elements of the same name', () => {
  const before = buildStarter('plain', { title: 'Before' });
  const layout = layoutOf(before, before.slides[3].layout);
  const title = layout.elements.find((e) => e.name === 'Title');
  const content = layout.elements.find((e) => e.name === 'Content');
  before.slides[3].overrides[title.id] = { content: { text: 'What we found' }, style: { color: 'accent' } };
  before.slides[3].overrides[content.id] = { content: { text: '- One thing\n- Another' } };

  const after = buildStarter('banded', { title: 'After' });
  const { slides, carried, dropped } = rebaseSlides(before, after, before.slides);
  assert.strictEqual(slides.length, before.slides.length);
  const moved = slides[3];
  const newLayout = layoutOf(after, moved.layout);
  assert.strictEqual(newLayout.kind, 'titleContent');
  const newTitle = newLayout.elements.find((e) => e.name === 'Title');
  assert.strictEqual(moved.overrides[newTitle.id].content.text, 'What we found');
  // The style belonged to the old design and does not come along.
  assert.ok(!moved.overrides[newTitle.id].style);
  assert.strictEqual(carried, 2);
  assert.strictEqual(dropped, 0);
  after.slides = slides;
  assert.deepStrictEqual(numbersOf(after), [1, 2, 3, 4, 5]);
});

test('what has nowhere to go is counted before anything moves', () => {
  const before = buildStarter('plain', { title: 'Before' });
  const layout = layoutOf(before, before.slides[0].layout);
  const odd = makeElement('text', 10, 10);
  odd.name = 'A name no other layout uses';
  layout.elements.push(odd);
  before.slides[0].overrides[odd.id] = { content: { text: 'nowhere to go' } };
  const after = buildStarter('banded', { title: 'After' });
  const { dropped } = rebaseSlides(before, after, before.slides);
  assert.strictEqual(dropped, 1);
});

await run('SlideX: numbering, the slide engine, charts and graphics');
