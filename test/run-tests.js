// The slide engine, the numbering, the PDF writer and the stores, without a browser.
//
// Laid out as Newsx's test/run-tests.js is: no dependencies, one small harness,
// and `node test/run-tests.js` runs the lot.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
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
  fillFields, agendaText, rebaseSlides, newId, clone, LAYOUT_KINDS,
} from '../web/shared/model.js';
import { numbering, slideTitle, sectionsOf, resolveReference } from '../web/shared/numbering.js';
import { renderSlide, contrastOf } from '../web/shared/scene.js';
import { renderSVG } from '../web/shared/svg.js';
import { generateDeck, generateSlideLayouts, generateLayoutsFor, contrastFloor, LAYOUT_VARIANTS } from '../web/shared/generate.js';
import { checkDeck } from '../web/js/check.js';
import { renderPdf } from '../src/lib/render.js';
import { encodePng } from '../src/lib/images.js';
import { paths } from '../src/lib/store.js';

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

/* -------------------------------------------------------------- present */
//
// Present mode needs a browser, so what is checked here is the part that
// decides what happens: which slides are shown, and what a typed number means.
// The rest is driven for real by the UI tests.

test('presenting shows the slides that are numbered, in order, and skips the hidden', () => {
  const deck = deckOf(6);
  deck.slides[1].hidden = true;
  deck.slides[4].hidden = true;
  const running = numbering(deck).visible;
  assert.deepStrictEqual(running.map((s) => slideTitle(deck, s)), ['Slide A', 'Slide C', 'Slide D', 'Slide F']);
  // What the room sees is 1, 2, 3, 4 with no gaps.
  assert.deepStrictEqual(running.map((s) => numbering(deck).numberOf(s.id)), [1, 2, 3, 4]);
});

test('typing a number during a talk means the slide with that number now', () => {
  const deck = deckOf(6);
  const nums = () => numbering(deck);
  assert.strictEqual(slideTitle(deck, nums().at(4)), 'Slide D');
  // Move a slide mid-talk, as somebody would from the sorter in another window.
  deck.slides = moveSlides(deck, [deck.slides[5].id], 0);
  assert.strictEqual(slideTitle(deck, nums().at(4)), 'Slide C');
  assert.strictEqual(nums().at(7), null, 'there is no slide 7 in a deck of six');
  assert.strictEqual(nums().at(0), null);
});

test('a hidden slide has no number to type, so it cannot be jumped to', () => {
  const deck = deckOf(4);
  deck.slides[2].hidden = true;
  const nums = numbering(deck);
  // 3 is now the fourth slide; the hidden one is not reachable by number at all.
  assert.strictEqual(slideTitle(deck, nums.at(3)), 'Slide D');
  assert.ok(!nums.visible.some((s) => s.id === deck.slides[2].id));
});

test('a deck in which every slide is hidden has nothing to present', () => {
  const deck = deckOf(3);
  for (const s of deck.slides) s.hidden = true;
  assert.strictEqual(numbering(deck).total, 0);
  assert.strictEqual(numbering(deck).visible.length, 0);
});

/* ------------------------------------------------------------- generator */

/**
 * A deck with its ids replaced by the order they first appear in.
 *
 * Ids are fresh every time something is made, and have to be: two decks in one
 * folder cannot share them. So comparing two decks made from one seed means
 * comparing everything except the ids - and comparing the ids' *structure*,
 * which this keeps: two slides pointing at the same layout still point at the
 * same layout afterwards.
 */
function canonical(value) {
  const ids = new Set();
  const collect = (v) => {
    if (Array.isArray(v)) return v.forEach(collect);
    if (!v || typeof v !== 'object') return undefined;
    for (const [k, x] of Object.entries(v)) {
      if (k === 'id' && typeof x === 'string') ids.add(x);
      if (k === 'overrides' && x && typeof x === 'object') for (const key of Object.keys(x)) ids.add(key);
      collect(x);
    }
    return undefined;
  };
  collect(value);
  const seen = new Map();
  const nameOf = (v) => {
    if (!seen.has(v)) seen.set(v, '#' + seen.size);
    return seen.get(v);
  };
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return typeof v === 'string' && ids.has(v) ? nameOf(v) : v;
    const out = {};
    for (const [k, x] of Object.entries(v)) out[ids.has(k) ? nameOf(k) : k] = walk(x);
    return out;
  };
  return walk(JSON.parse(JSON.stringify(value)));
}

const withoutIds = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'id' || k === 'seed' ? undefined : x)));

test('a generated deck is the same for the same seed, and different for another', () => {
  // Everything but the ids, and that includes every graphic's seed: one seed
  // makes one deck, down to the last dot of the last generated graphic.
  assert.deepStrictEqual(canonical(generateDeck({ seed: 'abc' })), canonical(generateDeck({ seed: 'abc' })));
  assert.notDeepStrictEqual(canonical(generateDeck({ seed: 'abc' })), canonical(generateDeck({ seed: 'abd' })));
  const seeds = (deck) => JSON.stringify(canonical(deck)).match(/"seed":"[^"]+"/g);
  assert.ok(seeds(generateDeck({ seed: 'abc' })).length > 0, 'a generated deck has no graphics at all');
  assert.deepStrictEqual(seeds(generateDeck({ seed: 'abc' })), seeds(generateDeck({ seed: 'abc' })));
  assert.notDeepStrictEqual(seeds(generateDeck({ seed: 'abc' })), seeds(generateDeck({ seed: 'abd' })));
  // And the same deck on a different machine: it is only JSON.
  const there = JSON.parse(JSON.stringify(generateDeck({ seed: 'abc' })));
  assert.deepStrictEqual(canonical(there), canonical(generateDeck({ seed: 'abc' })));
});

test('a held palette and shape are kept, and the seed is recorded', () => {
  const deck = generateDeck({ seed: 'held', palette: 'meadow', aspect: 'standard', title: 'Held' });
  assert.strictEqual(deck.palette.name, 'Meadow');
  assert.strictEqual(deck.aspect, 'standard');
  assert.strictEqual(deck.size.width, 720);
  assert.strictEqual(deck.generated.seed, 'held');
  // Twenty seeds, one palette: the palette is held while the layouts change.
  for (let n = 0; n < 20; n++) {
    assert.strictEqual(generateDeck({ seed: 'hold' + n, palette: 'cardinal' }).palette.name, 'Cardinal');
  }
});

// The quality checks. Anything a person would notice and we would be
// embarrassed by: words cut off, a box off the slide, two things on top of
// each other, or text nobody can read on what is behind it.
const BACKGROUND = new Set(['shape', 'pattern', 'image']);
const overlaps = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const WORDS_ON = new Set(['text', 'field', 'reference', 'agenda']);

function inspect(deck, where, fail) {
  const nums = numbering(deck);
  for (const layout of deck.layouts) {
    const slide = deck.slides.find((s) => s.layout === layout.id);
    const shown = slide ? resolveSlide(deck, slide) : resolveLayout(deck, layout);
    const at = where + ' \u00b7 ' + layout.name;
    const drawn = renderSlide(shown, { deck, slide: slide || null, numbers: nums, draft: false });

    for (const [id, note] of Object.entries(drawn.report)) {
      const el = shown.elements.find((e) => e.id === id) || {};
      const name = at + ' \u00b7 ' + (el.name || id);
      if (note.overflow) fail(name + ': ' + (note.hiddenWords || 'some') + ' words do not fit');
      if (note.error) fail(name + ' could not be drawn: ' + note.error);
      if (note.clipped) fail(name + ' had to be cut');
      if (note.tiny) fail(name + ' shrank to ' + note.tiny + 'pt, which nobody can read');
      if (note.shrunk && note.shrunk < 70) fail(name + ' shrank to ' + note.shrunk + '% of its size');
    }

    for (const el of shown.elements) {
      const name = at + ' \u00b7 ' + el.name;
      if (el.x < -0.5 || el.y < -0.5) fail(name + ' starts off the slide');
      if (el.x + el.w > deck.size.width + 0.5 || el.y + el.h > deck.size.height + 0.5) fail(name + ' runs off the slide');
      if (el.w < 2 || el.h < 2) fail(name + ' has no size');
    }

    // Two things on top of each other. Backgrounds are meant to be underneath
    // things, so they are not counted.
    const front = shown.elements.filter((e) => !BACKGROUND.has(e.type));
    for (let a = 0; a < front.length; a++) {
      for (let b = a + 1; b < front.length; b++) {
        if (overlaps(front[a], front[b])) fail(at + ': ' + front[a].name + ' overlaps ' + front[b].name);
      }
    }

    // Words on whatever is behind them, at the ratio that size actually needs.
    for (const el of shown.elements) {
      if (!WORDS_ON.has(el.type)) continue;
      const c = contrastOf(shown.elements, el, deck.palette);
      if (!c) continue;
      const floor = contrastFloor(Number(el.style.size) || 17, !!el.style.bold);
      if (c.ratio < floor) {
        fail(at + ' \u00b7 ' + el.name + ': contrast ' + c.ratio.toFixed(2) + ' on ' + c.on + ', needs ' + floor);
      }
    }
  }
}

for (const aspect of ['wide', 'standard']) {
  test('generated decks on ' + aspect + ': nothing overflows, leaves the slide, collides or fails contrast', () => {
    const bad = [];
    for (let n = 0; n < 60; n++) {
      const deck = generateDeck({ seed: aspect + '-' + n, aspect, title: 'A deck with a reasonably long name on it' });
      // A footer makes the strip along the foot carry words, which is where a
      // deck without one would never have found a contrast problem.
      deck.options.footer = 'Company \u00b7 Confidential';
      inspect(deck, aspect + ' seed ' + n, (m) => bad.push(m));
    }
    assert.deepStrictEqual(bad.slice(0, 8), [], bad.length + ' problems, first few:\n  ' + bad.slice(0, 8).join('\n  '));
  });
}

test('generated decks vary: palettes, title slides, panels and graphics', () => {
  const palettes = new Set();
  const titles = new Set();
  const panels = new Set();
  const graphics = new Set();
  const chrome = new Set();
  for (let n = 0; n < 50; n++) {
    const deck = generateDeck({ seed: 'v' + n });
    palettes.add(deck.palette.name);
    const title = deck.layouts.find((l) => l.kind === 'title');
    titles.add(title.elements.map((e) => e.type + ':' + e.name).join('|'));
    const comparison = deck.layouts.find((l) => l.kind === 'comparison');
    panels.add(JSON.stringify((comparison.elements.find((e) => e.name === 'Left panel') || { style: {} }).style));
    for (const l of deck.layouts) for (const e of l.elements) if (e.type === 'pattern') graphics.add(e.style.kind);
    chrome.add(deck.layouts.find((l) => l.kind === 'titleContent').elements.some((e) => e.name === 'Slide number'));
  }
  assert.ok(palettes.size >= 6, 'only ' + palettes.size + ' palettes: ' + [...palettes].join());
  assert.ok(titles.size >= 4, 'only ' + titles.size + ' kinds of title slide');
  assert.ok(panels.size >= 3, 'only ' + panels.size + ' panel styles');
  assert.ok(graphics.size >= 6, 'only ' + graphics.size + ' kinds of graphic: ' + [...graphics].join());
  assert.deepStrictEqual([...chrome].sort(), [false, true], 'every deck numbers its slides the same way');
});

test('a generated deck has every layout, and a slide to start from', () => {
  const deck = generateDeck({ seed: 'complete', title: 'Complete' });
  const kinds = deck.layouts.map((l) => l.kind);
  for (const kind of Object.keys(LAYOUT_KINDS)) assert.ok(kinds.includes(kind), 'no ' + kind + ' layout');
  assert.ok(deck.slides.length >= 5);
  assert.deepStrictEqual(numbersOf(deck), deck.slides.map((_, i) => i + 1));
  // The layouts a starting slide uses are the ones somebody opens on.
  const used = deck.slides.map((s) => (layoutOf(deck, s.layout) || {}).kind);
  assert.strictEqual(used[0], 'title');
  assert.strictEqual(used[used.length - 1], 'closing');
  assert.ok(deck.sections.length >= 1);
});

test('six layouts for one slide, then six more, all different and all sound', () => {
  const first = generateSlideLayouts({ seed: 'six', kind: 'titleContent', palette: 'harbor', count: 6 });
  const more = generateSlideLayouts({ seed: 'six', kind: 'titleContent', palette: 'harbor', count: 6, offset: 6 });
  assert.strictEqual(first.length, 6);
  assert.strictEqual(more.length, 6);
  const shape = (o) => JSON.stringify(withoutIds(o.layout));
  assert.strictEqual(new Set([...first, ...more].map(shape)).size, 12, 'two of the twelve are the same');
  // Asking again gives the same six: a layout somebody liked can be found again.
  assert.deepStrictEqual(first.map(shape), generateSlideLayouts({ seed: 'six', kind: 'titleContent', palette: 'harbor', count: 6 }).map(shape));
  // Held palette means held palette, for every one of them.
  const host = generateDeck({ seed: 'host', palette: 'harbor' });
  for (const option of [...first, ...more]) {
    assert.strictEqual(option.layout.kind, 'titleContent');
    const bad = [];
    inspect({ ...host, layouts: [option.layout], slides: [] }, 'option ' + option.layout.name, (m) => bad.push(m));
    assert.deepStrictEqual(bad, [], bad.join('\n  '));
  }
});

test('every kind of layout can be generated in every one of its variants', () => {
  for (const palette of Object.keys(PALETTES)) {
    const host = generateDeck({ seed: 'variants', palette });
    for (const [kind, variants] of Object.entries(LAYOUT_VARIANTS)) {
      // The options are generated in the deck's own colours, which is what
      // "hold this palette while I try layouts" means.
      const options = generateSlideLayouts({ seed: 'variants', kind, palette, count: variants.length });
      assert.strictEqual(options.length, variants.length);
      const bad = [];
      for (const option of options) {
        inspect({ ...host, layouts: [option.layout], slides: [] }, palette + ' ' + kind, (m) => bad.push(m));
      }
      assert.deepStrictEqual(bad, [], kind + ':\n  ' + bad.join('\n  '));
    }
  }
});

test('a new generated style carries a deck onto it, and one undo puts it back', () => {
  const deck = generateDeck({ seed: 'before', title: 'A deck' });
  const content = deck.slides.find((s) => (layoutOf(deck, s.layout) || {}).kind === 'titleContent');
  const layout = layoutOf(deck, content.layout);
  const title = layout.elements.find((e) => e.name === 'Title');
  content.overrides[title.id] = { content: { text: 'What we found' } };
  const before = JSON.stringify(deck);

  const style = generateLayoutsFor({ seed: 'after', aspect: deck.aspect });
  const after = { ...deck, layouts: style.layouts, palette: style.palette, fonts: style.fonts };
  const { slides, carried, dropped } = rebaseSlides(deck, after, deck.slides);
  after.slides = slides;
  // You are told how much moves and how much has nowhere to go, before it does.
  assert.ok(carried >= 1, 'nothing was carried');
  assert.strictEqual(typeof dropped, 'number');
  const moved = after.slides.find((s) => (layoutOf(after, s.layout) || {}).kind === 'titleContent');
  const newTitle = layoutOf(after, moved.layout).elements.find((e) => e.name === 'Title');
  assert.strictEqual(moved.overrides[newTitle.id].content.text, 'What we found');
  assert.deepStrictEqual(numbersOf(after), after.slides.map((_, i) => i + 1));
  const bad = [];
  inspect(after, 'after', (m) => bad.push(m));
  assert.deepStrictEqual(bad, [], bad.join('\n  '));

  // One undo is the whole deck as it was.
  assert.strictEqual(JSON.stringify(JSON.parse(before)), before);
});

test('a generated deck draws the same twice, and its graphics survive a round trip', () => {
  const deck = generateDeck({ seed: 'stable', title: 'Stable' });
  const draw = (d) => d.slides.map((s) => JSON.stringify(renderSlide(resolveSlide(d, s), { deck: d, slide: s, draft: false }).ops));
  const once = draw(deck);
  const again = draw(JSON.parse(JSON.stringify(deck)));
  assert.deepStrictEqual(once, again, 'a deck drawn from its own file differs from the deck in memory');
});

/* ------------------------------------------------------------------ check */

test('check finds what will not look right, worst first', () => {
  const deck = deckOf(4);
  const slide = deck.slides[0];
  const layout = layoutOf(deck, slide.layout);
  const title = layout.elements.find((e) => e.name === 'Title');
  const content = layout.elements.find((e) => e.name === 'Content');

  // Words that do not fit.
  slide.overrides[content.id] = { content: { text: 'word '.repeat(600) }, style: { fit: 'none' } };
  // A character the PDF fonts do not have.
  slide.overrides[title.id] = { content: { text: 'What we found \u4e2d' } };
  // A field nobody can fill in.
  const typo = makeElement('text', 40, 400);
  typo.name = 'Typo';
  typo.content = { text: 'Slide {nubmer} of {total}' };
  // A reference to a slide that is about to be deleted.
  const doomed = deck.slides[3];
  const ref = makeElement('reference', 40, 440);
  ref.content = { target: doomed.id, text: 'see slide {ref}' };
  // Words that cannot be read on what is behind them.
  const band = makeElement('shape', 500, 40);
  band.w = 200; band.h = 60;
  band.style = { shape: 'rect', fill: 'tint' };
  const onBand = makeElement('text', 500, 40, 'body');
  onBand.w = 200; onBand.h = 60;
  onBand.name = 'Pale words';
  onBand.style = { ...onBand.style, color: 'tint', size: 12 };
  onBand.content = { text: 'Nobody can read this' };
  // An empty chart.
  const chart = makeElement('chart', 40, 480);
  chart.name = 'Empty chart';
  chart.content = { kind: 'bar', data: { labels: [], series: [] } };
  slide.extras = [typo, ref, band, onBand, chart];
  deck.slides = removeSlides(deck, [doomed.id]);

  const found = checkDeck(deck);
  const has = (words) => found.some((x) => x.message.includes(words));
  assert.ok(has('do not fit'), 'overflow not found');
  assert.ok(has('\u201c\u4e2d\u201d'), 'an unprintable character not found');
  assert.ok(has('{nubmer}'), 'a field that is not one was not found');
  assert.ok(has('points at a slide that has been deleted'), 'a broken reference not found');
  assert.ok(has('contrast'), 'unreadable words not found');
  assert.ok(has('no numbers in it'), 'an empty chart not found');
  // Worst first, and the broken reference is among the worst.
  assert.strictEqual(found[0].level, 'bad');
  assert.ok(found.every((x, i) => i === 0 || levelRank(found[i - 1]) <= levelRank(x)), 'not sorted worst first');
  // Every item can be gone to.
  for (const item of found) {
    if (!item.slideId) continue;
    assert.ok(deck.slides.some((x) => x.id === item.slideId), 'an item points at a slide that is not there');
  }
});

const levelRank = (x) => ({ bad: 0, warn: 1, note: 2 }[x.level]);

test('a deck with nothing wrong with it gets nothing said about it', () => {
  const deck = generateDeck({ seed: 'tidy', title: 'A tidy deck' });
  deck.options.footer = 'Company';
  // A generated deck is full of the layout's own placeholder words and empty
  // picture frames, which is what it is for, and check says so quietly. What
  // should not be there is anything else at all.
  const sha = 'b'.repeat(40);
  for (const slide of deck.slides) {
    const layout = layoutOf(deck, slide.layout);
    for (const el of layout.elements) if (el.type === 'image') slide.overrides[el.id] = { content: { asset: sha } };
  }
  const assets = { [sha]: { kind: 'png', width: 2400, height: 1400 } };
  const found = checkDeck(deck, assets).filter((x) => x.level !== 'note');
  assert.deepStrictEqual(found.map((x) => x.where + ': ' + x.message), []);
});

test('an empty picture frame and one too small to project are both said', () => {
  const deck = deckOf(1);
  const empty = makeElement('image', 40, 200);
  empty.name = 'Empty frame';
  const small = makeElement('image', 400, 200);
  small.name = 'Small picture';
  small.w = 400; small.h = 300;
  small.content = { asset: 'c'.repeat(40), focusX: 0.5, focusY: 0.5 };
  deck.slides[0].extras = [empty, small];
  const found = checkDeck(deck, { ['c'.repeat(40)]: { kind: 'png', width: 200, height: 150 } });
  assert.ok(found.some((x) => x.message.includes('has no picture')), 'an empty frame was not noticed');
  assert.ok(found.some((x) => x.message.includes('look soft on a projector')), 'a picture too small was not noticed');
});

test('every starter, in every palette, on both shapes, checks clean', () => {
  // The starters are written by hand rather than generated, so nothing chooses
  // their colours for them; this is what makes sure a kicker in the accent
  // still reads when the accent is Meadow's rather than Harbor's.
  const bad = [];
  for (const starter of Object.keys(STARTERS)) {
    for (const palette of Object.keys(PALETTES)) {
      for (const aspect of ['wide', 'standard']) {
        const deck = buildStarter(starter, { palette, aspect, title: 'A deck with a reasonably long name' });
        deck.options.footer = 'Company \u00b7 Confidential';
        for (const item of checkDeck(deck)) {
          // A starter's own placeholder words, and its empty picture frames,
          // are what a starter is; anything else is a fault in it.
          if (item.level === 'note') continue;
          if (item.message.includes('has no picture')) continue;
          bad.push(starter + '/' + palette + '/' + aspect + ' \u00b7 ' + item.message);
        }
      }
    }
  }
  assert.deepStrictEqual(bad.slice(0, 6), [], bad.length + ' problems:\n  ' + bad.slice(0, 6).join('\n  '));
});

test('check notices a slide nothing can name, and a slide off the edge', () => {
  const deck = deckOf(2);
  const slide = deck.slides[0];
  const layout = layoutOf(deck, slide.layout);
  // Every word taken off it: the title, the bullets, and the footer fields.
  // slideTitle now finds nothing, which is exactly when the sorter, the agenda
  // and the go-to box have nothing to show.
  for (const el of layout.elements) slide.overrides[el.id] = { hidden: true };
  const chart = makeElement('chart', 40, 200);
  slide.extras = [chart];
  const found = checkDeck(deck);
  assert.ok(found.some((x) => x.message.includes('can be its title')), 'a slide nothing can name was not noticed: ' + found.map((x) => x.message).join(' | '));

  // And a box hanging over the right-hand edge.
  const off = makeElement('text', deck.size.width - 20, 40, 'body');
  off.name = 'Hanging off';
  off.w = 300;
  deck.slides[1].extras = [off];
  const again = checkDeck(deck);
  assert.ok(again.some((x) => x.message.includes('off the edge') || x.message.includes('off the slide')), 'something off the slide was not noticed');
});

/* -------------------------------------------------------------------- PDF */

test('a PDF has one page per slide, in the deck\u2019s order, with the text of the slides', () => {
  const deck = buildStarter('plain', { title: 'Printed' });
  const nums = numbering(deck);
  const { buffer, slides, pages } = renderPdf('test-deck', deck, { layout: 'slides' });
  assert.strictEqual(slides, nums.total);
  assert.strictEqual(pages, nums.total);
  const text = buffer.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'), 'not a PDF');
  assert.ok(text.trimEnd().endsWith('%%EOF'), 'the PDF is not finished');
  assert.strictEqual((text.match(/\/Type \/Page /g) || []).length, nums.total);
  // Every page is the size the slides are, not a sheet of paper.
  assert.strictEqual((text.match(new RegExp('/MediaBox \\[0 0 ' + deck.size.width + ' ' + deck.size.height + '\\]', 'g')) || []).length, nums.total);
  // The pages are listed in the deck's order.
  const kids = text.match(/\/Kids \[([^\]]+)\]/)[1].trim().split(' 0 R').filter((x) => x.trim()).map((x) => Number(x));
  assert.strictEqual(kids.length, nums.total);
  assert.deepStrictEqual(kids, kids.slice().sort((a, b) => a - b), 'the pages are not in order');
});

test('reordering the deck reorders the PDF, and renumbers every slide in it', () => {
  const deck = deckOf(5);
  const words = (buffer) => textOfPdf(buffer);
  const before = words(renderPdf('test-deck', deck, { layout: 'slides' }).buffer);
  assert.deepStrictEqual(before.map((p) => p.find((w) => /^Slide [A-E]$/.test(w))), ['Slide A', 'Slide B', 'Slide C', 'Slide D', 'Slide E']);
  // The number in the corner is the field, and follows the order.
  assert.deepStrictEqual(before.map((p) => p[p.length - 1]), ['1', '2', '3', '4', '5']);

  deck.slides = moveSlides(deck, [deck.slides[4].id], 0);
  const after = words(renderPdf('test-deck', deck, { layout: 'slides' }).buffer);
  assert.deepStrictEqual(after.map((p) => p.find((w) => /^Slide [A-E]$/.test(w))), ['Slide E', 'Slide A', 'Slide B', 'Slide C', 'Slide D']);
  assert.deepStrictEqual(after.map((p) => p[p.length - 1]), ['1', '2', '3', '4', '5'], 'the numbers in the PDF did not follow the order');
});

test('a hidden slide is left out of the PDF unless it is asked for', () => {
  const deck = deckOf(4);
  deck.slides[1].hidden = true;
  const shown = renderPdf('test-deck', deck, { layout: 'slides' });
  assert.strictEqual(shown.pages, 3);
  const all = renderPdf('test-deck', deck, { layout: 'slides', hidden: true });
  assert.strictEqual(all.pages, 4);
  // The numbers in the file are still the deck's: 1, 2, 3, with the hidden one
  // unnumbered.
  assert.deepStrictEqual(textOfPdf(shown.buffer).map((p) => p[p.length - 1]), ['1', '2', '3']);
});

test('notes and handouts put the right number of slides on the right number of pages', () => {
  const deck = deckOf(7);
  for (const s of deck.slides) s.notes = 'What to say here.';
  assert.strictEqual(renderPdf('test-deck', deck, { layout: 'notes' }).pages, 7);
  assert.strictEqual(renderPdf('test-deck', deck, { layout: 'handout2' }).pages, 4);
  assert.strictEqual(renderPdf('test-deck', deck, { layout: 'handout3' }).pages, 3);
  assert.strictEqual(renderPdf('test-deck', deck, { layout: 'handout6' }).pages, 2);
  // A notes page carries the slide's notes, and a handout does not.
  assert.ok(textOfPdf(renderPdf('test-deck', deck, { layout: 'notes' }).buffer)[0].includes('What to say here.'));
  assert.ok(!textOfPdf(renderPdf('test-deck', deck, { layout: 'handout6' }).buffer)[0].includes('What to say here.'));
  // Every printed layout is on paper, because it is printed.
  for (const layout of ['notes', 'handout2', 'handout3', 'handout6']) {
    assert.ok(renderPdf('test-deck', deck, { layout }).buffer.toString('latin1').includes('/MediaBox [0 0 595.28 841.89]'), layout + ' is not on A4');
  }
});

test('a deck whose every slide is hidden says so rather than making an empty PDF', () => {
  const deck = deckOf(2);
  for (const s of deck.slides) s.hidden = true;
  assert.throws(() => renderPdf('test-deck', deck, { layout: 'slides' }), /nothing to put in a PDF/);
});

test('pictures go into the PDF once however many slides use them', () => {
  const deck = deckOf(3);
  const sha = 'a'.repeat(40);
  // Opaque RGBA: a picture with an alpha channel goes in as two objects, the
  // picture and its mask, which would make counting them mean something else.
  const rgba = Buffer.alloc(4 * 4 * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 200; rgba[i + 1] = 120; rgba[i + 2] = 60; rgba[i + 3] = 255; }
  const png = encodePng(4, 4, rgba);
  const dir = paths.assets('pdf-asset-test');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, sha + '.png'), png);
  for (const slide of deck.slides) {
    const picture = makeElement('image', 40, 200);
    picture.content = { asset: sha, focusX: 0.5, focusY: 0.5 };
    slide.extras = [picture];
  }
  const { buffer } = renderPdf('pdf-asset-test', deck, { layout: 'slides', assets: { [sha]: { kind: 'png', width: 4, height: 4 } } });
  const text = buffer.toString('latin1');
  // One image object for the whole file...
  assert.strictEqual((text.match(/\/Subtype \/Image/g) || []).length, 1, 'the picture went in more than once');
  // ...drawn once on each of the three slides. The page streams are deflated,
  // so this counts inside them rather than in the bytes of the file.
  const draws = streamsOf(buffer).reduce((n, body) => n + (body.match(/\/Im1 Do/g) || []).length, 0);
  assert.strictEqual(draws, 3, 'the picture is not drawn on all three slides');
  fs.rmSync(path.join(paths.deck('pdf-asset-test')), { recursive: true, force: true });
});

/**
 * Every content stream in a PDF, uncompressed.
 *
 * Found by the /Length in each stream's own dictionary rather than by looking
 * for the word "endstream", because a stream is compressed bytes and those
 * bytes can spell anything - including "stream". Reading them as text and
 * hunting for a marker finds the wrong end of the wrong stream, and quietly
 * loses a page.
 */
function streamsOf(buffer) {
  const out = [];
  // The newline before it matters: "endstream\n" ends with "stream\n" too, and
  // matching that finds a stream where there is none and loses the real one.
  const marker = Buffer.from('\nstream\n', 'latin1');
  let at = 0;
  for (;;) {
    const start = buffer.indexOf(marker, at);
    if (start < 0) break;
    // The /Length belongs to the dictionary just before this stream - the last
    // one in the window, since the object before it has a /Length of its own.
    const head = buffer.slice(Math.max(0, start - 500), start).toString('latin1');
    const lengths = [...head.matchAll(/\/Length (\d+)/g)];
    at = start + marker.length;
    if (!lengths.length) continue;
    const body = buffer.slice(at, at + Number(lengths[lengths.length - 1][1]));
    at += body.length;
    try { out.push(zlib.inflateSync(body).toString('latin1')); } catch (e) { /* not deflated: a JPEG, say */ }
  }
  return out;
}

/** The words of each page of a PDF, in order. */
function textOfPdf(buffer) {
  return streamsOf(buffer)
    .map((body) => [...body.matchAll(/<([0-9a-f]+)> Tj/g)].map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1')))
    .filter((words) => words.length);
}

await run('SlideX: numbering, the slide engine, charts, graphics, the generator, check and the PDF');
